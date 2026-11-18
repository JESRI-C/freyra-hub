import { describe, it, expect } from "vitest";
import {
  buildImageDetectedMetadata,
  parseImage,
  parseGeoJson,
  suggestMapping,
  validateTabular,
  type ImagePreview,
  type TabularPreview,
} from "@/services/monitoring/upload-import-service";
import type { DroneImageMetadata } from "@/services/monitoring/drone-image-metadata";

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
  it("matches canonical headers in English and normalised Danish", () => {
    const mapping = suggestMapping([
      "timestamp",
      "latitude",
      "longitude",
      "value",
      "parameter",
      "sensor",
    ]);
    expect(mapping.timestamp).toBe("timestamp");
    expect(mapping.latitude).toBe("latitude");
    expect(mapping.longitude).toBe("longitude");
    expect(mapping.value).toBe("value");
    expect(mapping.parameter).toBe("parameter");
    expect(mapping.device).toBe("sensor");
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
            coordinates: [
              [
                [10, 54],
                [11, 54],
                [11, 55],
                [10, 55],
                [10, 54],
              ],
            ],
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

describe("drone image staging", () => {
  const droneMetadata: DroneImageMetadata = {
    schemaVersion: "drone-image-metadata/v1",
    extractor: "exifr@7.1.3",
    file: {
      name: "DJI_0001.JPG",
      sizeBytes: 42,
      mimeType: "image/jpeg",
      lastModified: 0,
      sha256: "a".repeat(64),
    },
    raw: {
      exif: { gps: { latitude: 55.245678, longitude: 9.487654 } },
      xmpXml: "<x:xmpmeta />",
      xmp: { GimbalYawDegree: 91.5 },
      parseErrors: [],
    },
    capture: {
      capturedAtUtc: "2026-08-28T12:05:06.000Z",
      offset: "+02:00",
      timezoneKnown: true,
      source: "exif-offset",
    },
    position: {
      latitude: 55.245678,
      longitude: 9.487654,
      source: "exif",
      datum: "WGS-84",
    },
    altitude: { absoluteM: 82.5 },
    orientation: {
      gimbal: { yawDeg: 91.5, pitchDeg: -90, rollDeg: 0 },
      viewDirectionDeg: 91.5,
      reference: "vendor_reported",
    },
    camera: { make: "DJI", model: "Mavic 3 Enterprise", widthPx: 5280, heightPx: 3956 },
    rtk: { flagRaw: "50" },
    footprintReadiness: "needs_ground_elevation",
    qa: { status: "ready", errors: [], warnings: [] },
  };

  it("maps the normalized metadata returned by the shared extractor", async () => {
    const file = new File(["fixture"], "DJI_0001.JPG", { type: "image/jpeg" });
    const preview = await parseImage(file, async () => droneMetadata);

    expect(preview).toMatchObject({
      latitude: 55.245678,
      longitude: 9.487654,
      altitudeM: 82.5,
      directionDeg: 91.5,
      capturedAt: "2026-08-28T12:05:06.000Z",
      cameraMake: "DJI",
      cameraModel: "Mavic 3 Enterprise",
    });
  });

  it("persists checksum, raw evidence and readiness in the detected metadata envelope", () => {
    const preview: ImagePreview = {
      kind: "image",
      width: 5280,
      height: 3956,
      latitude: 55.245678,
      longitude: 9.487654,
      altitudeM: 82.5,
      directionDeg: 91.5,
      capturedAt: "2026-08-28T12:05:06.000Z",
      cameraMake: "DJI",
      cameraModel: "Mavic 3 Enterprise",
      droneMetadata,
      errors: [],
    };

    const detected = buildImageDetectedMetadata(preview);

    expect(detected).toMatchObject({
      content_sha256: "a".repeat(64),
      metadata_schema_version: "drone-image-metadata/v1",
      metadata_status: "ready",
      ready_for_camera_position: true,
      latitude: 55.245678,
      longitude: 9.487654,
      drone_metadata: {
        raw: {
          exif: { gps: { latitude: 55.245678, longitude: 9.487654 } },
          xmpXml: "<x:xmpmeta />",
        },
      },
    });
  });

  it("never emits synthetic coordinates when the extractor has no position", () => {
    const withoutPosition: DroneImageMetadata = {
      ...droneMetadata,
      position: undefined,
      qa: {
        status: "blocked",
        errors: [{ code: "position_missing", message: "Mangler position" }],
        warnings: [],
      },
    };
    const detected = buildImageDetectedMetadata({
      kind: "image",
      droneMetadata: withoutPosition,
      errors: ["Mangler position"],
    });

    expect(detected.ready_for_camera_position).toBe(false);
    expect(detected).not.toHaveProperty("latitude");
    expect(detected).not.toHaveProperty("longitude");
  });
});
