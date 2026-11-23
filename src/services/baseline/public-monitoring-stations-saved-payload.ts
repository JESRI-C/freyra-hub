import { z } from "zod";
import type { PublicBaselineSource } from "./public-baseline-types";
import {
  PUBLIC_MONITORING_STATIONS_ADAPTER,
  PUBLIC_MONITORING_STATIONS_SCHEMA,
  PUBLIC_MONITORING_STATIONS_CRS,
  PUBLIC_MONITORING_STATIONS_PRODUCT,
  MONITORING_PAGE_COUNT,
  MAX_MONITORING_PAGES,
  MAX_MONITORING_CANDIDATES,
  MAX_MONITORING_PAGE_BYTES,
  MAX_MONITORING_TOTAL_BYTES,
  buildPublicMonitoringStationsUrl,
  parsePublicMonitoringStationsPage,
  type PublicMonitoringStationsPayload,
} from "./public-monitoring-stations-source";

function validDate(value: string): boolean {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}
const Timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)));
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const NativeBbox = z
  .tuple([
    z.number().finite().int(),
    z.number().finite().int(),
    z.number().finite().int(),
    z.number().finite().int(),
  ])
  .refine(
    ([minX, minY, maxX, maxY]) =>
      minX >= 200_000 &&
      maxX <= 950_000 &&
      minY >= 5_900_000 &&
      maxY <= 6_500_000 &&
      minX < maxX &&
      minY < maxY,
  );
const Candidate = z
  .object({
    kind: z.literal("generic_vanda_site"),
    featureId: z.string().min(1).max(64),
    siteUuid: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
    stationNumber: z.string().regex(/^\d{8}$/),
    sourceName: z.null(),
    nameStatus: z.enum(["omitted_unstructured_label", "not_reported"]),
    sourceType: z
      .object({ code: z.null(), name: z.null(), status: z.literal("not_reported") })
      .strict(),
    nativeGeometry: z
      .object({
        type: z.literal("Point"),
        coordinates: z.tuple([z.number().finite(), z.number().finite()]),
      })
      .strict(),
    geometryCrs: z.literal("EPSG:25832"),
    geographicRole: z.literal("buffered_bbox_candidate"),
    hydrometricStationRelation: z.literal("not_verified"),
    watercourseRelation: z.literal("not_verified"),
    catchmentRelation: z.literal("not_verified"),
    municipalReachMapped: z.literal(false),
    measurements: z.literal("not_fetched"),
  })
  .strict();
const fixed = PUBLIC_MONITORING_STATIONS_PRODUCT;
const SavedInventory = z
  .object({
    schema: z.literal(PUBLIC_MONITORING_STATIONS_SCHEMA),
    inventoryOnly: z.literal(true),
    catalogueView: z.literal("current_received_registry"),
    historicalRegistryCoverageVerified: z.literal(false),
    measurementDataFetched: z.literal(false),
    hydrometricStationCoverage: z.literal("not_verified"),
    automaticWatercourseAssociationPerformed: z.literal(false),
    automaticCatchmentAssociationPerformed: z.literal(false),
    municipalReachMapped: z.literal(false),
    legalAssessmentPerformed: z.literal(false),
    metricsCalculated: z.literal(false),
    upstreamTransactionalSnapshot: z.literal(false),
    geometrySha256: Hash,
    requestedPeriod: z.object({ from: z.string(), to: z.string() }).strict(),
    queryProjection: z
      .object({
        sourceCrs: z.literal("EPSG:4326"),
        sourceAxisOrder: z.literal("lng-lat"),
        queryCrs: z.literal("EPSG:25832"),
        queryAxisOrder: z.literal("easting-northing"),
        bbox: NativeBbox,
        method: z.literal("proj4-grs80-catalog-envelope/v1"),
        edgeSampleStepDegrees: z.literal(0.01),
        projectedSampleCount: z.number().int().positive().max(20_000),
        queryBufferM: z.literal(25),
        bboxRounding: z.literal("outward-to-integer-metres"),
        datumAssumption: z.literal("wgs84-treated-as-etrs89-without-epoch-or-grid-shift"),
        surveyAccuracyVerified: z.literal(false),
        heightTransformed: z.literal(false),
      })
      .strict(),
    product: z
      .object({
        id: z.literal(fixed.id),
        title: z.literal(fixed.title),
        endpoint: z.literal(fixed.endpoint),
        layer: z.literal(fixed.layer),
        geometryName: z.literal(fixed.geometryName),
        sortKey: z.literal(fixed.sortKey),
        wfsVersion: z.literal(fixed.wfsVersion),
        catalogueId: z.literal(fixed.catalogueId),
        datasetVersion: z.null(),
        licence: z.literal(fixed.licence),
        licenceUrl: z.literal(fixed.licenceUrl),
        attribution: z.literal(fixed.attribution),
        versionBasis: z.literal("received_page_hashes"),
        receivedInventoryComplete: z.literal(true),
        pagingIsTransactionSafe: z.literal(false),
        matchedCount: z.number().int().nonnegative().max(MAX_MONITORING_CANDIDATES),
        candidates: z.array(Candidate).max(MAX_MONITORING_CANDIDATES),
      })
      .strict(),
    pages: z
      .array(
        z
          .object({
            queryUrl: z.string().url(),
            responseSha256: Hash,
            responseBytes: z.number().int().positive().max(MAX_MONITORING_PAGE_BYTES),
            startIndex: z.number().int().nonnegative(),
            requestedCount: z.literal(MONITORING_PAGE_COUNT),
            sortKey: z.literal(fixed.sortKey),
            numberMatched: z.number().int().nonnegative().max(MAX_MONITORING_CANDIDATES),
            numberReturned: z.number().int().nonnegative().max(MONITORING_PAGE_COUNT),
            totalFeatures: z.number().int().nonnegative().max(MAX_MONITORING_CANDIDATES),
            serverTimestamp: Timestamp,
          })
          .strict(),
      )
      .min(1)
      .max(MAX_MONITORING_PAGES),
  })
  .strict();
function sameJson(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  };
  return canonical(a) === canonical(b);
}

/** Browser-safe saved-read validation. Hash integrity is checked by the containing manifest reader. */
export function parseSavedPublicMonitoringStationsSource(
  source: PublicBaselineSource,
): PublicMonitoringStationsPayload | null {
  const result = SavedInventory.safeParse(source.payload);
  if (!result.success) return null;
  const data: PublicMonitoringStationsPayload = result.data;
  if (
    source.id !== "public-monitoring-stations" ||
    source.provider !== "Danmarks Miljøportal" ||
    source.dataset !== fixed.title ||
    source.datasetVersion !== null ||
    source.licence !== fixed.licence ||
    source.attribution !== fixed.attribution ||
    source.sourceUrl !==
      "https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:steder-undersoegelser" ||
    source.sourceModifiedAt !== null ||
    source.adapterVersion !== PUBLIC_MONITORING_STATIONS_ADAPTER ||
    source.mode !== "live" ||
    source.status !== "partial" ||
    source.error !== null ||
    source.quality.evidenceKind !== "official_registration" ||
    source.quality.method !== "bounded_native_wfs_site_inventory_only" ||
    !Timestamp.safeParse(source.fetchedAt).success ||
    !Hash.safeParse(source.payloadSha256).success ||
    source.coverage.spatial !== "unknown" ||
    source.coverage.temporal !== "unknown" ||
    source.coverage.observedFrom !== null ||
    source.coverage.observedTo !== null ||
    !source.coverage.paginationComplete ||
    data.geometrySha256 !== source.query.geometrySha256 ||
    data.requestedPeriod.from !== source.query.requestedFrom ||
    data.requestedPeriod.to !== source.query.requestedTo ||
    !validDate(data.requestedPeriod.from) ||
    !validDate(data.requestedPeriod.to) ||
    data.requestedPeriod.from > data.requestedPeriod.to ||
    source.coverage.returnedCount !== data.product.candidates.length ||
    data.product.matchedCount !== data.product.candidates.length ||
    data.pages.length !==
      Math.max(1, Math.ceil(data.product.matchedCount / MONITORING_PAGE_COUNT)) ||
    data.pages.reduce((sum, page) => sum + page.responseBytes, 0) > MAX_MONITORING_TOTAL_BYTES
  )
    return null;
  try {
    const siteIds = new Set<string>(),
      stationNumbers = new Set<string>();
    let previousStation: string | undefined;
    for (const [pageIndex, page] of data.pages.entries()) {
      const startIndex = pageIndex * MONITORING_PAGE_COUNT;
      const candidates = data.product.candidates.slice(
        startIndex,
        startIndex + MONITORING_PAGE_COUNT,
      );
      if (
        page.startIndex !== startIndex ||
        page.numberMatched !== data.product.matchedCount ||
        page.totalFeatures !== data.product.matchedCount ||
        page.numberReturned !== candidates.length ||
        page.queryUrl !== buildPublicMonitoringStationsUrl(data.queryProjection.bbox, startIndex)
      )
        return null;
      // Reconstruct only the sanitized DTO fields. Original unstructured labels were deliberately omitted.
      const replayed = parsePublicMonitoringStationsPage(
        {
          type: "FeatureCollection",
          features: candidates.map((candidate) => ({
            type: "Feature",
            id: candidate.featureId,
            geometry_name: fixed.geometryName,
            geometry: candidate.nativeGeometry,
            properties: {
              Stationsnummer: candidate.stationNumber,
              Stationsnavn: candidate.nameStatus === "not_reported" ? "" : "omitted",
            },
          })),
          numberMatched: page.numberMatched,
          numberReturned: page.numberReturned,
          totalFeatures: page.totalFeatures,
          timeStamp: page.serverTimestamp,
          crs: { type: "name", properties: { name: PUBLIC_MONITORING_STATIONS_CRS } },
        },
        data.queryProjection.bbox,
        startIndex,
      );
      if (!sameJson(replayed.candidates, candidates)) return null;
      for (const candidate of candidates) {
        if (
          siteIds.has(candidate.siteUuid) ||
          stationNumbers.has(candidate.stationNumber) ||
          (previousStation !== undefined && previousStation >= candidate.stationNumber)
        )
          return null;
        previousStation = candidate.stationNumber;
        siteIds.add(candidate.siteUuid);
        stationNumbers.add(candidate.stationNumber);
      }
    }
    return data;
  } catch {
    return null;
  }
}
