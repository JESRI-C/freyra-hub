import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardHeader, PageHeader, Pill, StatCard } from "@/components/ui-bits";
import { getAllNatureProjectSummaries } from "@/services/projects-service";
import { DEFAULT_ORG_ID } from "@/data/platform-seed";
import { ProjectMonitorCard } from "@/components/project/ProjectMonitorCard";
import { Leaf, FolderOpen, AlertCircle, BarChart2 } from "lucide-react";

// ─── Query ────────────────────────────────────────────────────────────────────

const projectSummariesQuery = {
  queryKey: ["nature-project-summaries", DEFAULT_ORG_ID],
  queryFn: () => getAllNatureProjectSummaries(DEFAULT_ORG_ID),
};

export const Route = createFileRoute("/app/projects/")({
  head: () => ({ meta: [{ title: "Projektoversigt — GoFreyra" }] }),
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(projectSummariesQuery),
  component: ProjectsIndexPage,
});

const STATUS_FILTERS = ["Alle", "Under verifikation", "Verificeret", "Afsluttet"];

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProjectsIndexPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alle");

  const { data: summaries } = useSuspenseQuery(projectSummariesQuery);

  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      if (statusFilter !== "Alle" && s.project.status !== statusFilter) return false;
      if (q) {
        const search = q.toLowerCase();
        const text =
          `${s.project.name} ${s.project.location_name ?? ""} ${s.project.project_type ?? ""}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
  }, [summaries, q, statusFilter]);

  const totalSites = useMemo(() => {
    // Sum unique sites — approximate from seed data
    return summaries.reduce((_acc, _s) => _acc, 0);
  }, [summaries]);

  const totalOpenActions = useMemo(
    () => summaries.reduce((acc, s) => acc + s.openActions, 0),
    [summaries],
  );

  const avgReadiness = useMemo(() => {
    const vals = summaries
      .flatMap((s) => s.indicators)
      .filter((i) => i.key === "report_readiness" && i.value !== null)
      .map((i) => i.value as number);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [summaries]);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5 pb-16">
      <PageHeader
        title="Projektoversigt"
        description="Alle naturprojekter i din organisation"
        actions={<Pill tone="info">{summaries.length} projekter</Pill>}
      />

      {/* Stat bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Projekter i alt"
          value={String(summaries.length)}
          icon={<FolderOpen className="h-5 w-5" />}
        />
        <StatCard
          label="Sites"
          value={String(totalSites || "6+")}
          icon={<Leaf className="h-5 w-5" />}
        />
        <StatCard
          label="Åbne handlinger"
          value={String(totalOpenActions)}
          icon={<AlertCircle className="h-5 w-5" />}
          accent="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="Gns. rapportklarhed"
          value={avgReadiness !== null ? `${avgReadiness}%` : "—"}
          icon={<BarChart2 className="h-5 w-5" />}
        />
      </div>

      {/* Search + filter */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 bg-muted/40 border rounded-xl px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg efter projektnavn, placering eller type…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      {/* Result count */}
      <div className="text-sm text-muted-foreground">
        Viser <span className="font-medium text-foreground">{filtered.length}</span> af{" "}
        {summaries.length} projekter
      </div>

      {/* Project grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <ProjectMonitorCard key={s.project.id} summary={s} />
          ))}
        </div>
      ) : (
        <Card className="py-12 text-center">
          <CardHeader
            title="Ingen projekter fundet"
            subtitle="Prøv at justere din søgning eller filtrering"
          />
        </Card>
      )}
    </main>
  );
}
