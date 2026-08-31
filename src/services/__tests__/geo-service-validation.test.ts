import { describe, expect, it } from "vitest";
import {
  computeAreaHa,
  computeCentroid,
  getProjectGeometryUploadSizeError,
  MAX_PROJECT_GEOMETRY_UPLOAD_BYTES,
  MAX_PROJECT_POLYGON_VERTICES,
  parseProjectGeometryDetailed,
  validateProjectPolygon,
} from "@/services/geo-service";

const VALID_POLYGON = {
  type: "Polygon" as const,
  coordinates: [
    [
      [9.48, 55.25],
      [9.49, 55.25],
      [9.49, 55.26],
      [9.48, 55.26],
      [9.48, 55.25],
    ],
  ],
};

describe("validateProjectPolygon", () => {
  it("accepterer en lukket WGS84 Polygon", () => {
    const result = validateProjectPolygon(VALID_POLYGON);
    expect(result).toEqual({ valid: true, polygon: VALID_POLYGON });
  });

  it("afviser en åben ring med en forståelig fejl", () => {
    const result = validateProjectPolygon({
      ...VALID_POLYGON,
      coordinates: [[...VALID_POLYGON.coordinates[0].slice(0, -1)]],
    });
    expect(result).toMatchObject({ valid: false, code: "RING_NOT_CLOSED" });
    if (!result.valid) expect(result.error).toContain("ikke lukket");
  });

  it.each([
    ["NaN", Number.NaN, 55.25, "POSITION_NOT_FINITE"],
    ["Infinity", Number.POSITIVE_INFINITY, 55.25, "POSITION_NOT_FINITE"],
    ["longitude", 181, 55.25, "POSITION_OUT_OF_RANGE"],
    ["latitude", 9.48, 91, "POSITION_OUT_OF_RANGE"],
  ])("afviser %s-koordinater", (_label, longitude, latitude, code) => {
    const coordinates = structuredClone(VALID_POLYGON.coordinates);
    coordinates[0][1] = [longitude as number, latitude as number];
    const result = validateProjectPolygon({ type: "Polygon", coordinates });
    expect(result).toMatchObject({ valid: false, code });
  });

  it("afviser færre end tre unikke punkter", () => {
    const result = validateProjectPolygon({
      type: "Polygon",
      coordinates: [
        [
          [9.48, 55.25],
          [9.49, 55.26],
          [9.48, 55.25],
          [9.49, 55.26],
          [9.48, 55.25],
        ],
      ],
    });
    expect(result).toMatchObject({ valid: false, code: "TOO_FEW_UNIQUE_POINTS" });
  });

  it("afviser en selvkrydsende bow-tie Polygon", () => {
    const result = validateProjectPolygon({
      type: "Polygon",
      coordinates: [
        [
          [9.48, 55.25],
          [9.5, 55.27],
          [9.48, 55.27],
          [9.5, 55.25],
          [9.48, 55.25],
        ],
      ],
    });
    expect(result).toMatchObject({ valid: false, code: "SELF_INTERSECTION" });
  });

  it("afviser MultiPolygon og FeatureCollection eksplicit", () => {
    expect(validateProjectPolygon({ type: "MultiPolygon", coordinates: [] })).toMatchObject({
      valid: false,
      code: "MULTIPOLYGON_UNSUPPORTED",
    });
    expect(validateProjectPolygon({ type: "FeatureCollection", features: [] })).toMatchObject({
      valid: false,
      code: "FEATURE_COLLECTION_UNSUPPORTED",
    });
  });

  it("accepterer præcis det dokumenterede maksimum af Polygon-punkter", () => {
    const ring = Array.from({ length: MAX_PROJECT_POLYGON_VERTICES }, (_, index) => {
      const angle = (2 * Math.PI * index) / MAX_PROJECT_POLYGON_VERTICES;
      return [10 + Math.cos(angle), 56 + Math.sin(angle)] as [number, number];
    });
    ring.push(ring[0]);

    expect(validateProjectPolygon({ type: "Polygon", coordinates: [ring] }).valid).toBe(true);
  });

  it("afviser ét punkt over maksimum før topologikontrollen", () => {
    const vertexCount = MAX_PROJECT_POLYGON_VERTICES + 1;
    const ring = Array.from({ length: vertexCount }, (_, index) => {
      const angle = (2 * Math.PI * index) / vertexCount;
      return [10 + Math.cos(angle), 56 + Math.sin(angle)] as [number, number];
    });
    ring.push(ring[0]);

    const result = validateProjectPolygon({ type: "Polygon", coordinates: [ring] });
    expect(result).toMatchObject({ valid: false, code: "TOO_MANY_VERTICES" });
    if (!result.valid) {
      expect(result.error).toContain(`${MAX_PROJECT_POLYGON_VERTICES + 1} punkter`);
      expect(result.error).toContain(`Maksimum er ${MAX_PROJECT_POLYGON_VERTICES}`);
    }
  });

  it("validerer alle ringe og fratrækker huller i arealet", () => {
    const withHole = {
      type: "Polygon" as const,
      coordinates: [
        VALID_POLYGON.coordinates[0],
        [
          [9.482, 55.252],
          [9.484, 55.252],
          [9.484, 55.254],
          [9.482, 55.254],
          [9.482, 55.252],
        ],
      ],
    };
    expect(validateProjectPolygon(withHole).valid).toBe(true);
    expect(computeAreaHa(withHole)).toBeLessThan(computeAreaHa(VALID_POLYGON));
  });

  it("afviser et hul, der ligger helt uden for yderringen", () => {
    const result = validateProjectPolygon({
      type: "Polygon",
      coordinates: [
        VALID_POLYGON.coordinates[0],
        [
          [9.51, 55.25],
          [9.512, 55.25],
          [9.512, 55.252],
          [9.51, 55.252],
          [9.51, 55.25],
        ],
      ],
    });
    expect(result).toMatchObject({ valid: false, code: "HOLE_OUTSIDE_OUTER_RING" });
  });

  it("afviser et hul, der krydser yderringen", () => {
    const result = validateProjectPolygon({
      type: "Polygon",
      coordinates: [
        VALID_POLYGON.coordinates[0],
        [
          [9.479, 55.252],
          [9.483, 55.252],
          [9.483, 55.254],
          [9.479, 55.254],
          [9.479, 55.252],
        ],
      ],
    });
    expect(result).toMatchObject({ valid: false, code: "HOLE_INTERSECTS_OUTER_RING" });
  });

  it("afviser overlappende huller", () => {
    const result = validateProjectPolygon({
      type: "Polygon",
      coordinates: [
        VALID_POLYGON.coordinates[0],
        [
          [9.482, 55.252],
          [9.486, 55.252],
          [9.486, 55.256],
          [9.482, 55.256],
          [9.482, 55.252],
        ],
        [
          [9.484, 55.254],
          [9.488, 55.254],
          [9.488, 55.258],
          [9.484, 55.258],
          [9.484, 55.254],
        ],
      ],
    });
    expect(result).toMatchObject({ valid: false, code: "HOLES_INTERSECT" });
  });

  it("afviser nestede huller", () => {
    const result = validateProjectPolygon({
      type: "Polygon",
      coordinates: [
        VALID_POLYGON.coordinates[0],
        [
          [9.482, 55.252],
          [9.488, 55.252],
          [9.488, 55.258],
          [9.482, 55.258],
          [9.482, 55.252],
        ],
        [
          [9.484, 55.254],
          [9.486, 55.254],
          [9.486, 55.256],
          [9.484, 55.256],
          [9.484, 55.254],
        ],
      ],
    });
    expect(result).toMatchObject({ valid: false, code: "HOLES_NESTED" });
  });

  it("beregner samme arealvægtede centroid med et ekstra kollineært vertex", () => {
    const withExtraCollinearVertex = {
      type: "Polygon" as const,
      coordinates: [
        [
          [9.48, 55.25],
          [9.485, 55.25],
          [9.49, 55.25],
          [9.49, 55.26],
          [9.48, 55.26],
          [9.48, 55.25],
        ],
      ],
    };

    expect(validateProjectPolygon(withExtraCollinearVertex).valid).toBe(true);
    const baseline = computeCentroid(VALID_POLYGON);
    const withExtraVertex = computeCentroid(withExtraCollinearVertex);
    expect(withExtraVertex?.lng).toBeCloseTo(baseline?.lng ?? 0, 10);
    expect(withExtraVertex?.lat).toBeCloseTo(baseline?.lat ?? 0, 10);
  });
});

describe("getProjectGeometryUploadSizeError", () => {
  it("accepterer en fil præcis på uploadgrænsen", () => {
    expect(getProjectGeometryUploadSizeError(MAX_PROJECT_GEOMETRY_UPLOAD_BYTES)).toBeNull();
  });

  it("afviser en fil én byte over uploadgrænsen", () => {
    expect(getProjectGeometryUploadSizeError(MAX_PROJECT_GEOMETRY_UPLOAD_BYTES + 1)).toContain(
      "Maksimum er 2 MB",
    );
  });
});

describe("parseProjectGeometryDetailed", () => {
  it("unwrap'er en enkelt Feature uden at ændre koordinater", () => {
    const result = parseProjectGeometryDetailed({
      type: "Feature",
      properties: { source: "fixture" },
      geometry: VALID_POLYGON,
    });
    expect(result.error).toBeNull();
    expect(result.geometry.polygon).toEqual(VALID_POLYGON);
  });

  it("returnerer præcis årsag for ugyldig JSON og unsupported collections", () => {
    expect(parseProjectGeometryDetailed("{ikke-json").error).toContain("ikke gyldig JSON");
    expect(
      parseProjectGeometryDetailed({ type: "FeatureCollection", features: [] }).error,
    ).toContain("FeatureCollection understøttes ikke");
    expect(parseProjectGeometryDetailed({ type: "MultiPolygon", coordinates: [] }).error).toContain(
      "MultiPolygon understøttes ikke",
    );
  });
});
