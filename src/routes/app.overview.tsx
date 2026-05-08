import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader } from "@/components/ui-bits";
import {
  ModuleStatusCard, DataFlowDiagram, ActivityFeed, CriticalActionsPanel,
  OnboardingChecklist, ReadinessScore, StatusBadge,
} from "@/components/platform/Primitives";
import {
  PLATFORM_MODULES, ACTIVITY_FEED, CRITICAL_ACTIONS, ONBOARDING_STEPS,
  PROJECT_FACTS, AI_SUMMARY, NEXT_RECOMMENDED_ACTIONS,
} from "@/lib/platform-data";
import { Sparkles, ArrowRight, MapPin, FileText } from "lucide-react";
import { getCurrentOrg, getCurrentProject, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/overview")({
  head: () => ({ meta: [{ title: "Oversigt — GoFreyra" }] }),
  component: OverviewPage,
});

function OverviewPage() {
  const { user, orgId, projectId } = useAuth();
  const org = getCurrentOrg(orgId);
  const project = getCurrentProject(orgId, projectId);
  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <>
      <AppTopbar title="Oversigt" subtitle={`${org?.name ?? ""} · ${project?.name ?? ""}`} />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
        <PageHeader
          title={`God morgen ${firstName} 👋`}
          description="Kontrolrum for hele GoFreyra-platformen — fra datakilder til verificeret rapport."
          actions={
            <Link
              to="/app/reports/builder"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-soft hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" /> Generér rapport
            </Link>
          }
        />

        {/* Executive summary */}
        <Card className="overflow-hidden">
          <div className="p-6 grid lg:grid-cols-[1.6fr_1fr] gap-6"
               style={{ background: "linear-gradient(135deg, oklch(0.95 0.04 150 / 0.5), oklch(0.97 0.02 150 / 0.3))" }}>
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
              <p className="mt-4 text-sm text-foreground/85 leading-relaxed max-w-2xl">{AI_SUMMARY}</p>
              <div className="mt-5 grid grid-cols-3 gap-3 max-w-md">
                <div>
                  <div className="text-xs text-muted-foreground">Datakvalitet</div>
                  <div className="text-lg font-semibold mt-0.5">{PROJECT_FACTS.dataQuality}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Biodiversitet</div>
                  <div className="text-lg font-semibold mt-0.5">{PROJECT_FACTS.biodiversityIndex}/100</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Datakilder</div>
                  <div className="text-lg font-semibold mt-0.5">{PROJECT_FACTS.activeDataSources}</div>
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
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kritiske mangler</div>
                {PROJECT_FACTS.criticalGaps.map((g) => (
                  <div key={g} className="text-xs flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                    <span>{g}</span>
                  </div>
                ))}
              </div>
              <Link to="/app/reports/readiness" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
                Se rapportklarhed <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Card>

        {/* Data flow */}
        <DataFlowDiagram steps={PLATFORM_MODULES} />

        {/* Module status cards */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Platform-status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {PLATFORM_MODULES.map((m) => <ModuleStatusCard key={m.id} {...m} />)}
          </div>
        </div>

        {/* Critical actions + Onboarding */}
        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Kritiske handlinger"
              subtitle="Prioriterede opgaver på tværs af modulerne"
              action={<Link to="/app/decisions/recommendations" className="text-sm text-primary hover:underline">Se alle</Link>}
            />
            <CriticalActionsPanel items={CRITICAL_ACTIONS} />
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
              Træk data fra Smart Connect, anbefalinger fra DecisionsIQ, dokumentation fra ESG Ledger og portefølje fra Impact Exchange — i ét flow.
            </div>
          </div>
          <Link to="/app/reports/builder" className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-soft hover:opacity-95">
            Åbn rapportbygger <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </main>
    </>
  );
}
