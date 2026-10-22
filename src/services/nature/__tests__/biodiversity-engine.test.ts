import { describe, it, expect } from "vitest";
import { computeBiodiversityScore, generateRecommendations } from "../biodiversity-engine";
import type { Paragraph3Result, BiodiversityDataResult } from "../paragraph3-service";

function makeP3(overrides: Partial<Paragraph3Result> = {}): Paragraph3Result {
  return {
    overlapHa: 4.1,
    overlapPercent: 56,
    areas: [
      { id: "1", natureType: "Eng", typeCode: "p3_eng", areaHa: 2.3, geometry: null },
      { id: "2", natureType: "Mose", typeCode: "p3_mose", areaHa: 1.1, geometry: null },
      { id: "3", natureType: "Sø", typeCode: "p3_soe", areaHa: 0.7, geometry: null },
    ],
    natureTypes: ["Eng", "Mose", "Sø"],
    fetchedAt: new Date().toISOString(),
    mode: "live",
    ...overrides,
  };
}

function makeSpecies(overrides: Partial<BiodiversityDataResult> = {}): BiodiversityDataResult {
  return {
    species: [
      { scientificName: "Lutra lutra", danishName: "Odder", group: "Pattedyr", protected: true, redListStatus: "VU", count: 1 },
      { scientificName: "Bufo bufo", danishName: "Skrubtudse", group: "Padder", protected: true, count: 8 },
      { scientificName: "Parus major", danishName: "Musvit", group: "Fugle", protected: false, redListStatus: "LC", count: 12 },
    ],
    redListedCount: 1,
    protectedCount: 2,
    groupDiversity: { Pattedyr: 1, Padder: 1, Fugle: 1 },
    fetchedAt: new Date().toISOString(),
    mode: "live",
    ...overrides,
  };
}

describe("computeBiodiversityScore", () => {
  it("giver en score mellem 0 og 100", () => {
    const score = computeBiodiversityScore(0.68, makeP3(), makeSpecies(), 7.3);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it("høj NDVI + meget §3 + mange arter giver højere score end ingenting", () => {
    const rich = computeBiodiversityScore(0.75, makeP3({ overlapPercent: 70 }), makeSpecies(), 7.3);
    const poor = computeBiodiversityScore(
      0.1,
      makeP3({ overlapHa: 0, overlapPercent: 0, areas: [], natureTypes: [] }),
      makeSpecies({ species: [], protectedCount: 0, redListedCount: 0, groupDiversity: {} }),
      7.3,
    );
    expect(rich.total).toBeGreaterThan(poor.total);
  });

  it("manglende NDVI falder tilbage til middelværdi uden at crashe", () => {
    const score = computeBiodiversityScore(null, makeP3(), makeSpecies(), 7.3);
    expect(score.components.vegetation).toBe(50);
  });

  it("confidence er high når både §3 og arter er live + NDVI findes", () => {
    const score = computeBiodiversityScore(0.6, makeP3(), makeSpecies(), 7.3);
    expect(score.confidence).toBe("high");
  });

  it("confidence falder når data er preview", () => {
    const score = computeBiodiversityScore(
      null,
      makeP3({ mode: "preview" }),
      makeSpecies({ mode: "preview" }),
      7.3,
    );
    expect(score.confidence).toBe("low");
  });

  it("klassifikation matcher score-intervaller", () => {
    const high = computeBiodiversityScore(0.9, makeP3({ overlapPercent: 80, natureTypes: ["Eng","Mose","Sø","Hede","Overdrev","Strandeng"] }), makeSpecies(), 7.3);
    expect(["Meget høj", "Høj"]).toContain(high.classification);
  });
});

describe("generateRecommendations", () => {
  it("anbefaler vegetationsforbedring ved lav NDVI", () => {
    const score = computeBiodiversityScore(0.1, makeP3(), makeSpecies(), 7.3);
    const recs = generateRecommendations(score);
    expect(recs.some((r) => r.component === "vegetation")).toBe(true);
  });

  it("anbefaler §3-etablering ved lav habitatdækning", () => {
    const score = computeBiodiversityScore(
      0.6,
      makeP3({ overlapHa: 0.1, overlapPercent: 2, areas: [], natureTypes: [] }),
      makeSpecies(),
      7.3,
    );
    const recs = generateRecommendations(score);
    expect(recs.some((r) => r.component === "habitatCoverage" && r.priority === "Høj")).toBe(true);
  });

  it("returnerer færre anbefalinger ved sund natur", () => {
    const healthy = computeBiodiversityScore(
      0.8,
      makeP3({ overlapPercent: 70, natureTypes: ["Eng","Mose","Sø","Hede","Overdrev","Strandeng"] }),
      makeSpecies({
        species: Array.from({ length: 20 }, (_, i) => ({
          scientificName: `Art ${i}`, danishName: `Art ${i}`,
          group: ["Fugle","Pattedyr","Padder","Planter","Insekter","Svampe","Fisk","Krybdyr"][i % 8],
          protected: i % 2 === 0, redListStatus: i % 3 === 0 ? "VU" : "LC", count: 1,
        })),
        protectedCount: 10, redListedCount: 7,
        groupDiversity: { Fugle: 3, Pattedyr: 3, Padder: 2, Planter: 3, Insekter: 3, Svampe: 2, Fisk: 2, Krybdyr: 2 },
      }),
      7.3,
    );
    const sick = computeBiodiversityScore(0.05, makeP3({ overlapHa: 0, overlapPercent: 0, areas: [], natureTypes: [] }), makeSpecies({ species: [], protectedCount: 0, redListedCount: 0, groupDiversity: {} }), 7.3);
    expect(generateRecommendations(healthy).length).toBeLessThan(generateRecommendations(sick).length);
  });
});
