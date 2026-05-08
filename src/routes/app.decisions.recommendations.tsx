import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, PageHeader, StatCard } from "@/components/ui-bits";
import { RecommendationCard } from "@/components/decisions/RecommendationCard";
import { RecommendationDetail } from "@/components/decisions/RecommendationDetail";
import { RECOMMENDATIONS, CATEGORIES, type Recommendation, type Priority, type Status } from "@/lib/decisions-data";
import { ListChecks, AlertTriangle, FileCheck2, Database, Filter } from "lucide-react";
import { EmptyStateCard, actionToast } from "@/components/platform/Primitives";

export const Route = createFileRoute("/app/decisions/recommendations")({
  head: () => ({ meta: [{ title: "Anbefalinger — DecisionsIQ" }] }),
  component: Page,
});

const PRIORITIES: Priority[] = ["Høj", "Medium", "Lav"];
const STATUSES: Status[] = ["Åben", "Igangsat", "Dokumenteret", "Afventer data"];

function Page() {
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [priority, setPriority] = useState<string>("Alle");
  const [category, setCategory] = useState<string>("Alle");
  const [status, setStatus] = useState<string>("Alle");
  const [minConf, setMinConf] = useState<number>(0);

  const filtered = useMemo(
    () => RECOMMENDATIONS.filter((r) =>
      (priority === "Alle" || r.priority === priority) &&
      (category === "Alle" || r.category === category) &&
      (status === "Alle" || r.status === status) &&
      r.confidence * 100 >= minConf,
    ),
    [priority, category, status, minConf],
  );

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="Anbefalinger"
        description="AI-genererede anbefalinger med forventet effekt, datagrundlag og ejer."
        actions={<button onClick={() => actionToast("Anbefalingsliste eksporteret", "Filen er klar i Eksporter-historik")} className="text-sm rounded-lg border bg-card px-3 py-2">Eksportér liste</button>}
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Åbne anbefalinger" value="14" icon={<ListChecks className="h-5 w-5" />} />
        <StatCard label="Høj prioritet" value="5" icon={<AlertTriangle className="h-5 w-5" />} accent="bg-destructive/15 text-destructive" />
        <StatCard label="Kan dokumenteres direkte" value="7" icon={<FileCheck2 className="h-5 w-5" />} accent="bg-success/15 text-success" />
        <StatCard label="Kræver bedre datagrundlag" value="3" icon={<Database className="h-5 w-5" />} accent="bg-warning/20 text-warning-foreground" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Filter className="h-4 w-4" /> Filtre</div>
          <Select label="Prioritet" value={priority} onChange={setPriority} options={["Alle", ...PRIORITIES]} />
          <Select label="Kategori" value={category} onChange={setCategory} options={["Alle", ...CATEGORIES]} />
          <Select label="Status" value={status} onChange={setStatus} options={["Alle", ...STATUSES]} />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Min. konfidens</span>
            <input type="range" min={0} max={100} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="accent-primary" />
            <span className="tabular-nums w-10 text-right text-xs">{minConf}%</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} af {RECOMMENDATIONS.length}</div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((r) => (
          <RecommendationCard key={r.id} r={r} onClick={() => setSelected(r)} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full">
            <EmptyStateCard
              title="Ingen anbefalinger matcher filteret"
              description="Der er ingen anbefalinger med det valgte filter. Prøv at nulstille prioritet, kategori eller status."
            />
          </div>
        )}
      </div>

      <RecommendationDetail r={selected} onClose={() => setSelected(null)} />
    </main>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
