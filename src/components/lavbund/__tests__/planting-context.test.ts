import { describe, expect, it, vi } from "vitest";
import { makeSnapshot } from "@/services/baseline/__tests__/public-baseline.fixtures";
import { loadPlantingContext, type PlantingContextReaders } from "../planting-context";

const ROUND = "91000000-0000-4000-8000-000000000001";
async function setup() {
  const snapshot = await makeSnapshot();
  const round = {
    id: ROUND,
    projectId: snapshot.projectId,
    baselineId: snapshot.id,
    baselineSha256: snapshot.manifestSha256,
  };
  const readers = {
    listBaselines: vi.fn<PlantingContextReaders["listBaselines"]>().mockResolvedValue([snapshot]),
    getBaseline: vi.fn<PlantingContextReaders["getBaseline"]>().mockResolvedValue(snapshot),
    getRound: vi.fn<PlantingContextReaders["getRound"]>().mockResolvedValue(round),
  };
  return { snapshot, round, readers };
}

describe("planting baseline selection", () => {
  it("uses the selected investigation's exact baseline, never a newer version", async () => {
    const { snapshot, readers } = await setup();
    readers.listBaselines.mockResolvedValue([{ ...snapshot, id: "newer-baseline", version: 2 }]);
    expect(await loadPlantingContext(snapshot.projectId, ROUND, readers)).toBe(snapshot);
    expect(readers.getRound).toHaveBeenCalledWith(snapshot.projectId, ROUND);
    expect(readers.getBaseline).toHaveBeenCalledWith(snapshot.projectId, snapshot.id);
    expect(readers.listBaselines).not.toHaveBeenCalled();
  });

  it.each(["missing", "wrong-project", "wrong-round", "denied"])(
    "never falls back to latest when the selected round is %s",
    async (fault) => {
      const { snapshot, round, readers } = await setup();
      if (fault === "missing") readers.getRound.mockResolvedValue(null);
      if (fault === "wrong-project")
        readers.getRound.mockResolvedValue({ ...round, projectId: "other-project" });
      if (fault === "wrong-round") readers.getRound.mockResolvedValue({ ...round, id: "other" });
      if (fault === "denied") readers.getRound.mockRejectedValue(new Error("Access denied"));
      await expect(loadPlantingContext(snapshot.projectId, ROUND, readers)).rejects.toThrow();
      expect(readers.listBaselines).not.toHaveBeenCalled();
      expect(readers.getBaseline).not.toHaveBeenCalled();
    },
  );

  it.each(["missing", "wrong-project", "wrong-id", "wrong-hash", "denied"])(
    "rejects a %s baseline instead of rendering another version",
    async (fault) => {
      const { snapshot, readers } = await setup();
      if (fault === "missing") readers.getBaseline.mockResolvedValue(null);
      if (fault === "wrong-project")
        readers.getBaseline.mockResolvedValue({ ...snapshot, projectId: "other-project" });
      if (fault === "wrong-id")
        readers.getBaseline.mockResolvedValue({ ...snapshot, id: "other-baseline" });
      if (fault === "wrong-hash")
        readers.getBaseline.mockResolvedValue({ ...snapshot, manifestSha256: "f".repeat(64) });
      if (fault === "denied") readers.getBaseline.mockRejectedValue(new Error("Access denied"));
      await expect(loadPlantingContext(snapshot.projectId, ROUND, readers)).rejects.toThrow();
      expect(readers.listBaselines).not.toHaveBeenCalled();
    },
  );

  it("uses latest only without a selected investigation", async () => {
    const { snapshot, readers } = await setup();
    expect(await loadPlantingContext(snapshot.projectId, undefined, readers)).toBe(snapshot);
    expect(readers.listBaselines).toHaveBeenCalledWith(snapshot.projectId);
    expect(readers.getRound).not.toHaveBeenCalled();
  });

  it("distinguishes an empty latest list from a denied read", async () => {
    const { snapshot, readers } = await setup();
    readers.listBaselines.mockResolvedValue([]);
    expect(await loadPlantingContext(snapshot.projectId, undefined, readers)).toBeNull();
    readers.listBaselines.mockRejectedValue(new Error("Access denied"));
    await expect(loadPlantingContext(snapshot.projectId, undefined, readers)).rejects.toThrow();
  });
});
