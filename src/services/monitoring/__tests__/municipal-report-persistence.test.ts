import { describe, expect, it, vi } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { municipalReportCanonicalText, type MunicipalReportManifest } from "../municipal-report";
import {
  GetMunicipalReportInputSchema,
  ListMunicipalReportsInputSchema,
  MUNICIPAL_REPORT_SELECT,
  MUNICIPAL_REPORT_SUMMARY_SELECT,
  SaveMunicipalReportInputSchema,
  municipalReportSameRequestContent,
  municipalReportSummaryFromRow,
  municipalReportVersionFromRow,
} from "../municipal-report-persistence";
import { makeMunicipalReportFixture } from "./municipal-report.fixtures";

async function reportRow() {
  const fixture = await makeMunicipalReportFixture(),
    manifest = fixture.manifest;
  return {
    id: "d1000000-0000-4000-8000-000000000001",
    project_id: manifest.projectId,
    version_no: 1,
    baseline_id: manifest.pins.baseline.id,
    baseline_sha256: manifest.pins.baseline.sha256,
    plan_id: manifest.pins.plan.id,
    plan_sha256: manifest.pins.plan.sha256,
    round_version_id: manifest.pins.round.id,
    round_sha256: manifest.pins.round.sha256,
    generator_version: manifest.generatorVersion,
    status: manifest.status,
    report_eligible: false,
    professionally_reviewed: false,
    municipal_scope_approved: false,
    generated_at: manifest.generatedAt,
    manifest_sha256: await baselineSha256(manifest),
    manifest,
    manifest_text: municipalReportCanonicalText(manifest),
    created_at: "2026-10-15T09:00:01.000Z",
    created_by: fixture.input.baseline.createdBy,
    request_id: "d2000000-0000-4000-8000-000000000001",
  };
}

describe("immutable municipal report persistence contract", () => {
  it("accepts only a caller-selected saved round, never client content, pins, actor or approval", async () => {
    const row = await reportRow();
    const input = {
      projectId: row.project_id,
      roundVersionId: row.round_version_id,
      requestId: row.request_id,
    };
    expect(SaveMunicipalReportInputSchema.parse(input)).toEqual(input);
    for (const field of [
      "actorId",
      "createdBy",
      "manifest",
      "pins",
      "generatedAt",
      "status",
      "approved",
      "reportEligible",
      "reviewer",
    ])
      expect(() => SaveMunicipalReportInputSchema.parse({ ...input, [field]: "forged" })).toThrow();
    expect(() =>
      SaveMunicipalReportInputSchema.parse({ ...input, requestId: "not-a-uuid" }),
    ).toThrow();
  });

  it("replays the exact frozen manifest and all selected pins without fetch or current inputs", async () => {
    const row = await reportRow(),
      before = structuredClone(row);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Stored report reads must not fetch"));
    try {
      const version = await municipalReportVersionFromRow(row);
      expect(version.id).toBe(row.id);
      expect(version.version).toBe(1);
      expect(version.manifest).toEqual(row.manifest);
      expect(version.manifestSha256).toBe(row.manifest_sha256);
      expect(version.status).toBe("draft_unreviewed");
      expect(version.reportEligible).toBe(false);
      expect(version.professionallyReviewed).toBe(false);
      expect(version.municipalScopeApproved).toBe(false);
      expect(version.manifest.pins.notes).toHaveLength(1);
      expect(version.manifest.pins.inspections).toHaveLength(1);
      expect(version.manifest.pins.answers).toHaveLength(1);
      expect(row).toEqual(before);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it.each([
    "project_id",
    "baseline_id",
    "plan_id",
    "round_version_id",
    "baseline_sha256",
    "plan_sha256",
    "round_sha256",
  ] as const)(
    "rejects a different stored %s binding even when the manifest is unchanged",
    async (field) => {
      const row = await reportRow();
      const value = field.endsWith("sha256")
        ? "f".repeat(64)
        : "d3000000-0000-4000-8000-000000000001";
      await expect(municipalReportVersionFromRow({ ...row, [field]: value })).rejects.toThrow();
    },
  );

  it.each([
    { status: "approved" },
    { report_eligible: true },
    { professionally_reviewed: true },
    { municipal_scope_approved: true },
    { generator_version: "unreviewed-new-generator/v2" },
    { version_no: 0 },
    { generated_at: "not-a-date" },
    { generated_at: "2026-10-15T10:00:00.000Z" },
  ])("rejects unsupported or inconsistent saved metadata", async (change) => {
    const row = await reportRow();
    await expect(municipalReportVersionFromRow({ ...row, ...change })).rejects.toThrow();
  });

  it("accepts database timestamp formatting for the same instant without rewriting the stored manifest", async () => {
    const row = await reportRow();
    const version = await municipalReportVersionFromRow({
      ...row,
      generated_at: "2026-10-15T11:00:00+02:00",
    });
    expect(version.manifest.generatedAt).toBe(row.manifest.generatedAt);
  });

  it("requires exact canonical bytes and their hash, not only equivalent JSON", async () => {
    const row = await reportRow();
    await expect(
      municipalReportVersionFromRow({
        ...row,
        manifest_text: JSON.stringify(row.manifest, null, 2),
      }),
    ).rejects.toThrow();
    await expect(
      municipalReportVersionFromRow({ ...row, manifest_sha256: "f".repeat(64) }),
    ).rejects.toThrow();
    const manifest = structuredClone(row.manifest);
    manifest.executiveSummary.push("Changed after saving");
    await expect(municipalReportVersionFromRow({ ...row, manifest })).rejects.toThrow();
  });

  it.each(["reportEligible", "professionallyReviewed", "municipalScopeApproved"] as const)(
    "rejects a rehashed %s approval claim",
    async (field) => {
      const row = await reportRow();
      const manifest = { ...row.manifest, [field]: true };
      await expect(
        municipalReportVersionFromRow({
          ...row,
          manifest,
          manifest_text: JSON.stringify(manifest),
          manifest_sha256: await baselineSha256(manifest),
        }),
      ).rejects.toThrow();
    },
  );

  it("rejects missing source pins and photo sections that no longer match their exact original binding", async () => {
    const row = await reportRow();
    for (const alter of [
      (manifest: MunicipalReportManifest) => {
        manifest.pins.mediaBindings = [];
      },
      (manifest: MunicipalReportManifest) => {
        manifest.pins.mediaBindings[0].originalSha256 = "f".repeat(64);
      },
      (manifest: MunicipalReportManifest) => {
        manifest.photos[0].bindingId = "d3000000-0000-4000-8000-000000000001";
      },
      (manifest: MunicipalReportManifest) => {
        manifest.pins.notes.push(manifest.pins.notes[0]);
      },
    ]) {
      const manifest = structuredClone(row.manifest);
      alter(manifest);
      await expect(municipalReportVersionFromRow({ ...row, manifest })).rejects.toThrow();
    }
  });

  it("treats only generatedAt as a concurrent identical-request difference", async () => {
    const row = await reportRow(),
      later = structuredClone(row.manifest);
    later.generatedAt = "2026-10-15T09:00:02.000Z";
    expect(municipalReportSameRequestContent(row.manifest, later)).toBe(true);
    later.executiveSummary.push("A genuinely new report");
    expect(municipalReportSameRequestContent(row.manifest, later)).toBe(false);
    const altered = structuredClone(row.manifest);
    altered.pins.answers[0].sha256 = "f".repeat(64);
    expect(municipalReportSameRequestContent(row.manifest, altered)).toBe(false);
  });

  it("returns bounded metadata-only summaries and strict project/cursor read inputs", async () => {
    const row = await reportRow();
    const summary = municipalReportSummaryFromRow(row);
    expect(summary).not.toHaveProperty("manifest");
    expect(summary.roundVersionId).toBe(row.round_version_id);
    expect(MUNICIPAL_REPORT_SUMMARY_SELECT.split(",")).not.toContain("manifest");
    expect(MUNICIPAL_REPORT_SELECT.split(",")).toContain("manifest_text");
    expect(
      GetMunicipalReportInputSchema.parse({ projectId: row.project_id, reportVersionId: row.id }),
    ).toBeTruthy();
    expect(ListMunicipalReportsInputSchema.parse({ projectId: row.project_id }).limit).toBe(30);
    for (const limit of [0, 31, 1.5])
      expect(() =>
        ListMunicipalReportsInputSchema.parse({ projectId: row.project_id, limit }),
      ).toThrow();
    expect(() =>
      ListMunicipalReportsInputSchema.parse({ projectId: row.project_id, beforeVersion: 0 }),
    ).toThrow();
    expect(() =>
      GetMunicipalReportInputSchema.parse({
        projectId: row.project_id,
        reportVersionId: row.id,
        actorId: row.created_by,
      }),
    ).toThrow();
  });
});
