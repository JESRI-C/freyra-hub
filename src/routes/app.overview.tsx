import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader } from "@/components/ui-bits";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";
import {
  ModuleStatusCard,
  DataFlowDiagram,
  ActivityFeed,
  CriticalActionsPanel,
  OnboardingChecklist,
  ReadinessScore,
  StatusBadge,
} from "@/components/platform/Primitives";
import {
  PLATFORM_MODULES,
  ACTIVITY_FEED,
  CRITICAL_ACTIONS,
  ONBOARDING_STEPS,
  PROJECT_FACTS,
  AI_SUMMARY,
  NEXT_RECOMMENDED_ACTIONS,
  KEY_MESSAGE,
  POSITIONING_STATEMENT,
  NATURE_DASHBOARD_CARDS,
  STRATEGIC_SECTIONS,
} from "@/lib/platform-data";
import {
  Sparkles,
  ArrowRight,
  MapPin,
  FileText,
  TrendingUp,
  Database,
  ClipboardList,
  Radio,
  Info,
} from "lucide-react";
import { getLiveDataConfig } from "@/config/live-data-config";
import { getCurrentOrg, getCurrentProject, useAuth } from "@/lib/auth";
import { getAllNatureProjectSummaries } from "@/services/projects-service";
import { getAllOpenActions } from "@/services/actions-service";
import { DEFAULT_ORG_ID } from "@/data/platform-seed";
import type { NatureProjectSummary } from "@/lib/supabase/types";

// ─── Queries ──────────────────────────────────────────────────────────────────

const projectSummariesQuery = {
  queryKey: ["nature-project-summaries", DEFAULT_ORG_ID],
  queryFn: () => getAllNatureProjectSummaries(DEFAULT_ORG_ID),
};

const openActionsQuery = {
  queryKey: ["all-open-actions"],
  queryFn: () => getAllOpenActions(),
};

export const Route = createFileRoute("/app/overview")({
  head: () => ({ meta: [{ title: "Oversigt — GoFreyra" }] }),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(projectSummariesQuery),
      queryClient.ensureQueryData(openActionsQuery),
    ]),
  component: OverviewPage,
});

function LiveKpiStrip({
  summaries,
  openActionCount,
}: {
  summaries: NatureProjectSummary[];
  openActionCount: number;
}) {
  const avgBiodiversity =
    summaries.reduce((sum, s) => {
      const bi = s.indicators.find((i) => i.key === "biodiversity_index");
      return sum + (bi?.value ?? 0);
    }, 0) / (summaries.length || 1);

  const avgDataQuality =
    summaries.reduce((sum, s) => {
      const dq = s.indicators.find((i) => i.key === "data_quality");
      return sum + (dq?.value ?? 0);
    }, 0) / (summaries.length || 1);

  const totalActiveSources = summaries.reduce((sum, s) => sum + s.activeDataSources, 0);

  const kpis = [
    {
      label: "Aktive projekter",
      value: String(summaries.length),
      icon: <TrendingUp className="h-4 w-4" />,
      color: "text-emerald-600",
    },
    {
      label: "Ø biodiversitetsindeks",
      value: `${avgBiodiversity.toFixed(0)}/100`,
      icon: <TrendingUp className="h-4 w-4" />,
      color: "text-emerald-600",
    },
    {
      label: "Ø datakvalitet",
      value: `${avgDataQuality.toFixed(0)}%`,
      icon: <Database className="h-4 w-4" />,
      color: "text-emerald-600",
    },
    {
      label: "Aktive datakilder",
      value: String(totalActiveSources),
      icon: <Database className="h-4 w-4" />,
      color: "text-blue-600",
    },
    {
      label: "Åbne handlinger",
      value: String(openActionCount),
      icon: <ClipboardList className="h-4 w-4" />,
      color: openActionCount > 0 ? "text-amber-600" : "text-emerald-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-xl border bg-card p-4 space-y-1">
          <div className={`${k.color}`}>{k.icon}</div>
          <div className="text-2xl font-semibold">{k.value}</div>
          <div className="text-xs text-muted-foreground">{k.label}</div>
        </div>
      ))}
    </div>
  );
}

function LiveDataWidget() {
  const config = getLiveDataConfig();
  return (
    <div
      className={`rounded-xl border p-4 flex items-center gap-4 ${
        config.mode === "live" ? "bg-emerald-50 border-emerald-200" : "bg-muted/30 border-dashed"
      }`}
    >
      <div
        className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${
          config.mode === "live"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Radio className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium flex items-center gap-2">
          Live Data
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
              config.mode === "live"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {config.mode === "live" ? "Live" : "Preview"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {config.mode === "preview"
            ? `Preview mode aktiv — ${
                config.missingKeys.length > 0
                  ? config.missingKeys.join(", ") + " mangler"
                  : "sæt VITE_ENABLE_LIVE_DATA=true for at aktivere"
              }`
            : `${4 - config.missingKeys.length} af 4 connectorer aktive`}
        </div>
      </div>
      <Link to="/app/system-test" className="text-xs text-primary hover:underline shrink-0">
        Detaljer →
      </Link>
    </div>
  );
}

function OverviewPage() {
  const { data: summaries } = useSuspenseQuery(projectSummariesQuery);
  const { data: openActions } = useSuspenseQuery(openActionsQuery);
  const { user, orgId, projectId } = useAuth();
  const org = getCurrentOrg(orgId);
  const project = getCurrentProject(orgId, projectId);
  const firstName = user?.name.split(" ")[0] ?? "";

  // Build project id → slug map from summaries for action links
  const projectSlugMap = Object.fromEntries(
    summaries.map((s) => [s.project.id, s.project.slug ?? s.project.id]),
  );
  // Map live actions to the format CriticalActionsPanel expects
  const liveActionItems = openActions.slice(0, 5).map((a) => {
    const slug = a.project_id ? (projectSlugMap[a.project_id] ?? null) : null;
    const projectName =
      summaries.find((s) => s.project.id === a.project_id)?.project.name ?? "Projekt";
    return {
      module: projectName,
      title: a.title,
      priority: a.priority ?? "Lav",
      owner: a.owner ?? "—",
      deadline: a.due_date
        ? new Date(a.due_date).toLocaleDateString("da-DK", { day: "numeric", month: "short" })
        : "—",
      href: slug ? `/app/projects/${slug}` : "/app/projects",
    };
  });

  return (
    <>
      <AppTopbar title="Oversigt" subtitle={`${org?.name ?? ""} · ${project?.name ?? ""}`} />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
        <PageHeader
          title={`God morgen ${firstName} 👋`}
          description={POSITIONING_STATEMENT}
          actions={
            <Link
              to="/app/reports/builder"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-soft hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" /> Generér rapport
            </Link>
          }
        />

        {/* Key message — biodiversity ≠ CO2 */}
        <Card className="p-5 border-l-4 border-l-primary bg-leaf/10">
          <div className="flex gap-3 items-start">
            <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
                Princip
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{KEY_MESSAGE}</p>
            </div>
          </div>
        </Card>

        {/* Nature project dashboard cards */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Naturprojekt-status
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {NATURE_DASHBOARD_CARDS.map((c) => {
              const toneClass =
                c.tone === "success"
                  ? "text-success border-success/30"
                  : c.tone === "warning"
                    ? "text-warning-foreground border-warning/40"
                    : c.tone === "danger"
                      ? "text-destructive border-destructive/30"
                      : "text-foreground border-border";
              return (
                <Link
                  key={c.id}
                  to={c.href}
                  className={`rounded-xl border bg-card p-4 hover:shadow-soft transition block ${toneClass}`}
                >
                  <div className="text-xs text-muted-foreground">{c.title}</div>
                  <div className="text-2xl font-semibold mt-1.5">{c.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Live KPIs from data layer */}
        <LiveKpiStrip summaries={summaries} openActionCount={openActions.length} />

        {/* AI overview insight */}
        <AiInsightBanner
          module="Oversigt"
          tone="action"
          cacheKey={`overview:${summaries.length}:${openActions.length}`}
          context={`Antal projekter: ${summaries.length}. Åbne handlinger: ${openActions.length}. Højeste prioritet åbne handlinger: ${openActions.filter((a) => a.priority === "Høj").length}. Top-projekter (areal): ${summaries.slice(0, 3).map((s) => `${s.project.name}`).join(", ")}. Rapportklarhed: ${PROJECT_FACTS.reportReadiness}%. Datakvalitet: ${PROJECT_FACTS.dataQuality}%. Status: ${PROJECT_FACTS.status}.`}
        />

        {/* Live Data widget */}
        <LiveDataWidget />


        {/* Executive summary */}
        <Card className="overflow-hidden">
          <div
            className="p-6 grid lg:grid-cols-[1.6fr_1fr] gap-6"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.95 0.04 150 / 0.5), oklch(0.97 0.02 150 / 0.3))",
            }}
          >
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-leaf/30 text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> AI-resumé
                </span>
                <StatusBadge status={PROJECT_FACTS.status} />
                <span className="text-xs text-muted-foreground">Opdateret 14 min siden</span>
              </div>
              <h2 className="text-xl font-semibold tracking-tight">{PROJECT_FACTS.name}</h2>
              <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> {PROJECT_FACTS.location} · {PROJECT_FACTS.area}
              </div>
              <p className="mt-4 text-sm text-foreground/85 leading-relaxed max-w-2xl">
                {AI_SUMMARY}
              </p>
              <div className="mt-5 grid grid-cols-3 gap-3 max-w-md">
                <div>
                  <div className="text-xs text-muted-foreground">Datakvalitet</div>
                  <div className="text-lg font-semibold mt-0.5">{PROJECT_FACTS.dataQuality}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Biodiversitet</div>
                  <div className="text-lg font-semibold mt-0.5">
                    {PROJECT_FACTS.biodiversityIndex}/100
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Datakilder</div>
                  <div className="text-lg font-semibold mt-0.5">
                    {PROJECT_FACTS.activeDataSources}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-card border p-5 space-y-4">
              <div className="text-sm font-semibold">Rapportklarhed</div>
              <ReadinessScore value={PROJECT_FACTS.reportReadiness} />
              <div className="text-xs text-muted-foreground">
                Klar til intern brug. Eksterne ESG-bilag kræver feltverifikation og dronemetadata.
              </div>
              <div className="space-y-1.5 pt-2 border-t">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Kritiske mangler
                </div>
                {PROJECT_FACTS.criticalGaps.map((g) => (
                  <div key={g} className="text-xs flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                    <span>{g}</span>
                  </div>
                ))}
              </div>
              <Link
                to="/app/reports/readiness"
                className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
              >
                Se rapportklarhed <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Card>

        {/* Data flow */}
        <DataFlowDiagram steps={PLATFORM_MODULES} />

        {/* Module status cards */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Platform-status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {PLATFORM_MODULES.map((m) => (
              <ModuleStatusCard key={m.id} {...m} />
            ))}
          </div>
        </div>

        {/* Critical actions + Onboarding */}
        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Kritiske handlinger"
              subtitle="Prioriterede opgaver på tværs af modulerne"
              action={
                <Link
                  to="/app/decisions/recommendations"
                  className="text-sm text-primary hover:underline"
                >
                  Se alle
                </Link>
              }
            />
            <CriticalActionsPanel
              items={liveActionItems.length > 0 ? liveActionItems : CRITICAL_ACTIONS}
            />
          </Card>
          <OnboardingChecklist steps={ONBOARDING_STEPS} />
        </div>

        {/* Activity + Next actions */}
        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader title="Seneste aktivitet" subtitle="Hændelser på tværs af alle moduler" />
            <ActivityFeed items={ACTIVITY_FEED} />
          </Card>
          <Card>
            <CardHeader title="Næste anbefalede skridt" subtitle="AI-foreslået rækkefølge" />
            <ul className="px-5 pb-5 space-y-2">
              {NEXT_RECOMMENDED_ACTIONS.map((a, i) => (
                <li key={i}>
                  <Link
                    to={a.href}
                    className="flex items-start gap-3 p-3 rounded-xl border bg-background hover:bg-muted/40 transition"
                  >
                    <div className="h-7 w-7 rounded-lg bg-leaf/20 text-primary grid place-items-center shrink-0 text-xs font-semibold">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{a.module}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground mt-1.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Footer CTA */}
        <Card className="p-5 flex flex-wrap items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-leaf/20 text-primary grid place-items-center">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="font-semibold text-sm">Klar til at samle Q2-rapporten?</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Træk data fra Smart Connect, anbefalinger fra DecisionsIQ, dokumentation fra ESG
              Ledger og portefølje fra Impact Exchange — i ét flow.
            </div>
          </div>
          <Link
            to="/app/reports/builder"
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-soft hover:opacity-95"
          >
            Åbn rapportbygger <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </main>
    </>
  );
}
