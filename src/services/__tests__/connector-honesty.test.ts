import { describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ p3: vi.fn(), water: vi.fn() }));
vi.mock("@/services/nature/paragraph3-service", () => ({
  fetchParagraph3Overlap: fake.p3,
  fetchWatercourses: fake.water,
  OFFICIAL_NATURE_SOURCE: "official-nature",
  OFFICIAL_WATERCOURSE_SOURCE: "official-water",
}));
import { buildProjectEnvironmentalContext, fetchNatureContext } from "../connector-service";
describe("environmental evidence honesty", () => {
  it("missing geometry yields unknown risk/coverage and no simulated observations", async () => {
    const result = await buildProjectEnvironmentalContext("a", "Project", "Place", "Municipality");
    expect(result.scores).toEqual({
      natureSensitivity: "unknown",
      runoffRisk: "unknown",
      dataCompleteness: null,
    });
    expect(result.liveData).toBeUndefined();
    expect(result.overallReadiness).toBe("pending");
    for (const part of [
      result.natureContext,
      result.satelliteContext,
      result.rainfallContext,
      result.groundwaterContext,
      result.soilContext,
      result.terrainContext,
      result.protectedNatureContext,
    ]) {
      expect(part?.status).toBe("not_configured");
      expect(part?.data).toEqual({});
    }
  });
  it("official provider failure is not a zero or absence claim", async () => {
    fake.p3.mockRejectedValue(new Error("provider unavailable"));
    fake.water.mockResolvedValue([]);
    const result = await fetchNatureContext("a", "Place", { lat: 55, lng: 9 }, 10, {
      type: "Polygon",
      coordinates: [
        [
          [9, 55],
          [9.01, 55],
          [9, 55.01],
          [9, 55],
        ],
      ],
    });
    expect(result.status).toBe("error");
    expect(result.data).toEqual({});
    expect(result.summary).toContain("betyder ikke fravær");
  });
});
