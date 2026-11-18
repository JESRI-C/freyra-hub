import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: mocks.rpc },
}));

import { computeAreaHa } from "@/services/geo-service";
import { getProjectGeoJSON, getProjectMetrics } from "@/services/geospatial-service";

const CANONICAL_POLYGON = {
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

function rpcFeature(id: string, geometry: unknown, featureClass = "source") {
  return {
    type: "Feature",
    id,
    geometry,
    properties: { feature_class: featureClass },
  };
}

function metricsRpcData(calculatedAt: unknown) {
  return {
    project_id: "project-1",
    total_area_ha: 10,
    protected_nature_overlap_ha: 2,
    observation_count: 3,
    nearest_watercourse_distance_m: 25,
    latest_ndvi: 0.61,
    data_completeness_score: 80,
    calculated_at: calculatedAt,
  };
}

describe("getProjectGeoJSON", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("inkluderer projects.geometry_polygon som canonical boundary i RPC-eksporten", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        type: "FeatureCollection",
        project_id: "project-1",
        project_name: "Haderslev Vandløb",
        generated_at: "2026-08-30T10:00:00.000Z",
        features: [
          {
            type: "Feature",
            id: "observation-1",
            geometry: { type: "Point", coordinates: [9.485, 55.255] },
            properties: { feature_class: "observation" },
          },
        ],
      },
      error: null,
    });

    const result = await getProjectGeoJSON("project-1", "Haderslev Vandløb", {
      polygon: CANONICAL_POLYGON,
      areaHa: 72.4,
      source: "manual",
      municipality: "Haderslev",
      status: "active",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_project_geojson", {
      input_project_id: "project-1",
    });
    expect(result.projectId).toBe("project-1");
    expect(result.projectName).toBe("Haderslev Vandløb");
    expect(result.features).toHaveLength(2);
    expect(result.features[0]).toMatchObject({
      id: "project-1-boundary",
      geometry: CANONICAL_POLYGON,
      properties: {
        feature_class: "project_boundary",
        canonical: true,
        area_ha: Math.round(computeAreaHa(CANONICAL_POLYGON) * 100) / 100,
      },
    });
    expect(result.features[1].properties["feature_class"]).toBe("observation");
  });

  it("erstatter en eventuel gammel project_boundary i stedet for at duplikere den", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "legacy-boundary",
            geometry: CANONICAL_POLYGON,
            properties: { feature_class: "project_boundary", canonical: false },
          },
        ],
      },
      error: null,
    });

    const result = await getProjectGeoJSON("project-1", "Projekt", {
      polygon: CANONICAL_POLYGON,
    });
    expect(
      result.features.filter(
        (feature) => feature.properties["feature_class"] === "project_boundary",
      ),
    ).toHaveLength(1);
    expect(result.features[0].id).toBe("project-1-boundary");
  });

  it("fejler synligt ved RPC-fejl og returnerer ikke seed/demo-data", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "RPC unavailable" } });

    await expect(
      getProjectGeoJSON("project-1", "Haderslev Vandløb", {
        polygon: CANONICAL_POLYGON,
      }),
    ).rejects.toThrow("Kunne ikke hente projektets GeoJSON: RPC unavailable");
  });

  it("afviser en ugyldig canonical boundary, selv når RPC-svaret er gyldigt", async () => {
    mocks.rpc.mockResolvedValue({
      data: { type: "FeatureCollection", features: [] },
      error: null,
    });

    await expect(
      getProjectGeoJSON("project-1", "Haderslev Vandløb", {
        polygon: {
          type: "Polygon",
          coordinates: [[...CANONICAL_POLYGON.coordinates[0].slice(0, -1)]],
        },
      }),
    ).rejects.toThrow("Projektgrænsen kan ikke eksporteres");
  });

  it("afviser strukturelt ugyldige RPC-features før download", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        type: "FeatureCollection",
        features: [{ type: "Feature", id: "broken", geometry: null, properties: null }],
      },
      error: null,
    });

    await expect(getProjectGeoJSON("project-1", "Haderslev Vandløb")).rejects.toThrow(
      "GeoJSON-feature 1 mangler et properties-objekt",
    );
  });

  it("accepterer alle understøttede GeoJSON-geometrityper efter dyb validering", async () => {
    const ring = CANONICAL_POLYGON.coordinates[0];
    mocks.rpc.mockResolvedValue({
      data: {
        type: "FeatureCollection",
        features: [
          rpcFeature("point", { type: "Point", coordinates: [9.48, 55.25] }),
          rpcFeature("multipoint", {
            type: "MultiPoint",
            coordinates: [
              [9.48, 55.25],
              [9.49, 55.26],
            ],
          }),
          rpcFeature("line", {
            type: "LineString",
            coordinates: [
              [9.48, 55.25],
              [9.49, 55.26],
            ],
          }),
          rpcFeature("multiline", {
            type: "MultiLineString",
            coordinates: [
              [
                [9.48, 55.25],
                [9.49, 55.26],
              ],
            ],
          }),
          rpcFeature("polygon", { type: "Polygon", coordinates: [ring] }),
          rpcFeature("multipolygon", {
            type: "MultiPolygon",
            coordinates: [[ring]],
          }),
        ],
      },
      error: null,
    });

    const result = await getProjectGeoJSON("project-1", "Haderslev Vandløb");
    expect(result.features.map((feature) => feature.geometry?.type)).toEqual([
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "Polygon",
      "MultiPolygon",
    ]);
  });

  it.each([
    ["ikke-endelig Point", { type: "Point", coordinates: [Number.NaN, 55.25] }, "ikke-endelig"],
    ["Point uden for WGS84", { type: "Point", coordinates: [181, 55.25] }, "WGS84"],
    ["for kort LineString", { type: "LineString", coordinates: [[9.48, 55.25]] }, "mindst 2"],
    [
      "åben Polygon-ring",
      {
        type: "Polygon",
        coordinates: [
          [
            [9.48, 55.25],
            [9.49, 55.25],
            [9.49, 55.26],
            [9.48, 55.26],
          ],
        ],
      },
      "ikke lukket",
    ],
    ["tom MultiPolygon", { type: "MultiPolygon", coordinates: [] }, "mindst én Polygon"],
    ["GeometryCollection", { type: "GeometryCollection", geometries: [] }, "understøttes ikke"],
    [
      "selvkrydsende Polygon",
      {
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
      },
      "krydser sig selv",
    ],
  ])("afviser %s fra RPC-svaret", async (_label, geometry, expectedMessage) => {
    mocks.rpc.mockResolvedValue({
      data: {
        type: "FeatureCollection",
        features: [rpcFeature("invalid", geometry)],
      },
      error: null,
    });

    await expect(getProjectGeoJSON("project-1", "Haderslev Vandløb")).rejects.toThrow(
      expectedMessage as string,
    );
  });

  it("afviser 200 observationer som mulig RPC-afkortning", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        type: "FeatureCollection",
        features: Array.from({ length: 200 }, (_, index) =>
          rpcFeature(
            `observation-${index + 1}`,
            { type: "Point", coordinates: [9.48, 55.25] },
            "observation",
          ),
        ),
      },
      error: null,
    });

    await expect(getProjectGeoJSON("project-1", "Haderslev Vandløb")).rejects.toThrow(
      "kan være afkortet ved databasegrænsen på 200",
    );
  });

  it("afviser cross-project RPC-data og bruger aldrig RPC-navnet som projektnavn", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        type: "FeatureCollection",
        project_id: "other-project",
        project_name: "Forkert projekt",
        features: [],
      },
      error: null,
    });
    await expect(getProjectGeoJSON("project-1", "Rigtigt projekt")).rejects.toThrow(
      "ikke det anmodede projekt project-1",
    );

    mocks.rpc.mockResolvedValue({
      data: {
        type: "FeatureCollection",
        project_id: "project-1",
        project_name: "Forkert projekt",
        features: [],
      },
      error: null,
    });
    const result = await getProjectGeoJSON("project-1", "Rigtigt projekt");
    expect(result.projectName).toBe("Rigtigt projekt");
  });

  it("fejler synligt ved metrics-RPC-fejl i stedet for at vise seedtal som live", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "metrics RPC unavailable" } });

    await expect(getProjectMetrics("project-1")).rejects.toThrow(
      "Kunne ikke hente projektmålinger: metrics RPC unavailable",
    );
  });

  it.each([null, "ikke-en-dato"])(
    "afviser manglende eller ugyldigt metrics calculated_at: %s",
    async (calculatedAt) => {
      mocks.rpc.mockResolvedValue({ data: metricsRpcData(calculatedAt), error: null });

      await expect(getProjectMetrics("project-1")).rejects.toThrow("calculated_at");
    },
  );

  it("afviser cross-project og ikke-endelige metrics-felter", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...metricsRpcData("2026-08-31T10:00:00.000Z"), project_id: "other-project" },
      error: null,
    });
    await expect(getProjectMetrics("project-1")).rejects.toThrow("project_id matcher ikke");

    mocks.rpc.mockResolvedValue({
      data: { ...metricsRpcData("2026-08-31T10:00:00.000Z"), total_area_ha: Number.NaN },
      error: null,
    });
    await expect(getProjectMetrics("project-1")).rejects.toThrow(
      "total_area_ha er ikke et endeligt tal",
    );
  });
});
