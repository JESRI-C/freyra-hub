// Geospatial Service — project areas, map layers, GeoJSON and metrics
// Falls back to seed data when Supabase is not configured.

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { getProjectGeometrySeed } from "@/services/geo-service";

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
  type: string;
  coordinates: unknown;
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

function buildSeedGeoJSON(projectId: string, projectName: string): GeoFeatureCollection {
  const geometry = getProjectGeometrySeed(projectId);
  const features: GeoFeature[] = [];

  // Project area polygon
  if (geometry.polygon) {
    features.push({
      type: "Feature",
      id: `${projectId}-area`,
      geometry: geometry.polygon as unknown as GeoJSONGeometry,
      properties: {
        feature_class: "project_area",
        name: projectName,
        area_type: "pilot_area",
        area_ha: geometry.areaHa,
      },
    });
  }

  // Demo observation points near centroid
  if (geometry.centroid) {
    const { lng, lat } = geometry.centroid;
    const obsPoints = [
      { type: "soil_moisture", value: 38.2, unit: "%", offset: [0.0002, 0.0002] },
      { type: "temperature", value: 14.7, unit: "°C", offset: [0.0005, 0.0004] },
      { type: "acoustic_activity", value: 72.1, unit: "dB", offset: [0.0009, 0.0007] },
      { type: "vegetation_index", value: 0.68, unit: "NDVI", offset: [0.0, 0.0] },
      { type: "water_level", value: 1.23, unit: "m", offset: [0.0011, -0.0002] },
    ] as const;

    for (const obs of obsPoints) {
      features.push({
        type: "Feature",
        id: `${projectId}-obs-${obs.type}`,
        geometry: {
          type: "Point",
          coordinates: [lng + obs.offset[0], lat + obs.offset[1]],
        },
        properties: {
          feature_class: "observation",
          observation_type: obs.type,
          value: obs.value,
          unit: obs.unit,
          observed_at: new Date().toISOString(),
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    projectId,
    projectName,
    generatedAt: new Date().toISOString(),
    features,
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
    const { data } = await db.from("map_layers").select(
      "id,name,slug,category,provider,layer_type,is_active,requires_api_key,refresh_interval,status",
    ).eq("is_active", true);
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
): Promise<GeoFeatureCollection> {
  if (!isSupabaseConfigured || !supabase) {
    return buildSeedGeoJSON(projectId, projectName);
  }

  const db = supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  try {
    const { data, error } = await db.rpc("get_project_geojson", {
      input_project_id: projectId,
    });
    if (error || !data) return buildSeedGeoJSON(projectId, projectName);
    return data as GeoFeatureCollection;
  } catch {
    return buildSeedGeoJSON(projectId, projectName);
  }
}

export async function getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
  if (!isSupabaseConfigured || !supabase) {
    return buildSeedMetrics(projectId);
  }

  const db = supabase as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  try {
    const { data, error } = await db.rpc("get_project_metrics", {
      input_project_id: projectId,
    });
    if (error || !data) return buildSeedMetrics(projectId);
    const d = data as Record<string, unknown>;
    return {
      projectId: String(d["project_id"]),
      totalAreaHa: Number(d["total_area_ha"] ?? 0),
      protectedNatureOverlapHa: d["protected_nature_overlap_ha"] != null ? Number(d["protected_nature_overlap_ha"]) : null,
      observationCount: Number(d["observation_count"] ?? 0),
      nearestWatercourseDistanceM: d["nearest_watercourse_distance_m"] != null ? Number(d["nearest_watercourse_distance_m"]) : null,
      latestNdvi: d["latest_ndvi"] != null ? Number(d["latest_ndvi"]) : null,
      dataCompletenessScore: d["data_completeness_score"] != null ? Number(d["data_completeness_score"]) : null,
      calculatedAt: String(d["calculated_at"] ?? new Date().toISOString()),
    };
  } catch {
    return buildSeedMetrics(projectId);
  }
}
