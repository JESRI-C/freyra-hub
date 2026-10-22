import { describe, expect, it, vi } from "vitest";
import { fetchSoilTypeSource } from "../soil-type-source.server";
import { baselineSha256 } from "../public-baseline-service";
import { PROJECT } from "./public-baseline.fixtures";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
const input = {
  polygon: PROJECT.geometry_polygon as GeoJSONPolygon,
  dateFrom: "2026-08-24",
  dateTo: "2026-08-24",
};
const record = {
  type: "Feature",
  id: 1,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [9.01, 55.01],
        [9.02, 55.01],
        [9.02, 55.02],
        [9.01, 55.02],
        [9.01, 55.01],
      ],
    ],
  },
  properties: {
    OBJECTID: 1,
    jsym1: "ML",
    jsym2: "ML",
    tsym: "G",
    Jordart: "ML - Moræneler",
    Tidsalder: "Testperiode",
    Version: "Version 7.1, jan 2026",
    privateExtra: "not-persisted",
  },
};
function mockPage(features: unknown[], count = features.length, extra = {}) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ count }), { headers: { "content-type": "application/json" } }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ type: "FeatureCollection", features, ...extra }), {
        headers: { "content-type": "application/geo+json" },
      }),
    );
}
describe("official GEUS soil polygons", () => {
  it("freezes actual types, versions and geometry, preserves partial mapping despite complete query", async () => {
    const fetchImpl = mockPage([record]);
    const result = await fetchSoilTypeSource(input, { fetchImpl });
    expect(result).toMatchObject({
      mode: "live",
      status: "partial",
      datasetVersion: "Version 7.1, jan 2026",
      coverage: {
        spatial: "partial",
        temporal: "unknown",
        paginationComplete: true,
        returnedCount: 1,
      },
    });
    expect(result.payload).toMatchObject({
      schema: "freyra.soil-type-polygons/v1",
      features: [{ soilType: "ML - Moræneler", geometry: record.geometry }],
    });
    expect(result.payloadSha256).toBe(await baselineSha256(result.payload));
    expect(JSON.stringify(result)).not.toContain("not-persisted");
    const request = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(request.searchParams.get("outSR")).toBe("4326");
    expect(request.searchParams.get("maxAllowableOffset")).toBe("0.00001");
  });
  it("reports incomplete queries and absent mapping without converting missing soil to zero", async () => {
    expect(await fetchSoilTypeSource(input, { fetchImpl: mockPage([record], 2) })).toMatchObject({
      mode: "live",
      coverage: { spatial: "partial", paginationComplete: false, returnedCount: 1 },
    });
    expect(await fetchSoilTypeSource(input, { fetchImpl: mockPage([]) })).toMatchObject({
      mode: "live",
      status: "partial",
      coverage: { spatial: "unknown", paginationComplete: true, returnedCount: 0 },
    });
    expect(
      await fetchSoilTypeSource(input, {
        fetchImpl: mockPage([record], 1, { exceededTransferLimit: true }),
      }),
    ).toMatchObject({ coverage: { paginationComplete: false } });
  });
  it.each(
    [
      [{ ...record, id: 2 }],
      [record, record],
      [
        {
          ...record,
          geometry: {
            ...record.geometry,
            coordinates: [
              [
                [500000, 6100000],
                [501000, 6100000],
                [501000, 6101000],
                [500000, 6100000],
              ],
            ],
          },
        },
      ],
      [
        {
          ...record,
          geometry: {
            ...record.geometry,
            coordinates: [
              [
                [9.01, 55.01],
                [9.02, 55.01],
                [9.02, 55.02],
                [9.01, 55.02],
              ],
            ],
          },
        },
      ],
    ].map((features) => [features]),
  )(
    "rejects duplicate, inconsistent or non-WGS84 geometry without empty-area claims",
    async (features) => {
      const result = await fetchSoilTypeSource(input, { fetchImpl: mockPage(features) });
      expect(result).toMatchObject({
        mode: "error",
        payload: null,
        coverage: { spatial: "unknown", returnedCount: null },
      });
    },
  );
  it("isolates an upstream error without exposing its body", async () => {
    const result = await fetchSoilTypeSource(input, {
      fetchImpl: vi.fn().mockResolvedValue(
        new Response('{"error":{"message":"upstream-private-error"}}', {
          headers: { "content-type": "application/json" },
        }),
      ),
    });
    expect(result).toMatchObject({ mode: "error", payload: null });
    expect(JSON.stringify(result)).not.toContain("upstream-private-error");
  });
});
