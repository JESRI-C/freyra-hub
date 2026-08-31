import { describe, expect, it } from "vitest";
import { buildObservationCsv } from "@/services/map-export-service";
import type { GeoFeatureCollection } from "@/services/geospatial-service";

describe("buildObservationCsv", () => {
  it("quoter komma, citationstegn og linjeskift efter CSV-reglerne", () => {
    const collection: GeoFeatureCollection = {
      type: "FeatureCollection",
      projectId: "project-1",
      projectName: "Haderslev Vandløb",
      generatedAt: "2026-08-30T10:00:00.000Z",
      features: [
        {
          type: "Feature",
          id: "obs,1",
          geometry: { type: "Point", coordinates: [9.485, 55.255] },
          properties: {
            feature_class: "observation",
            observation_type: 'grøde"skæring',
            value: "før\nefter",
            unit: "m,cm",
          },
        },
      ],
    };

    const csv = buildObservationCsv(collection);
    expect(csv).toContain('"obs,1",observation,"grøde""skæring","før\nefter","m,cm",9.485,55.255');
    expect(csv.split("\r\n")[0]).toBe("id,feature_class,observation_type,value,unit,lng,lat");
  });

  it("neutraliserer formelpræfikser i tekst uden at ændre negative tal", () => {
    const collection: GeoFeatureCollection = {
      type: "FeatureCollection",
      projectId: "project-1",
      projectName: "Haderslev Vandløb",
      generatedAt: "2026-08-30T10:00:00.000Z",
      features: [
        {
          type: "Feature",
          id: '=HYPERLINK("https://example.invalid")',
          geometry: { type: "Point", coordinates: [9.485, 55.255] },
          properties: {
            feature_class: "observation",
            observation_type: "+cmd",
            value: -2,
            unit: "m",
          },
        },
      ],
    };

    const csv = buildObservationCsv(collection);
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).toContain("'+cmd,-2,m");
  });
});
