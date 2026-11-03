import type { ReportRevision } from "./report-document";
import type { ReportImage } from "@/services/report-assets";
import { WorkflowReportSnapshotSchema } from "./workflow-report";
import { generateReportFile, zipFiles } from "./report-export";
export async function buildWorkflowReportPackage(
  revision: ReportRevision,
  images: ReportImage[] = [],
) {
  const snapshot = WorkflowReportSnapshotSchema.parse(revision.content.workflowSnapshot);
  return buildReportPackage(
    revision,
    images,
    "freyra.workflow-package/v1",
    snapshot,
    "Gemte rapport- og inputversioner; ingen kilde indhentes igen ved eksport.\n" +
      "Originalreferencer og kontrolsummer er ikke en kopi af originalfilerne eller en fuld backup.\n" +
      "PDF-illustrationer er visningskopier. Baseline og metodeplan følger inputversionerne.\n" +
      "Review gælder præcis de angivne input og dokumentation; ingen natureffekt er automatisk godkendt.\n",
  );
}

export async function buildWorkOrderReportPackage(revision: ReportRevision) {
  const approval = revision.content.workOrderApproval;
  if (!approval) throw new Error("Rapporten mangler en fastholdt faglig godkendelse.");
  return buildReportPackage(
    revision,
    [],
    "freyra.work-order-report-package/v1",
    approval,
    "Pakken indeholder den gemte rapport, referencer til aflevering og gennemgang samt originalernes kildereferencer.\n" +
      "Originalfilerne åbnes via opgaven i GoFreyra med aktuel adgang.\n" +
      "Rapportens egen status fremgår af PDF og rapportversionen.\n",
  );
}

async function buildReportPackage(
  revision: ReportRevision,
  images: ReportImage[],
  schema: "freyra.workflow-package/v1" | "freyra.work-order-report-package/v1",
  inputs: NonNullable<
    ReportRevision["content"]["workflowSnapshot"] | ReportRevision["content"]["workOrderApproval"]
  >,
  readme: string,
) {
  const pdf = await generateReportFile(revision, "pdf", images);
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    "rapport.pdf": pdf.bytes,
    "rapportversion.json": encoder.encode(JSON.stringify(revision, null, 2)),
    "inputversioner.json": encoder.encode(JSON.stringify(inputs, null, 2)),
    "originalreferencer.json": encoder.encode(JSON.stringify(revision.content.sources, null, 2)),
    "LAES_MIG.txt": encoder.encode(readme),
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
        schema,
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
