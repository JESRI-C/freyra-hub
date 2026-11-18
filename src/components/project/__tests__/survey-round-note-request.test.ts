import { describe, expect, it } from "vitest";
import { makeRoundNoteFixture } from "@/services/baseline/__tests__/survey-round-note.fixtures";
import { surveyRoundNoteVersionFromRow } from "@/services/baseline/survey-round-note-persistence";
import {
  assertSurveyRoundNoteMatchesScope,
  assertSurveyRoundNoteSaved,
  createSurveyRoundNoteReceipt,
  readSurveyRoundNoteReceipt,
  surveyRoundNoteQuestions,
  surveyRoundNoteReceiptKey,
} from "../survey-round-note-request";

async function fixture() {
  const f = await makeRoundNoteFixture();
  return {
    ...f,
    scope: { actorId: f.noteRow.created_by, binding: f.binding, round: f.round, plan: f.plan },
    version: await surveyRoundNoteVersionFromRow(f.noteRow, f.binding, f.plan),
  };
}
describe("exact immutable manual-note receipts", () => {
  it("reuses the real pure-builder fixture, pins every input, and round-trips without URLs or approval", async () => {
    const f = await fixture();
    const receipt = await createSurveyRoundNoteReceipt(
      f.scope,
      f.noteInput.questionId,
      f.noteInput.manual,
      f.noteInput.requestId,
      f.noteInput.logicalNoteId,
    );
    expect(readSurveyRoundNoteReceipt(JSON.stringify(receipt), f.scope)).toEqual(receipt);
    await expect(assertSurveyRoundNoteSaved(f.version, receipt, f.scope)).resolves.toBeUndefined();
    expect(surveyRoundNoteQuestions(f.scope).map((q) => q.id)).toEqual([f.noteInput.questionId]);
    expect(surveyRoundNoteReceiptKey(f.scope)).toContain(f.binding.id);
    for (const forbidden of ["signedUrl", "storagePath", "professionalApproved", "reportEligible"])
      expect(JSON.stringify(receipt)).not.toContain(forbidden);
    expect(receipt.input.manual.proposedPriority).toBe("not_assessed");
  });
  it.each([
    "caller",
    "binding",
    "bindingHash",
    "roundHash",
    "baselineHash",
    "planHash",
    "original",
    "question",
  ])("rejects a stored receipt after %s changes", async (change) => {
    const f = await fixture();
    const receipt = await createSurveyRoundNoteReceipt(
      f.scope,
      f.noteInput.questionId,
      f.noteInput.manual,
      f.noteInput.requestId,
      f.noteInput.logicalNoteId,
    );
    if (change === "caller") f.scope.actorId = "a9000000-0000-4000-8000-000000000001";
    if (change === "binding") f.scope.binding.id = "a9000000-0000-4000-8000-000000000001";
    if (change === "bindingHash") f.scope.binding.manifestSha256 = "a".repeat(64);
    if (change === "roundHash") f.scope.round.manifestSha256 = "a".repeat(64);
    if (change === "baselineHash") f.scope.round.baselineSha256 = "a".repeat(64);
    if (change === "planHash") f.scope.round.planSha256 = "a".repeat(64);
    if (change === "original") f.scope.binding.manifest.originalSha256 = "f".repeat(64);
    if (change === "question") f.scope.binding.manifest.questionIds = [];
    expect(() => readSurveyRoundNoteReceipt(JSON.stringify(receipt), f.scope)).toThrow();
  });
  it.each(["actor", "request", "logical", "manual", "hash", "binding", "source", "status"])(
    "rejects a mismatched saved %s",
    async (change) => {
      const f = await fixture();
      const receipt = await createSurveyRoundNoteReceipt(
        f.scope,
        f.noteInput.questionId,
        f.noteInput.manual,
        f.noteInput.requestId,
        f.noteInput.logicalNoteId,
      );
      const v = structuredClone(f.version);
      if (change === "actor") v.createdBy = "a9000000-0000-4000-8000-000000000001";
      if (change === "request") v.requestId = "a9000000-0000-4000-8000-000000000001";
      if (change === "logical") v.logicalNoteId = "a9000000-0000-4000-8000-000000000001";
      if (change === "manual") v.manifest.manual.manualStatement = "En anden manuel tekst.";
      if (change === "hash") v.manifestSha256 = "a".repeat(64);
      if (change === "binding") v.manifest.mediaBindingSha256 = "a".repeat(64);
      if (change === "source")
        v.manifest.sourceMetadata.capture.relationToPlannedWindow = "verified" as never;
      if (change === "status") v.manifest.status = "approved" as never;
      await expect(assertSurveyRoundNoteSaved(v, receipt, f.scope)).rejects.toThrow();
    },
  );
  it("rejects malformed, oversized, foreign-field or control-text receipts and unsupported questions", async () => {
    const f = await fixture();
    const receipt = await createSurveyRoundNoteReceipt(
      f.scope,
      f.noteInput.questionId,
      f.noteInput.manual,
      f.noteInput.requestId,
      f.noteInput.logicalNoteId,
    );
    expect(() => readSurveyRoundNoteReceipt("broken", f.scope)).toThrow();
    expect(() => readSurveyRoundNoteReceipt(" ".repeat(32769), f.scope)).toThrow();
    expect(() =>
      readSurveyRoundNoteReceipt(JSON.stringify({ ...receipt, signedUrl: "synthetic" }), f.scope),
    ).toThrow();
    await expect(
      createSurveyRoundNoteReceipt(
        f.scope,
        "other-question",
        f.noteInput.manual,
        f.noteInput.requestId,
        f.noteInput.logicalNoteId,
      ),
    ).rejects.toThrow();
    await expect(
      createSurveyRoundNoteReceipt(
        f.scope,
        f.noteInput.questionId,
        { ...f.noteInput.manual, manualStatement: "line\nbreak" },
        f.noteInput.requestId,
        f.noteInput.logicalNoteId,
      ),
    ).rejects.toThrow();
  });
  it("accepts an independently created author's unreviewed note for read-only display", async () => {
    const f = await fixture();
    f.version.createdBy = "a9000000-0000-4000-8000-000000000001";
    await expect(assertSurveyRoundNoteMatchesScope(f.version, f.scope)).resolves.toBeUndefined();
  });
});
