import { describe, expect, it } from "vitest";
import {
  newReportContent,
  moveSection,
  reportIssues,
  validateReportRevision,
  type ReportRevision,
} from "../report-document";
import {
  buildDocx,
  buildReportCsv,
  buildReportGeoJSON,
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
describe("evidence-based report document", () => {
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
    expect(reportIssues(c).some((i) => i.includes("ukendt kilde"))).toBe(true);
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
