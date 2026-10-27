import {
  area,
  intersect,
  featureCollection,
  union,
  feature,
  bbox as geometryBbox,
} from "@turf/turf";
import type { Polygon, MultiPolygon } from "geojson";
/**
 * §3-overlap Service
 * Beregner præcist overlap mellem projektpolygon og §3-beskyttede naturarealer.
 * Kilde: Danmarks Miljøportal Arealdata WFS — gratis, ingen nøgle.
 * https://arealdata.miljoeportal.dk/api/wfs
 *
 * §3-naturtyper:
 *   p3_soe     = Søer
 *   p3_mose    = Moser
 *   p3_eng     = Enge
 *   p3_hede    = Heder
 *   p3_overdrev = Overdrev
 *   p3_strand  = Strandenge og strandsumpe
 */

export const OFFICIAL_NATURE_SOURCE =
  "https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:beskyttede-naturtyper";
export const OFFICIAL_WATERCOURSE_SOURCE =
  "https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:beskyttede-vandloeb";
// Copy the current WFS URL and type names from the official dataset distribution.
// The historic /gis/ows URL now serves HTML; do not silently label that as an empty result.
const WFS_BASE = import.meta.env.VITE_DMP_WFS_URL as string | undefined;
const NATURDATA_BASE = "https://naturdata.miljoeportal.dk/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Paragraph3Area {
  id: string;
  natureType: string; // dansk navn
  typeCode: string; // p3_eng, p3_mose osv.
  areaHa: number;
  geometry: GeoJsonGeometry | null;
  registeredYear?: number;
}

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface Paragraph3Result {
  overlapHa: number;
  overlapPercent: number; // af projektets areal
  areas: Paragraph3Area[];
  natureTypes: string[]; // unikke naturtyper
  nearestHabitatArea?: string;
  fetchedAt: string;
  mode: "live" | "preview" | "error";
}

export interface SpeciesObservation {
  scientificName: string;
  danishName: string;
  group: string;
  protected: boolean;
  redListStatus?: string;
  count: number;
  lastSeen?: string;
}

export interface BiodiversityDataResult {
  species: SpeciesObservation[];
  redListedCount: number;
  protectedCount: number;
  groupDiversity: Record<string, number>; // fugle: 12, pattedyr: 3 osv.
  fetchedAt: string;
  mode: "live" | "preview" | "error";
}

// ─── §3 Overlap ───────────────────────────────────────────────────────────────

const P3_TYPES = [
  { code: "p3_soe", label: "Sø" },
  { code: "p3_mose", label: "Mose" },
  { code: "p3_eng", label: "Eng" },
  { code: "p3_hede", label: "Hede" },
  { code: "p3_overdrev", label: "Overdrev" },
  { code: "p3_strandeng", label: "Strandeng" },
];

/**
 * Henter §3-arealer indenfor bbox via Miljøportalens WFS.
 * Beregner overlap med projektets areal (approximeret via bbox-intersection).
 */
export async function fetchParagraph3Overlap(
  lat: number,
  lng: number,
  areaHa: number,
  delta = 0.02,
  projectGeometry?: Polygon | MultiPolygon | null,
): Promise<Paragraph3Result> {
  if (!WFS_BASE)
    throw new Error("Officielt §3-lag afventer gyldig WFS-konfiguration fra Arealdata.");
  if (!projectGeometry) throw new Error("§3-overlap er ikke målt: projektpolygon mangler.");
  const bbox = geometryBbox(feature(projectGeometry)).join(",");

  const areas: Paragraph3Area[] = [];

  // Hent alle §3-typer parallelt
  const results = await Promise.allSettled(
    P3_TYPES.map(async ({ code, label }) => {
      const params = new URLSearchParams({
        service: "WFS",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: `${import.meta.env.VITE_DMP_WFS_NAMESPACE ?? "mp"}:${code}`,
        outputFormat: "application/json",
        bbox: `${bbox},EPSG:4326`,
        srsName: "EPSG:4326",
        count: "50",
      });

      const res = await fetch(`${WFS_BASE}?${params}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`§3 WFS HTTP ${res.status}`);

      const json = (await res.json()) as {
        features?: Array<{
          id?: string;
          geometry?: GeoJsonGeometry;
          properties?: Record<string, unknown>;
        }>;
      };

      if (!Array.isArray(json.features)) throw new Error("§3-kilden returnerede ikke GeoJSON.");
      if (json.features.length >= 50)
        throw new Error("§3-udtræk er afkortet. Reducér område eller konfigurér paginering.");
      return json.features.map((f, i): Paragraph3Area => {
        if (!f.geometry || !["Polygon", "MultiPolygon"].includes(f.geometry.type))
          throw new Error("§3-laget indeholder ugyldig geometri.");
        const props = f.properties ?? {};
        // Areal i m² i properties, konvertér til ha
        const areaM2 =
          (props["areal_m2"] as number | undefined) ??
          (props["Shape_Area"] as number | undefined) ??
          0;
        return {
          id: f.id ?? `${code}-${i}`,
          natureType: label,
          typeCode: code,
          areaHa: Math.round((areaM2 / 10_000) * 10) / 10,
          geometry: f.geometry ?? null,
          registeredYear: props["registreringsaar"] as number | undefined,
        };
      });
    }),
  );

  if (results.some((r) => r.status === "rejected"))
    throw new Error(
      "Ét eller flere officielle §3-lag kunne ikke hentes. Ingen overlapberegning udført.",
    );
  results.forEach((r) => {
    if (r.status === "fulfilled") areas.push(...r.value);
  });

  if (areas.length === 0) {
    // Ingen §3 fundet i området — returner real nul-resultat
    return {
      overlapHa: 0,
      overlapPercent: 0,
      areas: [],
      natureTypes: [],
      fetchedAt: new Date().toISOString(),
      mode: "live",
    };
  }

  const valid = areas
    .map((a) => a.geometry)
    .filter(
      (g): g is Polygon | MultiPolygon => g?.type === "Polygon" || g?.type === "MultiPolygon",
    );
  const features = valid.map((g) => feature(g));
  const dissolved = features.length > 1 ? union(featureCollection(features)) : features[0];
  const overlap = dissolved
    ? intersect(featureCollection([feature(projectGeometry), dissolved]))
    : null;
  const overlapHa = overlap ? area(overlap) / 10000 : 0;
  const measuredProjectHa = area(feature(projectGeometry)) / 10000;
  if (measuredProjectHa <= 0) throw new Error("Projektpolygon har intet målbart areal.");
  const overlapPercent = (overlapHa / measuredProjectHa) * 100;
  const natureTypes = [...new Set(areas.map((a) => a.natureType))];

  return {
    overlapHa: Math.round(overlapHa * 10) / 10,
    overlapPercent,
    areas,
    natureTypes,
    fetchedAt: new Date().toISOString(),
    mode: "live",
  };
}

// ─── Artsobservationer ────────────────────────────────────────────────────────

/**
 * Henter artsobservationer fra Naturbasen via Miljøportalens API.
 * Returnerer arter indenfor 1km radius, inkl. rødlistestatus.
 */
export async function fetchSpeciesObservations(
  lat: number,
  lng: number,
  radiusM = 1000,
): Promise<BiodiversityDataResult> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radiusM),
    take: "100",
    skip: "0",
  });

  const res = await fetch(`${NATURDATA_BASE}/Species?${params}`, {
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) throw new Error(`Naturdata API ${res.status}`);

  const json = (await res.json()) as {
    species?: Array<{
      scientificName?: string;
      danishName?: string;
      group?: string;
      protected?: boolean;
      redListStatus?: string;
      count?: number;
      lastObserved?: string;
    }>;
  };

  const species: SpeciesObservation[] = (json.species ?? []).map((s) => ({
    scientificName: s.scientificName ?? "Ukendt",
    danishName: s.danishName ?? s.scientificName ?? "Ukendt",
    group: s.group ?? "Ukendt",
    protected: s.protected ?? false,
    redListStatus: s.redListStatus,
    count: s.count ?? 1,
    lastSeen: s.lastObserved,
  }));

  const redListedCount = species.filter(
    (s) => s.redListStatus && !["LC", "NA", "DD"].includes(s.redListStatus),
  ).length;

  const protectedCount = species.filter((s) => s.protected).length;

  const groupDiversity: Record<string, number> = {};
  species.forEach((s) => {
    groupDiversity[s.group] = (groupDiversity[s.group] ?? 0) + 1;
  });

  return {
    species,
    redListedCount,
    protectedCount,
    groupDiversity,
    fetchedAt: new Date().toISOString(),
    mode: "live",
  };
}

// ─── Vandløb ──────────────────────────────────────────────────────────────────

export interface WatercourseFeature {
  id: string;
  name?: string;
  coordinates: number[][]; // [lng, lat] par langs linjen
}

/**
 * Henter vandløbslinjer indenfor bbox via Miljøportalens WFS.
 * Returnerer LineString-koordinater klar til Leaflet polylines.
 */
export async function fetchWatercourses(
  lat: number,
  lng: number,
  delta = 0.02,
): Promise<WatercourseFeature[]> {
  if (!WFS_BASE || !import.meta.env.VITE_DMP_PROTECTED_WATERCOURSE_TYPENAME)
    throw new Error("Beskyttede vandløb afventer officiel WFS-konfiguration fra Arealdata.");
  {
    const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
    const params = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: import.meta.env.VITE_DMP_PROTECTED_WATERCOURSE_TYPENAME,
      outputFormat: "application/json",
      bbox: `${bbox},EPSG:4326`,
      srsName: "EPSG:4326",
      count: "50",
    });

    const res = await fetch(`${WFS_BASE}?${params}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Beskyttede vandløb WFS HTTP ${res.status}`);

    const json = (await res.json()) as {
      features?: Array<{
        id?: string;
        geometry?: { type: string; coordinates: unknown };
        properties?: Record<string, unknown>;
      }>;
    };

    if (!Array.isArray(json.features)) throw new Error("Vandløbskilden returnerede ikke GeoJSON.");
    if (json.features.length >= 50)
      throw new Error("Vandløbsudtræk er afkortet; fuld dækning er ukendt.");
    const out: WatercourseFeature[] = [];
    (json.features ?? []).forEach((f, i) => {
      const geom = f.geometry;
      if (!geom) return;
      const name = (f.properties?.["navn"] ?? f.properties?.["name"]) as string | undefined;
      if (geom.type === "LineString") {
        out.push({ id: f.id ?? `wl-${i}`, name, coordinates: geom.coordinates as number[][] });
      } else if (geom.type === "MultiLineString") {
        (geom.coordinates as number[][][]).forEach((line, j) => {
          out.push({ id: `${f.id ?? `wl-${i}`}-${j}`, name, coordinates: line });
        });
      }
    });
    return out;
  }
}

/**
 * Henter §3 og artsobservationer med graceful fallback til preview.
 */
export async function fetchNatureData(
  lat: number,
  lng: number,
  areaHa: number,
  projectGeometry?: Polygon | MultiPolygon | null,
): Promise<{ p3: Paragraph3Result; species: BiodiversityDataResult }> {
  const [p3, species] = await Promise.all([
    fetchParagraph3Overlap(lat, lng, areaHa, 0.02, projectGeometry),
    fetchSpeciesObservations(lat, lng),
  ]);
  return { p3, species };
}
