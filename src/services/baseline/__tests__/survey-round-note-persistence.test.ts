import { describe, it, expect, vi } from "vitest";
import { makeRoundNoteFixture } from "@/services/baseline/__tests__/survey-round-note.fixtures";
import {
  buildSurveyRoundNoteManifestV1,
  SaveSurveyRoundNoteInputSchema,
  SurveyRoundNoteManifestSchema,
  surveyRoundNoteVersionFromRow,
  surveyRoundNoteCanonicalText,
} from "@/services/baseline/survey-round-note-persistence";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
describe("manual immutable note v1", () => {
  it("defaults an omitted proposed priority conservatively on input only", async () => {
    const f = await makeRoundNoteFixture();
    const { proposedPriority: _priority, ...manual } = f.noteInput.manual;
    expect(
      SaveSurveyRoundNoteInputSchema.parse({ ...f.noteInput, manual }).manual.proposedPriority,
    ).toBe("not_assessed");
    const { proposedPriority: _storedPriority, ...storedManual } = f.noteManifest.manual;
    expect(
      SurveyRoundNoteManifestSchema.safeParse({ ...f.noteManifest, manual: storedManual }).success,
    ).toBe(false);
  });
  it.each(["supports_reference", "does_not_support_reference", "inconclusive"] as const)(
    "saves a manual %s proposal without approval or inferred geometry",
    async (qualitativeAnswer) => {
      const f = await makeRoundNoteFixture(),
        before = structuredClone({ binding: f.binding, plan: f.plan });
      const m = await buildSurveyRoundNoteManifestV1(
        { ...f.noteInput, manual: { ...f.noteInput.manual, qualitativeAnswer } },
        f.binding,
        f.plan,
      );
      expect(m.manual.qualitativeAnswer).toBe(qualitativeAnswer);
      expect(m.status).toBe("draft_unreviewed");
      expect(m.sourceMetadata.capture).toEqual({
        capturedAtUtc: null,
        localTimestamp: null,
        offset: null,
        timezoneKnown: false,
        source: null,
        relationToPlannedWindow: "not_verified",
      });
      expect(m.sourceMetadata.cameraPosition).toBeNull();
      expect(m).not.toHaveProperty("acceptance");
      expect(m).not.toHaveProperty("observedAt");
      expect(m).not.toHaveProperty("objectGeometry");
      expect({ binding: f.binding, plan: f.plan }).toEqual(before);
    },
  );
  it("retains saved local time and camera-only position without inventing UTC/object position", async () => {
    const f = await makeRoundNoteFixture(true);
    expect(f.noteManifest.sourceMetadata.capture.localTimestamp).toBe("2026-10-01T09:30:00");
    expect(f.noteManifest.sourceMetadata.capture.capturedAtUtc).toBeNull();
    expect(f.noteManifest.sourceMetadata.cameraPosition?.geometryRole).toBe("camera_position_only");
    expect(JSON.stringify(f.noteManifest)).not.toContain("intents/");
    expect(JSON.stringify(f.noteManifest)).not.toContain("serial");
  });
  it("reopens the same immutable version without network", async () => {
    const f = await makeRoundNoteFixture(),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      expect(
        (await surveyRoundNoteVersionFromRow(f.noteRow, f.binding, f.plan)).manifestSha256,
      ).toBe(f.noteRow.manifest_sha256);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each(["projectId", "mediaBindingId", "roundVersionId", "baselineId", "planId"] as const)(
    "rejects a different %s",
    async (key) => {
      const f = await makeRoundNoteFixture();
      await expect(
        buildSurveyRoundNoteManifestV1(
          { ...f.noteInput, [key]: "ffffffff-0000-4000-8000-000000000001" },
          f.binding,
          f.plan,
        ),
      ).rejects.toThrow();
    },
  );
  it.each(["mediaBindingSha256", "roundSha256", "baselineSha256", "planSha256"] as const)(
    "rejects wrong %s",
    async (key) => {
      const f = await makeRoundNoteFixture();
      await expect(
        buildSurveyRoundNoteManifestV1(
          { ...f.noteInput, [key]: "f".repeat(64) },
          f.binding,
          f.plan,
        ),
      ).rejects.toThrow();
    },
  );
  it.each(["unknown", "species", "hydraulic", "maintenance"])(
    "rejects unsupported %s question",
    async (kind) => {
      const f = await makeRoundNoteFixture();
      await expect(
        buildSurveyRoundNoteManifestV1(
          { ...f.noteInput, questionId: `verification:${f.noteInput.baselineId}:${kind}:v1` },
          f.binding,
          f.plan,
        ),
      ).rejects.toThrow();
    },
  );
  it("rejects question removed from saved assignment even with updated assignment checksum", async () => {
    const f = await makeRoundNoteFixture(),
      binding = structuredClone(f.binding);
    binding.manifest.questionIds = [];
    binding.manifestSha256 = await baselineSha256(binding.manifest);
    await expect(
      buildSurveyRoundNoteManifestV1(
        { ...f.noteInput, mediaBindingSha256: binding.manifestSha256 },
        binding,
        f.plan,
      ),
    ).rejects.toThrow();
  });
  it("rejects a changed plan question with unchanged plan hash", async () => {
    const f = await makeRoundNoteFixture(),
      plan = structuredClone(f.plan);
    plan.manifest.questions[0].question = "Different question";
    await expect(buildSurveyRoundNoteManifestV1(f.noteInput, f.binding, plan)).rejects.toThrow();
  });
  it.each(["manualStatement", "uncertainty", "proposedFollowup"] as const)(
    "requires bounded meaningful %s",
    async (key) => {
      const f = await makeRoundNoteFixture();
      for (const value of [
        "",
        "   ",
        "\u0085",
        "line\nline",
        "x".repeat(key === "manualStatement" ? 2001 : 1001),
      ])
        expect(
          SaveSurveyRoundNoteInputSchema.safeParse({
            ...f.noteInput,
            manual: { ...f.noteInput.manual, [key]: value },
          }).success,
        ).toBe(false);
    },
  );
  it.each([
    "professionalApproved",
    "reportReady",
    "observedAt",
    "geometry",
    "photoViewed",
    "createdBy",
    "expectedCallerUserId",
  ])("rejects injected %s", async (key) => {
    const f = await makeRoundNoteFixture();
    expect(SaveSurveyRoundNoteInputSchema.safeParse({ ...f.noteInput, [key]: true }).success).toBe(
      false,
    );
    expect(
      SurveyRoundNoteManifestSchema.safeParse({ ...f.noteManifest, [key]: true }).success,
    ).toBe(false);
  });
  it("rejects arbitrary outcomes and extra manual fields", async () => {
    const f = await makeRoundNoteFixture();
    for (const qualitativeAnswer of ["supported", "species_present", "approved", "site_visit"])
      expect(
        SaveSurveyRoundNoteInputSchema.safeParse({
          ...f.noteInput,
          manual: { ...f.noteInput.manual, qualitativeAnswer },
        }).success,
      ).toBe(false);
    expect(
      SaveSurveyRoundNoteInputSchema.safeParse({
        ...f.noteInput,
        manual: { ...f.noteInput.manual, approval: true },
      }).success,
    ).toBe(false);
  });
  it.each([
    "manifest_sha256",
    "original_sha256",
    "original_validation_sha256",
    "baseline_sha256",
    "media_binding_sha256",
  ])("rejects saved %s tamper", async (key) => {
    const f = await makeRoundNoteFixture();
    await expect(
      surveyRoundNoteVersionFromRow({ ...f.noteRow, [key]: "f".repeat(64) }, f.binding, f.plan),
    ).rejects.toThrow();
  });
  it("rejects internally rehashed invented capture metadata", async () => {
    const f = await makeRoundNoteFixture(),
      m = structuredClone(f.noteManifest);
    m.sourceMetadata.capture.capturedAtUtc = "2026-10-14T00:00:00Z";
    await expect(
      surveyRoundNoteVersionFromRow(
        { ...f.noteRow, manifest: m, manifest_sha256: await baselineSha256(m) },
        f.binding,
        f.plan,
      ),
    ).rejects.toThrow();
  });
  it("keeps logical identity distinct from project cursor and rejects revised versions", async () => {
    const f = await makeRoundNoteFixture();
    const n = await surveyRoundNoteVersionFromRow(
      { ...f.noteRow, version_no: 19 },
      f.binding,
      f.plan,
    );
    expect(n.version).toBe(19);
    expect(n.noteVersion).toBe(1);
    expect(n.logicalNoteId).toBe(f.noteInput.logicalNoteId);
    await expect(
      surveyRoundNoteVersionFromRow({ ...f.noteRow, note_version_no: 2 }, f.binding, f.plan),
    ).rejects.toThrow();
  });
  it("enforces UTF-8 byte bound independently of character limits", () => {
    expect(() => surveyRoundNoteCanonicalText({ large: "æ".repeat(9000) })).toThrow();
  });
});
