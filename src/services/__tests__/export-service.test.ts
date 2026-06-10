import { describe, it, expect } from "vitest";
import { buildProjectGeoJSON, buildCsv, buildZonesCsv } from "../export-service";
import type { Project } from "@/lib/supabase/types";
import type { Zone } from "@/services/zones-service";
import type { IoTSensor } from "@/services/iot-simulation-service";

const PROJECT: Project = {
  id: "p1",
  organization_id: "o1",
  name: "Skallebæk Biodiversity Pilot",
  slug: "skallebaek-biodiversity-pilot",
  project_type: "Biodiversitet",
  location_name: "Skallebæk Å-dal",
  municipality: "Vejle",
  country: "Denmark",
  status: "active",
  start_date: "2024-01-15",
  end_date: null,
  description: null,
  created_at: "2024-01-15T08:00:00Z",
  geometry_polygon: { type: "Polygon", coordinates: [[[9.4821, 55.2514], [9.4835, 55.2514], [9.4835, 55.2525], [9.4821, 55.2525], [9.4821, 55.2514]]] },
  geometry_centroid_lat: 55.252,
  geometry_centroid_lng: 9.4828,
  geometry_area_ha: 7.3,
  geometry_source: "manual",
};

const ZONE: Zone = {
  id: "z1",
  project_id: "p1",
  name: "Zone A — Vandløb",
  area_type: "watercourse",
  area_ha: 1.4,
  created_at: "2026-05-01T08:00:00Z",
  geojson: { type: "Polygon", coordinates: [[[9.4821, 55.2514], [9.4826, 55.2514], [9.4826, 55.2520], [9.4821, 55.2514]]] },
};

const SENSOR: IoTSensor = {
  id: "s1",
  label: "Jordfugt A1",
  type: "soil_moisture",
  status: "online",
  latestValue: 38.2,
  unit: "%",
  batteryPercent: 84,
  lastSeen: "2026-06-10T08:00:00Z",
  coordinates: { lat: 55.2516, lng: 9.4823 },
} as IoTSensor;

describe("buildProjectGeoJSON", () => {
  it("inkluderer grænse, zone og sensor som features", () => {
    const gj = buildProjectGeoJSON({ project: PROJECT, zones: [ZONE], sensors: [SENSOR] });
    expect(gj.type).toBe("FeatureCollection");
    expect(gj.features).toHaveLength(3);
    const classes = gj.features.map((f) => f.properties["feature_class"]);
    expect(classes).toContain("project_boundary");
    expect(classes).toContain("zone");
    expect(classes).toContain("sensor");
  });

  it("sensor-koordinater er [lng, lat] (GeoJSON-standard)", () => {
    const gj = buildProjectGeoJSON({ project: PROJECT, zones: [], sensors: [SENSOR] });
    const sensor = gj.features.find((f) => f.properties["feature_class"] === "sensor")!;
    const coords = (sensor.geometry as { coordinates: number[] }).coordinates;
    expect(coords[0]).toBeCloseTo(9.4823); // lng først
    expect(coords[1]).toBeCloseTo(55.2516);
  });

  it("analyseresultater flettes ind i grænsens properties", () => {
    const gj = buildProjectGeoJSON({
      project: PROJECT, zones: [], sensors: [],
      analysis: {
        ndviValue: 0.68, biodiversityScore: 72, biodiversityClass: "Høj",
        annualCO2: 18.4, totalCO2_30yr: 540, waterRisk: "Lav", waterScore: 22,
        p3OverlapHa: 4.1, speciesCount: 23, redListedCount: 3, watercourseDistM: 85,
      },
    });
    const boundary = gj.features[0];
    expect(boundary.properties["ndvi"]).toBe(0.68);
    expect(boundary.properties["biodiversity_score"]).toBe(72);
    expect(boundary.properties["water_risk"]).toBe("Lav");
  });

  it("springer zoner uden geometri over", () => {
    const gj = buildProjectGeoJSON({
      project: PROJECT, zones: [{ ...ZONE, geojson: null }], sensors: [],
    });
    expect(gj.features.filter((f) => f.properties["feature_class"] === "zone")).toHaveLength(0);
  });
});

describe("buildCsv", () => {
  it("escaper semikolon og citationstegn", () => {
    const csv = buildCsv([{ navn: 'Zone "A"; nord', tal: 1.4 }], ["navn", "tal"]);
    expect(csv).toContain('"Zone ""A""; nord"');
  });

  it("starter med BOM for Excel-kompatibilitet", () => {
    const csv = buildCsv([{ a: "æøå" }], ["a"]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("tomme værdier bliver tomme felter", () => {
    const csv = buildCsv([{ a: null, b: undefined, c: "x" }], ["a", "b", "c"]);
    expect(csv.split("\n")[1]).toBe(";;x");
  });
});

describe("buildZonesCsv", () => {
  it("indeholder zonenavn, type-label og areal", () => {
    const csv = buildZonesCsv([ZONE]);
    expect(csv).toContain("Zone A — Vandløb");
    expect(csv).toContain("Vandløb / Sø");
    expect(csv).toContain("1.4");
  });
});
