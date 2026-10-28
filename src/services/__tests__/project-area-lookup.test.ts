import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCadastralSource } from "../baseline/cadastral-source.server";
import { fetchPlantingPolygonSource } from "../baseline/planting-polygon-sources.server";
import { pickProjectArea } from "../project-area-lookup.server";
vi.mock("../baseline/cadastral-source.server", () => ({ fetchCadastralSource: vi.fn() }));
vi.mock("../baseline/planting-polygon-sources.server", () => ({
  fetchPlantingPolygonSource: vi.fn(),
}));
const shape = {
  type: "Polygon",
  coordinates: [
    [
      [10, 56],
      [10.01, 56],
      [10.01, 56.01],
      [10, 56.01],
      [10, 56],
    ],
  ],
};
const source = (payload: unknown, complete = true) => ({
  mode: "live",
  payload,
  coverage: { paginationComplete: complete, spatial: complete ? "complete" : "partial" },
});
beforeEach(() => vi.resetAllMocks());
describe("project area picks reuse current validated baseline adapters", () => {
  it("selects the containing parcel with source identity", async () => {
    vi.mocked(fetchCadastralSource).mockResolvedValue(
      source({
        parcels: [
          { id: "parcel-1", parcelNumber: "12a", landRegisterAreaCode: "123", geometry: shape },
        ],
      }) as never,
    );
    const picked = await pickProjectArea("matrikel", 56.005, 10.005);
    expect(picked).toMatchObject({
      source: "matrikel",
      geometry: shape,
      properties: { source_id: "parcel-1" },
    });
  });
  it("does not pick a nearby bbox candidate outside the actual clicked point", async () => {
    vi.mocked(fetchPlantingPolygonSource).mockResolvedValue(
      source({ geometries: [shape], featureIds: ["mb-1"] }) as never,
    );
    expect(await pickProjectArea("markblok", 56.02, 10.02)).toBeNull();
  });
  it("distinguishes unavailable service and incomplete coverage from no parcel", async () => {
    vi.mocked(fetchCadastralSource).mockResolvedValue({ mode: "error", payload: null } as never);
    await expect(pickProjectArea("matrikel", 56.005, 10.005)).rejects.toThrow("kunne ikke hentes");
    vi.mocked(fetchCadastralSource).mockResolvedValue(source({ parcels: [] }, false) as never);
    await expect(pickProjectArea("matrikel", 56.005, 10.005)).rejects.toThrow("ufuldstændigt");
  });
  it("never silently discards parts of a multipart property", async () => {
    vi.mocked(fetchCadastralSource).mockResolvedValue(
      source({
        parcels: [
          {
            id: "parcel-1",
            parcelNumber: "12a",
            landRegisterAreaCode: "123",
            geometry: { type: "MultiPolygon", coordinates: [shape.coordinates] },
          },
        ],
      }) as never,
    );
    await expect(pickProjectArea("matrikel", 56.005, 10.005)).rejects.toThrow("flere dele");
  });
});
