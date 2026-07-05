import { describe, it, expect } from "vitest";
import {
  parseGeoJson,
  suggestMapping,
  validateTabular,
  type TabularPreview,
} from "@/services/monitoring/upload-import-service";

function makeFile(content: string, name: string, type = "application/json"): File {
  return new File([content], name, { type });
}

function tabular(rows: Record<string, unknown>[], headers: string[]): TabularPreview {
  return {
    kind: "tabular",
    headers,
    rows,
    totalRows: rows.length,
    sampleRows: rows.slice(0, 5),
    errors: [],
  };
}

describe("suggestMapping", () => {
  it("matches Danish and English canonical headers", () => {
    const mapping = suggestMapping([
      "Tidspunkt",
      "Breddegrad",
      "Længdegrad",
      "Værdi",
      "Parameter",
      "Sensor",
    ]);
    expect(mapping.timestamp).toBe("Tidspunkt");
    expect(mapping.latitude).toBe("Breddegrad");
    expect(mapping.longitude).toBe("Længdegrad");
    expect(mapping.value).toBe("Værdi");
    expect(mapping.parameter).toBe("Parameter");
    expect(mapping.device).toBe("Sensor");
  });

  it("returns undefined for unrecognised headers", () => {
    const mapping = suggestMapping(["foo", "bar"]);
    expect(mapping.timestamp).toBeUndefined();
    expect(mapping.latitude).toBeUndefined();
  });
});

describe("validateTabular", () => {
  const headers = ["ts", "lat", "lng", "val"];
  const mapping = { timestamp: "ts", latitude: "lat", longitude: "lng", value: "val" };

  it("counts valid and invalid rows", () => {
    const preview = tabular(
      [
        { ts: "2025-01-01T00:00:00Z", lat: 55, lng: 12, val: 1 },
        { ts: "not-a-date", lat: 55, lng: 12, val: 2 },
        { ts: "2025-01-01T00:00:00Z", lat: 200, lng: 12, val: 3 },
        { ts: "2025-01-01T00:00:00Z", lat: 55, lng: -400, val: 4 },
      ],
      headers,
    );
    const summary = validateTabular(preview, mapping);
    expect(summary.totalRows).toBe(4);
    expect(summary.validRows).toBe(1);
    expect(summary.invalidRows).toBe(3);
    expect(summary.errors.length).toBeGreaterThan(0);
  });

  it("warns when timestamp column is missing", () => {
    const preview = tabular([{ val: 1 }], ["val"]);
    const summary = validateTabular(preview, { value: "val" });
    expect(summary.warnings.some((w) => w.includes("tids-kolonne"))).toBe(true);
  });
});

describe("parseGeoJson", () => {
  it("summarises features and bbox", async () => {
    const collection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [12, 55] },
        },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[10, 54], [11, 54], [11, 55], [10, 55], [10, 54]]],
          },
        },
      ],
    };
    const file = makeFile(JSON.stringify(collection), "x.geojson");
    const preview = await parseGeoJson(file);
    expect(preview.kind).toBe("geo");
    expect(preview.featureCount).toBe(2);
    expect(preview.points).toBe(1);
    expect(preview.polygons).toBe(1);
    expect(preview.bbox).toEqual([10, 54, 12, 55]);
    expect(preview.errors).toHaveLength(0);
  });

  it("returns error for invalid JSON", async () => {
    const file = makeFile("{not json", "bad.geojson");
    const preview = await parseGeoJson(file);
    expect(preview.errors.length).toBeGreaterThan(0);
    expect(preview.featureCount).toBe(0);
  });

  it("flags features without geometry", async () => {
    const collection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: null }],
    };
    const file = makeFile(JSON.stringify(collection), "x.geojson");
    const preview = await parseGeoJson(file);
    expect(preview.errors.some((e) => e.includes("uden geometri"))).toBe(true);
  });
});
