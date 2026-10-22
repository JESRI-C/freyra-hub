import { describe, it, expect, vi } from "vitest";

// Tving mock-fallback-stien: uden konfigureret Supabase skal servicen levere
// demo-data uden netværkskald.
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

describe("lavbundService fallback (uden Supabase i test-miljø)", () => {
  it("getProjects falder tilbage til mock-projekter", async () => {
    const projects = await getProjects();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].navn).toBeTruthy();
  });

  it("getSnapshot returnerer mock-snapshot eller null uden at kaste", async () => {
    const projects = await getProjects();
    const snap = await getSnapshot(projects[0].id);
    // Mock kan have et snapshot for demo-projektet; vigtigst: ingen exception.
    expect(snap === null || typeof snap.co2.verificeretTotal === "number").toBe(true);
  });
});
