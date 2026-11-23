import { describe, expect, it } from "vitest";
import { latestEntries, validateEntry, type WorkspaceEntry } from "../project-workspace";

describe("project workspace evidence", () => {
  it("requires a source and assumptions before saving a scenario", () => {
    expect(() => validateEntry("scenario", "Scenarie", { assumptions: "Plan" })).toThrow("Kilde");
    expect(() =>
      validateEntry("scenario", "Scenarie", {
        assumptions: "Plan",
        source: "Dokument v2",
        expectedEffect: "Ikke beregnet",
      }),
    ).not.toThrow();
  });
  it("keeps zero separate from missing CO2 and rejects invalid quantities", () => {
    const p = {
      period: "2026",
      boundary: "Afgrænset område",
      method: "Registreret metode v1",
      source: "Bilag",
    };
    expect(() => validateEntry("co2_entry", "Post", { ...p, quantity: "0" })).not.toThrow();
    for (const quantity of ["", "-1", "NaN", "Infinity"])
      expect(() => validateEntry("co2_entry", "Post", { ...p, quantity })).toThrow();
  });
  it("rejects unsupported fields and invented workflow status", () => {
    expect(() =>
      validateEntry("public_page", "Side", {
        summary: "S",
        limitations: "L",
        source: "Bilag",
        published: "true",
      }),
    ).toThrow("Ukendt felt");
    expect(() =>
      validateEntry("funding", "Fond", { organization: "Fond", status: "Solgte credits" }),
    ).toThrow("Ugyldigt valg");
  });
  it("chooses the latest version independently of fetch order and retains other entries", () => {
    const row = (entry_id: string, version: number, created_at: string) =>
      ({ entry_id, version, created_at, title: `v${version}` }) as WorkspaceEntry;
    const older = row("a", 1, "2026-01-01"),
      newer = row("a", 2, "2026-01-03"),
      other = row("b", 1, "2026-01-02");
    expect(latestEntries([newer, older, other])).toEqual([newer, other]);
  });
});
