import { describe, expect, it } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  compileMunicipalReportV1,
  municipalReportCanonicalText,
  MunicipalReportManifestSchema,
  municipalReportPublicUrl,
  municipalReportSourceProjection,
} from "../municipal-report";
import { makeMunicipalReportFixture } from "./municipal-report.fixtures";

describe("one coherent immutable municipal report", () => {
  it("joins selected source, round, original, AI and saved answers without promoting approval", async () => {
    const { manifest, input } = await makeMunicipalReportFixture();
    expect(manifest.photos).toHaveLength(1);
    expect(manifest.photos[0].manualNotes).toHaveLength(1);
    expect(manifest.photos[0].inspections[0].questions[0]).toMatchObject({
      note: input.answers[0].answers[0].note,
      answerVersionId: input.answers[0].id,
    });
    expect(manifest.scope.roundKind).toBe("before");
    expect(manifest).toMatchObject({
      status: "draft_unreviewed",
      reportEligible: false,
      professionallyReviewed: false,
      municipalScopeApproved: false,
    });
    expect(manifest.deliveryGaps.map((gap) => gap.code)).toContain("municipal_scope");
    expect(manifest.prioritizedFollowup[0].priority).toBe("before_delivery");
    expect(municipalReportCanonicalText(manifest)).not.toMatch(
      /RAW-EXIF|PRIVATE-CAMERA|storagePath|file_path|signedUrl/,
    );
  });
  it.each(["baseline", "plan", "round"] as const)(
    "rejects a changed %s hash before compiling prose",
    async (field) => {
      const { input } = await makeMunicipalReportFixture();
      input[field].manifestSha256 = "f".repeat(64);
      await expect(compileMunicipalReportV1(input)).rejects.toThrow();
    },
  );
  it("rejects a foreign or mismatched source/original inspection", async () => {
    const { input } = await makeMunicipalReportFixture();
    input.inspections[0].sourceSnapshotHash = "f".repeat(64);
    await expect(compileMunicipalReportV1(input)).rejects.toThrow("billedvurdering");
    input.inspections[0].sourceSnapshotHash = input.baseline.manifestSha256;
    input.inspections[0].originalSha256 = "e".repeat(64);
    await expect(compileMunicipalReportV1(input)).rejects.toThrow("billedvurdering");
  });
  it("rejects modified saved answers and multiple answer versions for one inspection", async () => {
    const { input } = await makeMunicipalReportFixture();
    input.answers[0].answers[0].note = "Not an actually saved note";
    await expect(compileMunicipalReportV1(input)).rejects.toThrow("svarversion");
    input.answers[0].answersSha256 = await baselineSha256(input.answers[0].answers);
    input.answers.push({ ...input.answers[0], id: "d3000000-0000-4000-8000-000000000001" });
    await expect(compileMunicipalReportV1(input)).rejects.toThrow("én gemt svarversion");
  });
  it("keeps all 120 selected photos without truncation and orders pins deterministically", async () => {
    const { input } = await makeMunicipalReportFixture();
    const first = input.mediaBindings[0];
    input.notes = [];
    input.inspections = [];
    input.answers = [];
    input.mediaBindings = await Promise.all(
      Array.from({ length: 120 }, async (_, index) => {
        const suffix = String(index + 1).padStart(12, "0");
        const mediaId = `e1000000-0000-4000-8000-${suffix}`;
        const manifest = { ...first.manifest, mediaId };
        return {
          ...first,
          id: `e2000000-0000-4000-8000-${suffix}`,
          mediaId,
          manifest,
          manifestSha256: await baselineSha256(manifest),
        };
      }),
    );
    const forward = await compileMunicipalReportV1(input);
    input.mediaBindings.reverse();
    const reverse = await compileMunicipalReportV1(input);
    expect(forward.photos).toHaveLength(120);
    expect(forward.pins.mediaBindings).toHaveLength(120);
    expect(municipalReportCanonicalText(reverse)).toBe(municipalReportCanonicalText(forward));
  });
  it("requires explicit saved round type and never infers after from project/folder naming", async () => {
    const { input } = await makeMunicipalReportFixture();
    input.baseline.manifest.project.name = "EFTER uploadmappe";
    input.baseline.manifestSha256 = await baselineSha256(input.baseline.manifest);
    await expect(compileMunicipalReportV1(input)).rejects.toThrow();
    const { manifest } = await makeMunicipalReportFixture();
    expect(manifest.scope.roundKind).toBe("before");
    expect(manifest.limitations.join(" ")).toContain("Mappenavn");
  });
  it("never permits approval flags or unknown report sections in a saved manifest", async () => {
    const { manifest } = await makeMunicipalReportFixture();
    expect(() =>
      MunicipalReportManifestSchema.parse({ ...manifest, professionallyReviewed: true }),
    ).toThrow();
    expect(() =>
      MunicipalReportManifestSchema.parse({ ...manifest, calculatedWaterFlow: 12 }),
    ).toThrow();
  });
  it("strips URL credentials/query secrets and keeps only public endpoint references", () => {
    expect(municipalReportPublicUrl("https://data.example/wfs?apiKey=SECRET#TOKEN")).toBe(
      "https://data.example/wfs",
    );
    expect(municipalReportPublicUrl("https://user:secret@data.example/wfs")).toBeNull();
    expect(municipalReportPublicUrl("javascript:alert(1)")).toBeNull();
  });
  it("keeps a DMI subset sum separate from the undocumented whole requested period", async () => {
    const { input } = await makeMunicipalReportFixture();
    const source = structuredClone(
      input.baseline.manifest.sources.find((item) => item.id === "dmi-historical")!,
    );
    const availableDailySummary = {
      scope: "complete_daily_intervals_inside_requested_period",
      unit: "mm",
      complete: true,
      totalMm: 12.5 as number | null,
      coveredFrom: "2026-09-01T06:00:00Z",
      coveredTo: "2026-09-29T06:00:00Z",
      representsEntireRequestedPeriod: false,
    };
    source.payload = {
      station: { id: "06123", name: "Syntetisk station" },
      summary: { complete: false, totalMm: null, unit: "mm" },
      availableDailySummary,
    };
    const result = municipalReportSourceProjection(source);
    expect(result.facts.join(" ")).toContain("12,5 mm");
    expect(result.facts.join(" ")).toContain("2026-09-29T06:00:00Z");
    expect(result.facts.join(" ")).toContain("ikke hele den bestilte periode");
    expect(result.facts.join(" ")).toContain("Ingen fuld nedbørssum");
    availableDailySummary.totalMm = null;
    expect(municipalReportSourceProjection(source).facts.join(" ")).not.toContain("12,5 mm");
  });
});
