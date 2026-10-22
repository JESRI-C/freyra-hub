import { describe, expect, it } from "vitest";
import { makeMunicipalReportFixture } from "@/services/monitoring/__tests__/municipal-report.fixtures";
import {
  municipalReportPhotoCsv,
  municipalReportCameraGeoJson,
  municipalReportZip,
  buildMunicipalReportPackage,
} from "../municipal-report-package";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import type { MunicipalReportVersion } from "@/services/monitoring/municipal-report-persistence";
import {
  compileMunicipalReportV1,
  MUNICIPAL_REPORT_GENERATOR_V2,
  MUNICIPAL_REPORT_GENERATOR_V3,
} from "@/services/monitoring/municipal-report";
async function report(): Promise<MunicipalReportVersion> {
  const f = await makeMunicipalReportFixture();
  return {
    id: "d1000000-0000-4000-8000-000000000001",
    version: 1,
    projectId: f.input.projectId,
    baselineId: f.baseline.id,
    baselineSha256: f.baseline.manifestSha256,
    planId: f.plan.id,
    planSha256: f.plan.manifestSha256,
    roundVersionId: f.round.id,
    roundSha256: f.round.manifestSha256,
    generatorVersion: f.manifest.generatorVersion,
    status: "draft_unreviewed",
    reportEligible: false,
    professionallyReviewed: false,
    municipalScopeApproved: false,
    generatedAt: f.manifest.generatedAt,
    createdAt: f.manifest.generatedAt,
    createdBy: f.note.createdBy,
    requestId: "d1000000-0000-4000-8000-000000000002",
    manifest: f.manifest,
    manifestSha256: await baselineSha256(f.manifest),
  };
}
describe("municipal report exports", () => {
  it("exports camera points with explicit unverified object/footprint roles", async () => {
    const data = JSON.parse(municipalReportCameraGeoJson(await report()));
    expect(data.type).toBe("FeatureCollection");
    expect(data.features).toHaveLength(1);
    expect(data.features[0].geometry.type).toBe("Point");
    expect(data.features[0].properties.geometryRole).toBe("camera_position_only");
    expect(data.features[0].properties.objectLocationVerified).toBe(false);
    expect(data.features[0].properties.footprintVerified).toBe(false);
  });
  it("exports a quoted semicolon register with stable photo and report hash references", async () => {
    const value = await report();
    const csv = municipalReportPhotoCsv(value);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"camera_position_only"');
    expect(csv).toContain('"original_sha256"');
    expect(csv.split("\r\n")).toHaveLength(3);
  });
  it("rejects archive path traversal and duplicate entries before producing bytes", () => {
    expect(() =>
      municipalReportZip([{ name: "../rapport.pdf", bytes: new Uint8Array() }]),
    ).toThrow();
    expect(() =>
      municipalReportZip([
        { name: "rapport.pdf", bytes: new Uint8Array() },
        { name: "rapport.pdf", bytes: new Uint8Array() },
      ]),
    ).toThrow();
  });
  it.each([MUNICIPAL_REPORT_GENERATOR_V2, MUNICIPAL_REPORT_GENERATOR_V3])(
    "includes frozen %s sections with verifiable SHA-256 and deterministic ZIP bytes",
    async (generatorVersion) => {
      const f = await makeMunicipalReportFixture();
      const manifest = await compileMunicipalReportV1({
        ...f.input,
        generatorVersion,
        photoPointReviews: [],
      });
      const version = {
        ...(await report()),
        generatorVersion: manifest.generatorVersion,
        manifest,
        manifestSha256: await baselineSha256(manifest),
      };
      const pdf = new TextEncoder().encode("%PDF synthetic test bytes");
      const archive = await buildMunicipalReportPackage(version, pdf);
      expect(await buildMunicipalReportPackage(version, pdf)).toEqual(archive);
      const entries = new Map<string, Uint8Array>();
      const view = new DataView(archive.buffer);
      let offset = 0;
      while (view.getUint32(offset, true) === 0x04034b50) {
        const size = view.getUint32(offset + 18, true);
        const nameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        const name = new TextDecoder().decode(archive.slice(offset + 30, offset + 30 + nameLength));
        const start = offset + 30 + nameLength + extraLength;
        entries.set(name, archive.slice(start, start + size));
        offset = start + size;
      }
      const readJson = (name: string) => JSON.parse(new TextDecoder().decode(entries.get(name)));
      expect(readJson("beplantningsskitse.json")).toEqual(manifest.planting);
      expect(readJson("faglig-fotogennemgang.json")).toEqual([]);
      const packageManifest = readJson("manifest.json");
      expect(packageManifest.pdfRendererVersion).toBe(
        generatorVersion === MUNICIPAL_REPORT_GENERATOR_V3
          ? "municipal-evidence-pdf/v3"
          : "municipal-evidence-pdf/v2",
      );
      expect(packageManifest.files).toHaveLength(6);
      for (const file of packageManifest.files as {
        name: string;
        sizeBytes: number;
        sha256: string;
      }[]) {
        const bytes = entries.get(file.name)!;
        expect(bytes.length).toBe(file.sizeBytes);
        const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
        expect(
          [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""),
        ).toBe(file.sha256);
      }
      expect(readJson("rapportgrundlag.json").manifestSha256).toBe(version.manifestSha256);
    },
  );
});
