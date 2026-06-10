import { describe, it, expect } from "vitest";
import { haversineM, polygonPerimeterM } from "../MapEditorMap";

describe("haversineM", () => {
  it("afstand fra punkt til sig selv er 0", () => {
    expect(haversineM(55.252, 9.4828, 55.252, 9.4828)).toBe(0);
  });

  it("1 breddegrad er ~111 km", () => {
    const d = haversineM(55.0, 9.0, 56.0, 9.0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("Skallebæk-polygonens bredde (~0.0014 lng) er under 100 m", () => {
    const d = haversineM(55.252, 9.4821, 55.252, 9.4835);
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(120);
  });
});

describe("polygonPerimeterM", () => {
  it("beregner omkreds af lukket rektangel", () => {
    // Skallebæk-polygon: ~89m bred × ~122m høj
    const ring: [number, number][] = [
      [55.2514, 9.4821],
      [55.2514, 9.4835],
      [55.2525, 9.4835],
      [55.2525, 9.4821],
      [55.2514, 9.4821], // lukket
    ];
    const perimeter = polygonPerimeterM(ring);
    expect(perimeter).toBeGreaterThan(300);
    expect(perimeter).toBeLessThan(600);
  });

  it("tom ring giver 0", () => {
    expect(polygonPerimeterM([])).toBe(0);
  });
});
