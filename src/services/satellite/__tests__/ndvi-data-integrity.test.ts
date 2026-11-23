import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_PROJECTS } from "@/test/fixtures/platform-seed";

const mocks = vi.hoisted(() => ({
  pipeline: vi.fn(),
  biodiversity: vi.fn(),
  carbon: vi.fn(),
  water: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../sentinel-service", () => ({ runNdviPipeline: mocks.pipeline }));
vi.mock("@/services/nature/biodiversity-engine", () => ({
  runBiodiversityAnalysis: mocks.biodiversity,
}));
vi.mock("@/services/nature/carbon-engine", () => ({ runCarbonAnalysis: mocks.carbon }));
vi.mock("@/services/nature/water-quality-engine", () => ({ runWaterQualityAnalysis: mocks.water }));
vi.mock("@/services/audit-service", () => ({ logAuditEvent: mocks.audit }));

import { runProjectNdvi } from "../ndvi-engine";
import { runFullAnalysis, summarizeAnalysis } from "@/services/analysis-orchestrator";

const observation = {
  ndvi: 0.62,
  confidence: "high",
  method: "sentinel2_computed",
  sceneDate: "2026-08-24T10:00:00Z",
  sceneId: "S2-test",
  cloudCover: 4,
};

beforeEach(() => vi.resetAllMocks());

describe("NDVI evidence integrity", () => {
  it("does not promote thumbnail, seasonal or preview estimates to measurements", async () => {
    for (const method of ["sentinel2_estimated", "preview"]) {
      mocks.pipeline.mockResolvedValue({ ndvi: { ...observation, method } });
      const result = await runProjectNdvi("project", 55.3, 9.4);
      expect(result.ndvi).toBeNull();
      expect(result.savedToDb).toBe(false);
      expect(result.reportEligible).toBe(false);
      expect(result.error).toContain("Ingen dokumenteret");
    }
  });

  it("preserves a valid zero band sample while keeping its unvalidated scope explicit", async () => {
    mocks.pipeline.mockResolvedValue({ ndvi: { ...observation, ndvi: 0 } });
    const result = await runProjectNdvi("project", 55.3, 9.4);
    expect(result.ndvi).toBe(0);
    expect(result.reportEligible).toBe(false);
    expect(result.savedToDb).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects nonfinite or physically invalid index values", async () => {
    for (const value of [NaN, Infinity, 1.1, -1.1]) {
      mocks.pipeline.mockResolvedValue({ ndvi: { ...observation, ndvi: value } });
      expect((await runProjectNdvi("project", 55.3, 9.4)).ndvi).toBeNull();
    }
  });

  it("does not feed an unvalidated centroid sample into project-wide biodiversity, carbon or water models", async () => {
    mocks.pipeline.mockResolvedValue({ ndvi: observation });
    const result = await runFullAnalysis({
      ...SEED_PROJECTS[0],
      geometry_centroid_lat: 55.3,
      geometry_centroid_lng: 9.4,
    });
    expect(result.ndvi?.ndvi).toBe(0.62);
    expect(mocks.biodiversity).not.toHaveBeenCalled();
    expect(mocks.carbon).not.toHaveBeenCalled();
    expect(mocks.water).not.toHaveBeenCalled();
    expect(result.stepsFailed).toEqual(["ndvi", "biodiversity", "carbon", "water"]);
    expect(result.stepsCompleted).toBe(0);
    const summary = summarizeAnalysis(result);
    expect(summary.ndviValue).toBeNull();
    expect(summary.biodiversityScore).toBeNull();
    expect(summary.annualCO2).toBeNull();
    expect(summary.waterRisk).toBeNull();
  });
});
