import { describe, expect, it } from "vitest";
import { buildObservationCsv, withMapDevices } from "@/services/map-export-service";
import type { MapDevice } from "@/services/monitoring/map-devices-service";
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
    expect(csv.split("\r\n")[0]).toBe(
      "id,feature_class,observation_type,value,unit,lng,lat,project_id,device_id,measurement_id,measured_at,position_source,position_recorded_at,quality_status,data_classification,name",
    );
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
const base: GeoFeatureCollection = {
  type: "FeatureCollection",
  projectId: "case",
  projectName: "DEMO",
  generatedAt: "2020-01-01T00:00:00Z",
  features: [],
};
const device: MapDevice = {
  id: "measured",
  projectId: "case",
  label: "DEMO · Vandstand",
  deviceType: "water_level",
  dataClassification: "synthetic",
  signalStrength: null,
  trend: null,
  status: "online",
  batteryPercent: 80,
  lastSeen: null,
  coordinates: {
    lat: 55.251,
    lng: 9.481,
    source: "measurement",
    recordedAt: "2026-11-17T12:00:00Z",
  },
  measurement: {
    id: "reading",
    value: 0,
    unit: "m",
    measuredAt: "2026-11-17T12:00:00Z",
    qualityStatus: "valid",
  },
};
it("preserves missing geometry in GeoJSON, exports only real points to CSV and keeps zero and provenance", () => {
  const result = withMapDevices(base, [
    device,
    { ...device, id: "missing", coordinates: null, measurement: null },
    {
      ...device,
      id: "registered",
      coordinates: { lat: 55.252, lng: 9.482, source: "registered", recordedAt: null },
      measurement: null,
    },
  ]);
  expect(base.features).toHaveLength(0);
  expect(result.features).toHaveLength(3);
  expect(result.features[1].geometry).toBeNull();
  expect(result.features[0].geometry).toEqual({ type: "Point", coordinates: [9.481, 55.251] });
  expect(result.features[0].properties).toMatchObject({
    value: 0,
    measurement_id: "reading",
    data_classification: "synthetic",
    position_source: "measurement",
  });
  expect(result.features[2].properties).toMatchObject({
    value: null,
    measurement_id: null,
    position_source: "registered",
    position_recorded_at: null,
  });
  const csv = buildObservationCsv(result);
  expect(csv.split("\r\n")).toHaveLength(3);
  expect(csv).toContain(",0,m,9.481,55.251,case,measured,reading,");
  expect(csv).not.toContain("monitoring-device:missing");
});
it("rejects cross-project device data rather than exporting it under another case", () => {
  expect(() => withMapDevices(base, [{ ...device, projectId: "other" }])).toThrow("anden sag");
});
it("replaces an existing device layer and removes it completely when hidden", () => {
  const once = withMapDevices(base, [device]);
  expect(withMapDevices(once, [device]).features).toHaveLength(1);
  expect(withMapDevices(once, []).features).toHaveLength(0);
});
it("excludes corrupt point coordinates without discarding a genuine zero coordinate", () => {
  const result = {
    ...base,
    features: [[], [999, 55], [9, NaN], [0, 0]].map((coordinates, index) => ({
      type: "Feature" as const,
      id: String(index),
      geometry: { type: "Point" as const, coordinates },
      properties: {},
    })),
  };
  const csv = buildObservationCsv(result);
  expect(csv.split("\r\n")).toHaveLength(2);
  expect(csv).toContain("3,,,,,0,0,case");
});
