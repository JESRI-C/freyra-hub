import type { Feature as GeoJSONLibFeature } from "geojson";
import type {
  GeoJSONPolygon,
  GeoJSONPosition,
  GeoJSONFeature,
  ProjectGeometry,
} from "@/lib/supabase/types";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export interface BufferZonesGeoJSON {
  buffer100m: GeoJSONLibFeature | null;
  buffer500m: GeoJSONLibFeature | null;
  buffer1000m: GeoJSONLibFeature | null;
}
import { SEED_PROJECT_GEOMETRIES } from "@/data/platform-seed";

export type ProjectPolygonValidationCode =
  | "NOT_AN_OBJECT"
  | "FEATURE_COLLECTION_UNSUPPORTED"
  | "MULTIPOLYGON_UNSUPPORTED"
  | "GEOMETRY_TYPE_UNSUPPORTED"
  | "COORDINATES_MISSING"
  | "TOO_MANY_VERTICES"
  | "RING_TOO_SHORT"
  | "POSITION_INVALID"
  | "POSITION_NOT_FINITE"
  | "POSITION_OUT_OF_RANGE"
  | "RING_NOT_CLOSED"
  | "TOO_FEW_UNIQUE_POINTS"
  | "DUPLICATE_CONSECUTIVE_POINT"
  | "SELF_INTERSECTION"
  | "ZERO_AREA"
  | "HOLE_OUTSIDE_OUTER_RING"
  | "HOLE_INTERSECTS_OUTER_RING"
  | "HOLES_INTERSECT"
  | "HOLES_NESTED";

export type ProjectPolygonValidationResult =
  | { valid: true; polygon: GeoJSONPolygon }
  | { valid: false; code: ProjectPolygonValidationCode; error: string };

export interface ProjectGeometryParseResult {
  geometry: ProjectGeometry;
  error: string | null;
}

const EMPTY_BUFFERS = {
  buffer100m: false,
  buffer500m: false,
  buffer1000m: false,
} as const;

const EPSILON = 1e-12;

/**
 * Maximum number of real Polygon vertices across the outer ring and holes.
 * GeoJSON's repeated closing positions are not counted. The limit is checked
 * before the quadratic self/inter-ring intersection checks.
 */
export const MAX_PROJECT_POLYGON_VERTICES = 500;

/**
 * GeoJSON uploads only contain one project Polygon (at most 500 vertices), so
 * a 2 MiB cap leaves ample room for formatting/properties while bounding the
 * memory used by `File.text()` and `JSON.parse()` in the browser.
 */
export const MAX_PROJECT_GEOMETRY_UPLOAD_BYTES = 2 * 1024 * 1024;

export function getProjectGeometryUploadSizeError(sizeBytes: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "Filstørrelsen kunne ikke valideres.";
  }
  if (sizeBytes > MAX_PROJECT_GEOMETRY_UPLOAD_BYTES) {
    return `GeoJSON-filen er for stor (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Maksimum er 2 MB.`;
  }
  return null;
}

function invalidPolygon(
  code: ProjectPolygonValidationCode,
  error: string,
): ProjectPolygonValidationResult {
  return { valid: false, code, error };
}

function samePosition(a: number[], b: number[]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function orientation(a: number[], b: number[], c: number[]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point: number[], start: number[], end: number[]): boolean {
  return (
    Math.abs(orientation(start, end, point)) <= EPSILON &&
    point[0] >= Math.min(start[0], end[0]) - EPSILON &&
    point[0] <= Math.max(start[0], end[0]) + EPSILON &&
    point[1] >= Math.min(start[1], end[1]) - EPSILON &&
    point[1] <= Math.max(start[1], end[1]) + EPSILON
  );
}

function segmentsIntersect(a1: number[], a2: number[], b1: number[], b2: number[]): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (
    ((o1 > EPSILON && o2 < -EPSILON) || (o1 < -EPSILON && o2 > EPSILON)) &&
    ((o3 > EPSILON && o4 < -EPSILON) || (o3 < -EPSILON && o4 > EPSILON))
  ) {
    return true;
  }

  return (
    pointOnSegment(b1, a1, a2) ||
    pointOnSegment(b2, a1, a2) ||
    pointOnSegment(a1, b1, b2) ||
    pointOnSegment(a2, b1, b2)
  );
}

function ringSelfIntersects(ring: number[][]): boolean {
  const segmentCount = ring.length - 1;
  for (let first = 0; first < segmentCount; first++) {
    for (let second = first + 1; second < segmentCount; second++) {
      const adjacent = second === first + 1 || (first === 0 && second === segmentCount - 1);
      if (adjacent) continue;
      if (segmentsIntersect(ring[first], ring[first + 1], ring[second], ring[second + 1])) {
        return true;
      }
    }
  }
  return false;
}

function ringsIntersect(firstRing: number[][], secondRing: number[][]): boolean {
  for (let first = 0; first < firstRing.length - 1; first++) {
    for (let second = 0; second < secondRing.length - 1; second++) {
      if (
        segmentsIntersect(
          firstRing[first],
          firstRing[first + 1],
          secondRing[second],
          secondRing[second + 1],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function classifyPointInRing(point: number[], ring: number[][]): "inside" | "outside" | "boundary" {
  for (let index = 0; index < ring.length - 1; index++) {
    if (pointOnSegment(point, ring[index], ring[index + 1])) return "boundary";
  }

  let inside = false;
  for (
    let current = 0, previous = ring.length - 2;
    current < ring.length - 1;
    previous = current++
  ) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    const crossesLatitude = currentPoint[1] > point[1] !== previousPoint[1] > point[1];
    if (!crossesLatitude) continue;

    const crossingLongitude =
      ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
        (previousPoint[1] - currentPoint[1]) +
      currentPoint[0];
    if (point[0] < crossingLongitude) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

function signedRingArea(ring: number[][]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

interface RingMassProperties {
  area: number;
  centroid: GeoJSONPosition;
}

function ringMassProperties(ring: number[][]): RingMassProperties | null {
  if (ring.length < 4) return null;

  // Translate around the first point before applying the shoelace formula.
  // This avoids cancellation from multiplying full WGS84 coordinates.
  const originLng = ring[0][0];
  const originLat = ring[0][1];
  let twiceSignedArea = 0;
  let weightedLng = 0;
  let weightedLat = 0;

  for (let index = 0; index < ring.length - 1; index++) {
    const currentLng = ring[index][0] - originLng;
    const currentLat = ring[index][1] - originLat;
    const nextLng = ring[index + 1][0] - originLng;
    const nextLat = ring[index + 1][1] - originLat;
    const cross = currentLng * nextLat - nextLng * currentLat;
    twiceSignedArea += cross;
    weightedLng += (currentLng + nextLng) * cross;
    weightedLat += (currentLat + nextLat) * cross;
  }

  if (Math.abs(twiceSignedArea) <= EPSILON) return null;
  return {
    area: Math.abs(twiceSignedArea) / 2,
    centroid: {
      lng: originLng + weightedLng / (3 * twiceSignedArea),
      lat: originLat + weightedLat / (3 * twiceSignedArea),
    },
  };
}

/**
 * Fail-closed validation for the Polygon contract currently supported by the
 * project editor. Coordinates must be WGS84 `[longitude, latitude]`.
 */
export function validateProjectPolygon(input: unknown): ProjectPolygonValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalidPolygon("NOT_AN_OBJECT", "GeoJSON-geometrien skal være et objekt.");
  }

  const obj = input as Record<string, unknown>;
  if (obj["type"] === "FeatureCollection") {
    return invalidPolygon(
      "FEATURE_COLLECTION_UNSUPPORTED",
      "FeatureCollection understøttes ikke som projektgrænse. Vælg én Polygon-feature.",
    );
  }
  if (obj["type"] === "MultiPolygon") {
    return invalidPolygon(
      "MULTIPOLYGON_UNSUPPORTED",
      "MultiPolygon understøttes ikke endnu. Upload én sammenhængende Polygon.",
    );
  }
  if (obj["type"] !== "Polygon") {
    return invalidPolygon(
      "GEOMETRY_TYPE_UNSUPPORTED",
      `Projektgrænsen skal være en GeoJSON Polygon, ikke ${String(obj["type"] ?? "ukendt type")}.`,
    );
  }

  const coordinates = obj["coordinates"];
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return invalidPolygon("COORDINATES_MISSING", "Polygonen mangler koordinatringe.");
  }

  // A valid GeoJSON ring repeats its first position at the end. Count the
  // actual vertices (ring length minus that closing position) before any
  // O(n²) topology checks. Invalid/open rings are rejected below before those
  // checks run.
  let vertexCount = 0;
  for (const ring of coordinates) {
    if (!Array.isArray(ring)) continue;
    vertexCount += Math.max(0, ring.length - 1);
    if (vertexCount > MAX_PROJECT_POLYGON_VERTICES) {
      return invalidPolygon(
        "TOO_MANY_VERTICES",
        `Polygonen har ${vertexCount} punkter. Maksimum er ${MAX_PROJECT_POLYGON_VERTICES} punkter i alt på tværs af yderring og huller. Forenkl geometrien og prøv igen.`,
      );
    }
  }

  const validatedRings: number[][][] = [];
  for (let ringIndex = 0; ringIndex < coordinates.length; ringIndex++) {
    const ring = coordinates[ringIndex];
    const ringLabel = ringIndex === 0 ? "Yderringen" : `Hul ${ringIndex}`;
    if (!Array.isArray(ring) || ring.length < 4) {
      return invalidPolygon(
        "RING_TOO_SHORT",
        `${ringLabel} skal have mindst tre punkter samt et afsluttende gentaget punkt.`,
      );
    }

    for (let positionIndex = 0; positionIndex < ring.length; positionIndex++) {
      const position = ring[positionIndex];
      if (!Array.isArray(position) || position.length < 2) {
        return invalidPolygon(
          "POSITION_INVALID",
          `${ringLabel}, koordinat ${positionIndex + 1}, skal være [længdegrad, breddegrad].`,
        );
      }
      const [longitude, latitude] = position;
      if (typeof longitude !== "number" || typeof latitude !== "number") {
        return invalidPolygon(
          "POSITION_INVALID",
          `${ringLabel}, koordinat ${positionIndex + 1}, skal indeholde tal.`,
        );
      }
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return invalidPolygon(
          "POSITION_NOT_FINITE",
          `${ringLabel}, koordinat ${positionIndex + 1}, indeholder en ikke-endelig værdi.`,
        );
      }
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        return invalidPolygon(
          "POSITION_OUT_OF_RANGE",
          `${ringLabel}, koordinat ${positionIndex + 1}, ligger uden for WGS84-intervallet.`,
        );
      }
      if (positionIndex > 0 && samePosition(position, ring[positionIndex - 1])) {
        return invalidPolygon(
          "DUPLICATE_CONSECUTIVE_POINT",
          `${ringLabel} har to ens nabopunkter ved koordinat ${positionIndex + 1}.`,
        );
      }
    }

    if (!samePosition(ring[0], ring[ring.length - 1])) {
      return invalidPolygon(
        "RING_NOT_CLOSED",
        `${ringLabel} er ikke lukket: sidste koordinat skal være identisk med den første.`,
      );
    }

    const uniquePositions = new Set(
      ring.slice(0, -1).map((position) => `${position[0]},${position[1]}`),
    );
    if (uniquePositions.size < 3) {
      return invalidPolygon(
        "TOO_FEW_UNIQUE_POINTS",
        `${ringLabel} skal indeholde mindst tre forskellige punkter.`,
      );
    }
    const validatedRing = ring as number[][];
    if (ringSelfIntersects(validatedRing)) {
      return invalidPolygon(
        "SELF_INTERSECTION",
        `${ringLabel} krydser sig selv. Flyt eller fjern de krydsende punkter.`,
      );
    }
    if (Math.abs(signedRingArea(validatedRing)) <= EPSILON) {
      return invalidPolygon("ZERO_AREA", `${ringLabel} omslutter ikke et areal.`);
    }
    validatedRings.push(validatedRing);
  }

  const outerRing = validatedRings[0];
  for (let holeIndex = 1; holeIndex < validatedRings.length; holeIndex++) {
    const hole = validatedRings[holeIndex];
    if (ringsIntersect(outerRing, hole)) {
      return invalidPolygon(
        "HOLE_INTERSECTS_OUTER_RING",
        `Hul ${holeIndex} krydser eller berører yderringen. Hullet skal ligge helt inden for projektgrænsen.`,
      );
    }
    if (classifyPointInRing(hole[0], outerRing) !== "inside") {
      return invalidPolygon(
        "HOLE_OUTSIDE_OUTER_RING",
        `Hul ${holeIndex} ligger uden for yderringen. Hullet skal ligge helt inden for projektgrænsen.`,
      );
    }

    for (let otherHoleIndex = 1; otherHoleIndex < holeIndex; otherHoleIndex++) {
      const otherHole = validatedRings[otherHoleIndex];
      if (ringsIntersect(otherHole, hole)) {
        return invalidPolygon(
          "HOLES_INTERSECT",
          `Hul ${otherHoleIndex} og hul ${holeIndex} krydser eller berører hinanden.`,
        );
      }
      if (
        classifyPointInRing(hole[0], otherHole) === "inside" ||
        classifyPointInRing(otherHole[0], hole) === "inside"
      ) {
        return invalidPolygon(
          "HOLES_NESTED",
          `Hul ${otherHoleIndex} og hul ${holeIndex} må ikke overlappe eller ligge inden i hinanden.`,
        );
      }
    }
  }

  return { valid: true, polygon: obj as unknown as GeoJSONPolygon };
}

/**
 * Validate a GeoJSON polygon: must be Polygon type with at least 4 positions
 * (first == last) in the outer ring.
 */
export function validateGeoJSONPolygon(input: unknown): input is GeoJSONPolygon {
  return validateProjectPolygon(input).valid;
}

/** Compute the area-weighted centroid, subtracting any validated hole rings. */
export function computeCentroid(polygon: GeoJSONPolygon): GeoJSONPosition | null {
  const [outerRing, ...holeRings] = polygon.coordinates;
  if (!outerRing) return null;

  const outer = ringMassProperties(outerRing);
  if (!outer) return null;

  let netArea = outer.area;
  let weightedLng = outer.centroid.lng * outer.area;
  let weightedLat = outer.centroid.lat * outer.area;
  for (const holeRing of holeRings) {
    const hole = ringMassProperties(holeRing);
    if (!hole) return null;
    netArea -= hole.area;
    weightedLng -= hole.centroid.lng * hole.area;
    weightedLat -= hole.centroid.lat * hole.area;
  }

  if (netArea <= EPSILON) return null;
  return { lng: weightedLng / netArea, lat: weightedLat / netArea };
}

/**
 * Estimate polygon area in hectares using the Shoelace formula
 * (flat-earth approximation — accurate enough for project areas < 50 km²).
 * 1 degree lat ≈ 111 320 m, 1 degree lng ≈ 111 320 * cos(lat) m
 */
export function computeAreaHa(polygon: GeoJSONPolygon): number {
  const rings = polygon.coordinates;
  const ring = rings[0];
  if (!ring || ring.length < 3) return 0;
  const centroid = computeCentroid(polygon);
  const cosLat = centroid ? Math.cos((centroid.lat * Math.PI) / 180) : 1;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * cosLat;

  const projectedRingArea = (candidate: number[][]) => {
    if (candidate.length < 4) return 0;
    const originX = candidate[0][0] * mPerDegLng;
    const originY = candidate[0][1] * mPerDegLat;
    let area = 0;
    for (let i = 0; i < candidate.length - 1; i++) {
      const x1 = candidate[i][0] * mPerDegLng - originX;
      const y1 = candidate[i][1] * mPerDegLat - originY;
      const x2 = candidate[i + 1][0] * mPerDegLng - originX;
      const y2 = candidate[i + 1][1] * mPerDegLat - originY;
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  };

  const outerAreaSqM = projectedRingArea(ring);
  const holesAreaSqM = rings.slice(1).reduce((sum, hole) => sum + projectedRingArea(hole), 0);
  const areaSqM = Math.max(0, outerAreaSqM - holesAreaSqM);
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
export function parseProjectGeometryDetailed(
  raw: string | object | null | undefined,
  source: ProjectGeometry["geometrySource"] = "uploaded",
): ProjectGeometryParseResult {
  const empty = (error: string | null): ProjectGeometryParseResult => ({
    geometry: {
      polygon: null,
      centroid: null,
      areaHa: null,
      hasValidGeometry: false,
      geometrySource: error === null ? "none" : source,
      bufferZones: { ...EMPTY_BUFFERS },
    },
    error,
  });

  if (!raw) {
    return empty(null);
  }

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      return empty(`Filen er ikke gyldig JSON.${detail}`);
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return empty("GeoJSON-indholdet skal være et objekt.");
  }

  const parsedObject = parsed as Record<string, unknown>;
  if (parsedObject["type"] === "FeatureCollection") {
    return empty("FeatureCollection understøttes ikke som projektgrænse. Vælg én Polygon-feature.");
  }

  // Handle GeoJSON Feature wrapper
  if (parsedObject["type"] === "Feature") {
    if (!parsedObject["geometry"] || typeof parsedObject["geometry"] !== "object") {
      return empty("GeoJSON-featuren mangler en geometri.");
    }
    parsed = (parsedObject as unknown as GeoJSONFeature).geometry;
  }

  const validation = validateProjectPolygon(parsed);
  if (!validation.valid) {
    return empty(validation.error);
  }

  const polygon = validation.polygon;
  const centroid = computeCentroid(polygon);
  const areaHa = computeAreaHa(polygon);

  return {
    geometry: {
      polygon,
      centroid,
      areaHa: Math.round(areaHa * 100) / 100,
      hasValidGeometry: true,
      geometrySource: source,
      bufferZones: buildBufferZonesMeta(),
    },
    error: null,
  };
}

export function parseProjectGeometry(
  raw: string | object | null | undefined,
  source: ProjectGeometry["geometrySource"] = "uploaded",
): ProjectGeometry {
  return parseProjectGeometryDetailed(raw, source).geometry;
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

export interface ResolveProjectGeometryOptions {
  /**
   * Seed geometry is demo data and must only be enabled by callers that know
   * they are running in preview mode. Live callers pass false so a cleared
   * database boundary stays empty.
   */
  allowSeedFallback?: boolean;
}

/**
 * Resolve a project's geometry with the persisted DB polygon taking priority
 * over seed data. Falls back to the seeded geometry (and finally an empty
 * geometry) only when the project has neither a saved polygon nor a centroid.
 */
export function resolveProjectGeometry(
  project: ProjectGeometryFields | null | undefined,
  options: ResolveProjectGeometryOptions = {},
): ProjectGeometry {
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
  const allowSeedFallback = options.allowSeedFallback ?? !isSupabaseConfigured;
  return allowSeedFallback ? getProjectGeometrySeed(project.id) : getProjectGeometrySeed("");
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
