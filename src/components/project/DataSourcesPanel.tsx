import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Link2, PlugZap, Radio, Satellite, FileSpreadsheet, PencilLine } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import type { DataSource, Site } from "@/lib/supabase/types";
import { dataSourceStatusLabel, dataSourceStatusTone, formatLastSync } from "@/services/data-sources-service";
import { deleteDataSource } from "@/services/data-sources-wizard-service";
import { DataSourceWizard } from "@/components/project/DataSourceWizard";

const TYPE_ICON: Record<string, React.ReactNode> = {
  file_upload: <FileSpreadsheet className="h-4 w-4" />,
  api_endpoint: <PlugZap className="h-4 w-4" />,
  satellite: <Satellite className="h-4 w-4" />,
  iot_sensor: <Radio className="h-4 w-4" />,
  manual: <PencilLine className="h-4 w-4" />,
};

export function DataSourcesPanel({
  projectId,
  sites,
  dataSources,
}: {
  projectId: string;
  sites: Site[];
  dataSources: DataSource[];
}) {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [siteFilter, setSiteFilter] = useState<string | "all" | "none">("all");

  const siteName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sites) map.set(s.id, s.name);
    return (id: string | null | undefined) => (id ? (map.get(id) ?? "Ukendt site") : "Projekt-niveau");
  }, [sites]);

  const filtered = useMemo(() => {
    if (siteFilter === "all") return dataSources;
    if (siteFilter === "none") return dataSources.filter((d) => !d.site_id);
    return dataSources.filter((d) => d.site_id === siteFilter);
  }, [dataSources, siteFilter]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["data-sources", projectId] });
  }

  async function handleDelete(ds: DataSource) {
    if (!confirm(`Slet datakilden "${ds.name}"?`)) return;
    try {
      await deleteDataSource(ds.id, projectId);
      toast.success("Datakilde fjernet");
      await refresh();
    } catch (err) {
      toast.error(`Kunne ikke slette: ${(err as Error).message}`);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Datakilder"
        subtitle="Tilknyttede datafeeds og integrationer — én pr. site eller på projekt-niveau"
        action={
          <div className="flex items-center gap-2">
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value as typeof siteFilter)}
              className="text-xs rounded-lg border bg-card px-2 py-1.5"
            >
              <option value="all">Alle sites ({dataSources.length})</option>
              <option value="none">Projekt-niveau</option>
              {sites.filter((s) => (s.status ?? "active") === "active").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Ny datakilde
            </button>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Ingen datakilder her endnu. Klik <span className="font-medium">Ny datakilde</span> for at starte wizarden.
        </div>
      ) : (
        <div className="px-5 pb-4 divide-y">
          {filtered.map((ds) => {
            const tone = dataSourceStatusTone(ds.status ?? "offline");
            return (
              <div key={ds.id} className="py-3 flex items-center gap-3">
                <span className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${
                  tone === "success" ? "bg-emerald-100 text-emerald-700"
                    : tone === "warning" ? "bg-amber-100 text-amber-700"
                    : tone === "danger" ? "bg-red-100 text-red-700"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {TYPE_ICON[ds.source_type ?? ""] ?? <PlugZap className="h-4 w-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{ds.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <span>{ds.source_type ?? "—"}</span>
                    {ds.provider && <><span>·</span><span>{ds.provider}</span></>}
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />{siteName(ds.site_id)}</span>
                  </div>
                  {ds.last_sync_message && (
                    <div className="text-xs mt-0.5 text-muted-foreground italic truncate">{ds.last_sync_message}</div>
                  )}
                </div>
                <div className="text-right shrink-0 mr-2">
                  <Pill tone={tone === "danger" ? "warning" : tone === "neutral" ? "default" : tone}>
                    {dataSourceStatusLabel(ds.status ?? "offline")}
                  </Pill>
                  <div className="text-xs text-muted-foreground mt-1">{formatLastSync(ds.last_sync_at)}</div>
                </div>
                <button
                  onClick={() => handleDelete(ds)}
                  className="h-8 w-8 rounded-lg hover:bg-muted grid place-items-center text-muted-foreground hover:text-destructive"
                  title="Slet"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {wizardOpen && (
        <DataSourceWizard
          projectId={projectId}
          sites={sites}
          onClose={() => setWizardOpen(false)}
          onCreated={refresh}
        />
      )}
    </Card>
  );
}
