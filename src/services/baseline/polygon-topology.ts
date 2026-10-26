import { booleanValid, feature, kinks } from "@turf/turf";
import type { Polygon, MultiPolygon } from "geojson";

/** Ingestion only: reject whole invalid features without repairing or changing their shape. */
export function hasUsablePolygonTopology(geometry: Polygon | MultiPolygon): boolean {
  try {
    return booleanValid(feature(geometry)) && kinks(geometry).features.length === 0;
  } catch {
    return false;
  }
}

export const POLYGON_TOPOLOGY_METHOD = "turf-boolean-valid-and-kinks/v1";
