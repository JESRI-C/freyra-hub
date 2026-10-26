import { describe, expect, it, vi } from "vitest";
import type { Polygon } from "geojson";
import { fetchPlantingPolygonSource } from "../planting-polygon-sources.server";
import { fetchSoilTypeSource } from "../soil-type-source.server";
import { baselineSha256, buildPublicBaselineManifest } from "../public-baseline-service";
import { buildPlantingFromBaseline } from "@/services/planting/planting-baseline";
import { bytesSha256 } from "../bounded-public-read.server";
import { COLLECTED_AT, INPUT, PROJECT, REFERENCE, makeSnapshot } from "./public-baseline.fixtures";

const valid: Polygon = {
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
// Closed, finite, in-bounds bow tie: basic tuple/ring validation alone is insufficient.
const invalid: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [9.01, 55.01],
      [9.02, 55.02],
      [9.01, 55.02],
      [9.02, 55.01],
      [9.01, 55.01],
    ],
  ],
};
const input = {
  polygon: PROJECT.geometry_polygon as Polygon,
  dateFrom: INPUT.dateFrom,
  dateTo: INPUT.dateTo,
};
const page = (shapes: Polygon[]) => ({
  type: "FeatureCollection",
  numberMatched: shapes.length,
  numberReturned: shapes.length,
  crs: { type: "name", properties: { name: "urn:ogc:def:crs:CRS::84" } },
  features: shapes.map((geometry, id) => ({ type: "Feature", id, geometry })),
});
const mixed = () =>
  page([...Array.from({ length: 30 }, () => valid), ...Array.from({ length: 8 }, () => invalid)]);
const getLowland = (raw: ReturnType<typeof page>) =>
  fetchPlantingPolygonSource("planting-lowland", input, {
    fetchImpl: vi.fn().mockResolvedValue(Response.json(raw)),
  });

describe("new public polygon ingestion isolates invalid features", () => {
  it("keeps 30 of 38 unchanged polygons, records rejection and hash, and downgrades complete transport coverage", async () => {
    const raw = mixed();
    const before = structuredClone(raw);
    const result = await getLowland(raw);
    expect(result).toMatchObject({
      status: "partial",
      mode: "live",
      error: null,
      coverage: { spatial: "partial", paginationComplete: true, returnedCount: 30 },
      payload: {
        geometries: Array.from({ length: 30 }, () => valid),
        numberMatched: 38,
        numberReturned: 38,
        geometryValidation: {
          receivedFeatureCount: 38,
          rejectedFeatureCount: 8,
          rejectionReason: "INVALID_TOPOLOGY",
        },
        responseSha256: await bytesSha256(new TextEncoder().encode(JSON.stringify(raw))),
      },
    });
    expect(result.quality.warnings.join(" ")).toContain("8 af 38");
    expect(result.payloadSha256).toBe(await baselineSha256(result.payload));
    expect(raw).toEqual(before);
  });
  it("does not turn all-invalid results into an empty complete layer", async () => {
    const raw = page([invalid]);
    const result = await getLowland(raw);
    expect(result).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      coverage: { spatial: "unknown", returnedCount: null },
      error: { code: "INVALID_GEOMETRY" },
    });
    expect(result.quality.warnings.join(" ")).toContain("1 af 1");
    expect(result.quality.warnings.join(" ")).toContain(
      await bytesSha256(new TextEncoder().encode(JSON.stringify(raw))),
    );
  });
  it("builds a partial planting sketch from the newly saved source without rewriting the old snapshot", async () => {
    const reference = {
      ...REFERENCE,
      geometry: {
        ...REFERENCE.geometry,
        coordinates: [
          [
            [9.01, 55.01],
            [9.05, 55.05],
          ],
          [
            [9.05, 55.05],
            [9.09, 55.09],
          ],
        ] as [number, number][][],
      },
      segmentCount: 2,
      vertexCount: 4,
    };
    const manifest = await buildPublicBaselineManifest(
      INPUT,
      PROJECT,
      reference,
      reference,
      COLLECTED_AT,
    );
    const current = await getLowland(mixed());
    manifest.sources = manifest.sources.map((source) =>
      source.id === current.id ? current : source,
    );
    const saved = await makeSnapshot(manifest);
    const result = buildPlantingFromBaseline(saved);
    expect(result.status).toBe("partial");
    expect(result.features.features.length).toBeGreaterThan(0);
    expect(result.features.features.every((f) => f.properties.suitability !== "egnet")).toBe(true);
    expect(result.reaches.every((reach) => reach.suitableHa === null)).toBe(true);
    const historical = structuredClone(saved);
    const legacy = historical.manifest.sources.find((source) => source.id === current.id)!;
    // Use the original failure shape that booleanValid itself rejects, not only a crossing.
    const spike = structuredClone(valid);
    spike.coordinates[0].splice(1, 0, [...spike.coordinates[0][0]]);
    const payload = {
      schema: "freyra.planting-polygons/v1",
      crs: "EPSG:4326",
      geometries: [{ type: spike.type, coordinates: spike.coordinates }],
    };
    legacy.payload = payload;
    legacy.payloadSha256 = await baselineSha256(payload);
    const actualBefore = structuredClone(historical);
    expect(buildPlantingFromBaseline(historical).status).toBe("unavailable");
    expect(historical).toEqual(actualBefore);
    expect(saved.manifest).toEqual(manifest);
  });
  it("isolates invalid GEUS features with the same provenance and fails closed when none are valid", async () => {
    const fetchSoil = (shapes: Polygon[]) => {
      const raw = {
        type: "FeatureCollection",
        features: shapes.map((geometry, id) => ({
          type: "Feature",
          id,
          geometry,
          properties: {
            OBJECTID: id,
            jsym1: "ML",
            jsym2: "ML",
            tsym: "G",
            Jordart: "Testjordart",
            Tidsalder: "Test",
            Version: "Test",
          },
        })),
      };
      return fetchSoilTypeSource(input, {
        fetchImpl: vi
          .fn()
          .mockResolvedValueOnce(Response.json({ count: shapes.length }))
          .mockResolvedValueOnce(
            new Response(JSON.stringify(raw), {
              headers: { "content-type": "application/geo+json" },
            }),
          ),
      });
    };
    const result = await fetchSoil([valid, invalid]);
    expect(result).toMatchObject({
      mode: "live",
      status: "partial",
      coverage: { spatial: "partial", paginationComplete: true, returnedCount: 1 },
      payload: {
        features: [{ geometry: valid }],
        geometryValidation: {
          receivedFeatureCount: 2,
          rejectedFeatureCount: 1,
          rejectionReason: "INVALID_TOPOLOGY",
        },
      },
    });
    expect(result.payloadSha256).toBe(await baselineSha256(result.payload));
    expect(await fetchSoil([invalid])).toMatchObject({
      mode: "error",
      payload: null,
      coverage: { spatial: "unknown", returnedCount: null },
      error: { code: "INVALID_GEOMETRY" },
    });
  });
});
