import { describe, expect, it } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { makeMunicipalReportFixture } from "./municipal-report.fixtures";
import {
  compileMunicipalReportV1,
  MUNICIPAL_REPORT_GENERATOR,
  MUNICIPAL_REPORT_GENERATOR_V2,
  MunicipalReportManifestSchema,
  municipalReportCanonicalText,
} from "../municipal-report";
import type { PhotoPointReviewRecord } from "../photo-point-review";

async function fixture() {
  const f = await makeMunicipalReportFixture();
  const review: PhotoPointReviewRecord["review"] = {
    schema: "freyra.photo-point-review/v1",
    projectId: f.input.projectId,
    bindingId: f.binding.id,
    bindingSha256: f.binding.manifestSha256,
    mediaId: f.binding.mediaId,
    originalSha256: f.binding.manifest.originalSha256,
    baselineId: f.baseline.id,
    baselineSha256: f.baseline.manifestSha256,
    decision: "confirmed",
    note: "Syntetisk testbeslutning; ikke en virkelig faglig gennemgang.",
    reviewerName: "Testfagperson",
    inspectionId: f.inspection.id,
    inspectionSha256: f.inspection.resultSha256,
  };
  const record: PhotoPointReviewRecord = {
    id: "d1000000-0000-4000-8000-000000000050",
    projectId: f.input.projectId,
    bindingId: f.binding.id,
    reviewedBy: f.note.createdBy,
    requestId: "d1000000-0000-4000-8000-000000000051",
    createdAt: "2026-10-15T08:00:00.000Z",
    review,
    reviewSha256: await baselineSha256(review),
  };
  return { ...f, record };
}

describe("municipal report v2 frozen evidence", () => {
  it("keeps default v1 serialization unchanged and refuses to relabel new sections as v1", async () => {
    const f = await fixture();
    const explicit = await compileMunicipalReportV1({
      ...f.input,
      generatorVersion: MUNICIPAL_REPORT_GENERATOR,
    });
    expect(municipalReportCanonicalText(explicit)).toBe(municipalReportCanonicalText(f.manifest));
    expect("planting" in explicit).toBe(false);
    expect("photoPointReviews" in explicit).toBe(false);
    expect(() =>
      MunicipalReportManifestSchema.parse({ ...explicit, photoPointReviews: [] }),
    ).toThrow();
  });

  it("freezes sketch, unknown A–E hectares, citations and exact human decision without report approval", async () => {
    const f = await fixture();
    const input = {
      ...f.input,
      generatorVersion: MUNICIPAL_REPORT_GENERATOR_V2,
      photoPointReviews: [f.record],
    };
    const report = await compileMunicipalReportV1(input);
    expect(report.photoPointReviews).toEqual([f.record]);
    expect(report.planting?.baselineSha256).toBe(f.baseline.manifestSha256);
    expect(report.planting?.reaches).toHaveLength(10);
    expect(report.planting?.reaches.every((reach) => reach.suitableHa === null)).toBe(true);
    expect(report.planting?.localEffectsCalculated).toBe(false);
    expect(
      report.planting?.literature.every((entry) => entry.sourceUrl.startsWith("https://")),
    ).toBe(true);
    expect(report.professionallyReviewed).toBe(false);
    expect(report.reportEligible).toBe(false);
    expect(await compileMunicipalReportV1(input)).toEqual(report);
    f.record.review.note = "Senere ændring";
    expect(report.photoPointReviews?.[0].review.note).toContain("Syntetisk testbeslutning");
  });

  it.each(["hash", "original", "baseline", "inspection", "actor", "future", "duplicate"] as const)(
    "rejects a %s mismatch in human decisions",
    async (change) => {
      const f = await fixture();
      const record = structuredClone(f.record);
      if (change === "hash") record.reviewSha256 = "a".repeat(64);
      if (change === "original") record.review.originalSha256 = "f".repeat(64);
      if (change === "baseline") record.review.baselineSha256 = "a".repeat(64);
      if (change === "inspection") record.review.inspectionSha256 = "a".repeat(64);
      if (change === "actor") record.reviewedBy = "not-a-user-id";
      if (change === "future") record.createdAt = "2026-10-16T00:00:00.000Z";
      if (["original", "baseline", "inspection"].includes(change))
        record.reviewSha256 = await baselineSha256(record.review);
      await expect(
        compileMunicipalReportV1({
          ...f.input,
          generatorVersion: MUNICIPAL_REPORT_GENERATOR_V2,
          photoPointReviews: change === "duplicate" ? [record, record] : [record],
        }),
      ).rejects.toThrow();
    },
  );

  it("does not require an AI result to document a human rejection", async () => {
    const f = await fixture();
    f.record.review.decision = "rejected";
    f.record.review.inspectionId = null;
    f.record.review.inspectionSha256 = null;
    f.record.reviewSha256 = await baselineSha256(f.record.review);
    const report = await compileMunicipalReportV1({
      ...f.input,
      inspections: [],
      answers: [],
      generatorVersion: MUNICIPAL_REPORT_GENERATOR_V2,
      photoPointReviews: [f.record],
    });
    expect(report.photoPointReviews?.[0].review.decision).toBe("rejected");
    expect(report.photos[0].inspections).toEqual([]);
  });
});
