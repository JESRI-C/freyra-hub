import { describe, it, expect } from "vitest";
import {
  aggregateObservations,
  computeDataQualityScore,
  labelForIndicatorKey,
  type ObservationLike,
} from "@/services/monitoring/indicator-aggregation-engine";

function obs(key: string, value: number, observedAt: string, confidence: number | null = null): ObservationLike {
  return { indicator_key: key, value, unit: "cm", observed_at: observedAt, confidence };
}

describe("aggregateObservations", () => {
  it("tager nyeste værdi pr. nøgle og beregner trend mod forrige", () => {
    const result = aggregateObservations([
      obs("water_table", 42, "2026-07-10T08:00:00Z"),
      obs("water_table", 38, "2026-07-12T08:00:00Z"), // nyeste
      obs("water_table", 40, "2026-07-11T08:00:00Z"), // forrige
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: "water_table",
      value: 38,
      trend: "down", // 38 < 40
      observationCount: 3,
    });
  });

  it("markerer trend up og flat korrekt", () => {
    const up = aggregateObservations([
      obs("x", 10, "2026-07-11T00:00:00Z"),
      obs("x", 12, "2026-07-12T00:00:00Z"),
    ]);
    expect(up[0].trend).toBe("up");

    const flat = aggregateObservations([obs("y", 5, "2026-07-12T00:00:00Z")]);
    expect(flat[0].trend).toBe("flat"); // ingen forrige observation
  });

  it("grupperer flere nøgler og ignorerer rækker uden nøgle/værdi", () => {
    const result = aggregateObservations([
      obs("a", 1, "2026-07-12T00:00:00Z"),
      obs("b", 2, "2026-07-12T00:00:00Z"),
      { indicator_key: null, value: 9, unit: null, observed_at: "2026-07-12T00:00:00Z", confidence: null },
      { indicator_key: "c", value: null, unit: null, observed_at: "2026-07-12T00:00:00Z", confidence: null },
    ]);
    expect(result.map((r) => r.key).sort()).toEqual(["a", "b"]);
  });

  it("beregner gennemsnitlig confidence", () => {
    const result = aggregateObservations([
      obs("z", 1, "2026-07-11T00:00:00Z", 0.8),
      obs("z", 2, "2026-07-12T00:00:00Z", 0.6),
    ]);
    expect(result[0].avgConfidence).toBe(0.7);
  });
});

describe("computeDataQualityScore", () => {
  it("giver 100 uden issues og 0 uden målinger med issues", () => {
    expect(computeDataQualityScore({ measurementCount: 50, openIssueCount: 0 })).toBe(100);
    expect(computeDataQualityScore({ measurementCount: 0, openIssueCount: 3 })).toBe(0);
  });

  it("trækker fra proportionalt med issue-andelen", () => {
    expect(computeDataQualityScore({ measurementCount: 100, openIssueCount: 10 })).toBe(90);
    expect(computeDataQualityScore({ measurementCount: 10, openIssueCount: 20 })).toBe(0); // clamped
  });

  it("returnerer null (ukendt) helt uden data", () => {
    expect(computeDataQualityScore({ measurementCount: 0, openIssueCount: 0 })).toBeNull();
  });
});

describe("labelForIndicatorKey", () => {
  it("bruger kendte danske labels og humaniserer ukendte nøgler", () => {
    expect(labelForIndicatorKey("data_quality")).toBe("Datakvalitet");
    expect(labelForIndicatorKey("biodiversity_index")).toBe("Biodiversitetsindeks");
    expect(labelForIndicatorKey("soil_ph_level")).toBe("Soil ph level");
  });
});
