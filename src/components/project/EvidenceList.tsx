import { FileText, Image, Map, FileCheck } from "lucide-react";
import { evidenceTypeLabelDa } from "@/services/evidence-service";
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
  if (files.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Ingen dokumentation uploadet endnu
      </div>
    );
  }

  return (
    <div className="divide-y">
      {files.map((file) => (
        <div key={file.id} className="flex items-center gap-3 py-3">
          <EvidenceIcon type={file.evidence_type} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{file.title}</div>
            <div className="text-xs text-muted-foreground">
              {evidenceTypeLabelDa(file.evidence_type ?? file.file_type ?? "fil")} ·{" "}
              {new Date(file.created_at).toLocaleDateString("da-DK")}
            </div>
          </div>
          <span className="text-xs text-muted-foreground uppercase">
            {file.file_type ?? "ukendt"}
          </span>
        </div>
      ))}
    </div>
  );
}
