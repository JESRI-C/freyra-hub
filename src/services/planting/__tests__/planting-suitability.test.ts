import { describe, expect, it } from "vitest";
import { area, feature, featureCollection, intersect } from "@turf/turf";
import type { Polygon } from "geojson";
import {
  buildPlantingSuitability,
  classifyPlantingArea,
  type PlantingInput,
  type PlantingLayer,
  type PlantingSourceId,
} from "../planting-suitability";

function rect(west: number, south: number, east: number, north: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

const boundary = rect(9, 55, 9.02, 55.02);
const layer = (id: PlantingSourceId, geometries: Polygon[] = []): PlantingLayer => ({
  id,
  label: id,
  geometries,
  coverage: "complete",
  fetchedAt: "2026-10-22T12:00:00.000Z",
  sourceUrl: "https://example.test/controlled-test-fixture",
  warnings: [],
});

function input(): PlantingInput {
  return {
    projectId: "test-project",
    baselineId: "test-baseline",
    baselineSha256: "a".repeat(64),
    projectBoundary: boundary,
    watercourse: {
      ...layer("watercourse"),
      geometry: {
        type: "LineString",
        coordinates: [
          [9.01, 55.001],
          [9.01, 55.019],
        ],
      },
    },
    section3: layer("section3"),
    woodland: layer("woodland"),
    lowland: layer("lowland"),
    fields: layer("fields", [boundary]),
    reaches: [{ id: "A", geometry: boundary, confirmed: true }],
  };
}

describe("planting classification", () => {
  it.each([
    [
      {
        excluded: true,
        fieldCandidate: true,
        carbonRichOrLowland: false,
        allSourcesComplete: true,
      },
      "uegnet",
    ],
    [
      {
        excluded: true,
        fieldCandidate: null,
        carbonRichOrLowland: null,
        allSourcesComplete: false,
      },
      "uegnet",
    ],
    [
      {
        excluded: false,
        fieldCandidate: false,
        carbonRichOrLowland: false,
        allSourcesComplete: true,
      },
      "uegnet",
    ],
    [
      {
        excluded: false,
        fieldCandidate: true,
        carbonRichOrLowland: true,
        allSourcesComplete: true,
      },
      "betinget",
    ],
    [
      {
        excluded: false,
        fieldCandidate: true,
        carbonRichOrLowland: null,
        allSourcesComplete: true,
      },
      "betinget",
    ],
    [
      {
        excluded: false,
        fieldCandidate: null,
        carbonRichOrLowland: false,
        allSourcesComplete: true,
      },
      "betinget",
    ],
    [
      {
        excluded: false,
        fieldCandidate: true,
        carbonRichOrLowland: false,
        allSourcesComplete: false,
      },
      "betinget",
    ],
    [
      {
        excluded: false,
        fieldCandidate: true,
        carbonRichOrLowland: false,
        allSourcesComplete: true,
      },
      "egnet",
    ],
  ] as const)("conservatively classifies %j as %s", (values, expected) => {
    expect(classifyPlantingArea(values)).toBe(expected);
  });
});

describe("planting geometry and evidence", () => {
  it("builds metre-based 10/20 alternatives and sums confirmed reaches only", () => {
    const result = buildPlantingSuitability(input());
    expect(result.status).toBe("complete");
    const ten = result.reaches.find((reach) => reach.reach === "A" && reach.bufferM === 10)!;
    const twenty = result.reaches.find((reach) => reach.reach === "A" && reach.bufferM === 20)!;
    // Roughly 2 km × two banks × 10 m, plus rounded ends; catches degrees/metres errors.
    expect(ten.suitableHa).toBeGreaterThan(3.9);
    expect(ten.suitableHa).toBeLessThan(4.2);
    expect(twenty.suitableHa! / ten.suitableHa!).toBeGreaterThan(1.99);
    expect(twenty.suitableHa! / ten.suitableHa!).toBeLessThan(2.05);
    expect(
      result.reaches
        .filter((reach) => reach.reach !== "A")
        .every((reach) => reach.suitableHa === null),
    ).toBe(true);
    expect(result.localEffectsCalculated).toBe(false);
  });

  it("subtracts protected nature and overlapping woodland without counting excluded land twice", () => {
    const data = input();
    data.section3.geometries = [rect(9, 55.002, 9.02, 55.007)];
    data.woodland.geometries = [rect(9, 55.005, 9.02, 55.01)];
    const result = buildPlantingSuitability(data);
    const baseline = buildPlantingSuitability(input());
    for (const width of [10, 20]) {
      const pieces = result.features.features.filter((item) => item.properties.bufferM === width);
      const original = baseline.features.features
        .filter((item) => item.properties.bufferM === width)
        .reduce((sum, item) => sum + item.properties.areaHa, 0);
      expect(pieces.reduce((sum, item) => sum + item.properties.areaHa, 0)).toBeCloseTo(
        original,
        5,
      );
      expect(pieces.filter((item) => item.properties.suitability === "uegnet").length).toBe(2);
      for (const candidate of pieces.filter((item) => item.properties.suitability === "egnet")) {
        for (const exclusion of [...data.section3.geometries, ...data.woodland.geometries]) {
          const overlap = intersect(
            featureCollection([feature(candidate.geometry), feature(exclusion)]),
          );
          expect(overlap ? area(overlap) : 0).toBeLessThan(0.001);
        }
      }
    }
  });

  it("marks lowland conditional while ordinary agricultural land is suitable", () => {
    const data = input();
    data.lowland.geometries = [rect(9, 55, 9.02, 55.01)];
    const result = buildPlantingSuitability(data);
    expect(
      result.features.features.some(
        (entry) =>
          entry.properties.suitability === "betinget" &&
          entry.properties.carbonRichOrLowland === true,
      ),
    ).toBe(true);
    expect(
      result.features.features.some(
        (entry) =>
          entry.properties.suitability === "egnet" &&
          entry.properties.carbonRichOrLowland === false,
      ),
    ).toBe(true);
  });

  it("does not promote non-field land to candidates, and preserves polygon holes", () => {
    const data = input();
    data.fields.geometries = [
      {
        ...boundary,
        coordinates: [
          boundary.coordinates[0],
          rect(9.005, 55.005, 9.015, 55.015).coordinates[0].slice().reverse(),
        ],
      },
    ];
    const result = buildPlantingSuitability(data);
    const nonField = result.features.features.filter(
      (entry) => entry.properties.fieldCandidate === false,
    );
    expect(nonField).toHaveLength(2);
    expect(nonField.every((entry) => entry.properties.suitability === "uegnet")).toBe(true);
  });

  it.each(["section3", "woodland", "lowland", "fields"] as const)(
    "never creates suitable land or zero totals with missing %s",
    (id) => {
      const data = input();
      data[id] = { ...data[id], coverage: "unavailable", geometries: [], fetchedAt: null };
      const result = buildPlantingSuitability(data);
      expect(result.status).toBe("partial");
      expect(
        result.features.features.some((entry) => entry.properties.suitability === "egnet"),
      ).toBe(false);
      expect(
        result.reaches.every(
          (reach) =>
            reach.suitableHa === null &&
            reach.conditionalHa === null &&
            reach.unsuitableHa === null,
        ),
      ).toBe(true);
    },
  );

  it("keeps a complete empty fields result distinct from unavailable fields", () => {
    const data = input();
    data.fields.geometries = [];
    const result = buildPlantingSuitability(data);
    expect(result.status).toBe("complete");
    expect(
      result.features.features.every((entry) => entry.properties.suitability === "uegnet"),
    ).toBe(true);
    expect(result.reaches.find((reach) => reach.reach === "A")?.suitableHa).toBe(0);
  });

  it("refuses unknown official geometry without synthesising a stream", () => {
    const data = input();
    data.watercourse.geometry = null;
    const result = buildPlantingSuitability(data);
    expect(result.status).toBe("unavailable");
    expect(result.features.features).toEqual([]);
  });

  it("rejects swapped coordinates, projected coordinates and invalid polygon rings", () => {
    for (const coordinates of [
      [
        [55, 9],
        [55.1, 9.1],
      ],
      [
        [500000, 6100000],
        [500100, 6100200],
      ],
    ]) {
      const data = input();
      data.watercourse.geometry = { type: "LineString", coordinates };
      expect(buildPlantingSuitability(data).status).toBe("unavailable");
    }
    const data = input();
    data.fields.geometries = [
      {
        type: "Polygon",
        coordinates: [
          [
            [9, 55],
            [9.01, 55],
            [9, 55.01],
          ],
        ],
      },
    ];
    expect(buildPlantingSuitability(data).status).toBe("unavailable");
  });

  it("does not sum overlapping or unapproved A–E boundaries", () => {
    const data = input();
    data.reaches.push({ id: "B", geometry: boundary, confirmed: true });
    const result = buildPlantingSuitability(data);
    expect(result.reaches.every((reach) => reach.suitableHa === null)).toBe(true);
    data.reaches = [{ id: "A", geometry: boundary, confirmed: false }];
    expect(buildPlantingSuitability(data).reaches.every((reach) => reach.suitableHa === null)).toBe(
      true,
    );
  });

  it("is deterministic, serializable and leaves source data untouched", () => {
    const data = input();
    const original = JSON.stringify(data);
    const first = buildPlantingSuitability(data);
    expect(buildPlantingSuitability(data)).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(JSON.stringify(data)).toBe(original);
    expect(first.baselineSha256).toBe(data.baselineSha256);
  });
});
