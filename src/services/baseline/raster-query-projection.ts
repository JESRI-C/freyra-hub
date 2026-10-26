import proj4 from "proj4";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { validateProjectPolygon } from "@/services/geo-service";

export const RASTER_QUERY_CRS = "EPSG:25832" as const;
export const RASTER_QUERY_PROJECTION_VERSION = "proj4-grs80-catalog-envelope/v1" as const;
export const RASTER_QUERY_BUFFER_M = 25;
export const RASTER_QUERY_SAMPLE_STEP_DEGREES = 0.01;
const MAX_PROJECTED_SAMPLES = 20_000;
// Definitions are passed explicitly: proj4's default UTM definitions are WGS84.
// KDS specifies ETRS89/UTM32 (GRS80). For a buffered catalogue envelope only,
// WGS84 is treated as ETRS89 without an epoch/grid shift. This is not survey accuracy.
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs +type=crs";
const ETRS89_UTM32 = "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs +type=crs";

export interface RasterQueryProjection {
  sourceCrs: "EPSG:4326";
  sourceAxisOrder: "lng-lat";
  queryCrs: typeof RASTER_QUERY_CRS;
  queryAxisOrder: "easting-northing";
  bbox: [number, number, number, number];
  method: typeof RASTER_QUERY_PROJECTION_VERSION;
  edgeSampleStepDegrees: number;
  projectedSampleCount: number;
  queryBufferM: number;
  bboxRounding: "outward-to-integer-metres";
  datumAssumption: "wgs84-treated-as-etrs89-without-epoch-or-grid-shift";
  surveyAccuracyVerified: false;
  heightTransformed: false;
}

export function projectRasterQueryPoint(point: readonly [number, number]): [number, number] {
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !point.every(Number.isFinite) ||
    point[0] < 7 ||
    point[0] > 16 ||
    point[1] < 54 ||
    point[1] > 58
  )
    throw new Error("Rasterkatalogets koordinater skal være todimensionelle lng/lat i Danmark.");
  const result = proj4(WGS84, ETRS89_UTM32, [...point]);
  if (result.length !== 2 || !result.every(Number.isFinite))
    throw new Error("Rasterkatalogets projektion fejlede.");
  return [result[0], result[1]];
}

/** Buffered envelope for candidate discovery only, never raster pixel coverage. */
export function buildRasterQueryProjection(polygon: GeoJSONPolygon): RasterQueryProjection {
  const validated = validateProjectPolygon(polygon);
  if (!validated.valid)
    throw new Error("Rasterkataloget kræver en gyldig, gemt projektafgrænsning.");
  const ring = validated.polygon.coordinates[0];
  const projected: [number, number][] = [];
  for (let index = 0; index < ring.length - 1; index++) {
    const start = ring[index];
    const end = ring[index + 1];
    const steps = Math.max(
      1,
      Math.ceil(
        Math.max(Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1])) /
          RASTER_QUERY_SAMPLE_STEP_DEGREES,
      ),
    );
    if (projected.length + steps + 1 > MAX_PROJECTED_SAMPLES)
      throw new Error("Rasterkatalogets projektafgrænsning overskrider forespørgselsgrænsen.");
    for (let step = 0; step < steps; step++) {
      const fraction = step / steps;
      projected.push(
        projectRasterQueryPoint([
          start[0] + (end[0] - start[0]) * fraction,
          start[1] + (end[1] - start[1]) * fraction,
        ]),
      );
    }
  }
  const eastings = projected.map((point) => point[0]);
  const northings = projected.map((point) => point[1]);
  return {
    sourceCrs: "EPSG:4326",
    sourceAxisOrder: "lng-lat",
    queryCrs: RASTER_QUERY_CRS,
    queryAxisOrder: "easting-northing",
    bbox: [
      Math.floor(Math.min(...eastings) - RASTER_QUERY_BUFFER_M),
      Math.floor(Math.min(...northings) - RASTER_QUERY_BUFFER_M),
      Math.ceil(Math.max(...eastings) + RASTER_QUERY_BUFFER_M),
      Math.ceil(Math.max(...northings) + RASTER_QUERY_BUFFER_M),
    ],
    method: RASTER_QUERY_PROJECTION_VERSION,
    edgeSampleStepDegrees: RASTER_QUERY_SAMPLE_STEP_DEGREES,
    projectedSampleCount: projected.length,
    queryBufferM: RASTER_QUERY_BUFFER_M,
    bboxRounding: "outward-to-integer-metres",
    datumAssumption: "wgs84-treated-as-etrs89-without-epoch-or-grid-shift",
    surveyAccuracyVerified: false,
    heightTransformed: false,
  };
}
