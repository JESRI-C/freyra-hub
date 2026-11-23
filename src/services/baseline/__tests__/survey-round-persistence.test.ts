import { describe, expect, it, vi } from "vitest";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  buildVerificationPlanManifest,
  verificationPlanVersionFromRow,
} from "@/services/baseline/verification-plan-persistence";
import {
  buildSurveyRoundManifestV1,
  MAX_SURVEY_ROUND_BYTES,
  SaveSurveyRoundInputSchema,
  surveyRoundCanonicalText,
  surveyRoundSummaryFromRow,
  surveyRoundVersionFromRow,
} from "@/services/baseline/survey-round-persistence";
import { makeSnapshot } from "@/services/baseline/__tests__/public-baseline.fixtures";
import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";

describe("immutable draft survey round v1", () => {
  it.each(["before", "after", "control"] as const)(
    "records %s intent without claims or mutable input",
    async (kind) => {
      const { input, baseline, plan } = await makeRoundFixture();
      const original = canonicalBaselineJson({ baseline, plan, input });
      const manifest = await buildSurveyRoundManifestV1({ ...input, kind }, baseline, plan);
      expect(manifest.status).toBe("draft");
      expect(manifest.acceptance).toEqual({
        municipalScopeApproved: false,
        professionalApproved: false,
        reportAccepted: false,
      });
      expect(manifest.recordingWindow).toEqual({
        ...input.recordingWindow,
        timeZone: "Europe/Copenhagen",
        datePrecision: "calendar_date",
        actualCoverage: "not_verified",
      });
      expect(manifest.questionIds).toEqual(plan.manifest.questions.map((question) => question.id));
      expect(manifest).not.toHaveProperty("photos");
      expect(manifest).not.toHaveProperty("observations");
      expect(manifest).not.toHaveProperty("metrics");
      expect(manifest).not.toHaveProperty("reviewer");
      expect(canonicalBaselineJson({ baseline, plan, input })).toBe(original);
    },
  );

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "0000-01-01",
    "2026-1-01",
    "2026-10-13T12:00:00Z",
    "not-date",
  ])("rejects invalid date %s", async (dateFrom) => {
    const { input } = await makeRoundFixture();
    expect(() =>
      SaveSurveyRoundInputSchema.parse({
        ...input,
        recordingWindow: { dateFrom, dateTo: "2026-11-10" },
      }),
    ).toThrow();
  });
  it("accepts an actual leap day and one calendar day without inventing camera times", async () => {
    const { input, baseline, plan } = await makeRoundFixture();
    const manifest = await buildSurveyRoundManifestV1(
      { ...input, recordingWindow: { dateFrom: "2028-02-29", dateTo: "2028-02-29" } },
      baseline,
      plan,
    );
    expect(manifest.recordingWindow.dateFrom).toBe("2028-02-29");
    expect(manifest.recordingWindow.actualCoverage).toBe("not_verified");
  });
  it.each(["", "   ", " leading", "trailing ", "bad\nline", "x".repeat(121)])(
    "rejects invalid title",
    async (title) => {
      const { input } = await makeRoundFixture();
      expect(() => SaveSurveyRoundInputSchema.parse({ ...input, title })).toThrow();
    },
  );
  it("denies a backwards window, empty selection, duplicates and unknown actual questions", async () => {
    const { input, baseline, plan } = await makeRoundFixture();
    for (const change of [
      { recordingWindow: { dateFrom: "2026-11-10", dateTo: "2026-10-13" } },
      { questionIds: [] },
      { questionIds: [input.questionIds[0], input.questionIds[0]] },
      { questionIds: ["invented-maintenance-need"] },
    ])
      await expect(
        buildSurveyRoundManifestV1({ ...input, ...change }, baseline, plan),
      ).rejects.toThrow();
  });
  it.each(["baselineSha256", "planSha256", "baselineId", "planId", "projectId"])(
    "rejects the mismatched %s binding",
    async (field) => {
      const { input, baseline, plan } = await makeRoundFixture();
      const value = field.endsWith("Sha256")
        ? "a".repeat(64)
        : "99000000-0000-4000-8000-000000000001";
      await expect(
        buildSurveyRoundManifestV1({ ...input, [field]: value }, baseline, plan),
      ).rejects.toThrow();
    },
  );
  it("rejects a self-consistent but altered plan, a corrupted baseline and a plan with no actual questions", async () => {
    const { input, baseline, plan } = await makeRoundFixture();
    const manifest = structuredClone(plan.manifest);
    manifest.questions[0].method = "Forged method";
    const altered = { ...plan, manifest, manifestSha256: await baselineSha256(manifest) };
    await expect(
      buildSurveyRoundManifestV1(
        { ...input, planSha256: altered.manifestSha256 },
        baseline,
        altered,
      ),
    ).rejects.toThrow("præcise gemte");
    await expect(
      buildSurveyRoundManifestV1(input, { ...baseline, manifestSha256: "a".repeat(64) }, plan),
    ).rejects.toThrow();
    const noReference = structuredClone(baseline.manifest);
    noReference.sources[0].status = "failed";
    noReference.sources[0].mode = "error";
    noReference.sources[0].payload = null;
    noReference.sources[0].payloadSha256 = null;
    noReference.sources[0].error = { code: "failed", message: "Synthetic missing reference" };
    const gapBaseline = await makeSnapshot(noReference);
    const gapPlanManifest = await buildVerificationPlanManifest(gapBaseline);
    const gapPlan = {
      ...plan,
      baselineSha256: gapBaseline.manifestSha256,
      manifest: gapPlanManifest,
      manifestSha256: await baselineSha256(gapPlanManifest),
    };
    await expect(
      buildSurveyRoundManifestV1(
        {
          ...input,
          baselineSha256: gapBaseline.manifestSha256,
          planSha256: gapPlan.manifestSha256,
        },
        gapBaseline,
        gapPlan,
      ),
    ).rejects.toThrow("faktiske spørgsmål");
  });
  it("reloads exact saved content with no upstream fetch and a stable separate logical/version identity", async () => {
    const { row, baseline, planRow } = await makeRoundFixture();
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    try {
      const version = await surveyRoundVersionFromRow(row, baseline, planRow);
      expect(version.id).toBe(row.id);
      expect(version.roundId).toBe(row.round_id);
      expect(version.id).not.toBe(version.roundId);
      expect(version.roundVersion).toBe(1);
      expect(version.supersedesId).toBeNull();
      expect(version.manifest).toEqual(row.manifest);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it.each([
    "status",
    "kind",
    "title",
    "recording_date_from",
    "plan_sha256",
    "baseline_sha256",
    "builder_version",
    "round_version_no",
    "supersedes_id",
  ])("rejects corrupted stored metadata %s", async (field) => {
    const { row, baseline, planRow } = await makeRoundFixture();
    const changed =
      field === "round_version_no"
        ? 2
        : field === "supersedes_id"
          ? row.id
          : field.endsWith("sha256")
            ? "a".repeat(64)
            : "changed";
    await expect(
      surveyRoundVersionFromRow({ ...row, [field]: changed }, baseline, planRow),
    ).rejects.toThrow();
  });
  it("rejects forged approvals, unknown nested keys, changed question IDs and any content checksum mismatch", async () => {
    const { row, baseline, planRow } = await makeRoundFixture();
    const candidates = [
      { ...row.manifest, acceptance: { ...row.manifest.acceptance, reportAccepted: true } },
      { ...row.manifest, acceptance: { ...row.manifest.acceptance, reviewer: "somebody" } },
      {
        ...row.manifest,
        recordingWindow: { ...row.manifest.recordingWindow, actualCoverage: "complete" },
      },
      { ...row.manifest, questionIds: ["invented"] },
      { ...row.manifest, metrics: { depth: 1 } },
    ];
    for (const manifest of candidates)
      await expect(
        surveyRoundVersionFromRow(
          { ...row, manifest, manifest_sha256: await baselineSha256(manifest) },
          baseline,
          planRow,
        ),
      ).rejects.toThrow();
    await expect(
      surveyRoundVersionFromRow({ ...row, manifest_sha256: "a".repeat(64) }, baseline, planRow),
    ).rejects.toThrow("checksum");
  });
  it("uses bounded UTF-8 bytes and checks calendar order in metadata-only summaries", async () => {
    const { row } = await makeRoundFixture();
    expect(() =>
      surveyRoundCanonicalText({ data: "ø".repeat(MAX_SURVEY_ROUND_BYTES / 2) }),
    ).toThrow("64 KiB");
    expect(() => surveyRoundSummaryFromRow({ ...row, recording_date_to: "2026-10-12" })).toThrow();
    const summary = surveyRoundSummaryFromRow(row);
    expect(summary).not.toHaveProperty("manifest");
    expect(summary.status).toBe("draft");
  });
});
