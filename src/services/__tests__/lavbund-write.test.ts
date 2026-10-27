import { describe, it, expect, vi } from "vitest";

// Skrive-vejene bruger kun det lokale lager i eksplicit offline-demo.
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

describe("customer writes require confirmed database persistence", () => {
  it("does not persist a field observation offline", async () => {
    await expect(
      saveMaalepunkt({
        id: "offline",
        projektId: "missing",
        type: "markpejling",
        position: { x: 50, y: 50 },
        intensiteter: ["standard"],
      }),
    ).rejects.toThrow();
    await expect(
      saveReading("missing", {
        maalepunktId: "offline",
        tidspunkt: "2026-07-13T12:00:00Z",
        dybdeM: 0.35,
        kilde: "manuel_pejling",
      }),
    ).rejects.toThrow();
    await expect(getMaalepunkter("missing")).rejects.toThrow();
    await expect(getReadings("missing")).rejects.toThrow();
  });
  it("does not replace transects offline", async () => {
    await expect(replaceTransekter("missing", [])).rejects.toThrow();
    await expect(getTransekter("missing")).rejects.toThrow();
  });
  it("does not invent portfolio totals", async () => {
    const { getLavbundOverblik } = await import("@/services/lavbundService");
    await expect(getLavbundOverblik()).rejects.toThrow();
  });
});
