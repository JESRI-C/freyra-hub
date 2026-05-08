import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Leaf, Droplets, Trees, Database, AlertTriangle, FileText, ChevronRight, Info, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { InsightCard, ConfidenceScore, RiskBadge } from "@/components/decisions/Primitives";
import { KEY_INSIGHTS, TIMELINE_CHANGES, RECOMMENDATIONS, RISK_SNAPSHOT } from "@/lib/decisions-data";
import { getCurrentProject, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/decisions/")({
  head: () => ({ meta: [{ title: "AI-overblik — DecisionsIQ" }] }),
  component: OverviewPage,
});

const ICONS: Record<string, React.ReactNode> = {
  co2: <Leaf className="h-4 w-4" />,
  bio: <Trees className="h-4 w-4" />,
  water: <Droplets className="h-4 w-4" />,
  data: <Database className="h-4 w-4" />,
  anomaly: <AlertTriangle className="h-4 w-4" />,
};

function OverviewPage() {
  const { orgId, projectId } = useAuth();
  const project = getCurrentProject(orgId, projectId);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      {/* Hero summary */}
      <Card className="overflow-hidden">
        <div className="p-6 sm:p-8 grid lg:grid-cols-[1fr_auto] gap-6 items-start"
             style={{ background: "linear-gradient(135deg, oklch(0.95 0.04 150 / 0.5), oklch(0.97 0.02 150 / 0.3))" }}>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-leaf/20 text-primary">
                <Sparkles className="h-3.5 w-3.5" /> AI-overblik
              </span>
              <span className="text-xs text-muted-foreground">Opdateret 14 min siden</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Beslutningsgrundlag baseret på projektets nyeste data</h2>
            <p className="mt-3 text-sm text-foreground/80 max-w-3xl leading-relaxed">
              {project?.name ?? "Projektet"} viser samlet positiv udvikling med målbar fremgang i biodiversitet og en moderat
              CO₂-reduktion. AI'en har identificeret 5 anbefalinger med høj forventet effekt og 3 risici, hvoraf
              vandkvalitet i zone 3 vurderes som kritisk. Datagrundlaget er solidt, men felt-dækning og forældede
              emissionsfaktorer kræver opmærksomhed inden Q2-rapport.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <ConfidenceScore value={0.82} />
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="text-xs text-muted-foreground">
                Datafriskhed: <span className="text-foreground font-medium">3 min</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="text-xs text-muted-foreground">
                14 datasæt · 6 kilder
              </div>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-soft hover:opacity-95 whitespace-nowrap">
            <FileText className="h-4 w-4" /> Generér beslutningsnotat
          </button>
        </div>
      </Card>

      {/* Key insights */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Centrale indsigter</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <InsightCard {...KEY_INSIGHTS[0]} icon={<TrendingUp className="h-5 w-5" />} />
          <InsightCard {...KEY_INSIGHTS[1]} icon={<AlertTriangle className="h-5 w-5" />} />
          <InsightCard {...KEY_INSIGHTS[2]} icon={<Database className="h-5 w-5" />} />
          <InsightCard {...KEY_INSIGHTS[3]} icon={<Sparkles className="h-5 w-5" />} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader title="Hvad har ændret sig?" subtitle="Månedlige ændringer i projektets nøgletal" />
          <ul className="px-5 pb-5 space-y-3">
            {TIMELINE_CHANGES.map((c, i) => (
              <li key={i} className="flex gap-3 items-start">
                <div className="text-xs text-muted-foreground w-10 pt-2">{c.month}</div>
                <div className={`h-8 w-8 rounded-lg grid place-items-center ${
                  c.tone === "success" ? "bg-success/15 text-success"
                  : c.tone === "danger" ? "bg-destructive/15 text-destructive"
                  : c.tone === "warning" ? "bg-warning/20 text-warning-foreground"
                  : "bg-leaf/20 text-primary"
                }`}>
                  {ICONS[c.icon]}
                </div>
                <div className="flex-1 pt-1.5 text-sm">{c.label}</div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Risk snapshot */}
        <Card>
          <CardHeader title="Risikobillede" subtitle="Status og udvikling pr. kategori" />
          <ul className="px-5 pb-5 space-y-3">
            {RISK_SNAPSHOT.map((r) => {
              const down = r.trend < 0;
              return (
                <li key={r.name} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${r.score >= 65 ? "bg-destructive" : r.score >= 45 ? "bg-warning" : "bg-success"}`}
                           style={{ width: `${r.score}%` }} />
                    </div>
                  </div>
                  <div className={`text-xs flex items-center gap-0.5 w-12 justify-end ${down ? "text-success" : "text-destructive"}`}>
                    {down ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {Math.abs(r.trend)}%
                  </div>
                  <RiskBadge level={r.level} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Priority recommendations */}
      <Card>
        <CardHeader title="Prioriterede anbefalinger" subtitle="Top 5 anbefalinger med højest forventet effekt"
                    action={<a href="/app/decisions/recommendations" className="text-sm text-primary hover:underline">Se alle</a>} />
        <ul className="divide-y">
          {RECOMMENDATIONS.slice(0, 5).map((r) => (
            <li key={r.id} className="px-5 py-3.5 flex items-center gap-4">
              <div className="h-9 w-9 rounded-xl bg-leaf/15 text-primary grid place-items-center"><Sparkles className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{r.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  Datagrundlag: {r.dataBasis.slice(0, 2).join(" · ")}
                </div>
              </div>
              <Pill>{r.category}</Pill>
              <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                r.priority === "Høj" ? "bg-destructive/15 text-destructive"
                : r.priority === "Medium" ? "bg-warning/20 text-warning-foreground"
                : "bg-muted text-muted-foreground"
              }`}>{r.priority}</div>
              <div className="hidden md:block text-xs text-muted-foreground w-32 text-right">{r.expectedEffect}</div>
              <ConfidenceScore value={r.confidence} size="sm" />
              <a href="/app/decisions/recommendations" className="ml-2 text-sm text-primary inline-flex items-center gap-1 hover:underline">
                Se anbefaling <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </Card>

      {/* AI explanation */}
      <Card className="p-5">
        <div className="flex gap-3">
          <div className="h-9 w-9 rounded-xl bg-leaf/15 text-primary grid place-items-center shrink-0"><Info className="h-4 w-4" /></div>
          <div>
            <div className="font-medium">Sådan er analysen beregnet</div>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              DecisionsIQ kombinerer realtids-sensordata, Sentinel-2 satellitobservationer, manuelle feltregistreringer,
              ESG-indikatorer fra ledger samt tredjepartsverificeret data. Modellen anvender trendanalyse og anomalidetektion
              over rullende 90-dages vinduer og krydsvalideres mod projektets baseline. Konfidens-score afspejler datadækning,
              kildebredde og overensstemmelse mellem signaler. Alle anbefalinger er sporbare ned til de underliggende
              datapunkter.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}
