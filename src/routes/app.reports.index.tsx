import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  FilePlus,
  FileCheck,
  AlertTriangle,
  LayoutTemplate,
  ShieldCheck,
  Clock,
  Sparkles,
  Building,
  Leaf,
  BarChart3,
  Send,
  FileText,
  Briefcase,
  Cable,
  Brain,
  Repeat2,
  BookCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardHeader, PageHeader, StatCard, Pill } from "@/components/ui-bits";
import {
  ReadinessBar,
  ReportStatusBadge,
  ReadinessScore as ReportsReadinessScore,
  Section,
} from "@/components/reports/Primitives";
import { RECENT_REPORTS } from "@/lib/reports-data";
import {
  ModuleHeader,
  ActivityFeed,
  CriticalActionsPanel,
  ReportReadinessBadge,
  actionToast,
} from "@/components/platform/Primitives";
import { ACTIVITY_FEED, CRITICAL_ACTIONS, PROJECT_FACTS } from "@/lib/platform-data";
import { getAllReports, reportStatusTone } from "@/services/reports-service";
import type { Report } from "@/lib/supabase/types";

// ─── Query ────────────────────────────────────────────────────────────────────

const allReportsQuery = {
  queryKey: ["all-reports"],
  queryFn: () => getAllReports(),
};

export const Route = createFileRoute("/app/reports/")({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(allReportsQuery),
  component: Page,
});

function DataLayerReportsTable({ reports }: { reports: Report[] }) {
  const toneClass: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    info: "bg-blue-100 text-blue-700",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <Card>
      <CardHeader
        title="Rapporter (datalaget)"
        subtitle={`${reports.length} rapporter på tværs af alle projekter`}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="px-4 py-3">Rapport</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Periode</th>
              <th className="px-4 py-3">Oprettet</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {reports.map((r) => {
              const tone = reportStatusTone(r.status);
              return (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.title}</div>
                    {r.summary && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 max-w-xs truncate">
                        {r.summary}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{r.report_type ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${toneClass[tone]}`}
                    >
                      {r.status ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.period_start && r.period_end ? `${r.period_start} → ${r.period_end}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(r.created_at).toLocaleDateString("da-DK")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Page() {
  const { data: reports } = useSuspenseQuery(allReportsQuery);
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <ModuleHeader
        eyebrow="Rapporter"
        title="Rapporter"
        subtitle="Byg, kvalitetstjek og eksportér professionelle ESG- og impact-rapporter."
        projectName={PROJECT_FACTS.name}
        freshness="2 timer"
        status="Klar til review"
        readiness={PROJECT_FACTS.reportReadiness}
        primaryCta={{
          label: "Opret rapport",
          to: "/app/reports/new",
          icon: <FilePlus className="h-4 w-4" />,
        }}
        secondaryCta={{
          label: "Åbn rapportbygger",
          to: "/app/reports/builder",
          icon: <FileText className="h-4 w-4" />,
        }}
      />

      <PageHeader
        title="Rapportcenter"
        description="Realtidsoverblik over rapportering, klarhed og aktivitet."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Rapporter" value="24" icon={<FileText className="h-5 w-5" />} />
        <StatCard
          label="Klar til eksport"
          value="8"
          icon={<FileCheck className="h-5 w-5" />}
          accent="bg-success/15 text-success"
        />
        <StatCard
          label="Kræver datagennemgang"
          value="5"
          icon={<AlertTriangle className="h-5 w-5" />}
          accent="bg-warning/20 text-warning-foreground"
        />
        <StatCard
          label="Brugte skabeloner"
          value="12"
          icon={<LayoutTemplate className="h-5 w-5" />}
        />
        <StatCard
          label="Ø datakvalitet"
          value="91%"
          icon={<ShieldCheck className="h-5 w-5" />}
          accent="bg-success/15 text-success"
        />
        <StatCard label="Seneste rapport" value="2 t" icon={<Clock className="h-5 w-5" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Section title="Rapportklarhed" subtitle="Pr. rapporttype">
          <div className="space-y-3">
            <ReadinessBar label="ESG-overblik" value={92} />
            <ReadinessBar label="CO₂-bilag" value={78} />
            <ReadinessBar label="Naturimpact" value={86} />
            <ReadinessBar label="Biodiversitet" value={74} />
            <ReadinessBar label="CSRD/ESRS readiness" value={68} />
            <ReadinessBar label="Revisorpakke" value={84} />
          </div>
        </Section>

        <Section title="Hurtige handlinger" subtitle="Genveje til typiske rapporter">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Opret ledelsesrapport", Briefcase],
              ["Generér CO₂-bilag", BarChart3],
              ["Byg investorrapport", Building],
              ["Eksportér revisorpakke", FileCheck],
              ["Lav projektfakta", Leaf],
              ["Send rapport til review", Send],
            ].map(([label, Icon]) => (
              <Link
                key={label}
                to="/app/reports/new"
                className="rounded-lg border bg-card p-3 text-left text-sm hover:bg-muted transition flex items-start gap-2"
              >
                <div className="h-8 w-8 rounded-lg bg-leaf/20 text-primary grid place-items-center">
                  {(() => { const I = Icon as LucideIcon; return <I className="h-4 w-4" />; })()}
                </div>
                <span className="flex-1">{label}</span>
              </Link>
            ))}
          </div>
        </Section>

        <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">AI rapporteringsindsigt</div>
              <p className="text-sm mt-2 text-foreground/90">
                <strong>Skallebæk-rapporten</strong> er tæt på eksportklar, men
                biodiversitetsafsnittet mangler feltverifikation, og datakvaliteten bør løftes fra
                78% til mindst 85% før ekstern deling.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/app/reports/readiness"
                  className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5"
                >
                  Åbn rapportklarhed
                </Link>
                <Link
                  to="/app/reports/builder"
                  className="text-xs rounded-lg border bg-card px-3 py-1.5"
                >
                  Åbn bygger
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Seneste rapporter" subtitle="Klik for at åbne i bygger eller preview" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Rapportnavn</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Projekt/portefølje</th>
                <th className="px-4 py-3">Målgruppe</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Klarhed</th>
                <th className="px-4 py-3">Senest</th>
                <th className="px-4 py-3">Ejer</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {RECENT_REPORTS.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.id} · {r.version}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.type}</td>
                  <td className="px-4 py-3 text-xs">{r.scope}</td>
                  <td className="px-4 py-3 text-xs">{r.audience}</td>
                  <td className="px-4 py-3">
                    <ReportStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ReportsReadinessScore value={r.readiness} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-xs">{r.updated}</td>
                  <td className="px-4 py-3 text-xs">{r.owner}</td>
                  <td className="px-4 py-3 text-xs">
                    <Link to="/app/reports/preview" className="text-primary">
                      Åbn
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DataLayerReportsTable reports={reports} />

      {/* Cross-module actions */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            Saml rapport
          </div>
          <button
            onClick={() =>
              actionToast(
                "Data hentet fra Smart Connect",
                `${PROJECT_FACTS.activeDataSources} datakilder tilføjet`,
              )
            }
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <Cable className="h-3.5 w-3.5" /> Hent data fra Smart Connect
          </button>
          <button
            onClick={() =>
              actionToast(
                "Anbefalinger fra DecisionsIQ tilføjet",
                `${PROJECT_FACTS.openRecommendations} anbefalinger`,
              )
            }
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <Brain className="h-3.5 w-3.5" /> Medtag anbefalinger
          </button>
          <button
            onClick={() => actionToast("Impact-bilag fra Impact Exchange tilføjet")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <Repeat2 className="h-3.5 w-3.5" /> Medtag impact
          </button>
          <button
            onClick={() => actionToast("Audit trail fra ESG Ledger vedhæftet")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <BookCheck className="h-3.5 w-3.5" /> Medtag audit trail
          </button>
          <button
            onClick={() => actionToast("Mangler sendt tilbage til relevant modul")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <Send className="h-3.5 w-3.5" /> Send mangler tilbage
          </button>
          <span className="ml-auto">
            <ReportReadinessBadge value={PROJECT_FACTS.reportReadiness} />
          </span>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Seneste aktivitet" subtitle="Rapport-relaterede hændelser" />
          <ActivityFeed items={ACTIVITY_FEED.filter((a) => a.module === "Rapporter")} />
        </Card>
        <Card>
          <CardHeader title="Kritiske handlinger" subtitle="Skal lukkes før eksternt brug" />
          <CriticalActionsPanel items={CRITICAL_ACTIONS.filter((c) => c.module === "Rapporter")} />
        </Card>
      </div>
    </main>
  );
}
