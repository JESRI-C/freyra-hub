import { describe, expect, it } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { makeMunicipalReportFixture } from "./municipal-report.fixtures";
import { buildDroneImageInspectionDraft } from "../drone-image-inspection";
import { describeDroneVisualInDanish } from "../drone-visual-presentation";
import {
  compileMunicipalReportV1,
  MUNICIPAL_REPORT_GENERATOR_V2,
  MUNICIPAL_REPORT_GENERATOR_V3,
  municipalReportCanonicalText,
  MunicipalReportManifestSchema,
} from "../municipal-report";
import { municipalReportVersionFromRow } from "../municipal-report-persistence";

async function englishFixture(unusable = false) {
  const f = await makeMunicipalReportFixture();
  const original = f.inspection.result!;
  f.inspection.result = buildDroneImageInspectionDraft({
    provenance: original.provenance,
    sourceContext: original.sourceContext,
    visual: {
      ...original.visual,
      quality: {
        ...original.visual.quality,
        assessment: unusable ? "unusable" : "limited",
        limitation: "The view is obscured.",
      },
      watercourseVisibility: unusable ? "uncertain" : "partly_visible",
      overallUncertainty: "high",
      features: unusable
        ? []
        : original.visual.features.map((feature) => ({
            ...feature,
            appearance: "A bright object is visible.",
            uncertainty: "The function is unclear.",
          })),
    },
  });
  f.inspection.resultSha256 = await baselineSha256(f.inspection.result);
  f.input.answers = [];
  return f;
}

describe("municipal report v3 Danish presentation", () => {
  it.each([false, true])(
    "derives Danish prose while retaining immutable AI and source pins (unusable=%s)",
    async (unusable) => {
      const f = await englishFixture(unusable);
      const before = structuredClone(f.input);
      const report = await compileMunicipalReportV1({
        ...f.input,
        generatorVersion: MUNICIPAL_REPORT_GENERATOR_V3,
      });
      const inspection = report.photos[0].inspections[0];
      const expected = describeDroneVisualInDanish(f.inspection.result!.visual);
      expect(inspection.qualityLimitation).toBe(expected.qualityLimitation);
      expect(inspection.uncertainty).toBe(expected.uncertainty);
      expect(
        inspection.features.map((feature) => ({
          appearance: feature.description,
          uncertainty: feature.uncertainty,
        })),
      ).toEqual(expected.features);
      expect(inspection.features.map((feature) => feature.confidence)).toEqual(
        f.inspection.result!.visual.features.map((feature) => feature.confidence),
      );
      expect(inspection.sha256).toBe(f.inspection.resultSha256);
      expect(report.pins.inspections).toEqual([
        { id: f.inspection.id, sha256: f.inspection.resultSha256, mediaId: f.inspection.mediaId },
      ]);
      expect(f.input).toEqual(before);
      expect(report.planting?.baselineSha256).toBe(f.baseline.manifestSha256);
      expect(report.photoPointReviews).toEqual([]);
      const prose = municipalReportCanonicalText(report);
      expect(prose).not.toContain("The view is obscured.");
      expect(prose).not.toContain("A bright object is visible.");
      expect(prose).not.toContain('"uncertainty":"high"');
      expect(prose).toContain("modellens fritekst er bevaret i originalvurderingen");
      if (unusable)
        expect(inspection.qualityLimitation).toContain(
          "Billedet kan ikke vurderes pålideligt med AI",
        );
      const old = await compileMunicipalReportV1({
        ...f.input,
        generatorVersion: MUNICIPAL_REPORT_GENERATOR_V2,
      });
      expect(old.photos[0].inspections[0].qualityLimitation).toBe("The view is obscured.");
      expect(old.photos[0].inspections[0].uncertainty).toBe("high");
      expect(old.pins).toEqual(report.pins);
    },
  );

  it("reopens frozen v3 as an exact checked manifest without translating persisted data", async () => {
    const f = await englishFixture();
    const manifest = await compileMunicipalReportV1({
      ...f.input,
      generatorVersion: MUNICIPAL_REPORT_GENERATOR_V3,
    });
    const row = {
      id: "d1000000-0000-4000-8000-000000000001",
      project_id: manifest.projectId,
      version_no: 3,
      baseline_id: f.baseline.id,
      baseline_sha256: f.baseline.manifestSha256,
      plan_id: f.plan.id,
      plan_sha256: f.plan.manifestSha256,
      round_version_id: f.round.id,
      round_sha256: f.round.manifestSha256,
      generator_version: manifest.generatorVersion,
      status: "draft_unreviewed",
      report_eligible: false,
      professionally_reviewed: false,
      municipal_scope_approved: false,
      generated_at: manifest.generatedAt,
      manifest,
      manifest_text: municipalReportCanonicalText(manifest),
      manifest_sha256: await baselineSha256(manifest),
      created_at: manifest.generatedAt,
      created_by: f.note.createdBy,
      request_id: "d1000000-0000-4000-8000-000000000002",
    };
    const version = await municipalReportVersionFromRow(row);
    expect(version.generatorVersion).toBe(MUNICIPAL_REPORT_GENERATOR_V3);
    expect(version.manifest).toEqual(manifest);
    expect(municipalReportCanonicalText(version.manifest)).toBe(row.manifest_text);
    expect(() =>
      MunicipalReportManifestSchema.parse({ ...manifest, planting: undefined }),
    ).toThrow();
    expect(() =>
      MunicipalReportManifestSchema.parse({
        ...manifest,
        generatorVersion: "municipal-evidence-report/v4",
      }),
    ).toThrow();
  });
});
