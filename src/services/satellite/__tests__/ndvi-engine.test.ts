import { describe, it, expect } from "vitest";
import { interpretNdvi, seasonalNdviDelta } from "../ndvi-engine";

describe("interpretNdvi", () => {
  it("klassificerer tæt vegetation ved NDVI >= 0.6", () => {
    expect(interpretNdvi(0.7).label).toBe("Tæt vegetation");
  });

  it("klassificerer moderat vegetation ved 0.4-0.6", () => {
    expect(interpretNdvi(0.45).label).toBe("Moderat vegetation");
  });

  it("klassificerer ingen vegetation under 0.1", () => {
    expect(interpretNdvi(0.05).label).toBe("Ingen vegetation");
  });

  it("returnerer altid label, beskrivelse og farve", () => {
    [0, 0.15, 0.3, 0.5, 0.8].forEach((v) => {
      const r = interpretNdvi(v);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
      expect(r.color).toMatch(/^text-/);
    });
  });
});

describe("seasonalNdviDelta", () => {
  it("sommer-NDVI på 0.67 er tæt på baseline (juli)", () => {
    const delta = seasonalNdviDelta(0.67, "2026-07-15T12:00:00Z");
    expect(Math.abs(delta)).toBeLessThan(0.05);
  });

  it("høj NDVI om vinteren giver positiv delta", () => {
    const delta = seasonalNdviDelta(0.6, "2026-01-15T12:00:00Z");
    expect(delta).toBeGreaterThan(0.3);
  });

  it("lav NDVI om sommeren giver negativ delta", () => {
    const delta = seasonalNdviDelta(0.2, "2026-07-15T12:00:00Z");
    expect(delta).toBeLessThan(-0.3);
  });
});
