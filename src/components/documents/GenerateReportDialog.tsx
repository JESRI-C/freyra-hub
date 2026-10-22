import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { generateProjectReport } from "@/services/documents-service";
import type { Project, Site, Action, Indicator } from "@/lib/supabase/types";

interface Props {
  project: Project;
  sites: Site[];
  actions: Action[];
  indicators: Indicator[];
}

const TYPES: { value: "status" | "indicator" | "authority"; label: string; hint: string }[] = [
  { value: "status", label: "Projektstatusrapport", hint: "Overblik over sites, indikatorer og handlinger" },
  { value: "indicator", label: "Indikatorrapport", hint: "Fokus på KPI'er og trends" },
  { value: "authority", label: "Myndighedsrapport", hint: "Formel dokumentation til myndigheder" },
];

export function GenerateReportDialog({ project, sites, actions, indicators }: Props) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<"status" | "indicator" | "authority">("status");
  const qc = useQueryClient();

  const gen = useMutation({
    mutationFn: () => generateProjectReport({ project, sites, actions, indicators, reportType }),
    onSuccess: (out) => {
      // Trigger download
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = out.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(out.documentId ? "Rapport genereret og gemt" : "Rapport hentet (ikke gemt — DB ikke tilgængelig)");
      qc.invalidateQueries({ queryKey: ["documents", project.id] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(`Kunne ikke generere: ${e.message}`),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90"
      >
        <FileDown className="h-4 w-4" />
        Generér rapport
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !gen.isPending && setOpen(false)}>
      <div className="bg-background rounded-xl border shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">Generér rapport</h3>
        <p className="text-xs text-muted-foreground mb-4">Vælg rapporttype. PDF hentes automatisk og gemmes på projektet.</p>

        <div className="space-y-2 mb-4">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={`flex items-start gap-2 p-3 border rounded-lg cursor-pointer ${
                reportType === t.value ? "border-primary bg-primary/5" : ""
              }`}
            >
              <input
                type="radio"
                name="reportType"
                value={t.value}
                checked={reportType === t.value}
                onChange={() => setReportType(t.value)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            disabled={gen.isPending}
            className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted"
          >
            Annullér
          </button>
          <button
            onClick={() => gen.mutate()}
            disabled={gen.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Generér
          </button>
        </div>
      </div>
    </div>
  );
}
