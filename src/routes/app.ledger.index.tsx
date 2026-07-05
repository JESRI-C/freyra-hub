import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  ClipboardList,
  Database,
  FileText,
  Plug,
  AlertTriangle,
  ScrollText,
  Sparkles,
  Cloud,
  Droplets,
  Trash2,
  Sprout,
  ShieldAlert,
  ArrowRight,
  Cable,
  Brain,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  ESGMetricCard,
  ReadinessScore as LedgerReadinessScore,
} from "@/components/ledger/Primitives";
import { LEDGER_EVENTS } from "@/lib/ledger-data";
import {
  ModuleHeader,
  ActivityFeed,
  CriticalActionsPanel,
  CrossModuleLink,
  ReportReadinessBadge,
  actionToast,
} from "@/components/platform/Primitives";
import { PROJECT_FACTS } from "@/lib/platform-data";
import { useLiveActivityFeed, useLiveCriticalActions } from "@/lib/platform-live";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";

export const Route = createFileRoute("/app/ledger/")({
  head: () => ({ meta: [{ title: "ESG Ledger — GoFreyra" }] }),
  component: OverviewPage,
});

const GAPS = [
  { t: "Scope 3 transportdata mangler for Q2", level: "Høj" },
  { t: "Vanddata fra zone 3 er ikke opdateret", level: "Høj" },
  { t: "Biodiversitetsmåling mangler feltverifikation", level: "Medium" },
  { t: "Emissionsfaktor for varmeforbrug skal valideres", level: "Medium" },
  { t: "Dokumentation for naturimpact mangler godkendelse", level: "Medium" },
];

function OverviewPage() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <ModuleHeader
        eyebrow="ESG Ledger"
        title="ESG Ledger"
        subtitle="Dokumentation, audit trail og rapporteringsklar ESG-data."
        projectName={PROJECT_FACTS.name}
        freshness="27 min"
        status={PROJECT_FACTS.status}
        readiness={PROJECT_FACTS.reportReadiness}
        primaryCta={{
          label: "Generér ESG-rapport",
          to: "/app/ledger/reporting",
          icon: <FileText className="h-4 w-4" />,
        }}
        secondaryCta={{
          label: "Se audit trail",
          to: "/app/ledger/audit",
          icon: <ScrollText className="h-4 w-4" />,
        }}
      />

      <AiInsightBanner
        module="ESG Ledger"
        tone="action"
        context={`Projekt: ${PROJECT_FACTS.name}. Rapportklarhed: ${PROJECT_FACTS.reportReadiness}%. Datakvalitet: ${PROJECT_FACTS.dataQuality}%. Åbne gaps: ${GAPS.map((g) => `${g.t} (${g.level})`).join("; ")}. Senest registrerede ledger-events: ${LEDGER_EVENTS.slice(0, 3).map((e) => `${e.type}: ${e.description}`).join("; ")}.`}
      />



      {/* KPIs */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <ESGMetricCard
          label="ESG-score"
          value="82"
          unit="/100"
          trend={4}
          icon={<ShieldCheck className="h-4 w-4" />}
          hint="+4 point siden Q4"
        />
        <ESGMetricCard
          label="CSRD/ESRS readiness"
          value="68"
          unit="%"
          trend={6}
          icon={<ClipboardList className="h-4 w-4" />}
          hint="142 af 210 datapunkter dækket"
        />
        <ESGMetricCard
          label="Datakvalitet"
          value="91"
          unit="%"
          trend={3}
          icon={<Database className="h-4 w-4" />}
          hint="+3% efter sensor-rebalancering"
        />
        <ESGMetricCard
          label="Rapportklarhed"
          value="74"
          unit="%"
          trend={5}
          icon={<FileText className="h-4 w-4" />}
          hint="6 områder klar til intern review"
          tone="info"
        />
        <ESGMetricCard
          label="Verificerede datakilder"
          value="18"
          unit="/24"
          trend={2}
          icon={<Plug className="h-4 w-4" />}
          hint="4 kræver handling, 2 offline"
          tone="success"
        />
        <ESGMetricCard
          label="Åbne datamangler"
          value="7"
          trend={-2}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="2 lukket sidste 30 dage"
          tone="warning"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Reporting readiness */}
        <Card className="lg:col-span-2">
          <CardHeader title="Rapporteringsklarhed" subtitle="Status pr. dokumentationsdimension" />
          <div className="px-5 pb-5 grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {[
              ["CO₂-dokumentation", 88, Cloud],
              ["Energi", 94, Plug],
              ["Vand", 71, Droplets],
              ["Affald", 82, Trash2],
              ["Biodiversitet", 64, Sprout],
              ["Naturimpact", 72, Sprout],
              ["Audit trail", 92, ScrollText],
              ["Tredjepartsverifikation", 74, ShieldCheck],
            ].map(([l, v, Icon]) => {
              const I = Icon as typeof Cloud;
              return (
                <div key={l as string} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-leaf/15 text-primary grid place-items-center shrink-0">
                    <I className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <LedgerReadinessScore label={l as string} value={v as number} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Critical gaps */}
        <Card>
          <CardHeader
            title="Kritiske mangler"
            subtitle="Anbefales lukket før Q2-rapportering"
            action={<Pill tone="danger">{GAPS.length} åbne</Pill>}
          />
          <ul className="px-5 pb-5 space-y-2.5 text-sm">
            {GAPS.map((g) => (
              <li key={g.t} className="flex items-start gap-3 rounded-lg border p-2.5">
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 mt-0.5 ${g.level === "Høj" ? "text-destructive" : "text-warning-foreground"}`}
                />
                <div className="flex-1">{g.t}</div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    g.level === "Høj"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-warning/20 text-warning-foreground"
                  }`}
                >
                  {g.level}
                </span>
              </li>
            ))}
            <li className="pt-2">
              <Link
                to="/app/ledger/csrd"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                Se alle gaps i CSRD/ESRS <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          </ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Latest ledger events */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Seneste ledger-hændelser"
            subtitle="Datakilder, opdateringer, rapporter og verifikationer"
            action={
              <Link to="/app/ledger/audit" className="text-sm text-primary hover:underline">
                Se hele audit trail
              </Link>
            }
          />
          <ul className="divide-y">
            {LEDGER_EVENTS.slice(0, 6).map((e) => (
              <li key={e.id} className="px-5 py-3 flex items-start gap-3">
                <div className="text-xs text-muted-foreground w-32 pt-0.5 tabular-nums shrink-0">
                  {e.timestamp}
                </div>
                <ScrollText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.type} · {e.related} · {e.user}
                  </div>
                </div>
                <Pill
                  tone={
                    e.status === "OK" ? "success" : e.status === "Advarsel" ? "warning" : "danger"
                  }
                >
                  {e.status}
                </Pill>
              </li>
            ))}
          </ul>
        </Card>

        {/* AI insight */}
        <Card>
          <CardHeader title="AI-dokumentationsindsigt" subtitle="Hvad bør prioriteres?" />
          <div className="px-5 pb-5">
            <div className="rounded-xl border p-4 bg-leaf/10">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-leaf/30 text-primary grid place-items-center shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-sm leading-relaxed">
                  <span className="font-medium">Datagrundlaget er stærkt på energi og CO₂</span>,
                  men biodiversitetsdelen kræver feltverifikation før endelig rapportering.
                  Anbefalet næste skridt: opdatér emissionsfaktor for fjernvarme, genstart Sensor
                  LF-12 og afslut tredjepartsreview af Skallebæk.
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Pill tone="info">3 anbefalinger</Pill>
                <Pill tone="warning">2 høj prioritet</Pill>
              </div>
            </div>
            <div className="mt-4 rounded-xl border p-3 flex items-start gap-3 text-xs text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              ESG Ledger registrerer alle ændringer, datakilder og rapportudtræk, så dokumentationen
              kan spores over tid.
            </div>
          </div>
        </Card>
      </div>

      {/* Cross-module actions */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            Ledger-handlinger
          </div>
          <CrossModuleLink to="/app/connect/sources" label="Se datakilde" />
          <CrossModuleLink to="/app/ledger/audit" label="Åbn audit trail" />
          <button
            onClick={() => actionToast("Datapunkt sendt til rapport")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5" /> Send til rapport
          </button>
          <button
            onClick={() => actionToast("Mangelliste sendt til DecisionsIQ")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <Brain className="h-3.5 w-3.5" /> Opret mangelliste i DecisionsIQ
          </button>
          <CrossModuleLink to="/app/connect" label="Tilbage til Smart Connect" />
          <span className="ml-auto">
            <ReportReadinessBadge value={PROJECT_FACTS.reportReadiness} />
          </span>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Seneste aktivitet" subtitle="ESG Ledger-relaterede hændelser" />
          <ActivityFeed
            items={ACTIVITY_FEED.filter(
              (a) => a.module === "ESG Ledger" || a.module === "Impact Exchange",
            )}
          />
        </Card>
        <Card>
          <CardHeader title="Kritiske handlinger" subtitle="Skal lukkes før rapportering" />
          <CriticalActionsPanel items={CRITICAL_ACTIONS.filter((c) => c.module === "ESG Ledger")} />
        </Card>
      </div>
    </main>
  );
}
