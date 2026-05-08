import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plug, CheckCircle2, AlertTriangle, WifiOff, ShieldCheck, Clock, Activity,
  Database, BarChart3, FileBarChart, Brain, Layers, ArrowRight, Sparkles, Map,
} from "lucide-react";
import { Card, CardHeader, PageHeader, Bars, Pill } from "@/components/ui-bits";
import { ConnectionHealthCard, ProgressBar, Section, SeverityBadge } from "@/components/connect/Primitives";
import { ALERTS } from "@/lib/connect-data";
import { ModuleHeader, ActivityFeed, CriticalActionsPanel, CrossModuleLink, ReportReadinessBadge, actionToast } from "@/components/platform/Primitives";
import { ACTIVITY_FEED, CRITICAL_ACTIONS, PROJECT_FACTS } from "@/lib/platform-data";

export const Route = createFileRoute("/app/connect/")({
  component: Page,
});

function Page() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <ModuleHeader
        eyebrow="Smart Connect"
        title="Smart Connect"
        subtitle="Forbind, overvåg og valider datakilder på tværs af projektet."
        projectName={PROJECT_FACTS.name}
        freshness="3 min"
        status={PROJECT_FACTS.status}
        readiness={PROJECT_FACTS.reportReadiness}
        primaryCta={{ label: "Tilføj datakilde", to: "/app/connect/add", icon: <Plug className="h-4 w-4" /> }}
        secondaryCta={{ label: "Åbn kort", to: "/app/connect/map", icon: <Map className="h-4 w-4" /> }}
      />

      <PageHeader title="Forbindelses-KPI'er" description="Realtidsoverblik på datarygradens sundhed." />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ConnectionHealthCard label="Aktive datakilder" value="42" icon={<Database className="h-5 w-5" />} />
        <ConnectionHealthCard label="Online" value="36" tone="success" sub="86% af alle kilder" icon={<CheckCircle2 className="h-5 w-5" />} />
        <ConnectionHealthCard label="Kræver handling" value="4" tone="warning" sub="Validering nødvendig" icon={<AlertTriangle className="h-5 w-5" />} />
        <ConnectionHealthCard label="Offline" value="2" tone="danger" icon={<WifiOff className="h-5 w-5" />} />
        <ConnectionHealthCard label="Ø datakvalitet" value={`${PROJECT_FACTS.dataQuality}%`} tone="success" icon={<ShieldCheck className="h-5 w-5" />} />
        <ConnectionHealthCard label="Seneste sync" value="3 min" sub="MQTT broker" icon={<Clock className="h-5 w-5" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Section title="Status på datakilder" subtitle="Fordeling på sundhedstilstand">
          <Bars data={[
            { label: "Online", value: 36 },
            { label: "Delvist aktiv", value: 4 },
            { label: "Kræver handling", value: 4 },
            { label: "Offline", value: 2 },
            { label: "Under opsætning", value: 3 },
          ]} />
        </Section>

        <Section title="Datastrøm" subtitle="Fra kilde til modul">
          <DataFlow />
        </Section>

        <Section title="Routing destinationer" subtitle="Hvor data lander">
          <ul className="space-y-2.5">
            {[
              { name: "DecisionsIQ", q: 92, last: "2 min", status: "ok", icon: Brain },
              { name: "ESG Ledger", q: 96, last: "5 min", status: "ok", icon: FileBarChart },
              { name: "Impact Exchange", q: 88, last: "1 t", status: "warn", icon: Layers },
              { name: "Reports", q: 94, last: "12 min", status: "ok", icon: BarChart3 },
            ].map((d) => {
              const Icon = d.icon;
              return (
                <li key={d.name} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
                  <div className="h-8 w-8 rounded-lg bg-leaf/20 text-primary grid place-items-center"><Icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground">Sidste routing: {d.last}</div>
                  </div>
                  <Pill tone={d.status === "ok" ? "success" : "warning"}>{d.q}%</Pill>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Kritiske alerts" subtitle="Skal håndteres i dag" />
          <ul className="divide-y">
            {ALERTS.slice(0, 5).map((a) => (
              <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                <SeverityBadge severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground">{a.project} · {a.last}</div>
                </div>
                <Link to="/app/connect/alerts" className="text-xs text-primary inline-flex items-center gap-1">Se <ArrowRight className="h-3 w-3" /></Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Seneste data-events" subtitle="Audit-klar tidslinje" />
          <ul className="px-5 pb-4 space-y-3">
            {[
              ["11:52", "Ny sensor-aflæsning modtaget", "SKB-WQ-01"],
              ["11:48", "Satellitlag opdateret", "Sentinel-2 NDVI"],
              ["11:42", "Feltobservation uploadet", "Field App"],
              ["11:30", "API-sync gennemført", "DMI Klima API"],
              ["11:18", "Valideringsregel udløst", "URB-WQ-12"],
              ["10:52", "Data routet til ESG Ledger", "ERP API"],
              ["10:30", "Anbefaling oprettet i DecisionsIQ", "AI engine"],
            ].map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="text-xs text-muted-foreground w-12 tabular-nums">{e[0]}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                <div className="flex-1">
                  <div>{e[1]}</div>
                  <div className="text-[11px] text-muted-foreground">{e[2]}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Data-parathed" subtitle="Hvor klar er datagrundlaget til hvert modul?">
          <div className="space-y-3">
            <ProgressBar label="Klar til AI-analyse" value={92} />
            <ProgressBar label="Klar til ESG Ledger" value={88} />
            <ProgressBar label="Klar til Impact Exchange" value={74} />
            <ProgressBar label="Klar til rapportering" value={81} />
            <ProgressBar label="Kræver validering" value={18} hint="Drone + Scope 3 CSV" />
          </div>
        </Section>

        <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center"><Sparkles className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-semibold">AI data operations indsigt</div>
              <p className="text-sm mt-2 text-foreground/90">
                Datagrundlaget er stærkt på sensorer og satellitdata, men <strong>manuelle feltdata og droneuploads</strong> kræver bedre metadata før rapportering. Anbefaling: tving geotag i Field-app og aktivér tredjepartsverifikation på drone-uploads denne uge.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/app/connect/quality" className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5">Åbn datakvalitet</Link>
                <Link to="/app/connect/alerts" className="text-xs rounded-lg border bg-card px-3 py-1.5">Se alerts</Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}

function DataFlow() {
  return (
    <div className="space-y-2 text-xs">
      {[
        ["Sensorer + API + CSV", "→", "Smart Connect"],
        ["Smart Connect", "→", "Validering"],
        ["Validering", "→", "DecisionsIQ"],
        ["Validering", "→", "ESG Ledger"],
        ["Validering", "→", "Impact Exchange"],
        ["Validering", "→", "Reports"],
      ].map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-muted text-foreground truncate">{row[0]}</div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-leaf/20 text-foreground truncate">{row[2]}</div>
        </div>
      ))}
    </div>
  );
}
