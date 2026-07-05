import { createFileRoute } from "@tanstack/react-router";
import {
  Sparkles,
  Leaf,
  Droplets,
  Trees,
  Database,
  AlertTriangle,
  FileText,
  ChevronRight,
  Info,
  TrendingUp,
  TrendingDown,
  ListTodo,
  BookCheck,
  Cable,
  Repeat2,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { InsightCard, ConfidenceScore, RiskBadge } from "@/components/decisions/Primitives";
import {
  KEY_INSIGHTS,
  TIMELINE_CHANGES,
  RECOMMENDATIONS,
  RISK_SNAPSHOT,
} from "@/lib/decisions-data";
import {
  ModuleHeader,
  ActivityFeed,
  CriticalActionsPanel,
  ReportReadinessBadge,
  CrossModuleLink,
  actionToast,
} from "@/components/platform/Primitives";
import { PROJECT_FACTS } from "@/lib/platform-data";
import { useLiveActivityFeed, useLiveCriticalActions } from "@/lib/platform-live";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";

export const Route = createFileRoute("/app/decisions/")({
  head: () => ({ meta: [{ title: "DecisionsIQ — GoFreyra" }] }),
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
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <ModuleHeader
        eyebrow="DecisionsIQ"
        title="DecisionsIQ"
        subtitle="AI-drevet beslutningsgrundlag baseret på projektets nyeste data."
        projectName={PROJECT_FACTS.name}
        freshness="14 min"
        status={PROJECT_FACTS.status}
        readiness={PROJECT_FACTS.reportReadiness}
        primaryCta={{
          label: "Generér beslutningsnotat",
          to: "/app/decisions/notes",
          icon: <FileText className="h-4 w-4" />,
        }}
        secondaryCta={{
          label: "Se anbefalinger",
          to: "/app/decisions/recommendations",
          icon: <Sparkles className="h-4 w-4" />,
        }}
      />

      <AiInsightBanner
        module="DecisionsIQ"
        tone="risk"
        context={`Projekt: ${PROJECT_FACTS.name}. Åbne anbefalinger: ${PROJECT_FACTS.openRecommendations}. Biodiversitetsindeks: ${PROJECT_FACTS.biodiversityIndex}. Nøgleindsigter: ${KEY_INSIGHTS.slice(0, 3).map((k) => `${k.label}: ${k.value} (${k.description})`).join("; ")}. Top-anbefalinger: ${RECOMMENDATIONS.slice(0, 3).map((r) => r.title).join("; ")}.`}
      />



      <div className="flex flex-wrap items-center gap-3 text-xs">
        <ConfidenceScore value={0.82} />
        <span className="text-muted-foreground">
          {PROJECT_FACTS.activeDataSources} datakilder · {PROJECT_FACTS.openRecommendations} åbne
          anbefalinger
        </span>
        <ReportReadinessBadge value={PROJECT_FACTS.reportReadiness} />
      </div>

      {/* Key insights */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Centrale indsigter
        </h3>
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
          <CardHeader
            title="Hvad har ændret sig?"
            subtitle="Månedlige ændringer i projektets nøgletal"
          />
          <ul className="px-5 pb-5 space-y-3">
            {TIMELINE_CHANGES.map((c, i) => (
              <li key={i} className="flex gap-3 items-start">
                <div className="text-xs text-muted-foreground w-10 pt-2">{c.month}</div>
                <div
                  className={`h-8 w-8 rounded-lg grid place-items-center ${
                    c.tone === "success"
                      ? "bg-success/15 text-success"
                      : c.tone === "danger"
                        ? "bg-destructive/15 text-destructive"
                        : c.tone === "warning"
                          ? "bg-warning/20 text-warning-foreground"
                          : "bg-leaf/20 text-primary"
                  }`}
                >
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
                      <div
                        className={`h-full ${r.score >= 65 ? "bg-destructive" : r.score >= 45 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${r.score}%` }}
                      />
                    </div>
                  </div>
                  <div
                    className={`text-xs flex items-center gap-0.5 w-12 justify-end ${down ? "text-success" : "text-destructive"}`}
                  >
                    {down ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : (
                      <TrendingUp className="h-3 w-3" />
                    )}
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
        <CardHeader
          title="Prioriterede anbefalinger"
          subtitle="Top 5 anbefalinger med højest forventet effekt"
          action={
            <a
              href="/app/decisions/recommendations"
              className="text-sm text-primary hover:underline"
            >
              Se alle
            </a>
          }
        />
        <ul className="divide-y">
          {RECOMMENDATIONS.slice(0, 5).map((r) => (
            <li key={r.id} className="px-5 py-3.5 flex items-center gap-4">
              <div className="h-9 w-9 rounded-xl bg-leaf/15 text-primary grid place-items-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{r.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  Datagrundlag: {r.dataBasis.slice(0, 2).join(" · ")}
                </div>
              </div>
              <Pill>{r.category}</Pill>
              <div
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  r.priority === "Høj"
                    ? "bg-destructive/15 text-destructive"
                    : r.priority === "Medium"
                      ? "bg-warning/20 text-warning-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {r.priority}
              </div>
              <div className="hidden md:block text-xs text-muted-foreground w-32 text-right">
                {r.expectedEffect}
              </div>
              <ConfidenceScore value={r.confidence} size="sm" />
              <a
                href="/app/decisions/recommendations"
                className="ml-2 text-sm text-primary inline-flex items-center gap-1 hover:underline"
              >
                Se anbefaling <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </Card>

      {/* Cross-module actions */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            Send anbefaling
          </div>
          <button
            onClick={() => actionToast("Opgave oprettet", "Tildelt projektgruppen")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <ListTodo className="h-3.5 w-3.5" /> Opret opgave
          </button>
          <button
            onClick={() => actionToast("Anbefalingen er tilføjet til rapportudkastet")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5" /> Send til rapport
          </button>
          <CrossModuleLink to="/app/connect/sources" label="Se datakilde i Smart Connect" />
          <CrossModuleLink to="/app/ledger" label="Dokumentér i ESG Ledger" />
          <CrossModuleLink to="/app/impact/projects" label="Find projekt i Impact Exchange" />
        </div>
      </Card>

      {/* Activity + critical actions filtered to DecisionsIQ */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Seneste aktivitet" subtitle="DecisionsIQ-relaterede hændelser" />
          <ActivityFeed
            items={ACTIVITY_FEED.filter((a) => a.module === "DecisionsIQ").concat(
              ACTIVITY_FEED.filter((a) => a.module !== "DecisionsIQ").slice(0, 2),
            )}
          />
        </Card>
        <Card>
          <CardHeader title="Kritiske handlinger" subtitle="Prioriterede opgaver" />
          <CriticalActionsPanel
            items={CRITICAL_ACTIONS.filter((c) => c.module === "DecisionsIQ")}
          />
        </Card>
      </div>

      {/* AI explanation */}
      <Card className="p-5">
        <div className="flex gap-3">
          <div className="h-9 w-9 rounded-xl bg-leaf/15 text-primary grid place-items-center shrink-0">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium">Sådan er analysen beregnet</div>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              DecisionsIQ kombinerer realtids-sensordata, Sentinel-2 satellitobservationer, manuelle
              feltregistreringer, ESG-indikatorer fra ledger samt tredjepartsverificeret data.
              Modellen anvender trendanalyse og anomalidetektion over rullende 90-dages vinduer og
              krydsvalideres mod projektets baseline. Konfidens-score afspejler datadækning,
              kildebredde og overensstemmelse mellem signaler. Alle anbefalinger er sporbare ned til
              de underliggende datapunkter.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}
