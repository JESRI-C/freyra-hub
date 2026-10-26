import { useState } from "react";
import { Download, FileText, Image, Loader2, Map, FileCheck } from "lucide-react";
import {
  evidenceTypeLabelDa,
  getEvidenceDownloadUrl,
  isEvidenceDownloadAvailable,
} from "@/services/evidence-service";
import type { EvidenceFile } from "@/lib/supabase/types";

function EvidenceIcon({ type }: { type: string | null }) {
  switch (type) {
    case "satellitbillede":
    case "foto":
      return <Image className="h-4 w-4 text-blue-500" />;
    case "kortlægning":
      return <Map className="h-4 w-4 text-purple-500" />;
    case "certifikat":
      return <FileCheck className="h-4 w-4 text-emerald-500" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

export function EvidenceList({ files }: { files: EvidenceFile[] }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  const handleDownload = async (file: EvidenceFile) => {
    if (downloadingId) return;
    if (!file.project_id) {
      setDownloadErrors((current) => ({
        ...current,
        [file.id]: "Dokumentationen mangler en gyldig projektreference.",
      }));
      return;
    }
    setDownloadingId(file.id);
    setDownloadErrors((current) => {
      const next = { ...current };
      delete next[file.id];
      return next;
    });

    try {
      const result = await getEvidenceDownloadUrl({
        evidenceId: file.id,
        projectId: file.project_id,
      });
      if (!result.data) {
        setDownloadErrors((current) => ({
          ...current,
          [file.id]: result.error ?? "Dokumentationen kunne ikke hentes.",
        }));
        return;
      }

      const link = document.createElement("a");
      link.href = result.data;
      link.download = "";
      link.referrerPolicy = "no-referrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setDownloadErrors((current) => ({
        ...current,
        [file.id]: "Dokumentationen kunne ikke hentes.",
      }));
    } finally {
      setDownloadingId(null);
    }
  };

  if (files.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Ingen dokumentation uploadet endnu
      </div>
    );
  }

  return (
    <div className="divide-y">
      {files.map((file) => {
        const isDownloading = downloadingId === file.id;
        const canDownload = isEvidenceDownloadAvailable(file);
        return (
          <div key={file.id} className="py-3">
            <div className="flex items-center gap-3">
              <EvidenceIcon type={file.evidence_type} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{file.title}</div>
                <div className="text-xs text-muted-foreground">
                  {evidenceTypeLabelDa(file.evidence_type ?? file.file_type ?? "fil")} ·{" "}
                  {new Date(file.created_at).toLocaleDateString("da-DK")}
                </div>
              </div>
              <span className="hidden sm:inline text-xs text-muted-foreground uppercase">
                {file.file_type ?? "ukendt"}
              </span>
              <button
                type="button"
                onClick={() => void handleDownload(file)}
                disabled={downloadingId !== null || !canDownload}
                aria-label={isDownloading ? `Henter ${file.title}` : `Hent ${file.title}`}
                aria-busy={isDownloading}
                title={canDownload ? undefined : "Filen er ikke tilgængelig til sikker download"}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isDownloading ? "Henter …" : "Hent"}
              </button>
            </div>
            {downloadErrors[file.id] && (
              <p role="alert" className="mt-2 pl-7 text-xs text-destructive">
                {downloadErrors[file.id]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
