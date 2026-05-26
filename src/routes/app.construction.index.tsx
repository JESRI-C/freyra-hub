import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Building2, Droplets, AlertTriangle, FileCheck } from "lucide-react";
import { Card, CardHeader, PageHeader, Pill, StatCard } from "@/components/ui-bits";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";
import { ConstructionProjectCard } from "@/components/construction/ConstructionProjectCard";
import { getConstructionProjects } from "@/services/construction-service";

// ─── Query ────────────────────────────────────────────────────────────────────

const constructionProjectsQuery = {
  queryKey: ["construction-projects"],
  queryFn: () => getConstructionProjects(),
};

export const Route = createFileRoute("/app/construction/")({
  head: () => ({ meta: [{ title: "Byggeri & Natur — GoFreyra" }] }),
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(constructionProjectsQuery),
  component: ConstructionIndexPage,
});

const STATUS_FILTERS = ["Alle", "Under verifikation", "Kladde", "Verificeret", "Afsluttet"];
const TYPE_FILTERS = ["Alle typer", "Parkering", "Erhvervsbyggeri", "Boligbyggeri"];

// ─── Page ─────────────────────────────────────────────────────────────────────

function ConstructionIndexPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alle");
  const [typeFilter, setTypeFilter] = useState("Alle typer");

  const { data: summaries } = useSuspenseQuery(constructionProjectsQuery);

  const filtered = useMemo(() => {
    return summaries.filter((s) => {
      if (statusFilter !== "Alle" && s.project.status !== statusFilter) return false;
      if (typeFilter !== "Alle typer" && s.project.project_type !== typeFilter) return false;
      if (q) {
        const search = q.toLowerCase();
        const text =
          `${s.project.name} ${s.project.location_name ?? ""} ${s.project.municipality ?? ""} ${s.project.project_type ?? ""}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
  }, [summaries, q, statusFilter, typeFilter]);

  const projectsNearWater = useMemo(
    () => summaries.filter((s) => s.natureContext?.watercourse_present).length,
    [summaries],
  );

  const openHighRisks = useMemo(
    () =>
      summaries.reduce(
        (acc, s) =>
          acc +
          s.risks.filter(
            (r) => r.status === "Åben" && (r.severity === "Kritisk" || r.severity === "Høj"),
          ).length,
        0,
      ),
    [summaries],
  );

  const authorityReportsReady = useMemo(
    () =>
      summaries.filter((s) =>
        s.submissions.some((sub) => sub.status === "Klar" || sub.status === "Indsendt"),
      ).length,
    [summaries],
  );

  const avgReadiness = useMemo(() => {
    if (summaries.length === 0) return 0;
    return Math.round(summaries.reduce((acc, s) => acc + s.readinessScore, 0) / summaries.length);
  }, [summaries]);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5 pb-16">
      <PageHeader
        title="Byggeri & Natur"
        description="Dokumentér projektkontext, afstrømningsrisici, afværgetiltag og myndighedspakke for byggeprojekter tæt på natur og vand."
        actions={<Pill tone="info">{summaries.length} projekter</Pill>}
      />

      <AiInsightBanner
        module="Byggeri & Natur"
        tone="risk"
        cacheKey={`construction:${summaries.length}:${openHighRisks}:${avgReadiness}`}
        context={`Antal byggeprojekter: ${summaries.length}. Projekter nær vandløb: ${projectsNearWater}. Åbne kritiske/høje risici: ${openHighRisks}. Myndighedspakker klar/indsendt: ${authorityReportsReady}. Gns. readiness: ${avgReadiness}%. Top-projekter: ${summaries.slice(0, 3).map((s) => `${s.project.name} (${s.project.status})`).join("; ")}.`}
      />

      {/* Stat bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <StatCard
          label="Aktive projekter"
          value={String(summaries.length)}
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatCard
          label="Projekter nær vand"
          value={String(projectsNearWater)}
          icon={<Droplets className="h-5 w-5" />}
          accent="bg-blue-100 text-blue-700"
        />
        <StatCard
          label="Åbne høje risici"
          value={String(openHighRisks)}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={openHighRisks > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}
        />
        <StatCard
          label="Myndigh. klar/indsendt"
          value={String(authorityReportsReady)}
          icon={<FileCheck className="h-5 w-5" />}
          accent="bg-emerald-100 text-emerald-700"
        />
      </div>

      {/* Average readiness */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-medium">Gennemsnitlig myndighedsklarhed</span>
          <span className="tabular-nums font-semibold">{avgReadiness}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              avgReadiness >= 80
                ? "bg-emerald-500"
                : avgReadiness >= 50
                  ? "bg-amber-400"
                  : "bg-red-400"
            }`}
            style={{ width: `${avgReadiness}%` }}
          />
        </div>
      </Card>

      {/* Search + filter */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 bg-muted/40 border rounded-xl px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg efter projektnavn, placering eller kommune…"
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
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                typeFilter === f
                  ? "bg-secondary text-secondary-foreground border-secondary"
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
            <ConstructionProjectCard key={s.project.id} summary={s} />
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
