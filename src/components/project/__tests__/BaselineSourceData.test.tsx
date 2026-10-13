import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BaselineSourceData } from "../BaselineSourceData";
import type { BaselineJson, PublicBaselineSource } from "@/services/baseline/public-baseline-types";

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
