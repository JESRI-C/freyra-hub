// Geospatial Service — project areas, map layers, GeoJSON and metrics
// Falls back to seed data when Supabase is not configured.

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import {
  computeAreaHa,
  getProjectGeometrySeed,
  validateProjectPolygon,
} from "@/services/geo-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MapLayer {
  id: string;
  name: string;
  slug: string;
  category: "nature" | "satellite" | "sensors" | "terrain" | "water";
  provider: string | null;
  layerType: "geojson" | "wms" | "wfs" | "tile" | "sensor";
  isActive: boolean;
  requiresApiKey: boolean;
  refreshInterval: string | null;
  status: "live" | "preview" | "unavailable";
}

export interface ProjectMetrics {
  projectId: string;
  totalAreaHa: number;
  protectedNatureOverlapHa: number | null;
  observationCount: number;
  nearestWatercourseDistanceM: number | null;
  latestNdvi: number | null;
  dataCompletenessScore: number | null;
  calculatedAt: string;
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  projectId: string;
  projectName: string;
  generatedAt: string;
  features: GeoFeature[];
}

export interface GeoFeature {
  type: "Feature";
  id: string;
  geometry: GeoJSONGeometry | null;
  properties: Record<string, unknown>;
}

interface GeoJSONGeometry {
  type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
}

export interface CanonicalProjectBoundary {
  polygon: unknown | null;
  areaHa?: number | null;
  source?: string | null;
  municipality?: string | null;
  status?: string | null;
}

// ─── Seed fallbacks ───────────────────────────────────────────────────────────

const SEED_MAP_LAYERS: MapLayer[] = [
  {
    id: "layer-001",
    name: "Beskyttet natur (§3)",
    slug: "protected_nature",
    category: "nature",
    provider: "Miljøportal",
    layerType: "wfs",
    isActive: true,
    requiresApiKey: false,
    refreshInterval: "24h",
    status: "preview",
  },
  {
    id: "layer-002",
    name: "Vandløb",
    slug: "watercourses",
    category: "water",
    provider: "Miljøportal",
    layerType: "wfs",
    isActive: true,
    requiresApiKey: false,
    refreshInterval: "24h",
    status: "preview",
  },
  {
    id: "layer-003",
    name: "Jordbundstyper",
    slug: "soil_types",
    category: "terrain",
    provider: "GEUS",
    layerType: "wms",
    isActive: true,
    requiresApiKey: false,
    refreshInterval: "7d",
    status: "preview",
  },
  {
    id: "layer-004",
    name: "Sentinel-2 NDVI",
    slug: "sentinel_ndvi",
    category: "satellite",
    provider: "Copernicus",
    layerType: "tile",
    isActive: true,
    requiresApiKey: true,
    refreshInterval: "5d",
    status: "preview",
  },
  {
    id: "layer-005",
    name: "IoT Feltsensorer",
    slug: "sensors",
    category: "sensors",
    provider: "GoFreyra IoT",
    layerType: "sensor",
    isActive: true,
    requiresApiKey: false,
    refreshInterval: "realtime",
    status: "preview",
  },
];

const GEOJSON_OBSERVATION_RPC_LIMIT = 200;

function invalidFeatureGeometry(featureIndex: number, detail: string): never {
  throw new Error(`GeoJSON-feature ${featureIndex + 1} har ugyldig geometri: ${detail}`);
}

function validatePosition(value: unknown, featureIndex: number, path: string): number[] {
  if (!Array.isArray(value) || value.length < 2) {
    return invalidFeatureGeometry(
      featureIndex,
      `${path} skal være [længdegrad, breddegrad] med mindst to tal.`,
    );
  }

  for (const ordinate of value) {
    if (typeof ordinate !== "number" || !Number.isFinite(ordinate)) {
      return invalidFeatureGeometry(featureIndex, `${path} indeholder en ikke-endelig talværdi.`);
    }
  }

  const [longitude, latitude] = value;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return invalidFeatureGeometry(featureIndex, `${path} ligger uden for WGS84-intervallet.`);
  }
  return value as number[];
}

function validatePositionArray(
  value: unknown,
  featureIndex: number,
  path: string,
  minimumLength: number,
): number[][] {
  if (!Array.isArray(value) || value.length < minimumLength) {
    return invalidFeatureGeometry(
      featureIndex,
      `${path} skal indeholde mindst ${minimumLength} koordinat${minimumLength === 1 ? "" : "er"}.`,
    );
  }
  return value.map((position, index) =>
    validatePosition(position, featureIndex, `${path}, koordinat ${index + 1}`),
  );
}

function validatePolygonCoordinates(
  value: unknown,
  featureIndex: number,
  path: string,
): number[][][] {
  if (!Array.isArray(value) || value.length === 0) {
    return invalidFeatureGeometry(featureIndex, `${path} skal indeholde mindst én ring.`);
  }
  value.forEach((ring, index) =>
    validatePositionArray(ring, featureIndex, `${path}, ring ${index + 1}`, 4),
  );

  // Reuse the canonical Polygon validator for ring closure, self-intersection,
  // zero-area and hole topology instead of accepting structurally plausible
  // but spatially invalid RPC data.
  const validation = validateProjectPolygon({ type: "Polygon", coordinates: value });
  if (!validation.valid) {
    return invalidFeatureGeometry(featureIndex, `${path}: ${validation.error}`);
  }
  return validation.polygon.coordinates;
}

function validateRPCGeometry(value: unknown, featureIndex: number): GeoJSONGeometry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidFeatureGeometry(featureIndex, "geometrien skal være et objekt eller null.");
  }

  const geometry = value as Record<string, unknown>;
  const type = geometry["type"];
  const coordinates = geometry["coordinates"];

  switch (type) {
    case "Point":
      validatePosition(coordinates, featureIndex, "Point-koordinaten");
      break;
    case "MultiPoint":
      validatePositionArray(coordinates, featureIndex, "MultiPoint", 1);
      break;
    case "LineString":
      validatePositionArray(coordinates, featureIndex, "LineString", 2);
      break;
    case "MultiLineString":
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        return invalidFeatureGeometry(
          featureIndex,
          "MultiLineString skal indeholde mindst én LineString.",
        );
      }
      coordinates.forEach((line, index) =>
        validatePositionArray(line, featureIndex, `MultiLineString, linje ${index + 1}`, 2),
      );
      break;
    case "Polygon":
      validatePolygonCoordinates(coordinates, featureIndex, "Polygon");
      break;
    case "MultiPolygon":
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        return invalidFeatureGeometry(
          featureIndex,
          "MultiPolygon skal indeholde mindst én Polygon.",
        );
      }
      coordinates.forEach((polygon, index) =>
        validatePolygonCoordinates(polygon, featureIndex, `MultiPolygon, polygon ${index + 1}`),
      );
      break;
    default:
      return invalidFeatureGeometry(
        featureIndex,
        `geometritypen ${String(type ?? "mangler")} understøttes ikke.`,
      );
  }

  return value as GeoJSONGeometry;
}

function buildSeedMetrics(projectId: string): ProjectMetrics {
  const geometry = getProjectGeometrySeed(projectId);
  return {
    projectId,
    totalAreaHa: geometry.areaHa ?? 0,
    protectedNatureOverlapHa: geometry.areaHa ? Math.round(geometry.areaHa * 0.56 * 10) / 10 : null,
    observationCount: 5,
    nearestWatercourseDistanceM: 85,
    latestNdvi: 0.68,
    dataCompletenessScore: 78,
    calculatedAt: new Date().toISOString(),
  };
}

function normalizeProjectGeoJSON(
  value: unknown,
  projectId: string,
  projectName: string,
): GeoFeatureCollection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GeoJSON-svaret fra databasen er ikke et objekt.");
  }
  const raw = value as Record<string, unknown>;
  if (raw["type"] !== "FeatureCollection" || !Array.isArray(raw["features"])) {
    throw new Error("GeoJSON-svaret fra databasen er ikke en FeatureCollection.");
  }
  const responseProjectId = raw["projectId"] ?? raw["project_id"];
  if (responseProjectId != null && String(responseProjectId) !== projectId) {
    throw new Error(
      `GeoJSON-svaret tilhører projekt ${String(responseProjectId)}, ikke det anmodede projekt ${projectId}.`,
    );
  }

  const features = raw["features"].map((value, index): GeoFeature => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`GeoJSON-feature ${index + 1} er ikke et objekt.`);
    }
    const feature = value as Record<string, unknown>;
    if (feature["type"] !== "Feature") {
      throw new Error(`GeoJSON-feature ${index + 1} har ikke typen Feature.`);
    }
    if (
      !feature["properties"] ||
      typeof feature["properties"] !== "object" ||
      Array.isArray(feature["properties"])
    ) {
      throw new Error(`GeoJSON-feature ${index + 1} mangler et properties-objekt.`);
    }

    const rawGeometry = feature["geometry"];
    const geometry = rawGeometry === null ? null : validateRPCGeometry(rawGeometry, index);

    const featureId = feature["id"];
    if (typeof featureId !== "string" && typeof featureId !== "number") {
      throw new Error(`GeoJSON-feature ${index + 1} mangler et stabilt id.`);
    }

    return {
      type: "Feature",
      id: String(featureId),
      geometry,
      properties: feature["properties"] as Record<string, unknown>,
    };
  });

  return {
    type: "FeatureCollection",
    projectId,
    projectName,
    generatedAt: String(raw["generatedAt"] ?? raw["generated_at"] ?? new Date().toISOString()),
    features,
  };
}

export function includeCanonicalProjectBoundary(
  collection: GeoFeatureCollection,
  projectId: string,
  projectName: string,
  boundary?: CanonicalProjectBoundary | null,
): GeoFeatureCollection {
  if (!boundary?.polygon) return collection;

  const validation = validateProjectPolygon(boundary.polygon);
  if (!validation.valid) {
    throw new Error(`Projektgrænsen kan ikke eksporteres: ${validation.error}`);
  }

  const canonicalFeature: GeoFeature = {
    type: "Feature",
    id: `${projectId}-boundary`,
    geometry: validation.polygon as unknown as GeoJSONGeometry,
    properties: {
      feature_class: "project_boundary",
      name: projectName,
      // Afled metadata fra den validerede geometri ved eksport. Et gammelt
      // eller manuelt ændret geometry_area_ha må ikke følge med som sandhed.
      area_ha: Math.round(computeAreaHa(validation.polygon) * 100) / 100,
      source: boundary.source ?? null,
      municipality: boundary.municipality ?? null,
      status: boundary.status ?? null,
      canonical: true,
    },
  };

  return {
    ...collection,
    projectId,
    projectName,
    features: [
      canonicalFeature,
      ...collection.features.filter(
        (feature) => feature.properties["feature_class"] !== "project_boundary",
      ),
    ],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getMapLayers(): Promise<MapLayer[]> {
  if (!isSupabaseConfigured || !supabase) return SEED_MAP_LAYERS;

  const db = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => Promise<{ data: Record<string, unknown>[] | null }>;
      };
    };
  };

  try {
    const { data } = await db
      .from("map_layers")
      .select(
        "id,name,slug,category,provider,layer_type,is_active,requires_api_key,refresh_interval,status",
      )
      .eq("is_active", true);
    if (!data || data.length === 0) return SEED_MAP_LAYERS;
    return data.map((r) => ({
      id: String(r["id"]),
      name: String(r["name"]),
      slug: String(r["slug"]),
      category: String(r["category"]) as MapLayer["category"],
      provider: r["provider"] ? String(r["provider"]) : null,
      layerType: String(r["layer_type"]) as MapLayer["layerType"],
      isActive: Boolean(r["is_active"]),
      requiresApiKey: Boolean(r["requires_api_key"]),
      refreshInterval: r["refresh_interval"] ? String(r["refresh_interval"]) : null,
      status: String(r["status"]) as MapLayer["status"],
    }));
  } catch {
    return SEED_MAP_LAYERS;
  }
}

export async function getProjectGeoJSON(
  projectId: string,
  projectName: string,
  canonicalBoundary?: CanonicalProjectBoundary | null,
): Promise<GeoFeatureCollection> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "GeoJSON-eksport er ikke tilgængelig i preview-tilstand, fordi projektdata ikke kan verificeres mod databasen.",
    );
  }

  const db = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };

  const { data, error } = await db.rpc("get_project_geojson", {
    input_project_id: projectId,
  });
  if (error) {
    const detail =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "ukendt databasefejl";
    throw new Error(`Kunne ikke hente projektets GeoJSON: ${detail}`);
  }
  if (!data) throw new Error("Databasen returnerede intet GeoJSON for projektet.");

  const normalized = normalizeProjectGeoJSON(data, projectId, projectName);
  const observationCount = normalized.features.filter(
    (feature) => feature.properties["feature_class"] === "observation",
  ).length;
  if (observationCount >= GEOJSON_OBSERVATION_RPC_LIMIT) {
    throw new Error(
      `GeoJSON-eksporten indeholder ${observationCount} observationer og kan være afkortet ved databasegrænsen på ${GEOJSON_OBSERVATION_RPC_LIMIT}. Eksporten er derfor stoppet for ikke at fremstå komplet.`,
    );
  }

  return includeCanonicalProjectBoundary(normalized, projectId, projectName, canonicalBoundary);
}

function validateMetricsTimestamp(calculatedAt: unknown): string {
  if (typeof calculatedAt !== "string" || !calculatedAt.trim()) {
    throw new Error("Projektmålingerne mangler et gyldigt calculated_at-tidspunkt.");
  }
  const calculatedAtMs = Date.parse(calculatedAt);
  if (!Number.isFinite(calculatedAtMs)) {
    throw new Error("Projektmålingernes calculated_at-tidspunkt er ikke en gyldig dato.");
  }

  return calculatedAt;
}

function finiteMetric(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Projektmålingernes ${field} er ikke et endeligt tal.`);
  }
  return value;
}

function nullableFiniteMetric(value: unknown, field: string): number | null {
  return value == null ? null : finiteMetric(value, field);
}

export async function getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
  if (!isSupabaseConfigured || !supabase) {
    return buildSeedMetrics(projectId);
  }

  const db = supabase as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };

  let response: { data: unknown; error: unknown };
  try {
    response = await db.rpc("get_project_metrics", {
      input_project_id: projectId,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "ukendt databasefejl";
    throw new Error(`Kunne ikke hente projektmålinger: ${detail}`);
  }

  if (response.error) {
    const detail =
      typeof response.error === "object" && response.error !== null && "message" in response.error
        ? String((response.error as { message: unknown }).message)
        : "ukendt databasefejl";
    throw new Error(`Kunne ikke hente projektmålinger: ${detail}`);
  }
  if (!response.data) throw new Error("Databasen returnerede ingen projektmålinger.");

  const d = response.data as Record<string, unknown>;
  if (typeof d["project_id"] !== "string" || d["project_id"] !== projectId) {
    throw new Error("Projektmålingernes project_id matcher ikke det anmodede projekt.");
  }
  const calculatedAt = validateMetricsTimestamp(d["calculated_at"]);
  return {
    projectId,
    totalAreaHa: finiteMetric(d["total_area_ha"], "total_area_ha"),
    protectedNatureOverlapHa: nullableFiniteMetric(
      d["protected_nature_overlap_ha"],
      "protected_nature_overlap_ha",
    ),
    observationCount: finiteMetric(d["observation_count"], "observation_count"),
    nearestWatercourseDistanceM: nullableFiniteMetric(
      d["nearest_watercourse_distance_m"],
      "nearest_watercourse_distance_m",
    ),
    latestNdvi: nullableFiniteMetric(d["latest_ndvi"], "latest_ndvi"),
    dataCompletenessScore: nullableFiniteMetric(
      d["data_completeness_score"],
      "data_completeness_score",
    ),
    calculatedAt,
  };
}
