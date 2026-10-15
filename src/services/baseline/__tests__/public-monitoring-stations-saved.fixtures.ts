import type { BaselineJson, PublicBaselineSource } from "../public-baseline-types";
import {
  PUBLIC_MONITORING_STATIONS_ADAPTER,
  PUBLIC_MONITORING_STATIONS_SCHEMA,
  PUBLIC_MONITORING_STATIONS_PRODUCT,
  PUBLIC_MONITORING_STATIONS_CRS,
  MONITORING_PAGE_COUNT,
  buildPublicMonitoringStationsUrl,
  parsePublicMonitoringStationsPage,
  type PublicMonitoringStationsPayload,
} from "../public-monitoring-stations-source";

export function monitoringSource(count = 7): PublicBaselineSource {
  const bbox: [number, number, number, number] = [515000, 6132000, 518000, 6137000];
  const pages: PublicMonitoringStationsPayload["pages"] = [];
  const candidates: PublicMonitoringStationsPayload["product"]["candidates"] = [];
  for (let startIndex = 0; startIndex < Math.max(1, count); startIndex += MONITORING_PAGE_COUNT) {
    const features = Array.from(
      { length: Math.min(MONITORING_PAGE_COUNT, count - startIndex) },
      (_, offset) => {
        const index = startIndex + offset;
        return {
          type: "Feature",
          id: `steder.10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          geometry_name: "Lokation",
          geometry: { type: "Point", coordinates: [516000 + index, 6135000 + index] },
          properties: {
            Stationsnummer: String(38000000 + index),
            Stationsnavn: index % 2 ? "" : "Synthetic omitted label",
          },
        };
      },
    );
    const parsed = parsePublicMonitoringStationsPage(
      {
        type: "FeatureCollection",
        features,
        numberMatched: count,
        totalFeatures: count,
        numberReturned: features.length,
        timeStamp: "2026-10-13T20:00:00Z",
        crs: { type: "name", properties: { name: PUBLIC_MONITORING_STATIONS_CRS } },
      },
      bbox,
      startIndex,
    );
    candidates.push(...parsed.candidates);
    pages.push({
      queryUrl: buildPublicMonitoringStationsUrl(bbox, startIndex),
      responseSha256: "2".repeat(64),
      responseBytes: 1234,
      startIndex,
      requestedCount: MONITORING_PAGE_COUNT,
      sortKey: "Stationsnummer",
      numberMatched: count,
      totalFeatures: count,
      numberReturned: parsed.numberReturned,
      serverTimestamp: parsed.serverTimestamp,
    });
  }
  const payload: PublicMonitoringStationsPayload = {
    schema: PUBLIC_MONITORING_STATIONS_SCHEMA,
    inventoryOnly: true,
    catalogueView: "current_received_registry",
    historicalRegistryCoverageVerified: false,
    measurementDataFetched: false,
    hydrometricStationCoverage: "not_verified",
    automaticWatercourseAssociationPerformed: false,
    automaticCatchmentAssociationPerformed: false,
    municipalReachMapped: false,
    legalAssessmentPerformed: false,
    metricsCalculated: false,
    upstreamTransactionalSnapshot: false,
    geometrySha256: "1".repeat(64),
    requestedPeriod: { from: "2026-08-24", to: "2026-09-09" },
    queryProjection: {
      sourceCrs: "EPSG:4326",
      sourceAxisOrder: "lng-lat",
      queryCrs: "EPSG:25832",
      queryAxisOrder: "easting-northing",
      bbox,
      method: "proj4-grs80-catalog-envelope/v1",
      edgeSampleStepDegrees: 0.01,
      projectedSampleCount: 16,
      queryBufferM: 25,
      bboxRounding: "outward-to-integer-metres",
      datumAssumption: "wgs84-treated-as-etrs89-without-epoch-or-grid-shift",
      surveyAccuracyVerified: false,
      heightTransformed: false,
    },
    product: {
      ...PUBLIC_MONITORING_STATIONS_PRODUCT,
      versionBasis: "received_page_hashes",
      receivedInventoryComplete: true,
      pagingIsTransactionSafe: false,
      matchedCount: count,
      candidates,
    },
    pages,
  };
  return {
    id: "public-monitoring-stations",
    mode: "live",
    status: "partial",
    provider: "Danmarks Miljøportal",
    dataset: PUBLIC_MONITORING_STATIONS_PRODUCT.title,
    datasetVersion: null,
    licence: PUBLIC_MONITORING_STATIONS_PRODUCT.licence,
    attribution: PUBLIC_MONITORING_STATIONS_PRODUCT.attribution,
    sourceUrl: "https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:steder-undersoegelser",
    sourceModifiedAt: null,
    fetchedAt: "2026-10-13T20:00:00Z",
    adapterVersion: PUBLIC_MONITORING_STATIONS_ADAPTER,
    query: {
      geometrySha256: payload.geometrySha256,
      bbox: [9.2, 55.3, 9.3, 55.4],
      requestedFrom: payload.requestedPeriod.from,
      requestedTo: payload.requestedPeriod.to,
    },
    coverage: {
      spatial: "unknown",
      temporal: "unknown",
      observedFrom: null,
      observedTo: null,
      paginationComplete: true,
      returnedCount: count,
    },
    quality: {
      evidenceKind: "official_registration",
      method: "bounded_native_wfs_site_inventory_only",
      warnings: [],
    },
    payload: payload as unknown as BaselineJson,
    payloadSha256: "3".repeat(64),
    error: null,
  };
}
