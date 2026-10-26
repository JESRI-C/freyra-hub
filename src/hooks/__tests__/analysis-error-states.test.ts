import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_PROJECTS } from "@/data/platform-seed";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  fetchSoilProfile: vi.fn(),
  fetchTerrainProfile: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: true, supabase: null }));
vi.mock("@/services/nature/geus-service", () => ({
  fetchSoilProfile: mocks.fetchSoilProfile,
  fetchTerrainProfile: mocks.fetchTerrainProfile,
}));

const project = SEED_PROJECTS[0];
const biodiversityData = {
  score: {
    total: 65,
    classification: "Høj",
    confidence: "medium",
    components: {
      vegetation: 60,
      habitatCoverage: 60,
      speciesDiversity: 60,
      protectedSpecies: 60,
      habitatVariety: 60,
    },
  },
  savedToDb: true,
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_APP_DATA_MODE", "customer");
  mocks.useQuery.mockReset();
  mocks.useMutation.mockReset().mockReturnValue({ error: null, isPending: false, mutate: vi.fn() });
  mocks.invalidateQueries.mockReset().mockResolvedValue(undefined);
  mocks.fetchSoilProfile.mockReset();
  mocks.fetchTerrainProfile.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("analysis errors remain visible when query caches retain older data", () => {
  it.each(["query", "refresh"])(
    "suppresses previous biodiversity scores after a %s failure",
    async (source) => {
      const error = new Error("Projektanalysen afventer et valideret offentligt datagrundlag.");
      mocks.useQuery.mockReturnValue({
        data: biodiversityData,
        error: source === "query" ? error : null,
        isLoading: false,
      });
      if (source === "refresh") {
        mocks.useMutation.mockReturnValue({ error, isPending: false, mutate: vi.fn() });
      }
      const { useBiodiversity } = await import("../useBiodiversity");
      const state = useBiodiversity(project, 0.6);
      expect(state.error).toBe(error.message);
      expect(state.isError).toBe(true);
      expect(state.score).toBeNull();
      expect(state.components).toBeNull();
      expect(state.recommendations).toEqual([]);
      expect(state.savedToDb).toBe(false);
    },
  );

  it("preserves a source object's Danish error message", async () => {
    mocks.useQuery.mockReturnValue({
      data: biodiversityData,
      error: { code: "42501", message: "Du har ikke adgang til datagrundlaget." },
      isLoading: false,
    });
    const { useBiodiversity } = await import("../useBiodiversity");
    expect(useBiodiversity(project).error).toBe("Du har ikke adgang til datagrundlaget.");
  });

  it.each(["carbon", "water", "soil", "refresh"])(
    "suppresses cached environmental assessments after a %s failure",
    async (source) => {
      const error = new Error("Projektanalysen afventer et valideret offentligt datagrundlag.");
      mocks.useQuery
        .mockReturnValueOnce({
          data: { estimate: { annualSequestration: 12, totalOver30Years: 240 } },
          error: source === "carbon" ? error : null,
          isLoading: false,
        })
        .mockReturnValueOnce({
          data: {
            risk: { overall: "Lav", score: 15, mitigationRequired: false, recommendations: [] },
          },
          error: source === "water" ? error : null,
          isLoading: false,
        })
        .mockReturnValueOnce({
          data: { soil: { soilLabel: "Eksempeljord" }, terrain: { elevationM: 12 } },
          error: source === "soil" ? error : null,
          isLoading: false,
        });
      if (source === "refresh") {
        mocks.useMutation.mockReturnValue({ error, isPending: false, mutate: vi.fn() });
      }
      const { useEnvironmentalAnalysis } = await import("../useEnvironmentalAnalysis");
      const state = useEnvironmentalAnalysis(project, 0.6);
      expect(state.error).toBe(error.message);
      expect(state.isError).toBe(true);
      expect(state.annualCO2).toBeNull();
      expect(state.waterRisk).toBeNull();
      expect(state.waterScore).toBeNull();
      expect(state.soil).toBeNull();
      expect(state.terrain).toBeNull();
    },
  );

  it("does not fetch legacy fallback soil data for a customer project", async () => {
    mocks.useQuery.mockReturnValue({ data: undefined, error: null, isLoading: false });
    const { useEnvironmentalAnalysis } = await import("../useEnvironmentalAnalysis");
    useEnvironmentalAnalysis(project);
    const soilQueryOptions = mocks.useQuery.mock.calls[2][0];
    await expect(soilQueryOptions.queryFn()).rejects.toThrow("valideret offentligt datagrundlag");
    expect(mocks.fetchSoilProfile).not.toHaveBeenCalled();
    expect(mocks.fetchTerrainProfile).not.toHaveBeenCalled();
  });
});
