import { z } from "zod";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { RasterQueryProjection } from "@/services/baseline/raster-query-projection";

export const PUBLIC_MONITORING_STATIONS_SCHEMA =
  "gofreyra.public-monitoring-stations-inventory/v1" as const;
export const PUBLIC_MONITORING_STATIONS_ADAPTER =
  "public-monitoring-stations-inventory/v1" as const;
export const PUBLIC_MONITORING_STATIONS_CRS = "urn:ogc:def:crs:EPSG::25832" as const;
export const MONITORING_PAGE_COUNT = 50;
export const MAX_MONITORING_PAGES = 2;
export const MAX_MONITORING_CANDIDATES = 100;
export const MAX_MONITORING_PAGE_BYTES = 1024 * 1024;
export const MAX_MONITORING_TOTAL_BYTES = 2 * 1024 * 1024;
export const MAX_MONITORING_TIMEOUT_MS = 20_000;
export const PUBLIC_MONITORING_STATIONS_PRODUCT = {
  id: "vanda-sites",
  title: "Steder - undersøgelser",
  endpoint: "https://vanda-geo.miljoeportal.dk/geoserver/wfs",
  layer: "vanda:steder",
  geometryName: "Lokation",
  sortKey: "Stationsnummer",
  wfsVersion: "2.0.0",
  catalogueId: "urn:dmp:ds:steder-undersoegelser",
  datasetVersion: null,
  licence: "CC0 1.0",
  licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.da",
  attribution: "Danmarks Miljøportal",
} as const;

export interface PublicMonitoringStationsInput {
  polygon: GeoJSONPolygon;
  dateFrom: string;
  dateTo: string;
  geometrySha256?: string;
}
export class PublicMonitoringStationsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PublicMonitoringStationsError";
  }
}
export interface PublicMonitoringSiteCandidate {
  kind: "generic_vanda_site";
  featureId: string;
  siteUuid: string;
  stationNumber: string;
  /** Unstructured public labels are omitted in v1; use station number and UUID for display. */
  sourceName: null;
  nameStatus: "omitted_unstructured_label" | "not_reported";
  sourceType: { code: null; name: null; status: "not_reported" };
  nativeGeometry: { type: "Point"; coordinates: [number, number] };
  geometryCrs: "EPSG:25832";
  geographicRole: "buffered_bbox_candidate";
  hydrometricStationRelation: "not_verified";
  watercourseRelation: "not_verified";
  catchmentRelation: "not_verified";
  municipalReachMapped: false;
  measurements: "not_fetched";
}
export interface PublicMonitoringStationsPage {
  numberMatched: number;
  numberReturned: number;
  totalFeatures: number;
  serverTimestamp: string;
  candidates: PublicMonitoringSiteCandidate[];
}
export interface PublicMonitoringStationsPayload {
  schema: typeof PUBLIC_MONITORING_STATIONS_SCHEMA;
  inventoryOnly: true;
  catalogueView: "current_received_registry";
  historicalRegistryCoverageVerified: false;
  measurementDataFetched: false;
  hydrometricStationCoverage: "not_verified";
  automaticWatercourseAssociationPerformed: false;
  automaticCatchmentAssociationPerformed: false;
  municipalReachMapped: false;
  legalAssessmentPerformed: false;
  metricsCalculated: false;
  upstreamTransactionalSnapshot: false;
  geometrySha256: string;
  requestedPeriod: { from: string; to: string };
  queryProjection: RasterQueryProjection;
  product: typeof PUBLIC_MONITORING_STATIONS_PRODUCT & {
    versionBasis: "received_page_hashes";
    receivedInventoryComplete: true;
    pagingIsTransactionSafe: false;
    matchedCount: number;
    candidates: PublicMonitoringSiteCandidate[];
  };
  pages: {
    queryUrl: string;
    responseSha256: string;
    responseBytes: number;
    startIndex: number;
    requestedCount: number;
    sortKey: "Stationsnummer";
    numberMatched: number;
    numberReturned: number;
    totalFeatures: number;
    /** Time of the server's received catalogue page, never a measurement timestamp. */
    serverTimestamp: string;
  }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NativeBbox = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const NativePoint = z
  .object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number().finite(), z.number().finite()]),
  })
  .strict();
const SiteProperties = z.object({
  Stationsnummer: z.string().regex(/^\d{8}$/),
  Stationsnavn: z.string().max(500),
});
const Feature = z
  .object({
    type: z.literal("Feature"),
    id: z.string().max(64),
    geometry_name: z.literal("Lokation"),
    geometry: NativePoint,
    properties: SiteProperties,
    bbox: NativeBbox.optional(),
  })
  .strict();
const Page = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(Feature).max(MONITORING_PAGE_COUNT),
    numberMatched: z.number().int().nonnegative(),
    numberReturned: z.number().int().nonnegative(),
    totalFeatures: z.number().int().nonnegative(),
    timeStamp: z.string().datetime({ offset: true }),
    bbox: NativeBbox.optional(),
    links: z
      .array(
        z
          .object({
            title: z.string().max(200),
            type: z.literal("application/json"),
            rel: z.enum(["next", "previous"]),
            href: z.string().url().max(4000),
          })
          .strict(),
      )
      .max(2)
      .optional(),
    crs: z
      .object({
        type: z.literal("name"),
        properties: z.object({ name: z.literal(PUBLIC_MONITORING_STATIONS_CRS) }).strict(),
      })
      .strict()
      .nullable(),
  })
  .strict();
function invalid(code: string, message: string): never {
  throw new PublicMonitoringStationsError(code, message);
}
export function validateMonitoringNativeBbox(raw: unknown): [number, number, number, number] {
  const result = NativeBbox.safeParse(raw);
  if (!result.success) invalid("INVALID_QUERY", "Stationsinventarets område er ugyldigt.");
  const [minX, minY, maxX, maxY] = result.data;
  if (
    minX < 200_000 ||
    maxX > 950_000 ||
    minY < 5_900_000 ||
    maxY > 6_500_000 ||
    minX >= maxX ||
    minY >= maxY
  )
    invalid("INVALID_QUERY", "Stationsinventarets område er ugyldigt.");
  return result.data;
}
export function buildPublicMonitoringStationsUrl(
  bbox: readonly number[],
  startIndex: number,
  count = MONITORING_PAGE_COUNT,
): string {
  const safeBbox = validateMonitoringNativeBbox(bbox);
  if (
    !Number.isInteger(startIndex) ||
    startIndex < 0 ||
    startIndex >= MAX_MONITORING_CANDIDATES ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MONITORING_PAGE_COUNT ||
    startIndex % count !== 0 ||
    startIndex >= MAX_MONITORING_PAGES * count
  )
    invalid("INVALID_QUERY", "Stationsinventarets sideforespørgsel er ugyldig.");
  const url = new URL(PUBLIC_MONITORING_STATIONS_PRODUCT.endpoint);
  url.search = new URLSearchParams({
    service: "WFS",
    request: "GetFeature",
    version: "2.0.0",
    typeNames: PUBLIC_MONITORING_STATIONS_PRODUCT.layer,
    srsName: PUBLIC_MONITORING_STATIONS_CRS,
    bbox: [...safeBbox, PUBLIC_MONITORING_STATIONS_CRS].join(","),
    outputFormat: "application/json",
    count: String(count),
    startIndex: String(startIndex),
    sortBy: `${PUBLIC_MONITORING_STATIONS_PRODUCT.sortKey} A`,
  }).toString();
  return url.toString();
}
function sourceName(raw: string): Pick<PublicMonitoringSiteCandidate, "sourceName" | "nameStatus"> {
  const name = raw.trim();
  if (!name) return { sourceName: null, nameStatus: "not_reported" };
  // Regex redaction cannot guarantee that a free-text station label contains no people/addresses.
  return { sourceName: null, nameStatus: "omitted_unstructured_label" };
}

/** Parse a bounded received page only. No station-type, river or temporal-coverage inference. */
export function parsePublicMonitoringStationsPage(
  raw: unknown,
  bbox: readonly number[],
  startIndex: number,
  count = MONITORING_PAGE_COUNT,
): PublicMonitoringStationsPage {
  buildPublicMonitoringStationsUrl(bbox, startIndex, count);
  const parsed = Page.safeParse(raw);
  if (!parsed.success)
    invalid("INVALID_SCHEMA", "Stationskilden returnerede et ukendt eller ugyldigt schema.");
  const page = parsed.data;
  if (
    page.numberMatched > MAX_MONITORING_CANDIDATES ||
    page.numberMatched > MAX_MONITORING_PAGES * count
  )
    invalid("CANDIDATE_LIMIT", "Stationsinventaret overskrider kandidatgrænsen.");
  if (
    page.totalFeatures !== page.numberMatched ||
    page.numberReturned !== page.features.length ||
    page.numberReturned !== Math.min(count, Math.max(0, page.numberMatched - startIndex)) ||
    startIndex > page.numberMatched
  )
    invalid(
      "INCOMPLETE_INVENTORY",
      "Stationsinventarets sideantal er inkonsistent eller ufuldstændigt.",
    );
  if (page.crs === null && page.numberMatched !== 0)
    invalid("INVALID_CRS", "Stationsinventarets native koordinatsystem mangler.");
  const linkRelations = new Set<string>();
  for (const link of page.links ?? []) {
    if (
      linkRelations.has(link.rel) ||
      (link.rel === "next" && startIndex + page.numberReturned >= page.numberMatched) ||
      (link.rel === "previous" && startIndex === 0)
    )
      invalid(
        "INCOMPLETE_INVENTORY",
        "Stationsinventarets sidemarkører modsiger de modtagne sideantal.",
      );
    linkRelations.add(link.rel);
  }
  const [minX, minY, maxX, maxY] = validateMonitoringNativeBbox(bbox);
  if (
    page.bbox !== undefined &&
    (page.numberReturned === 0 ||
      page.bbox[0] > page.bbox[2] ||
      page.bbox[1] > page.bbox[3] ||
      page.bbox[0] < minX ||
      page.bbox[1] < minY ||
      page.bbox[2] > maxX ||
      page.bbox[3] > maxY)
  )
    invalid("INVALID_BBOX", "Stationsinventarets sideområde er ugyldigt.");
  const siteIds = new Set<string>(),
    stationIds = new Set<string>();
  let previousStation: string | undefined;
  const candidates: PublicMonitoringSiteCandidate[] = page.features.map((feature) => {
    const siteUuid = feature.id.startsWith("steder.") ? feature.id.slice(7) : "";
    if (!UUID.test(siteUuid))
      invalid("INVALID_ID", "Stationsinventarets stedidentitet er ugyldig.");
    const normalizedId = siteUuid.toLowerCase();
    const stationNumber = feature.properties.Stationsnummer;
    if (siteIds.has(normalizedId) || stationIds.has(stationNumber))
      invalid("CONFLICTING_ID", "Stationsinventaret gentog et sted eller stationsnummer.");
    if (previousStation !== undefined && previousStation >= stationNumber)
      invalid("SORT_CHANGED", "Stationsinventarets sorteringsrækkefølge er inkonsistent.");
    previousStation = stationNumber;
    siteIds.add(normalizedId);
    stationIds.add(stationNumber);
    const [x, y] = feature.geometry.coordinates;
    if (
      feature.bbox !== undefined &&
      (feature.bbox[0] !== x ||
        feature.bbox[1] !== y ||
        feature.bbox[2] !== x ||
        feature.bbox[3] !== y)
    )
      invalid("INVALID_BBOX", "Stationsinventarets punktområde er inkonsistent.");
    if (
      page.bbox !== undefined &&
      (x < page.bbox[0] || y < page.bbox[1] || x > page.bbox[2] || y > page.bbox[3])
    )
      invalid("INVALID_BBOX", "Stationsinventarets punkt ligger uden for sidens område.");
    if (x < minX || x > maxX || y < minY || y > maxY)
      invalid("OUT_OF_QUERY", "Stationskilden returnerede et punkt uden for forespørgselsområdet.");
    return {
      kind: "generic_vanda_site",
      featureId: feature.id,
      siteUuid: normalizedId,
      stationNumber,
      ...sourceName(feature.properties.Stationsnavn),
      sourceType: { code: null, name: null, status: "not_reported" },
      nativeGeometry: { type: "Point", coordinates: [x, y] },
      geometryCrs: "EPSG:25832",
      geographicRole: "buffered_bbox_candidate",
      hydrometricStationRelation: "not_verified",
      watercourseRelation: "not_verified",
      catchmentRelation: "not_verified",
      municipalReachMapped: false,
      measurements: "not_fetched",
    };
  });
  return {
    numberMatched: page.numberMatched,
    numberReturned: page.numberReturned,
    totalFeatures: page.totalFeatures,
    serverTimestamp: page.timeStamp,
    candidates,
  };
}
