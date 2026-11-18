import { describe, expect, it } from "vitest";
import {
  newReportContent,
  moveSection,
  reportIssues,
  validateReportRevision,
  ReportContentSchema,
  reportWorkOrderDataBasis,
  type ReportRevision,
} from "../report-document";
import {
  buildDocx,
  buildReportCsv,
  buildReportGeoJSON,
  reportLines,
  generateReportFile,
} from "../report-export";
const content = () => newReportContent("Bykær Bæk", "Haderslev Kommune", "Vegetation", "Kunde");
const revision = (): ReportRevision => ({
  id: "r1",
  report_id: "report1",
  version: 1,
  status: "draft",
  created_at: "2026-10-26T12:00:00Z",
  created_by: "u1",
  content: content(),
});
const approval = {
  actionId: "00000000-0000-4000-8000-000000000001",
  submissionId: "00000000-0000-4000-8000-000000000002",
  submissionVersion: 1,
  reviewId: "00000000-0000-4000-8000-000000000003",
  basisHash: "a".repeat(64),
};
describe("evidence-based report document", () => {
  it("matches map numbers across source register, CSV and GeoJSON for original and atlas photos", () => {
    const r = revision();
    const source = {
      id: "gps",
      title: "Dronefoto",
      kind: "photo",
      capturedAt: null,
      checksum: null,
      method: "RGB",
      version: "1",
      position: [9, 55] as [number, number],
    };
    r.content.sources = [
      { ...source, id: "no-gps", position: null },
      source,
      { ...source, id: "second" },
    ];
    r.content.photoLayoutVersion = 2;
    r.content.photoAtlas = {
      evidenceId: crypto.randomUUID(),
      checksum: "a".repeat(64),
      photoIds: ["A", "B"],
      mapPoints: [{ id: "B", position: [9.1, 55.1] }],
    };
    const lines = reportLines(r);
    expect(lines).toContain("Kortpunkt 1 · Dronefoto · gps");
    expect(lines).toContain("Kortpunkt 2 · Dronefoto · second");
    expect(lines).toContain("Kortpunkt 3 · Atlasfoto B · GPS 9.1, 55.1");
    expect(lines).toContain("no-gps: Dronefoto");
    expect(new TextDecoder().decode(buildDocx(r))).toContain("Kortpunkt 3 · Atlasfoto B");
    expect(buildReportGeoJSON(r).features.map((f) => f.properties)).toMatchObject([
      { source_id: "gps", map_number: 1 },
      { source_id: "second", map_number: 2 },
      { photo_id: "B", map_number: 3 },
    ]);
    const csv = buildReportCsv(r).split("\r\n");
    expect(csv[1]).toMatch(/;""$/);
    expect(csv.slice(2).map((row) => row.slice(-3))).toEqual(['"1"', '"2"', '"3"']);
    delete r.content.photoLayoutVersion;
    expect(reportLines(r).join("\n")).not.toContain("Kortpunkt");
    expect(buildReportCsv(r)).not.toContain("map_number");
    expect(buildReportGeoJSON(r).features).toHaveLength(2);
  });
  it.each([
    ["synthetic", "Syntetiske prøvedata"],
    ["demo", "Demonstrationsdata"],
    ["real", "Udførelsesregistrering: Faktisk arbejde"],
  ] as const)(
    "retains the frozen %s classification independently of the approval",
    (executionDataBasis, label) => {
      const parsed = ReportContentSchema.parse({
        ...content(),
        workOrderApproval: {
          ...approval,
          executionDataBasis,
          executionRevisionId: "00000000-0000-4000-8000-000000000004",
        },
      });
      expect(reportWorkOrderDataBasis(parsed)).toMatchObject({ kind: executionDataBasis, label });
      expect(reportWorkOrderDataBasis(parsed)?.description).toContain("natureffekt");
      expect(
        reportIssues(parsed).some((issue) => issue.includes("prøve- eller demonstrationsdata")),
      ).toBe(executionDataBasis !== "real");
    },
  );
  it("keeps a historical report readable while explicitly treating absent classification as unknown", () => {
    const parsed = ReportContentSchema.parse({ ...content(), workOrderApproval: approval });
    expect(parsed.workOrderApproval).toEqual(approval);
    expect(reportWorkOrderDataBasis(parsed)?.kind).toBe("unknown");
    expect(reportIssues(parsed)).toContain(
      "Rapportversionen mangler udførelsens registreringstype.",
    );
    expect(reportWorkOrderDataBasis(content())).toBeUndefined();
  });
  it.each([
    { executionDataBasis: "synthetic" },
    { executionRevisionId: "00000000-0000-4000-8000-000000000004" },
    { executionDataBasis: "invented", executionRevisionId: "00000000-0000-4000-8000-000000000004" },
    { executionDataBasis: "real", executionRevisionId: "not-a-version" },
  ])("rejects a malformed or unpaired classification (%j)", (pin) => {
    expect(
      ReportContentSchema.safeParse({ ...content(), workOrderApproval: { ...approval, ...pin } })
        .success,
    ).toBe(false);
  });
  it("does not claim readiness without sources or review", () => {
    const c = content();
    expect(reportIssues(c)).toContain("Rapporten mangler kilder.");
    expect(() => validateReportRevision(c, "approved")).toThrow();
    expect(c.sections.every((s) => !s.reviewed)).toBe(true);
  });
  it("reorders sections without duplicating or mutating source version", () => {
    const c = content(),
      before = JSON.stringify(c);
    const moved = moveSection(c.sections, 0, 3);
    expect(moved[3].id).toBe(c.sections[0].id);
    expect(new Set(moved.map((s) => s.id)).size).toBe(c.sections.length);
    expect(JSON.stringify(c)).toBe(before);
  });
  it("rejects missing source references even when marked reviewed", () => {
    const c = content();
    c.sources = [
      {
        id: "s1",
        title: "Original",
        kind: "photo",
        capturedAt: null,
        checksum: "a".repeat(64),
        position: null,
        method: "RGB",
        version: "1",
      },
    ];
    c.sections = c.sections.map((s) => ({
      ...s,
      text: "Fagligt gennemgået",
      reviewed: true,
      basis: "observed",
      sourceIds: ["other-project"],
    }));
    c.sources.push({
      ...c.sources[0],
      id: "unchecked-original",
      title: "Driftsbilag",
      checksum: null,
    });
    expect(reportIssues(c)).toContain(`${c.sections[0].title}: ukendt kilde (other-project).`);
    expect(reportIssues(c)).toContain(
      "Driftsbilag (unchecked-original) mangler en gyldig SHA-256-kontrolsum.",
    );
    expect(() => validateReportRevision(c, "approved")).toThrow();
  });
  it("does not synthesize GPS points for photos lacking GPS", () => {
    const r = revision();
    r.content.sources = [
      {
        id: "s",
        title: "No GPS",
        kind: "photo",
        capturedAt: null,
        checksum: null,
        position: null,
        method: "RGB",
        version: "1",
      },
    ];
    expect(buildReportGeoJSON(r).features).toHaveLength(0);
    expect(buildReportCsv(r)).toContain('"No GPS"');
  });
  it("creates real PDF and OOXML files with checksums", async () => {
    const r = revision();
    const pdf = await generateReportFile(r, "pdf"),
      docx = await generateReportFile(r, "docx");
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 4))).toBe("%PDF");
    expect(Array.from(docx.bytes.slice(0, 4))).toEqual([80, 75, 3, 4]);
    expect(docx.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(pdf.bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(buildDocx(r))).toContain("word/document.xml");
    expect(new TextDecoder().decode(buildDocx(r))).toContain("KLADDE - ikke godkendt");
  });
  it("preserves the selected professional photo decision across report exports", () => {
    const r = revision();
    const review = {
      id: crypto.randomUUID(),
      bindingId: crypto.randomUUID(),
      sha256: "a".repeat(64),
      originalSha256: "b".repeat(64),
      originalValidationSha256: "c".repeat(64),
      bindingSha256: "d".repeat(64),
    };
    const source = {
      id: `media:${crypto.randomUUID()}`,
      title: "Dronefoto",
      kind: "drone_image",
      capturedAt: null,
      localCaptureDate: "2026-08-24",
      position: [9.4, 55.2] as [number, number],
      method: "Fagligt bekræftet fotopunkt",
      version: review.sha256,
      checksum: review.originalSha256,
      storageBucket: "monitoring-uploads",
      photoPointReview: review,
    };
    r.content = ReportContentSchema.parse({ ...r.content, sources: [source] });
    expect(r.content.sources[0].photoPointReview).toEqual(review);
    const docx = new TextDecoder().decode(buildDocx(r));
    expect(docx).toContain(review.id);
    expect(docx).toContain("lokal kameradato uden dokumenteret tidszone");
    const csv = buildReportCsv(r);
    expect(csv).toContain("photo_review_sha256");
    expect(csv).toContain(review.originalValidationSha256);
    expect(buildReportGeoJSON(r).features[0]).toMatchObject({
      properties: { photo_point_review: review },
    });
    r.content.sources[0].photoPointReview = undefined;
    expect(reportIssues(r.content).join(" ")).toContain("genindlæs rapportens kilderegister");
  });
  it("preserves field observation lines and escapes their content in Word", () => {
    const r = revision();
    r.content.sections[0].text = "Eng vest\nStar <uafklaret>\r\nMetode & dækning";
    const document = new TextDecoder().decode(buildDocx(r));
    expect(document).toContain(
      'Eng vest</w:t><w:br/><w:t xml:space="preserve">Star &lt;uafklaret&gt;</w:t><w:br/><w:t xml:space="preserve">Metode &amp; dækning',
    );
  });
  it("escapes spreadsheet formulas in source names", () => {
    const r = revision();
    r.content.sources = [
      {
        id: "s",
        title: "=HYPERLINK(1)",
        kind: "photo",
        capturedAt: null,
        checksum: null,
        position: null,
        method: "RGB",
        version: "1",
      },
    ];
    expect(buildReportCsv(r)).toContain("'=HYPERLINK");
  });
  it("propagates export checksum errors instead of claiming success", async () => {
    const original = crypto.subtle.digest;
    try {
      crypto.subtle.digest = () => Promise.reject(new Error("checksum failure"));
      await expect(generateReportFile(revision(), "csv")).rejects.toThrow("checksum failure");
    } finally {
      crypto.subtle.digest = original;
    }
  });
});
