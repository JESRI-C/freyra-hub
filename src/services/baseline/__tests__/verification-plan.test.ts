import { describe, expect, it } from "vitest";
import { baselineSha256 } from "../public-baseline-service";
import { createDraftVerificationPlan } from "../verification-plan";
import { makeSnapshot } from "./public-baseline.fixtures";

describe("source-bound verification drafts", () => {
  it("generates a stable location question with frozen dates, source, AOI, required evidence and result options", async () => {
    const snapshot = await makeSnapshot();
    const first = await createDraftVerificationPlan(snapshot);
    const second = await createDraftVerificationPlan(structuredClone(snapshot));
    expect(first).toEqual(second);
    expect(first.status).toBe("draft");
    expect(first.questions).toHaveLength(1);
    const question = first.questions[0];
    expect(question.snapshotId).toBe(snapshot.id);
    expect(question.snapshotSha256).toBe(snapshot.manifestSha256);
    expect(question.sourceIds).toEqual(["official-watercourse-reference"]);
    expect(question.area.aoi).toEqual(snapshot.manifest.project.polygon);
    expect(question.dates).toMatchObject({
      baselineFrom: "2026-09-01",
      baselineTo: "2026-09-30",
      sourceFetchedAt: "2026-10-13T12:00:00.000Z",
    });
    expect(question.requiredEvidence).toContainEqual(
      expect.objectContaining({ kind: "original_photo", requirement: "required" }),
    );
    expect(question.allowedResults).toEqual(["supported", "refuted", "inconclusive", "site_visit"]);
    expect(question.result).toBeNull();
    expect(question.uncertainty.length).toBeGreaterThan(0);
  });

  it("keeps uncollected public sources as data gaps, without deriving drone findings", async () => {
    const plan = await createDraftVerificationPlan(await makeSnapshot());
    expect(plan.baselineDataGaps).toHaveLength(6);
    expect(
      plan.questions.every(
        (question) =>
          question.sourceIds.length === 1 &&
          question.sourceIds[0] === "official-watercourse-reference",
      ),
    ).toBe(true);
    expect(
      plan.questions.some((question) =>
        /vandføring|vedligeholdelse|arter|vegetation/i.test(question.title),
      ),
    ).toBe(false);
  });

  it("emits no location question when the reference does not overlap the project AOI", async () => {
    const snapshot = await makeSnapshot();
    snapshot.manifest.project.polygon = {
      type: "Polygon",
      coordinates: [
        [
          [10, 56],
          [10.1, 56],
          [10.1, 56.1],
          [10, 56.1],
          [10, 56],
        ],
      ],
    };
    snapshot.manifest.project.polygonSha256 = await baselineSha256(
      snapshot.manifest.project.polygon,
    );
    for (const source of snapshot.manifest.sources)
      source.query.geometrySha256 = snapshot.manifest.project.polygonSha256;
    snapshot.manifestSha256 = await baselineSha256(snapshot.manifest);
    const plan = await createDraftVerificationPlan(snapshot);
    expect(plan.questions).toEqual([]);
    expect(plan.warnings).toContainEqual(expect.stringContaining("overlapper ikke"));
  });

  it("refuses an altered snapshot rather than silently making a new plan", async () => {
    const snapshot = await makeSnapshot();
    snapshot.manifest.project.name = "Altered after capture";
    await expect(createDraftVerificationPlan(snapshot)).rejects.toThrow("uændret baselineversion");
  });

  it("does not mutate or approve the source snapshot", async () => {
    const snapshot = await makeSnapshot();
    const original = structuredClone(snapshot);
    const plan = await createDraftVerificationPlan(snapshot);
    plan.questions[0].area.aoi.coordinates[0][0][0] = 12;
    expect(snapshot).toEqual(original);
    expect(plan.questions[0].result).toBeNull();
  });
});
