import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlantingPolygonSource } from "../planting-polygon-sources.server";
import { PROJECT } from "./public-baseline.fixtures";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { baselineSha256 } from "../public-baseline-service";
const input = {
  polygon: PROJECT.geometry_polygon as GeoJSONPolygon,
  dateFrom: "2026-08-24",
  dateTo: "2026-08-24",
};
const shape = {
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
};
const page = (matched = 1) => ({
  type: "FeatureCollection",
  numberMatched: matched,
  numberReturned: 1,
  crs: { type: "name", properties: { name: "urn:ogc:def:crs:CRS::84" } },
  features: [{ type: "Feature", id: "official-fixture.1", geometry: shape }],
});
afterEach(() => vi.unstubAllEnvs());
describe("real-source polygon adapter contract", () => {
  it.each(["planting-markblocks", "planting-lowland"] as const)(
    "saves validated %s polygons and actual scope without calculations",
    async (id) => {
      const fetchImpl = vi.fn().mockResolvedValue(Response.json(page()));
      const source = await fetchPlantingPolygonSource(id, input, { fetchImpl });
      expect(source).toMatchObject({
        mode: "live",
        status: "partial",
        coverage: {
          spatial: "complete",
          temporal: "unknown",
          paginationComplete: true,
          returnedCount: 1,
        },
      });
      expect(source.payload).toMatchObject({
        schema: "freyra.planting-polygons/v1",
        crs: "EPSG:4326",
        geometries: [shape],
      });
      expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
      expect(String(fetchImpl.mock.calls[0][0])).toContain("CRS84");
    },
  );
  it("keeps incomplete inventories partial and empty errors unknown", async () => {
    const source = await fetchPlantingPolygonSource("planting-lowland", input, {
      fetchImpl: vi.fn().mockResolvedValue(Response.json(page(500))),
    });
    expect(source.coverage).toMatchObject({ spatial: "partial", paginationComplete: false });
    const error = await fetchPlantingPolygonSource("planting-lowland", input, {
      fetchImpl: vi.fn().mockResolvedValue(new Response("private diagnostics", { status: 503 })),
    });
    expect(error).toMatchObject({
      mode: "error",
      payload: null,
      coverage: { returnedCount: null },
    });
    expect(JSON.stringify(error)).not.toContain("private diagnostics");
  });
  it("rejects unknown axis order, malformed shapes, and duplicate IDs", async () => {
    for (const raw of [
      { ...page(), crs: { type: "name", properties: { name: "EPSG:4326" } } },
      {
        ...page(),
        features: [{ type: "Feature", id: "x", geometry: { ...shape, coordinates: [[[55, 9]]] } }],
      },
      { ...page(2), numberReturned: 2, features: [...page().features, ...page().features] },
    ]) {
      const source = await fetchPlantingPolygonSource("planting-markblocks", input, {
        fetchImpl: vi.fn().mockResolvedValue(Response.json(raw)),
      });
      expect(source.mode).toBe("error");
      expect(source.payload).toBeNull();
    }
  });
  it("never exposes the key and retains woodland's incomplete small-tree coverage", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "private-unit-test-key");
    const source = await fetchPlantingPolygonSource("planting-woodland", input, {
      fetchImpl: vi.fn().mockResolvedValue(Response.json(page())),
    });
    expect(source.coverage.spatial).toBe("partial");
    expect(JSON.stringify(source)).not.toContain("private-unit-test-key");
  });
});
