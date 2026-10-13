import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDmiHistoricalSource,
  summarizeDmiDailySeries,
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

  it.each([429, 503])("preserves HTTP %s as a source failure", async (status) => {
    const result = await fetchDmiHistoricalSource(input, {
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("failure", { status })),
    });
    expect(result).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
      error: { code: `HTTP_${status}` },
      coverage: { temporal: "unknown", returnedCount: null },
    });
  });

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
