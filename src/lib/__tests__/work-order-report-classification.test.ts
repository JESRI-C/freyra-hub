import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { newReportContent, type ReportRevision } from "../report-document";
import {
  generateReportFile,
  reportLines,
  buildReportCsv,
  buildReportGeoJSON,
  buildDocx,
} from "../report-export";
import { buildWorkOrderReportPackage } from "../workflow-report-package";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function legacyReport(): ReportRevision {
  return {
    id: id(1),
    report_id: id(2),
    version: 1,
    status: "draft",
    created_at: "2026-11-04T08:00:00Z",
    created_by: id(3),
    content: {
      ...newReportContent(
        "TEST · Prøverapport",
        "TEST · Kommune",
        "Versionsbundet udførelse og dokumentation",
        "TEST",
      ),
      workOrderApproval: {
        actionId: id(4),
        submissionId: id(5),
        submissionVersion: 1,
        reviewId: id(6),
        basisHash: "a".repeat(64),
      },
      sections: [
        {
          id: "execution",
          title: "Registreret udførelse",
          text: "TEST · Syntetisk registrering",
          sourceIds: ["task-original:" + id(7)],
          reviewed: false,
          basis: "documented",
        },
      ],
      sources: [
        {
          id: "task-original:" + id(7),
          title: "TEST · Originalfoto",
          kind: "Originalfoto",
          capturedAt: null,
          checksum: "b".repeat(64),
          position: [10, 55],
          method: "TEST · Syntetisk kilde",
          version: "1",
        },
      ],
    },
  };
}
beforeEach(() => vi.stubEnv("TZ", "UTC"));
afterEach(() => vi.unstubAllEnvs());
function classifiedReport(dataBasis: "real" | "synthetic" | "demo") {
  const revision = legacyReport();
  Object.assign(revision.content.workOrderApproval!, {
    executionDataBasis: dataBasis,
    executionRevisionId: id(8),
  });
  return revision;
}
function packageFiles(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: Record<string, Uint8Array> = {};
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true),
      nameLength = view.getUint16(offset + 26, true),
      extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    result[name] = bytes.slice(start, start + size);
    offset = start + size;
  }
  return result;
}
it("preserves historical report export bytes when classification is absent", async () => {
  const revision = legacyReport();
  const checksums: Record<string, string> = {};
  for (const format of ["pdf", "docx", "csv", "geojson"] as const)
    checksums[format] = (await generateReportFile(revision, format)).checksum;
  const zip = await buildWorkOrderReportPackage(revision);
  checksums.zip = Buffer.from(await crypto.subtle.digest("SHA-256", zip.slice().buffer)).toString(
    "hex",
  );
  expect(checksums).toMatchInlineSnapshot(`
    {
      "csv": "2d3396799af216bcdbf78472b479a5564215b8337a7f313c140d9a6a0d09525d",
      "docx": "b4008e5d3288ad4e147574e1f70a8248ee7e4d647f227f27346c32a41e5933f3",
      "geojson": "05bc7368b4edf7fbf7dbe75c8c16bbcb24dd69769febe7bafb07eff67f38138a",
      "pdf": "fd0b800ed0f56d7b8d4c81b8b1d624614fb084995aa3a9ac59d72fa4fec5c457",
      "zip": "1a797230641155466ad1613b3c142230c69f72da612353c57809f61d792d662f",
    }
  `);
});

it.each([
  ["synthetic", "Syntetiske prøvedata"],
  ["demo", "Demonstrationsdata"],
  ["real", "Udførelsesregistrering: Faktisk arbejde"],
] as const)(
  "carries %s and its pinned execution into visible text and all new exports",
  async (dataBasis, label) => {
    const revision = classifiedReport(dataBasis),
      before = JSON.stringify(revision),
      decoder = new TextDecoder();
    expect(reportLines(revision)).toContain(label);
    expect(reportLines(revision).join("\n")).toContain(id(8));
    expect(decoder.decode(buildDocx(revision))).toContain(label);
    expect(buildReportCsv(revision)).toContain('"execution_data_basis";"execution_revision_id"');
    expect(buildReportCsv(revision)).toContain(`"${dataBasis}";"${id(8)}"`);
    expect(buildReportGeoJSON(revision)).toMatchObject({
      execution_data_basis: dataBasis,
      execution_revision_id: id(8),
    });
    const bytes = await buildWorkOrderReportPackage(revision),
      files = packageFiles(bytes);
    expect(JSON.parse(decoder.decode(files["inputversioner.json"]))).toMatchObject({
      executionDataBasis: dataBasis,
      executionRevisionId: id(8),
    });
    expect(JSON.parse(decoder.decode(files["manifest.json"])).schema).toBe(
      "freyra.work-order-report-package/v2",
    );
    expect(decoder.decode(files["LAES_MIG.txt"])).toContain(label);
    expect(JSON.stringify(revision)).toBe(before);
    if (dataBasis === "synthetic" && process.env.FREYRA_REPORT_ARTIFACT_DIR) {
      const directory = path.resolve(process.env.FREYRA_REPORT_ARTIFACT_DIR);
      expect(directory.startsWith(path.resolve("tmp") + path.sep)).toBe(true);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, "synthetic-report.pdf"), files["rapport.pdf"]);
    }
  },
);

it("recreates a classified PDF with identical bytes in different local time zones", async () => {
  const revision = classifiedReport("synthetic");
  vi.stubEnv("TZ", "Pacific/Honolulu");
  const first = await generateReportFile(revision, "pdf");
  vi.stubEnv("TZ", "Europe/Copenhagen");
  const second = await generateReportFile(revision, "pdf");
  expect(first.bytes).toEqual(second.bytes);
  expect(first.checksum).toBe(second.checksum);
});
