import { describe, expect, it } from "vitest";
import {
  beregnBounds,
  bygVandstandsGrid,
  iPolygon,
  naermesteDybde,
} from "@/services/lavbundInterpolation";

const PUNKTER = [
  { lat: 55.2801, lng: 11.5921, dybdeM: 0.1 }, // Sump
  { lat: 55.2779, lng: 11.5942, dybdeM: 0.4 }, // Våd eng
  { lat: 55.2792, lng: 11.5898, dybdeM: 1.3 }, // Mark-agtig tør
];

describe("lavbund-interpolation (nærmeste-punkt)", () => {
  it("naermesteDybde vælger det geografisk nærmeste punkt", () => {
    // Tæt på punkt 1
    expect(naermesteDybde(PUNKTER, 55.28, 11.592)).toBe(0.1);
    // Tæt på punkt 3
    expect(naermesteDybde(PUNKTER, 55.2793, 11.5897)).toBe(1.3);
    expect(naermesteDybde([], 55, 11)).toBeNull();
  });

  it("iPolygon: ray casting virker for simpel firkant", () => {
    const ring = [
      [11.59, 55.277],
      [11.596, 55.277],
      [11.596, 55.281],
      [11.59, 55.281],
      [11.59, 55.277],
    ];
    expect(iPolygon(55.279, 11.593, ring)).toBe(true);
    expect(iPolygon(55.283, 11.593, ring)).toBe(false);
    expect(iPolygon(55.279, 11.6, ring)).toBe(false);
  });

  it("beregnBounds dækker punkterne med margin", () => {
    const b = beregnBounds(PUNKTER);
    expect(b).not.toBeNull();
    expect(b!.nord).toBeGreaterThan(55.2801);
    expect(b!.syd).toBeLessThan(55.2779);
    expect(b!.oest).toBeGreaterThan(11.5942);
    expect(b!.vest).toBeLessThan(11.5898);
  });

  it("bygVandstandsGrid klassificerer celler og klipper til polygon", () => {
    const grid = bygVandstandsGrid(PUNKTER, { cols: 24, rows: 16 });
    expect(grid).not.toBeNull();
    expect(grid!.klasseNavne).toHaveLength(24 * 16);
    // Alle tre klasser skal optræde (hver har et opland)
    const navne = new Set(grid!.klasseNavne);
    expect(navne.has("Sump")).toBe(true);
    expect(navne.has("Våd eng")).toBe(true);
    expect(navne.has("Mark")).toBe(true);
    expect(navne.has(null)).toBe(false); // uden polygon klippes intet

    // Med en lille polygon klippes celler udenfor til null
    const ring = [
      [11.5915, 55.2795],
      [11.5928, 55.2795],
      [11.5928, 55.2806],
      [11.5915, 55.2806],
      [11.5915, 55.2795],
    ];
    const klippet = bygVandstandsGrid(PUNKTER, { cols: 24, rows: 16, polygonRing: ring });
    expect(klippet!.klasseNavne.filter((k) => k === null).length).toBeGreaterThan(0);
    expect(klippet!.klasseNavne.filter((k) => k !== null).length).toBeGreaterThan(0);
  });

  it("kræver mindst 3 punkter", () => {
    expect(bygVandstandsGrid(PUNKTER.slice(0, 2))).toBeNull();
  });
});
