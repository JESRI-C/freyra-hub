import proj4 from "proj4";
import {
  MAX_NATURE_FEATURES,
  MAX_NATURE_GEOMETRY_POSITIONS,
  WATER_PLAN_NATURE_SCHEMA,
  type NativeGeometry,
  type NativePosition,
  type RegistrationCandidate,
  type WaterPlanNaturePayload,
} from "@/services/baseline/water-plan-nature-source";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type GeoCoordinates = number[] | number[][] | number[][][] | number[][][][];
export interface NatureFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: Record<string, Json>;
    geometry: { type: string; coordinates: GeoCoordinates };
  }>;
}
export const NATURE_DISPLAY_PROJECTION = {
  method: "proj4-grs80-catalog-display/v1",
  sourceCrs: "EPSG:25832",
  sourceAxisOrder: "easting-northing",
  displayCrs: "EPSG:4326",
  displayAxisOrder: "lng-lat",
  datumAssumption: "etrs89-treated-as-wgs84-without-epoch-or-grid-shift",
  surveyAccuracyVerified: false,
  heightTransformed: false,
} as const;
const ETRS89_UTM32 = "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs +type=crs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs +type=crs";

export function nativeNaturePointForDisplay(point: readonly [number, number]): NativePosition {
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !point.every(Number.isFinite) ||
    point[0] < 100_000 ||
    point[0] > 1_100_000 ||
    point[1] < 5_800_000 ||
    point[1] > 6_600_000
  )
    throw new Error("Invalid native nature coordinate");
  const projected = proj4(ETRS89_UTM32, WGS84, [...point]);
  if (
    projected.length !== 2 ||
    !projected.every(Number.isFinite) ||
    projected[0] < 7 ||
    projected[0] > 16 ||
    projected[1] < 54 ||
    projected[1] > 58
  )
    throw new Error("Invalid nature display coordinate");
  return [projected[0], projected[1]];
}
function geometryForDisplay(
  geometry: NativeGeometry,
  budget: { remaining: number },
): { type: string; coordinates: GeoCoordinates } {
  const point = (value: NativePosition) => {
    if (--budget.remaining < 0) throw new Error("Nature display position limit");
    return nativeNaturePointForDisplay(value);
  };
  switch (geometry.type) {
    case "Polygon":
      return { type: "Polygon", coordinates: geometry.coordinates.map((ring) => ring.map(point)) };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(point))),
      };
    case "LineString":
      return { type: "LineString", coordinates: geometry.coordinates.map(point) };
    case "MultiLineString":
      return {
        type: "MultiLineString",
        coordinates: geometry.coordinates.map((line) => line.map(point)),
      };
    default:
      throw new Error("Unsupported native nature geometry");
  }
}
/** Project only validated current catalogue candidates; never derive a nature_contexts row or an area/presence metric. */
export function natureCandidatesForDisplay(payload: WaterPlanNaturePayload): {
  paragraph3: NatureFeatureCollection;
  watercourses: NatureFeatureCollection;
} {
  if (
    payload.schema !== WATER_PLAN_NATURE_SCHEMA ||
    !payload.inventoryOnly ||
    payload.metricsCalculated !== false ||
    payload.legalAssessmentPerformed !== false ||
    payload.municipalReachMapped !== false ||
    payload.upstreamTransactionalSnapshot !== false
  )
    throw new Error("Invalid nature display source contract");
  const result = {
    paragraph3: { type: "FeatureCollection" as const, features: [] } as NatureFeatureCollection,
    watercourses: { type: "FeatureCollection" as const, features: [] } as NatureFeatureCollection,
  };
  const budget = { remaining: MAX_NATURE_GEOMETRY_POSITIONS };
  const productIds = new Set<string>();
  let total = 0;
  for (const product of payload.products) {
    if (
      productIds.has(product.id) ||
      !product.receivedInventoryComplete ||
      product.pagingIsTransactionSafe !== false ||
      product.matchedCount !== product.candidates.length ||
      (total += product.candidates.length) > MAX_NATURE_FEATURES
    )
      throw new Error("Invalid nature display inventory");
    productIds.add(product.id);
    // VP3 states remain available in the immutable baseline, never silently merged
    // into the protected-watercourse layer or resolved as the municipal reach.
    if (product.id === "vp3-watercourses") continue;
    const target =
      product.id === "protected-nature"
        ? result.paragraph3
        : product.id === "protected-watercourses"
          ? result.watercourses
          : null;
    if (!target) throw new Error("Unexpected nature display product");
    for (const candidate of product.candidates) {
      if (candidate.kind !== product.id || candidate.geometryCrs !== "EPSG:25832")
        throw new Error("Invalid nature display candidate");
      const registration = candidate as RegistrationCandidate;
      target.features.push({
        type: "Feature",
        id: candidate.featureId,
        geometry: geometryForDisplay(candidate.nativeGeometry, budget),
        properties: {
          natureType: registration.natureType?.name ?? "Vandløbsregistrering",
          registryStatus:
            registration.status.interpretation === "unknown"
              ? "Ukendt"
              : (registration.status.name ?? "Ukendt"),
          registryStatusSourceLabel: registration.status.name,
          registryStatusCode: registration.status.code,
          sourceKind: "official_registration",
          scope: "bbox_candidate",
          juridicalPresenceAssessed: false,
          reportAccepted: false,
        },
      });
    }
  }
  if (productIds.size !== 3) throw new Error("Incomplete nature display products");
  return result;
}
