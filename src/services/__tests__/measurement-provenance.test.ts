import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ measurements: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase/queries", () => ({ fetchMeasurementsForIndicator: mocks.measurements }));
import { getMeasurements } from "../indicators-service";
import type { Indicator } from "@/lib/supabase/types";
describe("measurement provenance", () => {
  beforeEach(() => vi.resetAllMocks());
  const indicator = { id: "indicator-a", project_id: "project-a", value: 50 } as Indicator;
  it("keeps absent history empty", async () => {
    mocks.measurements.mockResolvedValue([]);
    expect(await getMeasurements(indicator)).toEqual([]);
  });
  it("shows missing-table errors instead of manufacturing a simulated curve", async () => {
    mocks.measurements.mockRejectedValue(new Error("42P01 missing relation"));
    await expect(getMeasurements(indicator)).rejects.toThrow("42P01");
  });
});
