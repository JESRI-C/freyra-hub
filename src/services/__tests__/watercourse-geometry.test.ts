import { describe, it, expect } from "vitest";
import {
  validateCenterline,
  centerlineLength,
  validateSegments,
  segmentGeometry,
  measuredArea,
  photoPairFlags,
  watercourseGeoJSON,
  importCenterline,
  WATERCOURSE_METHOD,
} from "../watercourse-geometry";
import type { WatercourseVersion } from "../watercourse-geometry";
const line = validateCenterline({
  type: "LineString",
  coordinates: [
    [9.5, 55.2],
    [9.501, 55.2],
    [9.502, 55.201],
  ],
});
describe("watercourse measurement contract", () => {
  it("rejects polygon-as-line and projected or non-finite coordinates", () => {
    expect(() => validateCenterline({ type: "Polygon", coordinates: [] })).toThrow();
    expect(() =>
      validateCenterline({
        type: "LineString",
        coordinates: [
          [550000, 6100000],
          [550001, 6100001],
        ],
      }),
    ).toThrow();
    expect(() =>
      validateCenterline({
        type: "LineString",
        coordinates: [
          [9, 55],
          [NaN, 55],
        ],
      }),
    ).toThrow();
  });
  it("preserves coordinate order, stationing and independent geometry on roundtrip", () => {
    const total = centerlineLength(line);
    expect(total).toBeGreaterThan(100);
    const v: WatercourseVersion = {
      id: "v1",
      project_id: "p1",
      organization_id: "o1",
      version: 1,
      geometry: line,
      crs: "EPSG:4326",
      direction: "downstream",
      source: "survey.geojson",
      length_m: total,
      method: WATERCOURSE_METHOD,
      segments: [{ id: "s1", name: "Upper", fromM: 0, toM: 50 }],
      created_at: "2026-10-26",
    };
    const roundtrip = JSON.parse(JSON.stringify(watercourseGeoJSON(v)));
    expect(roundtrip.features[0].geometry).toEqual(line);
    expect(importCenterline(roundtrip)).toEqual(line);
    // GIS tools may reorder features; the segment must never become the draft.
    roundtrip.features.reverse();
    expect(importCenterline(roundtrip)).toEqual(line);
    roundtrip.features.reverse();
    expect(centerlineLength(segmentGeometry(line, v.segments[0]))).toBeCloseTo(50, 3);
    expect(roundtrip.features[1].properties.centerline_version).toBe("v1");
  });
  it("imports a single ordinary line, but rejects ambiguous or segment-only files", () => {
    const feature = { type: "Feature" as const, geometry: line, properties: {} };
    const collection = { type: "FeatureCollection" as const, features: [feature] };
    expect(importCenterline(collection)).toEqual(line);
    expect(() => importCenterline({ ...collection, features: [feature, feature] })).toThrow();
    expect(() => importCenterline({ ...collection, features: [] })).toThrow();
    const centerline = { ...feature, properties: { role: "watercourse_centerline" } };
    const segment = { ...feature, properties: { role: "watercourse_segment" } };
    expect(() => importCenterline({ ...collection, features: [segment] })).toThrow();
    expect(() =>
      importCenterline({ ...collection, features: [centerline, centerline, segment] }),
    ).toThrow();
    expect(() =>
      importCenterline({ ...collection, features: [centerline, feature, segment] }),
    ).toThrow();
  });
  it("rejects duplicate and overlapping segments to prevent double counting", () => {
    expect(() =>
      validateSegments(
        [
          { id: "a", name: "A", fromM: 0, toM: 30 },
          { id: "b", name: "B", fromM: 20, toM: 40 },
        ],
        100,
      ),
    ).toThrow();
    expect(() =>
      validateSegments(
        [
          { id: "a", name: "A", fromM: 0, toM: 30 },
          { id: "a", name: "B", fromM: 30, toM: 40 },
        ],
        100,
      ),
    ).toThrow();
    expect(() => validateSegments([{ id: "a", name: "A", fromM: 0, toM: 101 }], 100)).toThrow();
  });
  it("does not infer measured area from photo GPS or an unapproved orthophoto", () => {
    const polygon = {
      type: "Polygon" as const,
      coordinates: [
        [
          [9, 55],
          [9.001, 55],
          [9.001, 55.001],
          [9, 55],
        ],
      ],
    };
    expect(() =>
      measuredArea(polygon, {
        sourceIds: ["photo"],
        version: "v1",
        kind: "gps_photo",
        approved: true,
        crs: "EPSG:4326",
      }),
    ).toThrow();
    expect(() =>
      measuredArea(polygon, {
        sourceIds: ["ortho"],
        version: "v1",
        kind: "georeferenced_orthophoto",
        approved: false,
        crs: "EPSG:4326",
      }),
    ).toThrow();
    const result = measuredArea(polygon, {
      sourceIds: ["survey"],
      version: "v1",
      kind: "survey_geometry",
      approved: true,
      crs: "EPSG:4326",
    });
    expect(result.value).toBeGreaterThan(0);
    expect(result.sourceIds).toEqual(["survey"]);
    expect(result.unit).toBe("m²");
  });
  it("flags missing GPS, heading and lighting without a centroid substitute", () => {
    const photo = { id: "a", lat: null, lng: null, heading: null, light: null, qualityFlags: [] };
    expect(photoPairFlags(photo, { ...photo, id: "b" })).toEqual([
      "missing_gps",
      "missing_heading",
      "lighting_not_comparable",
    ]);
  });
});
