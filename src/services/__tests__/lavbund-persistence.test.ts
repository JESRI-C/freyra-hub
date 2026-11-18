import { describe, it, expect, vi } from "vitest";

// Eksplicit offline-demo bruger eksempeldata uden netværkskald.
vi.mock("@/lib/data-mode", () => ({
  isDemoDataEnabled: true,
  requireCustomerDatabase: vi.fn(() => {
    throw new Error("Offline-demo må ikke kræve kundedatabase");
  }),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
  getSupabaseClient: () => null,
}));

import { buildCo2Indicator, getProjects, getSnapshot } from "@/services/lavbundService";
import type { BeregningsSnapshot } from "@/types/lavbund";

const SNAPSHOT: BeregningsSnapshot = {
  projektId: "1",
  genereret: "2026-07-13T00:00:00Z",
  usageScope: "tilskudsordning_klimaregnskab",
  faktorVersioner: { co2: "v12", fosfor: "DCE-263" },
  co2: {
    krediteretTonPrHa: 20,
    krediteretTotal: 400,
    verifikationsgrad: 0.85,
    verificeretTonPrHa: 17,
    verificeretTotal: 340.456,
    usikkerhedTotal: 80,
  },
  fosfor: {
    vandloebFoerKgAar: 10,
    vandloebEfterKgAar: 4,
    groefterFoerKgAar: 6,
    groefterEfterKgAar: 1,
    balanceKgAar: -11,
  },
};

describe("buildCo2Indicator", () => {
  it("mapper verificeret total til co2e_reduced-indicator for det koblede projekt", () => {
    const row = buildCo2Indicator("core-project-uuid", SNAPSHOT);
    expect(row).toMatchObject({
      project_id: "core-project-uuid",
      key: "co2e_reduced",
      unit: "t CO₂e/år",
      value: 340.46, // afrundet til 2 decimaler
    });
    expect(row.label).toContain("verificeret");
  });
});

describe("customer persistence requires a database", () => {
  it("does not return sample projects", async () => {
    await expect(getProjects()).rejects.toThrow();
  });
  it("does not return a generated snapshot", async () => {
    await expect(getSnapshot("missing")).rejects.toThrow();
  });
});
