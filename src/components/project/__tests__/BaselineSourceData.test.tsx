import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BaselineSourceData } from "../BaselineSourceData";
import type { BaselineJson, PublicBaselineSource } from "@/services/baseline/public-baseline-types";
import {
  WATER_PLAN_NATURE_PRODUCTS,
  WATER_PLAN_NATURE_CRS,
  buildWaterPlanNatureUrl,
  parseWaterPlanNaturePage,
  type WaterPlanNaturePayload,
} from "@/services/baseline/water-plan-nature-source";
import { ACTUAL_NATIVE_FEATURES } from "@/services/baseline/__tests__/water-plan-nature.fixtures";

function source(
  id: string,
  payload: BaselineJson,
  count: number,
  overrides: Partial<PublicBaselineSource> = {},
): PublicBaselineSource {
  return {
    id,
    payload,
    mode: "live",
    status: "partial",
    provider: "Test source",
    dataset: "Saved dataset",
    datasetVersion: null,
    licence: "CC BY 4.0",
    attribution: "Official source",
    sourceUrl: "https://example.test/source",
    sourceModifiedAt: null,
    fetchedAt: "2026-10-13T12:00:00Z",
    adapterVersion: "test/v1",
    payloadSha256: "0".repeat(64),
    error: null,
    query: {
      geometrySha256: "1".repeat(64),
      bbox: [9, 55, 9.5, 55.5],
      requestedFrom: "2026-08-24",
      requestedTo: "2026-08-25",
    },
    coverage: {
      spatial: "partial",
      temporal: "complete",
      observedFrom: "2026-08-24T06:00:00Z",
      observedTo: "2026-08-26T06:00:00Z",
      paginationComplete: true,
      returnedCount: count,
    },
    quality: { evidenceKind: "calculation", method: "test", warnings: [] },
    ...overrides,
  };
}
function row(
  id: string,
  from: string,
  to: string,
  value: number,
  overrides: Record<string, BaselineJson> = {},
): BaselineJson {
  return {
    id,
    stationId: "05384",
    coordinates: [9.25, 55.25],
    parameterId: "acc_precip",
    timeResolution: "day",
    from,
    to,
    value,
    unit: "mm",
    valueKind: "amount",
    qcStatus: "manual",
    validity: true,
    ...overrides,
  };
}
function dailyRows() {
  return [
    row("a", "2026-08-24T06:00:00Z", "2026-08-25T06:00:00Z", 2.5),
    row("b", "2026-08-25T06:00:00Z", "2026-08-26T06:00:00Z", 3.5),
  ];
}
function summary(overrides: Record<string, BaselineJson> = {}): BaselineJson {
  return {
    complete: true,
    totalMm: 6,
    requestedFrom: "2026-08-24T06:00:00Z",
    requestedTo: "2026-08-26T06:00:00Z",
    coveredFrom: "2026-08-24T06:00:00Z",
    coveredTo: "2026-08-26T06:00:00Z",
    dailyValueCount: 2,
    reasons: [],
    ...overrides,
  };
}
function dmiPayload(overrides: Record<string, BaselineJson> = {}): BaselineJson {
  return {
    unit: "mm",
    station: {
      id: "05384",
      name: "Vojens Airport",
      coordinates: [9.25, 55.25],
      distanceToProjectCenterKm: 4.2,
      withinProject: false,
      catchmentRelevance: "not_assessed",
    },
    series: dailyRows(),
    summary: summary(),
    ...overrides,
  };
}
function scene(id: string, cloud: number | null): BaselineJson {
  return {
    id,
    datetime: "2026-08-24T10:34:00Z",
    platform: "sentinel-2a",
    globalCloudCoverPct: cloud,
    localQuality: { cloud: "pending", shadow: "pending", nodata: "pending", usable: null },
  };
}
function sentinelPayload(scenes: BaselineJson[], catalogComplete = true): BaselineJson {
  return {
    schema: "gofreyra.sentinel-scene-catalog/v1",
    collection: "sentinel-2-l2a",
    scenes,
    catalogComplete,
    localQualityStatus: "pending",
  };
}
function render(data: PublicBaselineSource) {
  return renderToStaticMarkup(<BaselineSourceData source={data} />);
}

describe("saved DMI source values", () => {
  it("shows real station, UTC intervals, precipitation, QC and only the supported sum", () => {
    const html = render(source("dmi-historical", dmiPayload(), 2));
    expect(html).toContain("Vojens Airport");
    expect(html).toContain("Station 05384");
    expect(html).toContain("4,2 km");
    expect(html).toContain("uden for projektområdet");
    expect(html).toContain("oplandet kræver faglig kontrol");
    expect(html).toContain("2,5 mm");
    expect(html).toContain("3,5 mm");
    expect(html).toContain("Manuel kontrol");
    expect(html).toContain("Gyldig");
    expect(html).toContain("2026-08-24T06:00:00Z");
    expect(html).toContain("UTC");
    expect(html).toContain("Periodesum: 6 mm");
  });

  it("preserves a measured zero in both daily data and a fully supported sum", () => {
    const series = [
      row("a", "2026-08-24T06:00:00Z", "2026-08-25T06:00:00Z", 0),
      row("b", "2026-08-25T06:00:00Z", "2026-08-26T06:00:00Z", 0),
    ];
    const html = render(
      source("dmi-historical", dmiPayload({ series, summary: summary({ totalMm: 0 }) }), 2),
    );
    expect(html).toContain("Periodesum: 0 mm");
    expect(html).toContain('class="p-2">0 mm');
  });

  it("labels the official trace code without displaying it as negative or zero rainfall", () => {
    const series = [
      row("a", "2026-08-24T06:00:00Z", "2026-08-25T06:00:00Z", -0.1, { valueKind: "trace" }),
      dailyRows()[1],
    ];
    const html = render(
      source(
        "dmi-historical",
        dmiPayload({
          series,
          summary: summary({ complete: false, totalMm: null, reasons: ["trace"] }),
        }),
        2,
      ),
    );
    expect(html).toContain("Spor af nedbør (&lt;0,1 mm)");
    expect(html).toContain("Periodesum kan ikke beregnes");
    expect(html).not.toContain("-0,1 mm");
    expect(html).not.toContain("Periodesum: 0 mm");
  });

  it("shows incomplete period reasons and never fabricates a sum", () => {
    const html = render(
      source(
        "dmi-historical",
        dmiPayload({
          summary: summary({
            complete: false,
            totalMm: null,
            reasons: ["requested_period_not_exact_daily_boundaries"],
          }),
        }),
        2,
      ),
    );
    expect(html).toContain("Periodens grænser følger ikke hele DMI-døgn");
    expect(html).not.toContain("Periodesum: 6 mm");
  });

  it("keeps unknown validity visible and refuses a supposedly complete sum", () => {
    const series = [
      row("a", "2026-08-24T06:00:00Z", "2026-08-25T06:00:00Z", 2.5, { validity: null }),
      dailyRows()[1],
    ];
    const html = render(
      source(
        "dmi-historical",
        dmiPayload({
          series,
          summary: summary({
            complete: false,
            totalMm: null,
            reasons: ["validity_unknown"],
          }),
        }),
        2,
      ),
    );
    expect(html).toContain("Ikke angivet");
    expect(html).toContain("Gyldigheden er ikke angivet");
    expect(html).not.toContain("Periodesum: 6 mm");
    const contradictory = render(source("dmi-historical", dmiPayload({ series }), 2));
    expect(contradictory).toContain('role="alert"');
    expect(contradictory).not.toContain("Periodesum: 6 mm");
  });

  it("shows no station coverage instead of a zero rainfall value", () => {
    const html = render(
      source(
        "dmi-historical",
        { candidateCount: 0, reason: "No station", searchBbox: [9, 55, 9.5, 55.5] },
        0,
        { status: "no_coverage" },
      ),
    );
    expect(html).toContain("ikke fundet en egnet nedbørsstation");
    expect(html).not.toContain("0 mm");
  });

  it.each([null, {}, { unit: "inches" }] as BaselineJson[])(
    "shows a visible payload error for missing or malformed stored data",
    (payload) => {
      const html = render(source("dmi-historical", payload, 2));
      expect(html).toContain('role="alert"');
      expect(html).toContain("mangler eller har et ugyldigt format");
      expect(html).not.toContain("0 mm");
    },
  );

  it("does not trust a complete summary that disagrees with the rows or source coverage", () => {
    const wrongSum = render(
      source("dmi-historical", dmiPayload({ summary: summary({ totalMm: 100 }) }), 2),
    );
    expect(wrongSum).toContain('role="alert"');
    expect(wrongSum).not.toContain("100 mm");
    const missingPages = render(
      source("dmi-historical", dmiPayload(), 2, {
        coverage: {
          spatial: "partial",
          temporal: "partial",
          observedFrom: null,
          observedTo: null,
          paginationComplete: false,
          returnedCount: 2,
        },
      }),
    );
    expect(missingPages).toContain('role="alert"');
    expect(missingPages).not.toContain("Periodesum: 6 mm");
  });
});

describe("saved Sentinel scene candidates", () => {
  it("shows scene ID, actual datetime, zero/unknown global clouds and pending local QA separately", () => {
    const html = render(
      source(
        "sentinel-2-scenes",
        sentinelPayload([scene("S2_REAL_A", 0), scene("S2_REAL_B", null)]),
        2,
      ),
    );
    expect(html).toContain("S2_REAL_A");
    expect(html).toContain("S2_REAL_B");
    expect(html).toContain("2026-08-24T10:34:00Z");
    expect(html).toContain('class="p-2">0 %');
    expect(html).toContain("Ukendt");
    expect(html).toContain("Afventer lokal kontrol");
    expect(html).toContain("siger ikke, om projektområdet er skyfrit");
    expect(html).toContain("ingen godkendt NDVI eller lokal måling");
  });

  it("shows an actual empty catalogue explicitly", () => {
    const html = render(
      source("sentinel-2-scenes", sentinelPayload([]), 0, { status: "no_coverage" }),
    );
    expect(html).toContain("Ingen satellitscener fundet");
    expect(html).not.toContain("0 %");
  });

  it("distinguishes incomplete pages from a complete no-scene result", () => {
    const html = render(source("sentinel-2-scenes", sentinelPayload([], false), 0));
    expect(html).toContain("Kataloget er ufuldstændigt");
    expect(html).not.toContain("Ingen satellitscener fundet");
  });

  it("rejects malformed candidates rather than supplying a zero cloud percentage", () => {
    const html = render(source("sentinel-2-scenes", sentinelPayload([{ id: "broken" }]), 1));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("0 %");
  });

  it("shows a failed source without any cached or fabricated data rows", () => {
    const html = render(
      source("sentinel-2-scenes", sentinelPayload([scene("old", 0)]), 1, {
        mode: "error",
        status: "failed",
        error: { code: "HTTP_429", message: "Failure" },
      }),
    );
    expect(html).toContain("Kilden kunne ikke hentes");
    expect(html).not.toContain("old");
    expect(html).not.toContain("0 %");
  });
});

function rasterPayload(fileCount = 15): BaselineJson {
  const datasets = ["GeoDKO10cm", "GeoDKO12,5cm", "Terraen"];
  const products = datasets.map((dataset, productIndex) => {
    const register = dataset === "Terraen" ? "dhm" : "geodko";
    const delivery = register === "dhm" ? 3 : 4;
    return {
      register,
      dataset,
      modelVersion: 1,
      dataDeliveryNumber: fileCount === 0 ? null : delivery,
      catalogueComplete: true,
      files: Array.from({ length: fileCount }, (_, index) => ({
        id: `${productIndex + 1}0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        register,
        dataset,
        modelVersion: 1,
        dataDeliveryNumber: delivery,
        fileName: `fixture_${productIndex}_${index + 1}.tif`,
        fileFormat: "tif",
        fileSizeInBytes: 123456,
        fileGeneratedAt: "2026-06-20T06:52:21.537761Z",
        catalogBBoxCrs: "EPSG:25832",
        nativeBBox: [516000, 6135000, 517000, 6136000],
        capturedFrom: null,
        capturedTo: null,
        verifiedRasterCrs: null,
        verifiedVerticalCrs: null,
        actualPixelSizeM: null,
        nodata: "not_checked",
        pixelCoverage: "unknown",
        rasterBytesFetched: false,
      })),
      nominalPixelSizeM: [0.1, 0.125, 0.4][productIndex],
      nominalSizeIsNotRasterVerified: true,
      expectedHorizontalCrs: "EPSG:25832",
      expectedVerticalCrs: register === "dhm" ? "EPSG:5799" : null,
      licence: "CC BY 4.0",
      licenceUrl: "https://example.test/licence",
      attribution: "Official source",
    };
  });
  return {
    schema: "gofreyra.datafordeler-raster-inventory/v1",
    apiVersion: "v1.0",
    inventoryOnly: true,
    pixelDataNotFetched: true,
    rasterAnalysisStatus: "not_started",
    generationDatesAreNotCaptureDates: true,
    queryProjection: {
      sourceCrs: "EPSG:4326",
      sourceAxisOrder: "lng-lat",
      queryCrs: "EPSG:25832",
      queryAxisOrder: "easting-northing",
      bbox: [516000, 6135000, 517000, 6136000],
      method: "proj4-grs80-catalog-envelope/v1",
      edgeSampleStepDegrees: 0.01,
      projectedSampleCount: 4,
      queryBufferM: 25,
      bboxRounding: "outward-to-integer-metres",
      datumAssumption: "wgs84-treated-as-etrs89-without-epoch-or-grid-shift",
      surveyAccuracyVerified: false,
      heightTransformed: false,
    },
    products,
    pages: datasets.map((dataset) => ({
      dataset,
      page: 1,
      queryUrl: `https://api.datafordeler.dk/FileDownloads/v1.0/GetAvailableRasterFileDownloads?DataSetName=${encodeURIComponent(dataset)}`,
      responseSha256: "2".repeat(64),
      responseBytes: 1234,
      pagination: {
        currentPage: 1,
        pageSize: 100,
        totalCount: fileCount,
        totalPages: fileCount === 0 ? 0 : 1,
      },
    })),
  };
}
function rasterSource(payload: BaselineJson = rasterPayload(), count = 45): PublicBaselineSource {
  return source("orthophoto-terrain", payload, count, {
    coverage: {
      spatial: "unknown",
      temporal: "unknown",
      observedFrom: null,
      observedTo: null,
      paginationComplete: true,
      returnedCount: count,
    },
  });
}

describe("saved raster inventory metadata", () => {
  it("shows 45 metadata candidates, three products and generation times without claiming capture or pixels", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network in saved snapshot render"));
    try {
      const html = render(rasterSource());
      expect(html).toContain("45 filmetadata · 0 rasterbytes hentet");
      expect(html).toContain("GeoDKO10cm · 15 filmetadata");
      expect(html).toContain("GeoDKO12,5cm · 15 filmetadata");
      expect(html).toContain("DHM Terræn · 15 filmetadata");
      expect(html).toContain("Model 1 · Leverance 3");
      expect(html).toContain("fixture_2_15.tif");
      expect(html).toContain("516.000 · 6.135.000 · 517.000 · 6.136.000");
      expect(html).toContain('dateTime="2026-06-20T06:52:21.537761Z"');
      expect(html).toContain("Filgenerering (UTC)");
      expect(html).toContain("Faktisk optagedato");
      expect(html).toContain("Ukendt");
      expect(html).toContain("Filgenerering og dataleverance er ikke optagedato");
      expect(html).toContain("Terrænkoter og hældning er ikke beregnet");
      expect(html).toContain("opmålingsnøjagtighed og højder er ikke valideret");
      expect(html).not.toContain("45 validerede billeder");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("shows a real empty catalogue explicitly without asserting missing raster coverage", () => {
    const html = render(rasterSource(rasterPayload(0), 0));
    expect(html).toContain("0 filmetadata · 0 rasterbytes hentet");
    expect(html).toContain("Leverance ikke angivet");
    expect(html).toContain("Ingen kandidatfiler i katalogforespørgslen");
    expect(html).toContain("dokumenterer ikke manglende data i området");
    expect(html).not.toContain('role="alert"');
  });

  it.each([null, {}, { schema: "unknown" }] as BaselineJson[])(
    "shows missing or malformed saved metadata as a visible error",
    (payload) => {
      const html = render(rasterSource(payload));
      expect(html).toContain('role="alert"');
      expect(html).not.toContain("0 rasterbytes hentet");
    },
  );

  it("refuses metadata counts or coverage claims that contradict the saved source", () => {
    const wrongCount = render(rasterSource(rasterPayload(), 44));
    expect(wrongCount).toContain('role="alert"');
    const data = rasterSource();
    data.status = "complete";
    data.coverage.spatial = "complete";
    expect(render(data)).toContain('role="alert"');
  });

  it("shows a visible error for a malformed provenance URL without crashing the view", () => {
    const serialized = JSON.stringify(rasterPayload()).replace(
      /"queryUrl":"[^"]*"/,
      '"queryUrl":"not-a-url"',
    );
    const html = render(rasterSource(JSON.parse(serialized) as BaselineJson));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("fixture_0_1.tif");
  });

  it("rejects pagination totals that claim a complete catalogue but omit a metadata file", () => {
    const serialized = JSON.stringify(rasterPayload()).replace(
      '"totalCount":15',
      '"totalCount":16',
    );
    const html = render(rasterSource(JSON.parse(serialized) as BaselineJson));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("45 filmetadata");
  });

  it("rejects credential-bearing filenames rather than showing a secret or download link", () => {
    const serialized = JSON.stringify(rasterPayload()).replace(
      "fixture_0_1.tif",
      "file.tif?apiKey=DO-NOT-RENDER",
    );
    const html = render(rasterSource(JSON.parse(serialized) as BaselineJson));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("DO-NOT-RENDER");
  });

  it("rejects credentials in catalogue provenance and inferred capture dates", () => {
    const withKey = JSON.stringify(rasterPayload()).replace(
      "?DataSetName=GeoDKO10cm",
      "?apiKey=DO-NOT-RENDER&DataSetName=GeoDKO10cm",
    );
    expect(render(rasterSource(JSON.parse(withKey) as BaselineJson))).toContain('role="alert"');
    const withDate = JSON.stringify(rasterPayload()).replace(
      '"capturedFrom":null',
      '"capturedFrom":"2026-06-20T06:52:21Z"',
    );
    expect(render(rasterSource(JSON.parse(withDate) as BaselineJson))).toContain('role="alert"');
  });

  it("keeps failed catalogues and historical unimplemented snapshots distinct from zero results", () => {
    const failed = rasterSource();
    failed.mode = "error";
    failed.status = "failed";
    failed.error = { code: "ACCESS_DENIED", message: "No access" };
    const html = render(failed);
    expect(html).toContain("Kilden kunne ikke hentes");
    expect(html).not.toContain("fixture_0_1.tif");
    const historical = rasterSource(null, 0);
    historical.status = "not_implemented";
    expect(render(historical)).toContain("Kilden er endnu ikke hentet eller tilsluttet");
    expect(render(historical)).not.toContain("0 filmetadata");
  });
});

function naturePayload(empty = false): WaterPlanNaturePayload {
  const bbox: [number, number, number, number] = [515884, 6132418, 517217, 6136177];
  const timestamp = "2026-10-13T17:31:04.782Z";
  return {
    schema: "gofreyra.water-plan-nature-inventory/v1",
    wfsVersion: "2.0.0",
    inventoryOnly: true,
    legalAssessmentPerformed: false,
    metricsCalculated: false,
    municipalReachMapped: false,
    upstreamTransactionalSnapshot: false,
    geometrySha256: "1".repeat(64),
    requestedPeriod: { from: "2026-08-24", to: "2026-08-25" },
    queryProjection: {
      sourceCrs: "EPSG:4326",
      sourceAxisOrder: "lng-lat",
      queryCrs: "EPSG:25832",
      queryAxisOrder: "easting-northing",
      bbox,
      method: "proj4-grs80-catalog-envelope/v1",
      edgeSampleStepDegrees: 0.01,
      projectedSampleCount: 12,
      queryBufferM: 25,
      bboxRounding: "outward-to-integer-metres",
      datumAssumption: "wgs84-treated-as-etrs89-without-epoch-or-grid-shift",
      surveyAccuracyVerified: false,
      heightTransformed: false,
    },
    products: WATER_PLAN_NATURE_PRODUCTS.map((product) => {
      const features = empty ? [] : structuredClone(ACTUAL_NATIVE_FEATURES[product.id]);
      const candidates = parseWaterPlanNaturePage(
        {
          type: "FeatureCollection",
          features,
          totalFeatures: features.length,
          numberMatched: features.length,
          numberReturned: features.length,
          timeStamp: timestamp,
          crs: { type: "name", properties: { name: WATER_PLAN_NATURE_CRS } },
        },
        product.id,
        bbox,
        0,
      ).candidates;
      return {
        id: product.id,
        layer: product.layer,
        endpoint: product.endpoint,
        geometryName: product.geometryName,
        sortKey: product.sortKey,
        datasetVersion: product.datasetVersion,
        versionBasis:
          product.id === "vp3-watercourses"
            ? "published_plan_release"
            : "per_feature_registration_version",
        planPublishedDate: product.id === "vp3-watercourses" ? "2025-12-18" : null,
        planEffectiveFrom: product.id === "vp3-watercourses" ? "2026-01-01" : null,
        licence: product.licence,
        licenceUrl: product.licenceUrl,
        attribution: product.attribution,
        catalogueIds: product.catalogueIds,
        receivedInventoryComplete: true,
        pagingIsTransactionSafe: false,
        matchedCount: candidates.length,
        candidates,
      };
    }),
    pages: WATER_PLAN_NATURE_PRODUCTS.map((product, index) => {
      const count = empty ? 0 : ACTUAL_NATIVE_FEATURES[product.id].length;
      return {
        productId: product.id,
        queryUrl: buildWaterPlanNatureUrl(product.id, bbox, 0),
        responseSha256: String(index + 2).repeat(64),
        responseBytes: 1234,
        startIndex: 0,
        requestedCount: 50,
        sortKey: product.sortKey,
        numberMatched: count,
        numberReturned: count,
        totalFeatures: count,
        serverTimestamp: timestamp,
      };
    }),
  };
}
function natureSource(
  payload: WaterPlanNaturePayload | null = naturePayload(),
): PublicBaselineSource {
  const count =
    payload?.products.reduce((sum, product) => sum + product.candidates.length, 0) ?? null;
  return source("water-plan-nature", payload as unknown as BaselineJson, count ?? 0, {
    provider: "Danmarks Miljøportal / Kommunerne / SGAV",
    dataset: "Naturregistreringer og VP3G-vandløbsafgrænsning, miljømål og tilstand",
    licence: "CC0 1.0 (natur); CC BY 4.0 (VP3G)",
    attribution:
      "Danmarks Miljøportal / Kommunerne; Styrelsen for Grøn Arealomlægning og Vandmiljø (SGAV)",
    sourceUrl: "https://datakatalog.miljoeportal.dk/api/swagger/index.html",
    adapterVersion: "water-plan-nature-inventory/v1",
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
      method: "bounded_native_wfs_received_inventory_only",
      warnings: [],
    },
  });
}

describe("saved nature and water-plan candidates", () => {
  it("renders a complete four-page received inventory and rejects missing second-page provenance", () => {
    const data = naturePayload();
    data.pages = [];
    for (const [productIndex, fixed] of WATER_PLAN_NATURE_PRODUCTS.entries()) {
      const total = [82, 4, 3][productIndex];
      const product = data.products[productIndex];
      product.candidates = [];
      product.matchedCount = total;
      for (let start = 0; start < total; start += 50) {
        const features = Array.from({ length: Math.min(50, total - start) }, (_, index) => {
          const feature = JSON.parse(JSON.stringify(ACTUAL_NATIVE_FEATURES[fixed.id][0]));
          const sequence = String(start + index + 1).padStart(12, "0");
          if (fixed.id === "vp3-watercourses") {
            feature.properties.ov_id = `DKRIVER${sequence}`;
            feature.id = `vp3_2e2025_vandloeb_samlet.${start + index + 1}`;
          } else {
            feature.properties.Objekt_id = `${productIndex + 1}0000000-0000-4000-8000-${sequence}`;
            feature.properties.Version_id = `${productIndex + 5}0000000-0000-4000-8000-${sequence}`;
            feature.id = `${fixed.id === "protected-nature" ? "bes_naturtyper" : "bes_vandloeb"}.${feature.properties.Version_id}`;
          }
          return feature;
        });
        const timestamp = start === 0 ? "2026-10-13T17:31:04.782Z" : "2026-10-13T17:31:05.123Z";
        const parsed = parseWaterPlanNaturePage(
          {
            type: "FeatureCollection",
            features,
            totalFeatures: total,
            numberMatched: total,
            numberReturned: features.length,
            timeStamp: timestamp,
            crs: { type: "name", properties: { name: WATER_PLAN_NATURE_CRS } },
          },
          fixed.id,
          data.queryProjection.bbox,
          start,
        );
        product.candidates.push(...parsed.candidates);
        data.pages.push({
          productId: fixed.id,
          queryUrl: buildWaterPlanNatureUrl(fixed.id, data.queryProjection.bbox, start),
          responseSha256: "d".repeat(64),
          responseBytes: 1234,
          startIndex: start,
          requestedCount: 50,
          sortKey: fixed.sortKey,
          numberMatched: total,
          numberReturned: features.length,
          totalFeatures: total,
          serverTimestamp: timestamp,
        });
      }
    }
    const html = render(natureSource(data));
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("89 registreringskandidater");
    expect(html).toContain("Naturregistreringer · 82 kandidater");
    expect(html).toContain("Registreringer af beskyttede vandløb · 4 kandidater");
    expect(html).toContain("Vandområder fra vandplanen · 3 kandidater");
    expect(html).toContain("Kildeproveniens · 4 gemte sider");
    expect(html).toContain("Fra indeks 50 · 32 registreringer");
    data.pages.splice(1, 1);
    expect(render(natureSource(data))).toContain('role="alert"');
  });

  it("shows separate goals and states, unknown epoch-zero inspection, dates and exact provenance without fetching", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No saved-data fetch"));
    try {
      const html = render(natureSource());
      expect(html).not.toContain('role="alert"');
      expect(html).toContain("4 registreringskandidater");
      expect(html).toContain("Naturregistreringer · 2 kandidater");
      expect(html).toContain("Registreringer af beskyttede vandløb · 1 kandidat");
      expect(html).toContain("Vandområder fra vandplanen · 1 kandidat");
      expect(html).toContain("DKRIVER2580");
      expect(html).toContain("Økologisk miljømål");
      expect(html).toContain("God økologisk tilstand");
      expect(html).toContain("Økologisk tilstand");
      expect(html).toContain("Dårlig økologisk tilstand");
      expect(html).toContain("Kemisk miljømål");
      expect(html).toContain("Kemisk tilstand");
      expect(html).toContain("Vurderingsdato: Ukendt");
      expect(html).toContain("Besigtigelsesdato: Ukendt");
      expect(html).not.toContain("1970");
      expect(html).toContain("Registervedligeholdelse: Ok - gennemgået");
      expect(html).toContain("Ingen juridisk godkendelse");
      expect(html).toContain('dateTime="2025-12-18"');
      expect(html).toContain('dateTime="2026-01-01"');
      expect(html).toContain("Planversion vp3_2endelig2025");
      expect(html).toContain("CC0 1.0");
      expect(html).toContain("CC BY 4.0");
      expect(html).toContain("Kildeproveniens · 3 gemte sider");
      expect(html).toContain("Kilden tilbyder ikke en");
      expect(html).toContain("transaktionssikker snapshot");
      expect(html).toContain("515.884 · 6.132.418 · 517.217 · 6.136.177");
      expect(html).toContain("opmålingsnøjagtighed og højder er ikke valideret");
      expect(html).not.toContain("Bykær Bæk");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("shows reported inspection dates separately from registry maintenance without claiming a new inspection", () => {
    const data = naturePayload();
    const candidate = data.products[0].candidates[0];
    if (candidate.kind !== "protected-nature") throw new Error("Wrong fixture");
    candidate.inspection!.rawDate = "2020-08-24T00:00:00Z";
    candidate.inspection!.reportedDate = candidate.inspection!.rawDate;
    candidate.inspection!.status = "reported_date";
    const html = render(natureSource(data));
    expect(html).toContain("Kildens besigtigelsesdato:");
    expect(html).toContain("2020");
    expect(html).toContain("Ny besigtigelse er ikke verificeret");
    expect(html).not.toContain('role="alert"');
  });

  it("retains unknown waterbody names, goals and assessed states independently", () => {
    const data = naturePayload();
    const candidate = data.products[2].candidates[0];
    if (candidate.kind !== "vp3-watercourses") throw new Error("Wrong fixture");
    candidate.sourceName = null;
    candidate.planGoals.ecological = null;
    candidate.assessedState.chemical = null;
    const html = render(natureSource(data));
    expect(html).toContain("Navn ukendt");
    expect(html).toContain("Dårlig økologisk tilstand");
    expect(html).toContain("God kemisk tilstand");
    expect(html).not.toContain('role="alert"');
  });

  it("shows validated empty inventories without turning failure into zero or asserting legal absence", () => {
    const html = render(natureSource(naturePayload(true)));
    expect(html).toContain("0 registreringskandidater");
    expect(html).toContain("Ingen kandidater i denne gemte kildeforespørgsel");
    expect(html).toContain("Det fastslår ikke fravær");
    expect(html).not.toContain('role="alert"');
    const failed = natureSource(null);
    failed.mode = "error";
    failed.status = "timeout";
    failed.error = { code: "SOURCE_TIMEOUT", message: "Timeout" };
    expect(render(failed)).toContain("Kilden kunne ikke hentes");
    expect(render(failed)).not.toContain("0 registreringskandidater");
  });

  it("preserves historical unimplemented placeholders even when they carry their old error envelope", () => {
    const historical = natureSource(null);
    historical.mode = "error";
    historical.status = "not_implemented";
    historical.adapterVersion = "not-implemented/v1";
    historical.error = { code: "NOT_IMPLEMENTED", message: "Not connected" };
    expect(render(historical)).toContain("Kilden er endnu ikke hentet eller tilsluttet");
    expect(render(historical)).not.toContain('role="alert"');
    expect(render(historical)).not.toContain("0 registreringskandidater");
  });

  it.each([
    [
      "foreign endpoint",
      (data: WaterPlanNaturePayload) => {
        data.products[0].endpoint = "https://example.test/wfs";
      },
    ],
    [
      "credential query",
      (data: WaterPlanNaturePayload) => {
        data.pages[0].queryUrl += "&apiKey=DO-NOT-RENDER";
      },
    ],
    [
      "malformed query",
      (data: WaterPlanNaturePayload) => {
        data.pages[0].queryUrl = "not-a-url";
      },
    ],
    [
      "wrong query bbox",
      (data: WaterPlanNaturePayload) => {
        data.queryProjection.bbox[0]++;
      },
    ],
    [
      "wrong licence",
      (data: WaterPlanNaturePayload) => {
        data.products[0].licence = "Unverified licence";
      },
    ],
    [
      "wrong plan release",
      (data: WaterPlanNaturePayload) => {
        data.products[2].datasetVersion = "hearing-2023";
      },
    ],
    [
      "wrong hash binding",
      (data: WaterPlanNaturePayload) => {
        data.geometrySha256 = "f".repeat(64);
      },
    ],
    [
      "wrong period",
      (data: WaterPlanNaturePayload) => {
        data.requestedPeriod.from = "2026-08-23";
      },
    ],
    [
      "missing inventory candidate",
      (data: WaterPlanNaturePayload) => {
        data.products[0].candidates.pop();
      },
    ],
    [
      "incorrect page count",
      (data: WaterPlanNaturePayload) => {
        data.pages[0].numberReturned++;
      },
    ],
    [
      "missing page",
      (data: WaterPlanNaturePayload) => {
        data.pages.pop();
      },
    ],
    [
      "duplicate page",
      (data: WaterPlanNaturePayload) => {
        data.pages.push(data.pages[0]);
      },
    ],
    [
      "native coordinate corruption",
      (data: WaterPlanNaturePayload) => {
        data.products[0].candidates[0].nativeBBox[0]++;
      },
    ],
    [
      "position count corruption",
      (data: WaterPlanNaturePayload) => {
        data.products[0].candidates[0].positionCount++;
      },
    ],
    [
      "invalid source calendar date",
      (data: WaterPlanNaturePayload) => {
        const candidate = data.products[0].candidates[0];
        if (candidate.kind === "vp3-watercourses") throw new Error("Wrong fixture");
        candidate.rawDates.registeredAt = "2026-02-30T12:00:00Z";
      },
    ],
    [
      "epoch-zero presented as inspection",
      (data: WaterPlanNaturePayload) => {
        const candidate = data.products[0].candidates[1];
        if (candidate.kind !== "protected-nature") throw new Error("Wrong fixture");
        candidate.inspection!.reportedDate = candidate.inspection!.rawDate;
        candidate.inspection!.status = "reported_date";
      },
    ],
    [
      "unknown status presented as approved",
      (data: WaterPlanNaturePayload) => {
        const candidate = data.products[0].candidates[1];
        if (candidate.kind === "vp3-watercourses") throw new Error("Wrong fixture");
        candidate.status.interpretation = "source_record_status";
      },
    ],
  ] as const)("rejects %s before displaying candidate values", (_name, mutate) => {
    const data = naturePayload();
    mutate(data);
    const html = render(natureSource(data));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("registreringskandidater");
    expect(html).not.toContain("DO-NOT-RENDER");
    expect(html).not.toContain("DKRIVER2580");
  });

  it("rejects invalid requested calendar dates, false coverage and unsupported source adapters", () => {
    const invalidDate = natureSource();
    invalidDate.query.requestedFrom = "2026-02-30";
    const payload = invalidDate.payload as unknown as WaterPlanNaturePayload;
    payload.requestedPeriod.from = invalidDate.query.requestedFrom;
    expect(render(invalidDate)).toContain('role="alert"');
    for (const bad of [
      { status: "complete" },
      { adapterVersion: "unknown/v2" },
      { licence: "Unverified licence" },
      { sourceUrl: "https://example.test/source?apiKey=DO-NOT-RENDER" },
      { coverage: { ...natureSource().coverage, returnedCount: 5 } },
      { coverage: { ...natureSource().coverage, temporal: "complete" } },
      { coverage: { ...natureSource().coverage, paginationComplete: false } },
    ] as Partial<PublicBaselineSource>[]) {
      expect(render({ ...natureSource(), ...bad })).toContain('role="alert"');
    }
  });
});
