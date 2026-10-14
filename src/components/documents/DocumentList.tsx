import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/ui-bits";
import { listDocuments, deleteDocument } from "@/services/documents-service";

interface Props {
  projectId: string;
}

export function DocumentList({ projectId }: Props) {
  const qc = useQueryClient();
  const {
    data: docs = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
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

  if (!projectId) return <p className="text-sm text-muted-foreground">Vælg et projekt.</p>;
  if (error)
    return (
      <div role="alert" className="text-sm py-2">
        Dokumentregistreringerne kunne ikke hentes.{" "}
        <button type="button" onClick={() => void refetch()} className="underline">
          Prøv igen
        </button>
      </div>
    );
  if (isLoading) return <p className="text-sm text-muted-foreground py-2">Indlæser dokumenter…</p>;
  if (docs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Ingen dokumentregistreringer for projektet endnu.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {docs.map((d) => (
        <div key={d.id} className="py-3 flex items-start gap-3">
          <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{d.title}</span>
              <Pill tone={d.status === "generated" ? "info" : "default"}>
                Registreret status: {d.status || "ukendt"}
              </Pill>
              <Pill tone="default">v{d.version}</Pill>
              <Pill tone="default">{d.document_type}</Pill>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {new Date(d.created_at).toLocaleString("da-DK")}
              {d.file_size ? ` · ${(d.file_size / 1024).toFixed(1)} KB` : ""}
              {d.file_name ? ` · ${d.file_name}` : ""}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {d.storage_path
                ? "Filreference registreret. Filens indhold og mulighed for genhentning er ikke verificeret."
                : "Kun dokumentregistrering. PDF-filen er ikke gemt til genhentning her."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {documentReferenceHref(d.storage_path) && (
              <a
                href={documentReferenceHref(d.storage_path)!}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 hover:bg-muted rounded"
                title="Åbn registreret filreference (ikke verificeret)"
                aria-label="Åbn registreret filreference (ikke verificeret)"
              >
                <ExternalLink className="h-4 w-4" />
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

function documentReferenceHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
