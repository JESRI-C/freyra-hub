import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlantingPolygonSource } from "../planting-polygon-sources.server";
import { PROJECT } from "./public-baseline.fixtures";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { baselineSha256 } from "../public-baseline-service";
import { bytesSha256 } from "../bounded-public-read.server";
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
  it("projects finite GeoDanmark Z coordinates to XY, preserves holes and original-response provenance", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "private-unit-test-key");
    const hole = [
      [9.012, 55.012],
      [9.014, 55.012],
      [9.014, 55.014],
      [9.012, 55.014],
      [9.012, 55.012],
    ];
    const xy = { type: "MultiPolygon", coordinates: [[shape.coordinates[0], hole]] };
    const raw = {
      ...page(),
      features: [
        {
          ...page().features[0],
          geometry: {
            type: "MultiPolygon",
            coordinates: xy.coordinates.map((p) => p.map((r) => r.map((point) => [...point, 5]))),
          },
        },
      ],
    };
    const source = await fetchPlantingPolygonSource("planting-woodland", input, {
      fetchImpl: vi.fn().mockResolvedValue(Response.json(raw)),
    });
    expect(source).toMatchObject({
      mode: "live",
      status: "partial",
      coverage: { spatial: "partial", returnedCount: 1 },
      payload: {
        geometries: [xy],
        coordinateHandling: "finite-z-omitted",
        responseSha256: await bytesSha256(new TextEncoder().encode(JSON.stringify(raw))),
      },
    });
    expect(source.quality.warnings.join(" ")).toContain("Højden er eksplicit udeladt");
    expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
    expect(raw.features[0].geometry.coordinates[0][0][0]).toHaveLength(3);
    const other = await fetchPlantingPolygonSource("planting-lowland", input, {
      fetchImpl: vi.fn().mockResolvedValue(Response.json(raw)),
    });
    expect(other.mode).toBe("error");
  });
  it.each([null, "5", [5, 6]].map((extra) => [extra]))(
    "rejects invalid Z and extra dimensions without flattening them away: %j",
    async (extra) => {
      vi.stubEnv("DATAFORDELER_API_KEY", "private-unit-test-key");
      const coordinates = shape.coordinates.map((r) =>
        r.map((p) => [...p, ...(Array.isArray(extra) ? extra : [extra])]),
      );
      const raw = {
        ...page(),
        features: [{ ...page().features[0], geometry: { ...shape, coordinates } }],
      };
      const source = await fetchPlantingPolygonSource("planting-woodland", input, {
        fetchImpl: vi.fn().mockResolvedValue(Response.json(raw)),
      });
      expect(source).toMatchObject({
        mode: "error",
        payload: null,
        coverage: { returnedCount: null },
      });
    },
  );
  it("rejects non-finite JSON Z numbers and preserves the total vertex/byte bounds", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "private-unit-test-key");
    const raw = {
      ...page(),
      features: [
        {
          ...page().features[0],
          geometry: {
            ...shape,
            coordinates: shape.coordinates.map((r) => r.map((p) => [...p, "NON_FINITE_Z"])),
          },
        },
      ],
    };
    const body = JSON.stringify(raw).replaceAll('"NON_FINITE_Z"', "1e999");
    expect(
      (
        await fetchPlantingPolygonSource("planting-woodland", input, {
          fetchImpl: vi
            .fn()
            .mockResolvedValue(
              new Response(body, { headers: { "content-type": "application/json" } }),
            ),
        })
      ).mode,
    ).toBe("error");
    const many = {
      ...page(3),
      numberReturned: 3,
      features: Array.from({ length: 3 }, (_, id) => ({
        type: "Feature",
        id,
        geometry: {
          type: "Polygon",
          coordinates: [Array.from({ length: 8_001 }, () => [9, 55, 1])],
        },
      })),
    };
    expect(
      (
        await fetchPlantingPolygonSource("planting-woodland", input, {
          fetchImpl: vi.fn().mockResolvedValue(Response.json(many)),
        })
      ).error?.code,
    ).toBe("GEOMETRY_LIMIT");
    expect(
      (
        await fetchPlantingPolygonSource("planting-woodland", input, {
          fetchImpl: vi
            .fn()
            .mockResolvedValue(Response.json({ ...page(), padding: "x".repeat(384 * 1024) })),
        })
      ).error?.code,
    ).toBe("SIZE_LIMIT");
  });
  it.each(["planting-markblocks", "planting-lowland", "planting-woodland"] as const)(
    "retains an explicitly empty %s response with null CRS as a register result",
    async (id) => {
      vi.stubEnv("DATAFORDELER_API_KEY", "private-unit-test-key");
      const source = await fetchPlantingPolygonSource(id, input, {
        fetchImpl: vi.fn().mockResolvedValue(
          Response.json({
            type: "FeatureCollection",
            features: [],
            numberMatched: 0,
            numberReturned: 0,
            totalFeatures: 0,
            crs: null,
          }),
        ),
      });
      expect(source).toMatchObject({
        mode: "live",
        status: "partial",
        error: null,
        coverage: { paginationComplete: true, returnedCount: 0, temporal: "unknown" },
        payload: { geometries: [], featureIds: [] },
      });
      expect(source.coverage.spatial).toBe(id === "planting-woodland" ? "partial" : "complete");
      expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
    },
  );
  it.each([
    { ...page(), crs: null },
    { ...page(1), features: [], numberReturned: 0, totalFeatures: 1, crs: null },
    { ...page(0), features: [], numberReturned: 0, crs: null },
    { ...page(0), features: [], numberReturned: 0, totalFeatures: 1, crs: null },
    { ...page(0), features: [], numberReturned: 0, totalFeatures: 0, crs: undefined },
  ])("rejects ambiguous empty counts or missing CRS for coordinates %#", async (raw) => {
    const source = await fetchPlantingPolygonSource("planting-lowland", input, {
      fetchImpl: vi.fn().mockResolvedValue(Response.json(raw)),
    });
    expect(source.mode).toBe("error");
    expect(source.payload).toBeNull();
    expect(source.coverage.returnedCount).toBeNull();
  });
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
