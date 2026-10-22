import type { Feature as GeoJSONLibFeature } from "geojson";
import type {
  GeoJSONPolygon,
  GeoJSONPosition,
  GeoJSONFeature,
  ProjectGeometry,
} from "@/lib/supabase/types";

export interface BufferZonesGeoJSON {
  buffer100m: GeoJSONLibFeature | null;
  buffer500m: GeoJSONLibFeature | null;
  buffer1000m: GeoJSONLibFeature | null;
}
import { SEED_PROJECT_GEOMETRIES } from "@/data/platform-seed";

/**
 * Validate a GeoJSON polygon: must be Polygon type with at least 4 positions
 * (first == last) in the outer ring.
 */
export function validateGeoJSONPolygon(input: unknown): input is GeoJSONPolygon {
  if (!input || typeof input !== "object") return false;
  const obj = input as Record<string, unknown>;
  if (obj["type"] !== "Polygon") return false;
  const coords = obj["coordinates"];
  if (!Array.isArray(coords) || coords.length === 0) return false;
  const ring = coords[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return true;
}

/**
 * Compute centroid of a polygon's outer ring using the arithmetic mean
 * of all vertex coordinates (simple but sufficient for small project areas).
 */
export function computeCentroid(polygon: GeoJSONPolygon): GeoJSONPosition | null {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length === 0) return null;
  // exclude the closing vertex (same as first)
  const verts = ring.slice(0, -1);
  const lngSum = verts.reduce((s, v) => s + (v[0] ?? 0), 0);
  const latSum = verts.reduce((s, v) => s + (v[1] ?? 0), 0);
  return { lng: lngSum / verts.length, lat: latSum / verts.length };
}

/**
 * Estimate polygon area in hectares using the Shoelace formula
 * (flat-earth approximation — accurate enough for project areas < 50 km²).
 * 1 degree lat ≈ 111 320 m, 1 degree lng ≈ 111 320 * cos(lat) m
 */
export function computeAreaHa(polygon: GeoJSONPolygon): number {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 3) return 0;
  const centroid = computeCentroid(polygon);
  const cosLat = centroid ? Math.cos((centroid.lat * Math.PI) / 180) : 1;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * cosLat;

  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[i + 1] as [number, number];
    area += x1 * mPerDegLng * y2 * mPerDegLat - x2 * mPerDegLng * y1 * mPerDegLat;
  }
  const areaSqM = Math.abs(area) / 2;
  return areaSqM / 10_000; // m² → ha
}

/**
 * Haversine distance between two lat/lng points, returns metres.
 */
export function haversineDistance(a: GeoJSONPosition, b: GeoJSONPosition): number {
  const R = 6_371_000; // Earth radius in metres
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

export function buildBufferZonesMeta() {
  return {
    buffer100m: true,
    buffer500m: true,
    buffer1000m: true,
  };
}

export async function buildBufferZonesGeoJSON(
  geometry: ProjectGeometry,
): Promise<BufferZonesGeoJSON | null> {
  if (!geometry.polygon && !geometry.centroid) return null;

  const turf = await import("@turf/turf");

  let feature: ReturnType<typeof turf.polygon> | ReturnType<typeof turf.point>;
  if (geometry.polygon) {
    feature = turf.polygon(geometry.polygon.coordinates);
  } else if (geometry.centroid) {
    feature = turf.point([geometry.centroid.lng, geometry.centroid.lat]);
  } else {
    return null;
  }

  return {
    buffer100m: turf.buffer(feature, 0.1, { units: "kilometers" }) ?? null,
    buffer500m: turf.buffer(feature, 0.5, { units: "kilometers" }) ?? null,
    buffer1000m: turf.buffer(feature, 1.0, { units: "kilometers" }) ?? null,
  };
}

/**
 * Parse raw input (string JSON or object) into a ProjectGeometry.
 * Returns a geometry with hasValidGeometry=false on any parse error.
 */
export function parseProjectGeometry(
  raw: string | GeoJSONPolygon | GeoJSONFeature | null | undefined,
  source: ProjectGeometry["geometrySource"] = "uploaded",
): ProjectGeometry {
  if (!raw) {
    return {
      polygon: null,
      centroid: null,
      areaHa: null,
      hasValidGeometry: false,
      geometrySource: "none",
      bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
    };
  }

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        polygon: null,
        centroid: null,
        areaHa: null,
        hasValidGeometry: false,
        geometrySource: source,
        bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
      };
    }
  }

  // Handle GeoJSON Feature wrapper
  if ((parsed as Record<string, unknown>)["type"] === "Feature") {
    parsed = (parsed as GeoJSONFeature).geometry;
  }

  if (!validateGeoJSONPolygon(parsed)) {
    return {
      polygon: null,
      centroid: null,
      areaHa: null,
      hasValidGeometry: false,
      geometrySource: source,
      bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
    };
  }

  const polygon = parsed as GeoJSONPolygon;
  const centroid = computeCentroid(polygon);
  const areaHa = computeAreaHa(polygon);

  return {
    polygon,
    centroid,
    areaHa: Math.round(areaHa * 100) / 100,
    hasValidGeometry: true,
    geometrySource: source,
    bufferZones: buildBufferZonesMeta(),
  };
}

/** Projekt-felter der er nødvendige for at udlede geometri fra en DB-række. */
export interface ProjectGeometryFields {
  id: string;
  geometry_polygon?: object | null;
  geometry_centroid_lat?: number | null;
  geometry_centroid_lng?: number | null;
  geometry_area_ha?: number | null;
  geometry_source?: string | null;
}

/**
 * Resolve a project's geometry with the persisted DB polygon taking priority
 * over seed data. Falls back to the seeded geometry (and finally an empty
 * geometry) only when the project has neither a saved polygon nor a centroid.
 */
export function resolveProjectGeometry(project: ProjectGeometryFields | null | undefined): ProjectGeometry {
  if (!project) return getProjectGeometrySeed("");
  if (project.geometry_polygon != null || project.geometry_centroid_lat != null) {
    const parsed = parseProjectGeometry(
      (project.geometry_polygon ?? null) as GeoJSONPolygon | null,
      (project.geometry_source as ProjectGeometry["geometrySource"] | null) ?? "manual",
    );
    const centroid =
      parsed.centroid ??
      (project.geometry_centroid_lat != null && project.geometry_centroid_lng != null
        ? { lat: project.geometry_centroid_lat, lng: project.geometry_centroid_lng }
        : null);
    return {
      ...parsed,
      centroid,
      areaHa: parsed.areaHa ?? project.geometry_area_ha ?? null,
      // Et centroid uden polygon er stadig en brugbar position for kortet.
      hasValidGeometry: parsed.hasValidGeometry,
    };
  }
  return getProjectGeometrySeed(project.id);
}

/** Get geometry for a project from seed data (fallback when Supabase not configured). */
export function getProjectGeometrySeed(projectId: string): ProjectGeometry {
  return (
    SEED_PROJECT_GEOMETRIES[projectId] ?? {
      polygon: null,
      centroid: null,
      areaHa: null,
      hasValidGeometry: false,
      geometrySource: "none",
      bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
    }
  );
}
