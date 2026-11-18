import { describe, expect, it } from "vitest";
import { emptyExecution } from "../action-execution";
import {
  assessPhotoComparison,
  PhotoComparisonSchema,
  suggestPhotoPairs,
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

it("suggests dated originals by saved pairing or nearby camera position without assessing their subject", () => {
  const execution = {
    ...emptyExecution(uuid(5)),
    stage: "performed" as const,
    actualDate: "2026-08-30",
    actualEndDate: "2026-08-31",
  };
  const photo = (id: number, date: string, lat: number, sha256: string) => ({
    id: uuid(id),
    projectId: uuid(9),
    title: `Photo ${id}`,
    capturedAt: date,
    coordinates: { lat, lng: 9 },
    sha256,
    category: "drone_image" as const,
    source: "drone" as const,
    status: "ready" as const,
    url: "",
    uploadedAt: date,
    tags: [],
    isReportReady: false,
  });
  const early = photo(11, "2026-08-24", 55, "a".repeat(64));
  const nearby = photo(12, "2026-09-07", 55.0001, "b".repeat(64));
  const duplicate = photo(13, "2026-09-07", 55, early.sha256);
  const sameDay = photo(14, "2026-08-31", 55, "c".repeat(64));
  const distant = photo(15, "2026-09-07", 55.002, "d".repeat(64));
  const linked = {
    ...photo(16, "2026-09-07", 55.002, "e".repeat(64)),
    coordinates: undefined,
    beforeMediaId: early.id,
  };
  const foreign = { ...photo(17, "2026-09-07", 55, "f".repeat(64)), projectId: uuid(18) };
  const photos = [early, nearby, duplicate, sameDay, distant, linked, foreign];

  expect(
    suggestPhotoPairs(photos, early.projectId, execution).map(({ before, after, linked }) => [
      before.id,
      after.id,
      linked,
    ]),
  ).toEqual([
    [early.id, linked.id, true],
    [early.id, nearby.id, false],
  ]);
  expect(suggestPhotoPairs(photos, early.projectId, { ...execution, stage: "planned" })).toEqual(
    [],
  );
  expect(
    suggestPhotoPairs(photos, early.projectId, undefined, {
      earlier: "2026-08-24",
      later: "2026-09-07",
    }).map(({ after }) => after.id),
  ).toEqual([linked.id, nearby.id]);
  expect(
    suggestPhotoPairs(photos, early.projectId, undefined, {
      earlier: "2026-09-07",
      later: "2026-08-24",
    }),
  ).toEqual([]);
  const localDates = [early, nearby].map(({ capturedAt, ...photo }) => ({
    ...photo,
    localCaptureDate: capturedAt,
  }));
  expect(
    suggestPhotoPairs(localDates, early.projectId, undefined, {
      earlier: "2026-08-24",
      later: "2026-09-07",
    }),
  ).toMatchObject([{ before: { id: early.id }, after: { id: nearby.id } }]);
});

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
    const result = assessPhotoComparison(ready, planned, planned, before, after);
    expect(result.status).toBe("visual_only");
    expect(result.quantitative).toBe(false);
    expect(result.gaps.join(" ")).toContain("arbejdsdato er ukendt");
  });
  it("rejects duplicate originals, unknown dates and reversed capture order", () => {
    for (const changed of [
      { ...(after as object), sha256: "a".repeat(64) },
      { ...(after as object), capturedAt: undefined },
      { ...(after as object), capturedAt: "2026-08-23" },
    ])
      expect(
        assessPhotoComparison(ready, revision, revision, before, changed as never).status,
      ).toBe("insufficient");
  });
  it("keeps ordered photos usable for description when they do not bracket the work", () => {
    const changed = { ...(after as object), capturedAt: "2026-08-30" } as never;
    const result = assessPhotoComparison(ready, revision, revision, before, changed);
    expect(result.status).toBe("visual_only");
    expect(result.gaps.join(" ")).toContain("omslutter ikke");
  });
  it("never grants measurement permission from Quick Orto or a pixel size", () => {
    expect(() => PhotoComparisonSchema.parse({ ...ready, quantitative: true })).toThrow();
    expect(assessPhotoComparison(ready, revision, revision, before, after).quantitative).toBe(
      false,
    );
  });
});
