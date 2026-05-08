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
import { ESGMetricCard, ReadinessScore as LedgerReadinessScore } from "@/components/ledger/Primitives";
import { LEDGER_EVENTS } from "@/lib/ledger-data";
import { ModuleHeader, ActivityFeed, CriticalActionsPanel, CrossModuleLink, ReportReadinessBadge, actionToast } from "@/components/platform/Primitives";
import { ACTIVITY_FEED, CRITICAL_ACTIONS, PROJECT_FACTS } from "@/lib/platform-data";

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
      {/* Hero */}
      <Card className="overflow-hidden">
        <div
          className="p-6 sm:p-8 grid lg:grid-cols-[1fr_auto] gap-6 items-start"
          style={{ background: "linear-gradient(135deg, oklch(0.95 0.04 150 / 0.55), oklch(0.97 0.02 150 / 0.3))" }}
        >
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-leaf/20 text-primary">
              <ScrollText className="h-3.5 w-3.5" /> Ledger · 1.284 hændelser registreret
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">ESG Ledger</h2>
            <p className="mt-1 text-sm text-foreground/80 max-w-2xl">
              Her samles projektets ESG-data, datakilder, ændringshistorik og rapporteringsstatus — sporbart, dokumenteret
              og klar til revision.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/app/ledger/audit"
              className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted whitespace-nowrap"
            >
              <ScrollText className="h-4 w-4" /> Se audit trail
            </Link>
            <Link
              to="/app/ledger/reporting"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-soft hover:opacity-95 whitespace-nowrap"
            >
              <FileText className="h-4 w-4" /> Generér ESG-rapport
            </Link>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <ESGMetricCard label="ESG-score" value="82" unit="/100" trend={4} icon={<ShieldCheck className="h-4 w-4" />} hint="+4 point siden Q4" />
        <ESGMetricCard label="CSRD/ESRS readiness" value="68" unit="%" trend={6} icon={<ClipboardList className="h-4 w-4" />} hint="142 af 210 datapunkter dækket" />
        <ESGMetricCard label="Datakvalitet" value="91" unit="%" trend={3} icon={<Database className="h-4 w-4" />} hint="+3% efter sensor-rebalancering" />
        <ESGMetricCard label="Rapportklarhed" value="74" unit="%" trend={5} icon={<FileText className="h-4 w-4" />} hint="6 områder klar til intern review" tone="info" />
        <ESGMetricCard label="Verificerede datakilder" value="18" unit="/24" trend={2} icon={<Plug className="h-4 w-4" />} hint="4 kræver handling, 2 offline" tone="success" />
        <ESGMetricCard label="Åbne datamangler" value="7" trend={-2} icon={<AlertTriangle className="h-4 w-4" />} hint="2 lukket sidste 30 dage" tone="warning" />
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
                  <div className="flex-1"><ReadinessScore label={l as string} value={v as number} /></div>
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
                    g.level === "Høj" ? "bg-destructive/15 text-destructive" : "bg-warning/20 text-warning-foreground"
                  }`}
                >
                  {g.level}
                </span>
              </li>
            ))}
            <li className="pt-2">
              <Link to="/app/ledger/csrd" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
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
                <div className="text-xs text-muted-foreground w-32 pt-0.5 tabular-nums shrink-0">{e.timestamp}</div>
                <ScrollText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.type} · {e.related} · {e.user}
                  </div>
                </div>
                <Pill tone={e.status === "OK" ? "success" : e.status === "Advarsel" ? "warning" : "danger"}>
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
                  <span className="font-medium">Datagrundlaget er stærkt på energi og CO₂</span>, men biodiversitetsdelen
                  kræver feltverifikation før endelig rapportering. Anbefalet næste skridt: opdatér emissionsfaktor for
                  fjernvarme, genstart Sensor LF-12 og afslut tredjepartsreview af Skallebæk.
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Pill tone="info">3 anbefalinger</Pill>
                <Pill tone="warning">2 høj prioritet</Pill>
              </div>
            </div>
            <div className="mt-4 rounded-xl border p-3 flex items-start gap-3 text-xs text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              ESG Ledger registrerer alle ændringer, datakilder og rapportudtræk, så dokumentationen kan spores over
              tid.
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
