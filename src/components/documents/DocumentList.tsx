import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/ui-bits";
import { listDocuments, deleteDocument } from "@/services/documents-service";

interface Props {
  projectId: string;
}

export function DocumentList({ projectId }: Props) {
  const qc = useQueryClient();
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => listDocuments(projectId),
    enabled: !!projectId,
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      toast.success("Dokument slettet");
      qc.invalidateQueries({ queryKey: ["documents", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-2">Indlæser dokumenter…</p>;
  if (docs.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">Ingen genererede dokumenter endnu.</p>;
  }

  return (
    <div className="divide-y">
      {docs.map((d) => (
        <div key={d.id} className="py-3 flex items-start gap-3">
          <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{d.title}</span>
              <Pill tone={d.status === "generated" ? "info" : "default"}>{d.status}</Pill>
              <Pill tone="default">v{d.version}</Pill>
              <Pill tone="default">{d.document_type}</Pill>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {new Date(d.created_at).toLocaleString("da-DK")}
              {d.file_size ? ` · ${(d.file_size / 1024).toFixed(1)} KB` : ""}
              {d.file_name ? ` · ${d.file_name}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {d.storage_path && (
              <a
                href={d.storage_path}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 hover:bg-muted rounded"
                title="Hent"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={() => {
                if (confirm(`Slet "${d.title}"?`)) del.mutate(d.id);
              }}
              className="p-1.5 hover:bg-destructive/10 text-destructive rounded"
              title="Slet"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
