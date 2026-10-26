import { describe, expect, it, vi } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  buildSurveyRoundMediaManifestV1,
  surveyRoundMediaCanonicalText,
  surveyRoundMediaVersionFromRow,
  SaveSurveyRoundMediaInputSchema,
} from "@/services/baseline/survey-round-media-persistence";
import { makeRoundMediaFixture } from "@/services/baseline/__tests__/survey-round-media.fixtures";
describe("immutable round-original assignment contract", () => {
  it("keeps unknown capture unknown and planned Copenhagen window separate", async () => {
    const f = await makeRoundMediaFixture();
    expect(f.bindingManifest.sourceMetadata.capture).toEqual({
      capturedAtUtc: null,
      localTimestamp: null,
      offset: null,
      timezoneKnown: false,
      source: null,
      relationToPlannedWindow: "not_verified",
    });
    expect(f.bindingManifest.sourceMetadata.cameraPosition).toBeNull();
    expect(f.bindingManifest).not.toHaveProperty("recordingWindow");
    expect(f.round.manifest.recordingWindow.timeZone).toBe("Europe/Copenhagen");
    expect(Object.values(f.bindingManifest.acceptance)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
  it("projects bounded source capture/GPS without raw EXIF, serials, altitudes or object geometry", async () => {
    const f = await makeRoundMediaFixture(true),
      text = surveyRoundMediaCanonicalText(f.bindingManifest);
    expect(f.bindingManifest.sourceMetadata.capture.localTimestamp).toBe("2026-10-01T09:30:00");
    expect(f.bindingManifest.sourceMetadata.cameraPosition).toEqual({
      latitude: 55.35,
      longitude: 9.26,
      source: "exif",
      geometryRole: "camera_position_only",
      objectGeometry: null,
      footprint: null,
    });
    for (const forbidden of [
      "RAW-EXIF",
      "PRIVATE-XMP",
      "CAMERA-SERIAL",
      "NOT-A-GEOMETRY",
      "storagePath",
      "file_path",
    ])
      expect(text).not.toContain(forbidden);
  });
  it("preserves explicit source UTC without substituting it for the planned window", async () => {
    const f = await makeRoundMediaFixture(true);
    f.validation.metadata!.capture = {
      timezoneKnown: true,
      localTimestamp: "2026-10-01T09:30:00",
      capturedAtUtc: "2026-10-01T07:30:00Z",
      offset: "+02:00",
      source: "exif-offset",
    } as never;
    f.media.original_validation_sha256 = await baselineSha256(f.validation);
    const result = await buildSurveyRoundMediaManifestV1(
      f.bindingInput,
      f.round,
      f.media,
      f.validation,
    );
    expect(result.sourceMetadata.capture).toMatchObject({
      capturedAtUtc: "2026-10-01T07:30:00Z",
      timezoneKnown: true,
      relationToPlannedWindow: "not_verified",
    });
  });
  it.each(["projectId", "roundVersionId", "baselineId", "planId", "mediaId"])(
    "rejects a changed %s identity",
    async (key) => {
      const f = await makeRoundMediaFixture();
      await expect(
        buildSurveyRoundMediaManifestV1(
          { ...f.bindingInput, [key]: "ffffffff-0000-4000-8000-000000000001" },
          f.round,
          f.media,
          f.validation,
        ),
      ).rejects.toThrow();
    },
  );
  it.each(["roundSha256", "baselineSha256", "planSha256"])(
    "rejects a changed %s pin",
    async (key) => {
      const f = await makeRoundMediaFixture();
      await expect(
        buildSurveyRoundMediaManifestV1(
          { ...f.bindingInput, [key]: "f".repeat(64) },
          f.round,
          f.media,
          f.validation,
        ),
      ).rejects.toThrow();
    },
  );
  it.each([
    { questionIds: [] },
    { questionIds: ["not-selected-in-saved-round"] },
    { questionIds: ["duplicate", "duplicate"] },
  ])("rejects unavailable, missing or duplicate question set %j", async ({ questionIds }) => {
    const f = await makeRoundMediaFixture();
    await expect(
      buildSurveyRoundMediaManifestV1(
        { ...f.bindingInput, questionIds },
        f.round,
        f.media,
        f.validation,
      ),
    ).rejects.toThrow();
  });
  it("rejects a plan question excluded from this saved round", async () => {
    const f = await makeRoundMediaFixture();
    f.round.manifest.questionIds = ["other-saved-selection"];
    f.round.manifestSha256 = await baselineSha256(f.round.manifest);
    await expect(
      buildSurveyRoundMediaManifestV1(
        { ...f.bindingInput, roundSha256: f.round.manifestSha256 },
        f.round,
        f.media,
        f.validation,
      ),
    ).rejects.toThrow("valgte spørgsmål");
  });
  it.each([
    "original_sha256",
    "original_validation_sha256",
    "storage_object_id",
    "storage_object_version",
    "storage_object_updated_at",
  ])("rejects changed original pin %s", async (key) => {
    const f = await makeRoundMediaFixture();
    const altered = key.endsWith("sha256")
      ? "f".repeat(64)
      : key.endsWith("id")
        ? "ffffffff-0000-4000-8000-000000000001"
        : key.endsWith("updated_at")
          ? "2026-10-01T00:00:00Z"
          : "changed";
    await expect(
      buildSurveyRoundMediaManifestV1(
        f.bindingInput,
        f.round,
        { ...f.media, [key]: altered },
        f.validation,
      ),
    ).rejects.toThrow();
  });
  it.each(["pixelDecoded", "georeferenced", "reportEligible"])(
    "rejects elevated source flag %s",
    async (key) => {
      const f = await makeRoundMediaFixture();
      const validation = { ...f.validation, [key]: true };
      f.media.original_validation_sha256 = await baselineSha256(validation);
      await expect(
        buildSurveyRoundMediaManifestV1(f.bindingInput, f.round, f.media, validation),
      ).rejects.toThrow();
    },
  );
  it.each([
    { timezoneKnown: true },
    { timezoneKnown: false, capturedAtUtc: "2026-10-01T00:00:00Z" },
    { timezoneKnown: false, offset: "+02:00" },
  ])("rejects ambiguous timezone %j", async (capture) => {
    const f = await makeRoundMediaFixture(true);
    f.validation.metadata!.capture = capture as never;
    f.media.original_validation_sha256 = await baselineSha256(f.validation);
    await expect(
      buildSurveyRoundMediaManifestV1(f.bindingInput, f.round, f.media, f.validation),
    ).rejects.toThrow("tidszone");
  });
  it("rejects free paths, caller approval, raw metadata and detach/revision inputs", async () => {
    const fixture = await makeRoundMediaFixture();
    for (const extra of [
      { path: "free/path" },
      { approved: true },
      { metadata: {} },
      { detached: true },
      { supersedesId: "x" },
    ])
      expect(
        SaveSurveyRoundMediaInputSchema.safeParse({ ...fixture.bindingInput, ...extra }).success,
      ).toBe(false);
  });
  it("replays exact saved metadata and hashes without fetch or Storage", async () => {
    const f = await makeRoundMediaFixture(true),
      network = vi.fn(() => {
        throw new Error("No network allowed");
      });
    vi.stubGlobal("fetch", network);
    try {
      expect(
        (await surveyRoundMediaVersionFromRow(f.bindingRow, f.round, f.media, f.validation))
          .manifest,
      ).toEqual(f.bindingManifest);
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    "project_id",
    "round_version_id",
    "baseline_id",
    "plan_id",
    "media_id",
    "original_sha256",
    "original_validation_sha256",
    "storage_object_id",
    "storage_object_version",
    "storage_object_updated_at",
    "manifest_sha256",
  ])("fails closed when saved row %s is changed", async (key) => {
    const f = await makeRoundMediaFixture();
    const value = key.endsWith("sha256")
      ? "f".repeat(64)
      : key.endsWith("_id")
        ? "ffffffff-0000-4000-8000-000000000001"
        : key.endsWith("updated_at")
          ? "2026-01-01T00:00:00Z"
          : "changed";
    await expect(
      surveyRoundMediaVersionFromRow(
        { ...f.bindingRow, [key]: value },
        f.round,
        f.media,
        f.validation,
      ),
    ).rejects.toThrow();
  });
  it("rejects recomputed manifest with invented UTC or approval", async () => {
    const f = await makeRoundMediaFixture();
    const manifest = structuredClone(f.bindingManifest);
    manifest.sourceMetadata.capture.capturedAtUtc = "2026-10-13T12:00:00Z";
    await expect(
      surveyRoundMediaVersionFromRow(
        {
          ...f.bindingRow,
          manifest,
          manifest_sha256: await baselineSha256(manifest),
        },
        f.round,
        f.media,
        f.validation,
      ),
    ).rejects.toThrow();
    const promoted = structuredClone(f.bindingManifest);
    promoted.acceptance.professionalApproved = true as never;
    await expect(
      surveyRoundMediaVersionFromRow(
        {
          ...f.bindingRow,
          manifest: promoted,
          manifest_sha256: await baselineSha256(promoted),
        },
        f.round,
        f.media,
        f.validation,
      ),
    ).rejects.toThrow();
  });
});
