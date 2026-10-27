import { describe, it, expect } from "vitest";
import { validateObservation } from "../watercourse-observations";
describe("manual source review", () => {
  const input = {
    source_ids: ["photo-1"],
    text: "Possible branched bur-reed",
    feature_key: "plant-01",
    kind: "species" as const,
    determination_level: "species_suggestion" as const,
  };
  it("rejects repeated source photographs", () =>
    expect(() => validateObservation({ ...input, source_ids: ["photo-1", "photo-1"] })).toThrow(
      "unikke",
    ));
  it("does not silently approve a species", () =>
    expect(() => validateObservation({ ...input, determination_level: "observed" })).toThrow(
      "forslag",
    ));
  it("requires source and stable object reference", () => {
    expect(() => validateObservation({ ...input, source_ids: [] })).toThrow();
    expect(() => validateObservation({ ...input, feature_key: "" })).toThrow();
  });
  it("accepts an explicitly provisional sourced suggestion", () =>
    expect(() => validateObservation(input)).not.toThrow());
});

import { comparisonSelection } from "../watercourse-observations";
describe("immutable comparison roles and lighting", () => {
  const observation = {
    source_ids: ["photo-before", "photo-after"],
    text: "Vegetation changed",
    feature_key: "plant-01",
    kind: "vegetation" as const,
    determination_level: "observed" as const,
  };
  it("roundtrips explicit roles and lighting across persisted JSON", () => {
    const comparison = {
      beforeId: "photo-before",
      afterId: "photo-after",
      beforeLight: "Sol",
      afterLight: "Overskyet",
    };
    const persisted = JSON.parse(JSON.stringify({ ...observation, comparison }));
    expect(() => validateObservation(persisted)).not.toThrow();
    expect(comparisonSelection(persisted.comparison)).toEqual(comparison);
  });
  it("does not infer photo roles from source order", () => {
    const comparison = {
      beforeId: "photo-after",
      afterId: "photo-before",
      beforeLight: null,
      afterLight: null,
    };
    expect(comparisonSelection(comparison)).toEqual({
      beforeId: "photo-after",
      afterId: "photo-before",
      beforeLight: "",
      afterLight: "",
    });
  });
  it("rejects pair sources outside the observation and duplicate roles", () => {
    const comparison = {
      beforeId: "photo-before",
      afterId: "another-project-photo",
      beforeLight: null,
      afterLight: null,
    };
    expect(() => validateObservation({ ...observation, comparison })).toThrow();
    expect(() =>
      validateObservation({
        ...observation,
        comparison: { ...comparison, afterId: "photo-before" },
      }),
    ).toThrow();
  });
});
