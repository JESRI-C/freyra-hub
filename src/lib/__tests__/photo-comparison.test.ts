import { describe, expect, it } from "vitest";
import { emptyExecution } from "../action-execution";
import {
  assessPhotoComparison,
  PhotoComparisonSchema,
  type PhotoComparison,
} from "../photo-comparison";
const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const comparison: PhotoComparison = {
  schema: "freyra.photo-comparison/v1",
  comparisonId: uuid(1),
  executionRevisionId: uuid(2),
  beforeId: uuid(3),
  afterId: uuid(4),
  parameter: "visible_vegetation",
  samePlaceEvidence: "",
  commonCoverage: "unknown",
  coverageDescription: "",
  excludedAreas: "",
  captureDifferences: "",
  conclusion: "",
  correctionReason: "",
  quantitative: false,
};
const revision = {
  entry: { id: uuid(2) },
  execution: {
    ...emptyExecution(uuid(5)),
    stage: "performed",
    dataBasis: "synthetic",
    actualDate: "2026-08-30",
    actualEndDate: "2026-08-31",
    method: "SYNTHETIC manual",
    performedBy: "SYNTHETIC",
    reach: "SYNTHETIC reach",
    sourceReference: "SYNTHETIC log",
    coverage: "limited",
    coverageDescription: "SYNTHETIC coverage",
  },
} as never;
const before = {
  id: uuid(3),
  projectId: uuid(9),
  sha256: "a".repeat(64),
  capturedAt: "2026-08-24",
} as never;
const after = {
  id: uuid(4),
  projectId: uuid(9),
  sha256: "b".repeat(64),
  capturedAt: "2026-09-07",
} as never;
const ready = {
  ...comparison,
  samePlaceEvidence: "SYNTHETIC mapped landmarks",
  commonCoverage: "limited" as const,
  coverageDescription: "SYNTHETIC visible reach",
  excludedAreas: "Canopy obscures the eastern bank",
  captureDifferences: "Different season and sun",
};
describe("parameter-dependent descriptive before/after", () => {
  it("does not pair two images automatically by project or filename", () => {
    expect(assessPhotoComparison(comparison, revision, revision, before, after).status).toBe(
      "insufficient",
    );
  });
  it("supports limited descriptive coverage without any improvement percentage", () => {
    expect(assessPhotoComparison(ready, revision, revision, before, after)).toEqual({
      status: "descriptive",
      gaps: [],
      quantitative: false,
    });
  });
  it("marks an altered execution revision for reassessment", () => {
    const changed = { ...(revision as object), entry: { id: uuid(6) } } as never;
    expect(assessPhotoComparison(ready, revision, changed, before, after).status).toBe(
      "reassessment_required",
    );
  });
  it("rejects hidden coverage as a zero result and requires opt-in explanation", () => {
    const result = assessPhotoComparison(
      { ...ready, excludedAreas: "" },
      revision,
      revision,
      before,
      after,
    );
    expect(result.status).toBe("insufficient");
    expect(result.gaps.join(" ")).toContain("skjulte");
  });
  it("does not infer performed cutting from a planned action", () => {
    const planned = { ...(revision as object), execution: emptyExecution(uuid(5)) } as never;
    expect(assessPhotoComparison(ready, planned, planned, before, after).status).toBe(
      "insufficient",
    );
  });
  it("rejects duplicate original, unknown date and wrong period", () => {
    for (const changed of [
      { ...(after as object), sha256: "a".repeat(64) },
      { ...(after as object), capturedAt: undefined },
      { ...(after as object), capturedAt: "2026-08-30" },
    ])
      expect(
        assessPhotoComparison(ready, revision, revision, before, changed as never).status,
      ).toBe("insufficient");
  });
  it("never grants measurement permission from Quick Orto or a pixel size", () => {
    expect(() => PhotoComparisonSchema.parse({ ...ready, quantitative: true })).toThrow();
    expect(assessPhotoComparison(ready, revision, revision, before, after).quantitative).toBe(
      false,
    );
  });
});
