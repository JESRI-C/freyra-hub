import { describe, it, expect } from "vitest";
import { resolveProjectGeometry, getProjectGeometrySeed } from "@/services/geo-service";

const SQUARE = {
  type: "Polygon" as const,
  coordinates: [
    [
      [9.4, 55.2],
      [9.5, 55.2],
      [9.5, 55.3],
      [9.4, 55.3],
      [9.4, 55.2],
    ],
  ],
};

describe("resolveProjectGeometry", () => {
  it("bruger DB-polygon når projektet har en gemt geometri", () => {
    const geom = resolveProjectGeometry({
      id: "p-1",
      geometry_polygon: SQUARE,
      geometry_centroid_lat: null,
      geometry_centroid_lng: null,
      geometry_area_ha: null,
      geometry_source: "manual",
    });
    expect(geom.hasValidGeometry).toBe(true);
    expect(geom.polygon).not.toBeNull();
    expect(geom.geometrySource).toBe("manual");
    expect(geom.centroid).not.toBeNull(); // beregnet fra polygonen
    expect(geom.areaHa).toBeGreaterThan(0);
  });

  it("bruger DB-centroid når kun centroid findes (ingen polygon)", () => {
    const geom = resolveProjectGeometry({
      id: "p-2",
      geometry_polygon: null,
      geometry_centroid_lat: 55.5,
      geometry_centroid_lng: 9.7,
      geometry_area_ha: 12,
      geometry_source: "estimated",
    });
    expect(geom.hasValidGeometry).toBe(false); // ingen polygon
    expect(geom.centroid).toEqual({ lat: 55.5, lng: 9.7 });
    expect(geom.areaHa).toBe(12);
  });

  it("falder tilbage til seed når projektet ingen DB-geometri har", () => {
    const seeded = getProjectGeometrySeed("1"); // Skallebæk har seed-polygon
    const geom = resolveProjectGeometry({ id: "1", geometry_polygon: null });
    expect(geom).toEqual(seeded);
  });

  it("returnerer tom geometri for ukendt projekt uden DB-geometri", () => {
    const geom = resolveProjectGeometry({ id: "findes-ikke" });
    expect(geom.hasValidGeometry).toBe(false);
    expect(geom.polygon).toBeNull();
    expect(geom.centroid).toBeNull();
  });

  it("håndterer null/undefined projekt", () => {
    expect(resolveProjectGeometry(null).hasValidGeometry).toBe(false);
    expect(resolveProjectGeometry(undefined).hasValidGeometry).toBe(false);
  });

  it("afviser ugyldig DB-polygon men beholder centroid", () => {
    const geom = resolveProjectGeometry({
      id: "p-3",
      geometry_polygon: { type: "Ikke-en-polygon" },
      geometry_centroid_lat: 56.0,
      geometry_centroid_lng: 10.0,
    });
    expect(geom.hasValidGeometry).toBe(false);
    expect(geom.centroid).toEqual({ lat: 56.0, lng: 10.0 });
  });
});
