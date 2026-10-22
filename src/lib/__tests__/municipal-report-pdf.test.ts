import { beforeEach, describe, expect, it, vi } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { makeMunicipalReportFixture } from "@/services/monitoring/__tests__/municipal-report.fixtures";
import { buildMunicipalReportPdf } from "../municipal-report-pdf";
import {
  compileMunicipalReportV1,
  MUNICIPAL_REPORT_GENERATOR_V2,
} from "@/services/monitoring/municipal-report";

const drawing = vi.hoisted(() => ({
  texts: [] as { value: string; y: number; page: number }[],
  pages: 1,
  page: 1,
}));
// Layout behavior test only. Actual jsPDF generation and rendered-page review
// are separate artifact QA; this mock creates no PDF artifact.
vi.mock("jspdf", () => ({
  jsPDF: class {
    setProperties() {}
    setFileId() {}
    setCreationDate() {}
    setDrawColor() {}
    setLineWidth() {}
    line() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    text(value: string, _x: number, y: number) {
      drawing.texts.push({ value, y, page: drawing.page });
    }
    splitTextToSize(value: string) {
      return value.match(/.{1,80}(?:\s|$)|.{1,80}/g) ?? [""];
    }
    addPage() {
      drawing.pages++;
      drawing.page = drawing.pages;
    }
    getNumberOfPages() {
      return drawing.pages;
    }
    setPage(page: number) {
      drawing.page = page;
    }
    output() {
      return new Uint8Array([37, 80, 68, 70]).buffer;
    }
  },
}));
async function fixture() {
  const { manifest } = await makeMunicipalReportFixture();
  return {
    id: "f1000000-0000-4000-8000-000000000001",
    version: 1,
    createdAt: manifest.generatedAt,
    manifest,
    manifestSha256: await baselineSha256(manifest),
  };
}
describe("municipal report PDF layout boundaries", () => {
  beforeEach(() => {
    drawing.texts = [];
    drawing.page = 1;
    drawing.pages = 1;
  });
  it("paginates all sections with repeated version/hash footers and explicit unembedded photos", async () => {
    const version = await fixture();
    await buildMunicipalReportPdf(version);
    expect(drawing.pages).toBeGreaterThan(1);
    expect(
      drawing.texts.some((text) => text.value.includes("8. Versions- og evidensregister")),
    ).toBe(true);
    expect(drawing.texts.some((text) => text.value.includes("Originalfoto ikke indlejret"))).toBe(
      true,
    );
    const bodyText = drawing.texts.map((text) => text.value).join(" ");
    expect(bodyText).toContain("De tre første handlinger");
    expect(bodyText).toContain(`af ${version.manifest.prioritizedFollowup.length} opgaver`);
    expect(drawing.texts.some((text) => text.value.startsWith("11. "))).toBe(false);
    for (const question of version.manifest.photos[0].inspections[0].questions) {
      expect(bodyText).toContain(question.question.slice(0, 40));
      if (question.note) expect(bodyText).toContain(question.note.slice(0, 40));
    }
    for (let page = 1; page <= drawing.pages; page++) {
      const texts = drawing.texts.filter((text) => text.page === page);
      expect(texts.some((text) => text.value.includes("RAPPORTGRUNDLAG"))).toBe(true);
      expect(texts.some((text) => text.value === `Side ${page} af ${drawing.pages}`)).toBe(true);
      expect(texts.some((text) => text.value.includes(version.manifestSha256))).toBe(true);
      expect(texts.every((text) => text.y <= 289)).toBe(true);
    }
  });
  it("refuses stale manifest hashes before producing pages", async () => {
    const version = await fixture();
    version.manifest.projectName = "Unpersisted change";
    await expect(buildMunicipalReportPdf(version)).rejects.toThrow("checksum");
    expect(drawing.texts).toHaveLength(0);
  });
  it("renders v2 sketch limitations, unknown hectares, frozen citations and pending human decisions", async () => {
    const f = await makeMunicipalReportFixture();
    const manifest = await compileMunicipalReportV1({
      ...f.input,
      generatorVersion: MUNICIPAL_REPORT_GENERATOR_V2,
      photoPointReviews: [],
    });
    await buildMunicipalReportPdf({
      ...(await fixture()),
      manifest,
      manifestSha256: await baselineSha256(manifest),
    });
    const text = drawing.texts.map((entry) => entry.value).join(" ");
    expect(text).toContain("5. Beplantningsegnethed");
    expect(text).toContain("Skitse - kræver faglig validering");
    expect(text).toContain("A: egnet ukendt");
    expect(text).toContain("Fotopunkt afventer faglig gennemgang");
    expect(text).toContain("9. Versions- og evidensregister");
    expect(text).toContain("ingen beregnet lokal effekt");
    expect(text).toContain("CO2");
    expect(text).not.toContain("CO₂");
    for (const source of manifest.planting!.literature) {
      expect(text).toContain(source.sourceUrl);
      expect(text).toContain(source.checkedAt);
    }
    expect(drawing.texts.every((entry) => entry.y <= 289)).toBe(true);
  });
  it("refuses a foreign or wrong-original JPEG asset instead of embedding it", async () => {
    const version = await fixture();
    await expect(
      buildMunicipalReportPdf(version, [
        {
          mediaId: version.manifest.photos[0].mediaId,
          originalSha256: "f".repeat(64),
          dataUrl: "data:image/jpeg;base64,/9j/2Q==",
        },
      ]),
    ).rejects.toThrow("originalfoto");
    expect(drawing.texts).toHaveLength(0);
  });
});
