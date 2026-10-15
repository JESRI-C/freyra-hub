import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDmiHistoricalSource,
  summarizeDmiDailySeries,
  summarizeAvailableDmiDailySeries,
  type DmiDailyPrecipitation,
} from "../dmi-historical-source";
import { isBaselineMeasuredEvidence } from "../public-baseline-types";

const input = {
  bbox: [9.1, 55.1, 9.7, 55.4] as [number, number, number, number],
  dateFrom: "2026-08-17T06:00:00Z",
  dateTo: "2026-08-19T06:00:00Z",
};
const now = () => "2026-10-13T12:00:00Z";
function station(
  id = "06149",
  coordinates = [9.45, 55.25],
  properties: Record<string, unknown> = {},
) {
  return {
    id: `station-${id}`,
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: {
      stationId: id,
      name: `Station ${id}`,
      country: "DNK",
      parameterId: ["acc_precip", "mean_temp"],
      validFrom: "2000-01-01T00:00:00Z",
      validTo: null,
      operationFrom: "2000-01-01T00:00:00Z",
      operationTo: null,
      status: "Active",
      ...properties,
    },
  };
}
function value(day: number, amount = 4, properties: Record<string, unknown> = {}) {
  return {
    id: `value-${day}`,
    type: "Feature",
    geometry: { type: "Point", coordinates: [9.45, 55.25] },
    properties: {
      stationId: "06149",
      parameterId: "acc_precip",
      timeResolution: "day",
      from: `2026-08-${day}T06:00:00Z`,
      to: `2026-08-${day + 1}T06:00:00Z`,
      value: amount,
      qcStatus: "manual",
      validity: true,
      created: "2026-09-01T10:00:00Z",
      calculatedAt: "2026-09-01T09:00:00Z",
      noValuesInCalculation: 24,
      ...properties,
    },
  };
}
function page(features: unknown[], next?: string) {
  return new Response(
    JSON.stringify({
      type: "FeatureCollection",
      features,
      links: next ? [{ rel: "next", href: next }] : [],
    }),
    { headers: { "Content-Type": "application/geo+json" } },
  );
}
function fixture(values: unknown[] = [value(17, 4), value(18, 6)]) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(page([station()]))
    .mockResolvedValueOnce(page(values));
}
function payload(source: Awaited<ReturnType<typeof fetchDmiHistoricalSource>>) {
  return source.payload as unknown as {
    station: { id: string; catchmentRelevance: string; distanceToProjectCenterKm: number };
    series: DmiDailyPrecipitation[];
    summary: { totalMm: number | null; complete: boolean; reasons: string[] };
    queries: Array<{ url: string; sha256: string }>;
    candidateCount: number;
    stationSelection: {
      schema: string;
      receivedOccurrenceCount: number;
      distinctOccurrenceCount: number;
      eligibleOccurrenceCount: number;
      eligibleUniqueStationCount: number;
      eligibilityComplete: boolean;
      selectedStationId: string | null;
      selectedOccurrenceId: string | null;
      maxDistinctStationAttempts: number;
      attemptLimitReached: boolean;
      unattemptedEligibleStationCount: number;
      candidates: Array<{
        occurrenceId: string;
        stationId: string;
        eligible: boolean;
        rejectionReasons: string[];
        status: string;
        operationFrom: { state: string; value: string | null };
        operationTo: { state: string; value: string | null };
        validFrom: { state: string; value: string | null };
        validTo: { state: string; value: string | null };
      }>;
      attempts: Array<{
        stationId: string;
        occurrenceId: string;
        rank: number;
        outcome: string;
        rawValueCount: number;
        overlappingDailyValueCount: number;
        paginationComplete: boolean;
        queryPageIndices: number[];
      }>;
    };
  };
}
afterEach(() => vi.useRealTimers());

describe("official historical DMI source", () => {
  it("preserves station, dates, quality, units and page provenance and sums only an exactly covered interval", async () => {
    const fetchImpl = fixture();
    const result = await fetchDmiHistoricalSource(input, { fetchImpl, now });
    expect(result).toMatchObject({
      id: "dmi-historical",
      mode: "live",
      status: "partial",
      provider: "DMI",
      fetchedAt: now(),
      error: null,
      adapterVersion: "dmi-historical-station-precip/v3",
      coverage: {
        spatial: "partial",
        temporal: "complete",
        returnedCount: 2,
        paginationComplete: true,
      },
    });
    expect(payload(result).summary).toMatchObject({ complete: true, totalMm: 10 });
    expect(payload(result).series[0]).toMatchObject({
      parameterId: "acc_precip",
      timeResolution: "day",
      from: input.dateFrom,
      to: "2026-08-18T06:00:00Z",
      qcStatus: "manual",
      validity: true,
      unit: "mm",
      value: 4,
    });
    expect(payload(result).station).toMatchObject({
      id: "06149",
      catchmentRelevance: "not_assessed",
    });
    expect(result.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(payload(result).queries.every((query) => /^[0-9a-f]{64}$/.test(query.sha256))).toBe(
      true,
    );
    expect(isBaselineMeasuredEvidence(result)).toBe(false);
    const url = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(url.origin).toBe("https://opendataapi.dmi.dk");
    expect(url.searchParams.get("timeResolution")).toBe("day");
    expect(url.searchParams.get("parameterId")).toBe("acc_precip");
    expect(url.searchParams.get("datetime")).toBe(
      `${new Date(input.dateFrom).toISOString()}/${new Date(input.dateTo).toISOString()}`,
    );
    expect(url.searchParams.has("api-key")).toBe(false);
  });

  it("selects the nearest eligible station deterministically and excludes unrelated parameters", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([
          station("old", [9.4, 55.25], { parameterId: ["mean_temp"] }),
          station("06149", [9.45, 55.25]),
          station("distant", [9.1, 55.1]),
        ]),
      )
      .mockResolvedValueOnce(page([value(17), value(18)]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(payload(result).station.id).toBe("06149");
  });

  it("rejects Oksenvad closed in 2009 despite its open Inactive metadata row, preserving the rejection proof", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([
          station("26050", [9.4, 55.25], {
            status: "Inactive",
            validFrom: "2009-04-02T00:00:00Z",
            validTo: null,
            operationFrom: "1920-09-01T00:00:00Z",
            operationTo: "2009-04-02T00:00:00Z",
          }),
          station(),
        ]),
      )
      .mockResolvedValueOnce(page([value(17), value(18)]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(payload(result).station.id).toBe("06149");
    expect(payload(result).stationSelection.candidates).toContainEqual(
      expect.objectContaining({
        stationId: "26050",
        eligible: false,
        status: "Inactive",
        operationTo: { state: "value", value: "2009-04-02T00:00:00Z" },
        validTo: { state: "open", value: null },
        rejectionReasons: ["operation_period_outside_request"],
      }),
    );
    expect(new URL(String(fetchImpl.mock.calls[1][0])).searchParams.get("stationId")).toBe("06149");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("accepts an inactive historical station whose documented operational and occurrence periods overlap the request", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([
          station("06149", [9.45, 55.25], {
            status: "Inactive",
            operationTo: "2026-09-01T00:00:00Z",
            validTo: "2026-09-01T00:00:00Z",
          }),
        ]),
      )
      .mockResolvedValueOnce(page([value(17), value(18)]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(payload(result).summary.totalMm).toBe(8);
    expect(payload(result).stationSelection.candidates[0]).toMatchObject({
      eligible: true,
      status: "Inactive",
      rejectionReasons: [],
    });
    const stationUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(stationUrl.searchParams.has("status")).toBe(false);
    expect(stationUrl.searchParams.get("datetime")).toBe(
      `${new Date(input.dateFrom).toISOString()}/${new Date(input.dateTo).toISOString()}`,
    );
  });

  it.each([
    [
      "missing operation start",
      { operationFrom: undefined },
      "operation_period_unknown",
      "missing",
    ],
    ["missing operation end", { operationTo: undefined }, "operation_period_unknown", "missing"],
    ["null operation start", { operationFrom: null }, "operation_period_invalid", "invalid"],
    ["invalid operation end", { operationTo: "not-a-date" }, "operation_period_invalid", "invalid"],
    ["missing metadata end", { validTo: undefined }, "metadata_period_unknown", "missing"],
    ["invalid metadata start", { validFrom: "not-a-date" }, "metadata_period_invalid", "invalid"],
  ])(
    "distinguishes %s from a documented open end and keeps unknown eligibility partial",
    async (_label, properties, reason, state) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(page([station("unknown", [9.4, 55.25], properties), station()]))
        .mockResolvedValueOnce(page([value(17), value(18)]));
      const result = await fetchDmiHistoricalSource(input, { fetchImpl });
      const proof = payload(result).stationSelection.candidates.find(
        (candidate) => candidate.stationId === "unknown",
      )!;
      expect(proof).toMatchObject({ eligible: false, rejectionReasons: [reason] });
      expect(
        Object.values(proof).some(
          (bound) =>
            typeof bound === "object" &&
            bound !== null &&
            "state" in bound &&
            bound.state === state,
        ),
      ).toBe(true);
      expect(
        payload(result).stationSelection.candidates.find(
          (candidate) => candidate.stationId === "06149",
        )?.operationTo,
      ).toEqual({ state: "open", value: null });
      expect(result.coverage.paginationComplete).toBe(true);
      expect(payload(result).summary.totalMm).toBeNull();
      expect(payload(result).summary.reasons).toContain("station_eligibility_unknown");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    [{ operationTo: input.dateFrom }, "operation_period_outside_request"],
    [{ operationFrom: input.dateTo }, "operation_period_outside_request"],
    [{ validTo: input.dateFrom }, "metadata_period_outside_request"],
    [{ validFrom: input.dateTo }, "metadata_period_outside_request"],
    [
      { operationFrom: "2026-09-01T00:00:00Z", operationTo: "2026-08-01T00:00:00Z" },
      "operation_period_invalid",
    ],
  ])(
    "rejects non-overlapping or inverted interval bounds without querying that station",
    async (properties, reason) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(page([station("excluded", [9.4, 55.25], properties)]));
      const result = await fetchDmiHistoricalSource(input, { fetchImpl });
      expect(payload(result).stationSelection.candidates[0].rejectionReasons).toContain(reason);
      expect(payload(result).stationSelection.selectedStationId).toBeNull();
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(result.status).toBe(reason.endsWith("invalid") ? "partial" : "no_coverage");
    },
  );

  it("does not claim no coverage when every precipitation candidate has absent operational metadata", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([
          station("unknown", [9.4, 55.25], { operationFrom: undefined, operationTo: undefined }),
        ]),
      );
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(result).toMatchObject({
      mode: "live",
      status: "partial",
      coverage: { paginationComplete: true, returnedCount: 0 },
    });
    expect(payload(result).candidateCount).toBe(0);
    expect(payload(result).stationSelection.eligibilityComplete).toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("preserves duplicate metadata occurrences but probes each distinct station at most once", async () => {
    const near = { ...station("near", [9.4, 55.25]), id: "near-a" };
    const moved = { ...station("near", [9.42, 55.25]), id: "near-b" };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([near, near, moved, station()]))
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([value(17), value(18)]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(payload(result).station.id).toBe("06149");
    expect(payload(result).stationSelection).toMatchObject({
      receivedOccurrenceCount: 4,
      distinctOccurrenceCount: 3,
      eligibleOccurrenceCount: 3,
      eligibleUniqueStationCount: 2,
    });
    expect(
      payload(result).stationSelection.candidates.map((candidate) => candidate.occurrenceId),
    ).toEqual(["near-a", "near-b", "station-06149"]);
    expect(payload(result).stationSelection.attempts.map((attempt) => attempt.stationId)).toEqual([
      "near",
      "06149",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects conflicting versions of the same metadata occurrence rather than choosing a convenient one", async () => {
    const repeated = station();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([repeated, { ...repeated, geometry: { type: "Point", coordinates: [9.5, 55.25] } }]),
      );
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(result).toMatchObject({
      status: "failed",
      payload: null,
      error: { code: "CONFLICTING_STATION_OCCURRENCE" },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("tries the next nearest station only after a complete empty period response and retains every attempt/page proof", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([station("near", [9.4, 55.25]), station()]))
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([value(17), value(18)]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(payload(result).station.id).toBe("06149");
    expect(payload(result).summary.totalMm).toBe(8);
    expect(payload(result).stationSelection.attempts).toEqual([
      expect.objectContaining({
        stationId: "near",
        rank: 1,
        outcome: "complete_empty_try_next",
        rawValueCount: 0,
        overlappingDailyValueCount: 0,
        paginationComplete: true,
        queryPageIndices: [1],
      }),
      expect.objectContaining({
        stationId: "06149",
        rank: 2,
        outcome: "selected_with_values",
        overlappingDailyValueCount: 2,
        paginationComplete: true,
        queryPageIndices: [2],
      }),
    ]);
    expect(payload(result).queries).toHaveLength(3);
    expect(payload(result).queries.every((query) => /^[0-9a-f]{64}$/.test(query.sha256))).toBe(
      true,
    );
  });

  it("bounds fallback to three unique stations and retains unprobed candidates as incomplete coverage", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([
          station("a", [9.4, 55.25]),
          station("b", [9.41, 55.25]),
          station("c", [9.42, 55.25]),
          station("d", [9.43, 55.25]),
        ]),
      )
      .mockImplementation(async () => page([]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(result).toMatchObject({
      mode: "live",
      status: "partial",
      coverage: { temporal: "none", paginationComplete: true },
    });
    expect(payload(result).summary.totalMm).toBeNull();
    expect(payload(result).summary.reasons).toContain("station_attempt_limit_reached");
    expect(payload(result).stationSelection).toMatchObject({
      maxDistinctStationAttempts: 3,
      attemptLimitReached: true,
      unattemptedEligibleStationCount: 1,
      eligibleUniqueStationCount: 4,
    });
    expect(payload(result).stationSelection.attempts.map((attempt) => attempt.stationId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("reports no period data after all known candidates return complete empty series, with no zero-filled rainfall", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([station("a", [9.4, 55.25]), station("b", [9.41, 55.25])]))
      .mockImplementation(async () => page([]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(result).toMatchObject({
      mode: "live",
      status: "no_coverage",
      coverage: { returnedCount: 0, paginationComplete: true },
    });
    expect(payload(result).summary.totalMm).toBeNull();
    expect(payload(result).stationSelection).toMatchObject({
      attemptLimitReached: false,
      unattemptedEligibleStationCount: 0,
    });
    expect(payload(result).stationSelection.attempts.at(-1)?.outcome).toBe("complete_empty_stop");
  });

  it.each([
    ["partial series", [value(17)], null],
    ["unchecked quality", [value(17, 4, { qcStatus: "none" }), value(18)], null],
    ["trace rain", [value(17, -0.1), value(18)], null],
    ["invalid unit", [value(17, 4, { unit: "inches" })], "INVALID_SOURCE_RESPONSE"],
    ["invalid interval", [value(17, 4, { to: input.dateFrom })], "INVALID_INTERVAL"],
    ["wrong station", [value(17, 4, { stationId: "other" })], "STATION_MISMATCH"],
  ])("never switches station to hide %s", async (_name, values, errorCode) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([station(), station("other", [9.1, 55.1])]))
      .mockResolvedValueOnce(page(values));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    if (errorCode) {
      expect(result).toMatchObject({
        mode: "error",
        status: "failed",
        payload: null,
        error: { code: errorCode },
      });
      expect(
        result.quality.warnings.some((warning) => warning.includes(`06149 (failed/${errorCode})`)),
      ).toBe(true);
    } else {
      expect(payload(result).station.id).toBe("06149");
      expect(payload(result).summary.totalMm).toBeNull();
      expect(payload(result).stationSelection.attempts).toHaveLength(1);
    }
  });

  it("does not fallback after a truncated empty value response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([station(), station("other", [9.1, 55.1])]))
      .mockResolvedValueOnce(
        page(
          [value(15)],
          "https://opendataapi.dmi.dk/v2/climateData/collections/stationValue/items?offset=200",
        ),
      );
    const result = await fetchDmiHistoricalSource(input, { fetchImpl, maxPages: 1 });
    expect(result).toMatchObject({
      status: "partial",
      coverage: { paginationComplete: false, returnedCount: 0 },
    });
    expect(payload(result).stationSelection.attempts[0]).toMatchObject({
      outcome: "truncated_empty_stop",
      rawValueCount: 1,
      overlappingDailyValueCount: 0,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("preserves a failure on the second attempt instead of hiding it with a third station", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([
          station("a", [9.4, 55.25]),
          station("b", [9.41, 55.25]),
          station("c", [9.42, 55.25]),
        ]),
      )
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(result).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
      error: { code: "HTTP_503" },
    });
    expect(
      result.quality.warnings.some((warning) =>
        warning.includes("a (complete_empty_try_next), b (failed/HTTP_503)"),
      ),
    ).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("keeps a timed-out station attempt visible and never falls back", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([station(), station("other", [9.1, 55.1])]))
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("timed out", "AbortError")),
              { once: true },
            );
          }),
      );
    const result = await fetchDmiHistoricalSource(input, { fetchImpl, requestTimeoutMs: 5 });
    expect(result).toMatchObject({ status: "timeout", payload: null, error: { code: "TIMEOUT" } });
    expect(
      result.quality.warnings.some((warning) => warning.includes("06149 (failed/TIMEOUT)")),
    ).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uses the most recently created official revision, without summing duplicate dates", async () => {
    const result = await fetchDmiHistoricalSource(input, {
      fetchImpl: fixture([
        value(17, 1),
        value(17, 8, { created: "2026-09-02T10:00:00Z" }),
        value(18, 2),
      ]),
    });
    expect(payload(result).series).toHaveLength(2);
    expect(payload(result).summary.totalMm).toBe(10);
  });

  it("keeps zero as a real measurement when the complete records support it", async () => {
    const result = await fetchDmiHistoricalSource(input, {
      fetchImpl: fixture([value(17, 0), value(18, 0)]),
    });
    expect(payload(result).summary.totalMm).toBe(0);
  });

  it.each([
    ["trace", [value(17, -0.1), value(18)], "trace"],
    ["invalid validity", [value(17, 4, { validity: false }), value(18)], "invalid_value"],
    ["unknown validity", [value(17, 4, { validity: null }), value(18)], "validity_unknown"],
    ["missing validity", [value(17, 4, { validity: undefined }), value(18)], "validity_unknown"],
    [
      "unchecked quality",
      [value(17, 4, { qcStatus: "none" }), value(18)],
      "quality_control_incomplete",
    ],
    ["missing day", [value(17)], "requested_period_not_exact_daily_boundaries"],
    [
      "partial daily interval",
      [value(17, 4, { to: "2026-08-17T12:00:00Z" }), value(18)],
      "incomplete_daily_interval",
    ],
    [
      "partial daily inputs",
      [value(17, 4, { noValuesInCalculation: 12 }), value(18)],
      "incomplete_daily_inputs",
    ],
    ["unexpected negative", [value(17, -2), value(18)], "invalid_negative"],
  ])("does not zero-fill or output a sum for %s", async (_name, values, reason) => {
    const result = await fetchDmiHistoricalSource(input, {
      fetchImpl: fixture(values as unknown[]),
    });
    expect(payload(result).summary.totalMm).toBeNull();
    expect(payload(result).summary.reasons).toContain(reason);
  });

  it("retains arbitrary photo timestamps without pretending they are complete daily sum windows", async () => {
    const result = await fetchDmiHistoricalSource(
      { ...input, dateFrom: "2026-08-17T09:42:00Z" },
      { fetchImpl: fixture() },
    );
    expect(payload(result).summary.totalMm).toBeNull();
    expect(result.coverage.temporal).toBe("partial");
  });

  it("reports a valid empty station response as no coverage with no numeric rain result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(page([]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(result).toMatchObject({
      status: "no_coverage",
      mode: "live",
      coverage: { temporal: "none" },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(JSON.stringify(result.payload)).not.toContain("totalMm");
  });

  it("reports an empty daily response without replacing it with zero rainfall", async () => {
    const result = await fetchDmiHistoricalSource(input, { fetchImpl: fixture([]) });
    expect(result.status).toBe("no_coverage");
    expect(payload(result).summary.totalMm).toBeNull();
    expect(payload(result).series).toEqual([]);
  });

  it.each([301, 302, 307, 308, 429, 503])(
    "preserves HTTP %s as a source failure",
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("failure", { status }));
      const result = await fetchDmiHistoricalSource(input, {
        fetchImpl,
      });
      expect(result).toMatchObject({
        mode: "error",
        status: "failed",
        payload: null,
        payloadSha256: null,
        error: { code: `HTTP_${status}` },
        coverage: { temporal: "unknown", returnedCount: null },
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl.mock.calls[0][1]?.redirect).toBe("manual");
    },
  );

  it.each([{}, { type: "FeatureCollection", features: [{}] }])(
    "fails safely on malformed source data",
    async (json) => {
      const result = await fetchDmiHistoricalSource(input, {
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(json))),
      });
      expect(result).toMatchObject({ mode: "error", status: "failed", payload: null });
    },
  );

  it("rejects another station and unknown units", async () => {
    for (const properties of [{ stationId: "other" }, { unit: "inches" }]) {
      const result = await fetchDmiHistoricalSource(input, {
        fetchImpl: fixture([value(17, 4, properties)]),
      });
      expect(result).toMatchObject({ status: "failed", payload: null });
    }
  });

  it("bounds pages and marks truncated pagination rather than claiming a complete sum", async () => {
    const url = "https://opendataapi.dmi.dk/v2/climateData/collections/station/items?offset=200";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([station()], url))
      .mockResolvedValueOnce(page([value(17), value(18)]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl, maxPages: 1 });
    expect(result.coverage.paginationComplete).toBe(false);
    expect(payload(result).summary.totalMm).toBeNull();
  });

  it("cannot follow pagination to an arbitrary host", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(page([station()], "https://other.example/collect?offset=200"));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect(result.error?.code).toBe("UNSAFE_PAGINATION");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not trust source pagination to widen the station or date scope", async () => {
    const next =
      "https://opendataapi.dmi.dk/v2/climateData/collections/stationValue/items?offset=200&stationId=other&parameterId=mean_temp";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([station()]))
      .mockResolvedValueOnce(page([value(17)], next))
      .mockResolvedValueOnce(page([value(18)]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    const nextUrl = new URL(String(fetchImpl.mock.calls[2][0]));
    expect(nextUrl.searchParams.get("stationId")).toBe("06149");
    expect(nextUrl.searchParams.get("parameterId")).toBe("acc_precip");
    expect(payload(result).summary.totalMm).toBe(8);
  });

  it("rejects oversized and stalled bodies with bounded error results", async () => {
    const oversized = await fetchDmiHistoricalSource(input, {
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("{}", { headers: { "content-length": "1000000" } })),
    });
    expect(oversized.error?.code).toBe("RESPONSE_TOO_LARGE");
    const stalled = new ReadableStream<Uint8Array>({
      start() {
        /* deliberately never emits bytes */
      },
    });
    const timed = fetchDmiHistoricalSource(input, {
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(stalled)),
      requestTimeoutMs: 5,
    });
    expect(await timed).toMatchObject({ mode: "error", status: "timeout", payload: null });
  });

  it("rejects invalid bounds, timezone-free dates and geometry hash mismatch before fetching", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchDmiHistoricalSource({ ...input, bbox: [9, 56, 8, 55] }, { fetchImpl }),
    ).rejects.toThrow();
    await expect(
      fetchDmiHistoricalSource({ ...input, dateFrom: "2026-08-17T06:00:00" }, { fetchImpl }),
    ).rejects.toThrow();
    await expect(
      fetchDmiHistoricalSource({ ...input, geometrySha256: "0".repeat(64) }, { fetchImpl }),
    ).rejects.toThrow("hash");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("recognizes 23-hour DST days using actual intervals and rejects mixed-station sums", () => {
    const row: DmiDailyPrecipitation = {
      id: "dst",
      stationId: "06149",
      coordinates: [9, 55],
      parameterId: "acc_precip",
      timeResolution: "day",
      from: "2026-03-28T23:00:00Z",
      to: "2026-03-29T22:00:00Z",
      value: 2,
      unit: "mm",
      valueKind: "amount",
      qcStatus: "manual",
      validity: true,
      created: "2026-04-01T00:00:00Z",
      calculatedAt: null,
      noValuesInCalculation: 23,
    };
    expect(summarizeDmiDailySeries([row], row.from, row.to, true).totalMm).toBe(2);
    const other = {
      ...row,
      id: "other",
      stationId: "other",
      from: row.to,
      to: "2026-03-30T22:00:00Z",
      noValuesInCalculation: 24,
    };
    expect(summarizeDmiDailySeries([row, other], row.from, other.to, true).reasons).toContain(
      "mixed_stations",
    );
  });
});

describe("bounded DMI daily context inside a requested window", () => {
  const rows = [17, 18, 19].map((day) => ({
    ...value(day).properties,
    id: `local-day-${day}`,
    coordinates: [9.45, 55.25] as [number, number],
    parameterId: "acc_precip" as const,
    timeResolution: "day" as const,
    from: `2026-08-${day}T00:00:00.001+02:00`,
    to: `2026-08-${day + 1}T00:00:00+02:00`,
    value: day - 15,
    unit: "mm" as const,
    valueKind: "amount" as const,
    qcStatus: "manual",
    validity: true,
    calculatedAt: null,
    noValuesInCalculation: 24,
  }));
  it("uses only wholly contained local days and exposes their exact dates without a full-request claim", () => {
    const result = summarizeAvailableDmiDailySeries(
      rows,
      "2026-08-17T00:00:00Z",
      "2026-08-20T00:00:00Z",
      true,
    );
    expect(result).toMatchObject({
      scope: "complete_daily_intervals_inside_requested_period",
      totalMm: 7,
      complete: true,
      dailyValueCount: 2,
      excludedBoundaryIntervalCount: 1,
      representsEntireRequestedPeriod: false,
      coveredFrom: "2026-08-18T00:00:00.001+02:00",
      coveredTo: "2026-08-20T00:00:00+02:00",
      requestedFrom: "2026-08-17T00:00:00Z",
      requestedTo: "2026-08-20T00:00:00Z",
    });
    expect(
      summarizeDmiDailySeries(rows, "2026-08-17T00:00:00Z", "2026-08-20T00:00:00Z", true).totalMm,
    ).toBeNull();
  });
  it("never sums boundary fractions, missing days, trace values or incomplete pagination", () => {
    const from = rows[0].from,
      to = rows[2].to;
    for (const [series, complete] of [
      [[rows[0], rows[2]], true],
      [[{ ...rows[0], value: -0.1, valueKind: "trace" as const }, rows[1], rows[2]], true],
      [rows, false],
    ] as const) {
      expect(summarizeAvailableDmiDailySeries([...series], from, to, complete).totalMm).toBeNull();
    }
    const empty = summarizeAvailableDmiDailySeries(
      [rows[0]],
      "2026-08-17T04:00:00Z",
      "2026-08-17T05:00:00Z",
      true,
    );
    expect(empty).toMatchObject({
      complete: false,
      totalMm: null,
      dailyValueCount: 0,
      coveredFrom: null,
      coveredTo: null,
      representsEntireRequestedPeriod: false,
    });
  });
  it("can describe an exactly supported whole interval without modifying the stricter period summary", async () => {
    const result = await fetchDmiHistoricalSource(input, { fetchImpl: fixture() });
    expect((result.payload as Record<string, unknown>).availableDailySummary).toMatchObject({
      totalMm: 10,
      complete: true,
      representsEntireRequestedPeriod: true,
      excludedBoundaryIntervalCount: 0,
    });
    expect(payload(result).summary).toMatchObject({ totalMm: 10, complete: true });
  });
  it("does not release an available-period sum while station eligibility is uncertain", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([station(), station("other", [9.5, 55.25], { operationFrom: undefined })]),
      )
      .mockResolvedValueOnce(page([value(17), value(18)]));
    const result = await fetchDmiHistoricalSource(input, { fetchImpl });
    expect((result.payload as Record<string, unknown>).availableDailySummary).toMatchObject({
      complete: false,
      totalMm: null,
      representsEntireRequestedPeriod: false,
      reasons: expect.arrayContaining(["station_eligibility_unknown"]),
    });
  });
});
