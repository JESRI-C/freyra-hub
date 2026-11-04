import { reportWorkOrderDataBasis, type ReportRevision } from "./report-document";
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

const originalByteLimit = 25 * 1024 * 1024;
const originalExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
};

export async function buildWorkOrderReportPackage(
  revision: ReportRevision,
  signOriginal?: (id: string) => Promise<{ url: string; sha256: string }>,
) {
  const approval = revision.content.workOrderApproval;
  if (!approval) throw new Error("Rapporten mangler en fastholdt faglig godkendelse.");
  const source = reportWorkOrderDataBasis(revision.content);
  const classified = source && source.kind !== "unknown";
  const originals: Record<string, Uint8Array> = {};
  if (signOriginal) {
    if (!revision.content.sources.length || revision.content.sources.length > 100)
      throw new Error("Rapporten har ingen eller for mange originalreferencer.");
    let remaining = originalByteLimit;
    const seen = new Set<string>();
    for (const source of revision.content.sources) {
      const match = /^task-original:([a-f0-9-]{36})$/i.exec(source.id);
      if (!match || !source.checksum || seen.has(source.id))
        throw new Error("Rapportens originalreferencer kunne ikke verificeres.");
      seen.add(source.id);
      const signed = await signOriginal(match[1]);
      if (signed.sha256 !== source.checksum)
        throw new Error("Originalens kontrolsum afviger fra den gemte rapport.");
      const response = await fetch(signed.url, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      }).catch(() => {
        throw new Error("En originalfil kunne ikke hentes.");
      });
      if (!response.ok || !response.body) throw new Error("En originalfil kunne ikke hentes.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > remaining) throw new Error("Originalerne overskrider ZIP-grænsen på 25 MiB.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      if ((await sha256(bytes)) !== source.checksum)
        throw new Error("Originalfilen matcher ikke rapportens kontrolsum.");
      remaining -= size;
      const mime = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
      const extension = originalExtensions[mime] ?? "original";
      originals["originaler/" + match[1] + "." + extension] = bytes;
    }
  }
  return buildReportPackage(
    revision,
    [],
    classified ? "freyra.work-order-report-package/v2" : "freyra.work-order-report-package/v1",
    approval,
    "Pakken indeholder den gemte rapport, referencer til aflevering og gennemgang samt originalernes kildereferencer.\n" +
      (signOriginal
        ? "Originalmappen indeholder de verificerede filer navngivet efter dokumentationsreferencen.\n"
        : "Originalfilerne åbnes via opgaven i GoFreyra med aktuel adgang.\n") +
      "Rapportens egen status fremgår af PDF og rapportversionen.\n" +
      (classified
        ? `${source.label}. ${source.description}\nUdførelseskilde: ${approval.executionRevisionId}\n`
        : ""),
    originals,
  );
}

async function buildReportPackage(
  revision: ReportRevision,
  images: ReportImage[],
  schema:
    | "freyra.workflow-package/v1"
    | "freyra.work-order-report-package/v1"
    | "freyra.work-order-report-package/v2",
  inputs: NonNullable<
    ReportRevision["content"]["workflowSnapshot"] | ReportRevision["content"]["workOrderApproval"]
  >,
  readme: string,
  originals: Record<string, Uint8Array> = {},
) {
  const pdf = await generateReportFile(revision, "pdf", images);
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    "rapport.pdf": pdf.bytes,
    "rapportversion.json": encoder.encode(JSON.stringify(revision, null, 2)),
    "inputversioner.json": encoder.encode(JSON.stringify(inputs, null, 2)),
    "originalreferencer.json": encoder.encode(JSON.stringify(revision.content.sources, null, 2)),
    "LAES_MIG.txt": encoder.encode(readme),
    ...originals,
  };
  const manifest = [];
  for (const [name, bytes] of Object.entries(files)) {
    manifest.push({
      name,
      bytes: bytes.length,
      sha256: await sha256(bytes),
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

async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
