import { length, lineString, lineSliceAlong, area, polygon } from "@turf/turf";
import type { LineString, Polygon } from "geojson";

export const WATERCOURSE_METHOD = "turf-7.3.5-geodesic-wgs84-v1";
export interface WatercourseSegment {
  id: string;
  name: string;
  fromM: number;
  toM: number;
}
export interface WatercourseVersion {
  id: string;
  project_id: string;
  organization_id: string;
  version: number;
  geometry: LineString;
  crs: "EPSG:4326";
  direction: "downstream" | "upstream" | "unknown";
  source: string;
  length_m: number;
  method: string;
  segments: WatercourseSegment[];
  created_at: string;
}

export function validateCenterline(value: unknown): LineString {
  const geometry = value as LineString;
  if (
    geometry?.type !== "LineString" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2
  )
    throw new Error("Centerlinjen skal være én LineString med mindst to punkter i EPSG:4326.");
  for (const point of geometry.coordinates) {
    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 90
    )
      throw new Error("Ugyldige koordinater. Importér længdegrad/breddegrad i EPSG:4326.");
  }
  const copy: LineString = {
    type: "LineString",
    coordinates: geometry.coordinates.map((p) => [p[0], p[1]]),
  };
  if (centerlineLength(copy) <= 0) throw new Error("Centerlinjen skal have en positiv længde.");
  return copy;
}
export function centerlineLength(geometry: LineString): number {
  return length(lineString(geometry.coordinates), { units: "meters" });
}
export function validateSegments(segments: WatercourseSegment[], lengthM: number): void {
  const sorted = [...segments].sort((a, b) => a.fromM - b.fromM);
  const ids = new Set<string>();
  sorted.forEach((s, i) => {
    if (
      !s.id ||
      ids.has(s.id) ||
      !s.name.trim() ||
      !Number.isFinite(s.fromM) ||
      !Number.isFinite(s.toM) ||
      s.fromM < 0 ||
      s.toM <= s.fromM ||
      s.toM > lengthM ||
      (i > 0 && s.fromM < sorted[i - 1].toM)
    )
      throw new Error(
        "Delstrækninger skal have unikke id’er, navn og ikke-overlappende stationering inden for linjen.",
      );
    ids.add(s.id);
  });
}
export function segmentGeometry(line: LineString, segment: WatercourseSegment): LineString {
  validateSegments([segment], centerlineLength(line));
  return lineSliceAlong(lineString(line.coordinates), segment.fromM, segment.toM, {
    units: "meters",
  }).geometry;
}
export function watercourseGeoJSON(version: WatercourseVersion) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: version.geometry,
        properties: {
          role: "watercourse_centerline",
          source: version.source,
          version: version.version,
          crs: version.crs,
          direction: version.direction,
          length_m: version.length_m,
          method: version.method,
          id: version.id,
        },
      },
      ...version.segments.map((s) => ({
        type: "Feature" as const,
        geometry: segmentGeometry(version.geometry, s),
        properties: {
          ...s,
          role: "watercourse_segment",
          centerline_version: version.id,
          method: version.method,
        },
      })),
    ],
  };
}
export interface MeasurementBasis {
  sourceIds: string[];
  version: string;
  kind: "survey_geometry" | "georeferenced_orthophoto" | "gps_photo" | "rgb_oblique";
  crs: string;
  approved: boolean;
}
export function measuredArea(geometry: Polygon, basis: MeasurementBasis) {
  if (
    !basis.approved ||
    !basis.sourceIds.length ||
    !basis.version ||
    basis.crs !== "EPSG:4326" ||
    !["survey_geometry", "georeferenced_orthophoto"].includes(basis.kind)
  )
    throw new Error(
      "Areal kræver godkendt målfast geometri med kilde, version og CRS. GPS-fotopunkter og RGB-skråfotos er ikke et arealgrundlag.",
    );
  return {
    value: area(polygon(geometry.coordinates)),
    unit: "m²",
    method: WATERCOURSE_METHOD,
    sourceIds: basis.sourceIds,
    version: basis.version,
  };
}
export interface PairPhoto {
  id: string;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  light: string | null;
  qualityFlags: string[];
}
export function photoPairFlags(before: PairPhoto, after: PairPhoto): string[] {
  const flags = [...new Set([...before.qualityFlags, ...after.qualityFlags])];
  if (before.lat == null || before.lng == null || after.lat == null || after.lng == null)
    flags.push("missing_gps");
  else if (
    centerlineLength({
      type: "LineString",
      coordinates: [
        [before.lng, before.lat],
        [after.lng, after.lat],
      ],
    }) > 20
  )
    flags.push("position_difference_over_20m");
  if (before.heading == null || after.heading == null) flags.push("missing_heading");
  else if (Math.abs(((before.heading - after.heading + 540) % 360) - 180) > 30)
    flags.push("direction_difference_over_30deg");
  if (!before.light || !after.light || before.light !== after.light)
    flags.push("lighting_not_comparable");
  if (before.id === after.id) flags.push("same_source");
  return [...new Set(flags)];
}
