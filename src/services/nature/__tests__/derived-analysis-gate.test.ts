import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoilProfile, TerrainProfile } from "../geus-service";
import type { BiodiversityDataResult, Paragraph3Result } from "../paragraph3-service";

const mocks = vi.hoisted(() => ({
  configured: true,
  from: vi.fn(),
  fetchNatureData: vi.fn(),
  fetchSoilProfile: vi.fn(),
  fetchTerrainProfile: vi.fn(),
  saveIndicator: vi.fn(),
  logAuditEvent: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return mocks.configured;
  },
  get supabase() {
    return mocks.configured ? { from: mocks.from } : null;
  },
}));
vi.mock("../paragraph3-service", () => ({ fetchNatureData: mocks.fetchNatureData }));
vi.mock("../geus-service", () => ({
  fetchSoilProfile: mocks.fetchSoilProfile,
  fetchTerrainProfile: mocks.fetchTerrainProfile,
}));
vi.mock("@/services/indicators-service", () => ({ saveIndicator: mocks.saveIndicator }));
vi.mock("@/services/audit-service", () => ({ logAuditEvent: mocks.logAuditEvent }));

const fetchedAt = "2026-10-13T08:00:00Z";
const p3: Paragraph3Result = {
  overlapHa: 0,
  overlapPercent: 0,
  areas: [],
  natureTypes: [],
  fetchedAt,
  mode: "preview",
};
const species: BiodiversityDataResult = {
  species: [],
  protectedCount: 0,
  redListedCount: 0,
  groupDiversity: {},
  fetchedAt,
  mode: "preview",
};
const soil: SoilProfile = {
  dominantClass: "sandy_clay",
  organicContent: 3,
  drainageClass: "moderate",
  infiltrationRate: "medium",
  carbonDensity: 35,
  soilLabel: "Eksempeljord",
  fetchedAt,
  mode: "preview",
};
const terrain: TerrainProfile = {
  elevationM: 12,
  slopePercent: 2.4,
  aspect: "gentle",
  fetchedAt,
  mode: "preview",
};

async function loadEngines(ndvi: number | null) {
  const [biodiversity, carbon, water] = await Promise.all([
    import("../biodiversity-engine"),
    import("../carbon-engine"),
    import("../water-quality-engine"),
  ]);
  return [
    {
      name: "biodiversity",
      run: () => biodiversity.runBiodiversityAnalysis("project", 55.25, 9.48, 1, ndvi),
    },
    {
      name: "carbon",
      run: () => carbon.runCarbonAnalysis("project", 55.25, 9.48, 1, "Naturprojekt", ndvi),
    },
    {
      name: "water",
      run: () => water.runWaterQualityAnalysis("project", 55.25, 9.48, "Naturprojekt", ndvi),
    },
  ];
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_APP_DATA_MODE", "customer");
  mocks.configured = true;
  for (const mock of [
    mocks.from,
    mocks.fetchNatureData,
    mocks.fetchSoilProfile,
    mocks.fetchTerrainProfile,
    mocks.saveIndicator,
    mocks.logAuditEvent,
    mocks.fetch,
  ]) {
    mock.mockReset();
  }
  mocks.fetchNatureData.mockResolvedValue({ p3, species });
  mocks.fetchSoilProfile.mockResolvedValue(soil);
  mocks.fetchTerrainProfile.mockResolvedValue(terrain);
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("legacy derived-analysis gate", () => {
  it.each([
    { configured: true, mode: "customer" },
    { configured: true, mode: "demo" },
    { configured: true, mode: undefined },
    { configured: false, mode: "customer" },
    { configured: false, mode: "preview" },
    { configured: false, mode: undefined },
  ])(
    "blocks direct engine calls before upstream access for $mode mode, configured=$configured",
    async ({ configured, mode }) => {
      mocks.configured = configured;
      vi.stubEnv("VITE_APP_DATA_MODE", mode);
      // A real-looking numeric NDVI cannot bypass validation, nor can the null
      // passed by the UI before its satellite query completes.
      for (const ndvi of [null, 0.63]) {
        for (const engine of await loadEngines(ndvi)) {
          await expect(engine.run(), engine.name).rejects.toThrow(
            "Projektanalysen afventer et valideret offentligt datagrundlag",
          );
        }
      }
      expect(mocks.fetchNatureData).not.toHaveBeenCalled();
      expect(mocks.fetchSoilProfile).not.toHaveBeenCalled();
      expect(mocks.fetchTerrainProfile).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.saveIndicator).not.toHaveBeenCalled();
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    },
  );

  it("preserves explicit offline demo previews while never persisting results", async () => {
    mocks.configured = false;
    vi.stubEnv("VITE_APP_DATA_MODE", "demo");
    const [biodiversity, carbon, water] = await loadEngines(null);
    const biodiversityResult = await biodiversity.run();
    const carbonResult = await carbon.run();
    const waterResult = await water.run();

    expect(biodiversityResult).toMatchObject({ score: { confidence: "low" }, savedToDb: false });
    expect(carbonResult).toMatchObject({ estimate: { confidence: "low" }, savedToDb: false });
    expect(waterResult).toMatchObject({ risk: { nearestWatercourseM: null }, savedToDb: false });
    expect(mocks.fetchNatureData).toHaveBeenCalledOnce();
    expect(mocks.fetchSoilProfile).toHaveBeenCalledTimes(2);
    expect(mocks.fetchTerrainProfile).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.saveIndicator).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
