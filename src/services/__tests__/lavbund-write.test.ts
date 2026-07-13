import { describe, it, expect, vi } from "vitest";

// Uden Supabase skal skrive-vejene falde tilbage til mock-lageret, så
// UI-flowet (registrér pejling, redigér transekter) virker offline/dev.
vi.mock("@/lib/supabase/client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
  getSupabaseClient: () => null,
}));

import {
  getProjects,
  getMaalepunkter,
  getReadings,
  getTransekter,
  saveMaalepunkt,
  saveReading,
  replaceTransekter,
} from "@/services/lavbundService";
import type { Transekt } from "@/types/lavbund";

describe("lavbund skrive-veje (mock-fallback)", () => {
  it("saveMaalepunkt + saveReading kan registreres og læses tilbage", async () => {
    const projects = await getProjects();
    const projektId = projects[0].id;

    const mp = {
      id: "MP-TEST-99",
      projektId,
      type: "markpejling" as const,
      position: { x: 50, y: 50 },
      intensiteter: ["minimal", "standard", "intensiv"] as const,
    };
    await saveMaalepunkt({ ...mp, intensiteter: [...mp.intensiteter] });
    const mps = await getMaalepunkter(projektId);
    expect(mps.some((m) => m.id === "MP-TEST-99")).toBe(true);

    const before = (await getReadings(projektId)).length;
    await saveReading(projektId, {
      maalepunktId: "MP-TEST-99",
      tidspunkt: "2026-07-13T12:00:00Z",
      dybdeM: 0.35,
      kilde: "manuel_pejling",
    });
    const after = await getReadings(projektId);
    expect(after.length).toBe(before + 1);
    expect(after.some((r) => r.maalepunktId === "MP-TEST-99" && r.dybdeM === 0.35)).toBe(true);
  });

  it("replaceTransekter erstatter projektets transekter", async () => {
    const projects = await getProjects();
    const projektId = projects[0].id;
    const nye: Transekt[] = [
      {
        nr: 1,
        projektId,
        fase: "foer",
        landskabstype: "moraene",
        vandloebsType: 2,
        georegion: 5,
        vandloebsform: "udrettet",
        laengdeM: 120,
        hoejVegetationSide1: 20,
        hoejVegetationSide2: 30,
        brinkHoejdeSide1M: 0.8,
        brinkHoejdeSide2M: 0.7,
        brinkLaengdeSide1M: 100,
        brinkLaengdeSide2M: 100,
      },
    ];
    await replaceTransekter(projektId, nye);
    const efter = await getTransekter(projektId);
    expect(efter).toHaveLength(1);
    expect(efter[0].laengdeM).toBe(120);
  });
});
