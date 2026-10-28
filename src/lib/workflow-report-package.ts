import type { ReportRevision } from "./report-document";
import type { ReportImage } from "@/services/report-assets";
import { WorkflowReportSnapshotSchema } from "./workflow-report";
import { generateReportFile, zipFiles } from "./report-export";
export async function buildWorkflowReportPackage(
  revision: ReportRevision,
  images: ReportImage[] = [],
) {
  const snapshot = WorkflowReportSnapshotSchema.parse(revision.content.workflowSnapshot);
  const pdf = await generateReportFile(revision, "pdf", images);
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    "rapport.pdf": pdf.bytes,
    "rapportversion.json": encoder.encode(JSON.stringify(revision, null, 2)),
    "inputversioner.json": encoder.encode(JSON.stringify(snapshot, null, 2)),
    "originalreferencer.json": encoder.encode(JSON.stringify(revision.content.sources, null, 2)),
    "LAES_MIG.txt": encoder.encode(
      "Gemte rapport- og inputversioner; ingen kilde indhentes igen ved eksport.\n" +
        "Originalreferencer og kontrolsummer er ikke en kopi af originalfilerne eller en fuld backup.\n" +
        "PDF-illustrationer er visningskopier. Baseline og metodeplan følger inputversionerne.\n" +
        "Review gælder præcis de angivne input og dokumentation; ingen natureffekt er automatisk godkendt.\n",
    ),
  };
  const manifest = [];
  for (const [name, bytes] of Object.entries(files)) {
    const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
    manifest.push({
      name,
      bytes: bytes.length,
      sha256: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(""),
    });
  }
  files["manifest.json"] = encoder.encode(
    JSON.stringify(
      {
        schema: "freyra.workflow-package/v1",
        reportId: revision.report_id,
        revisionId: revision.id,
        version: revision.version,
        files: manifest,
      },
      null,
      2,
    ),
  );
  return zipFiles(files);
}
