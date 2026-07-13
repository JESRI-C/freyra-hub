import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plug,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  ShieldCheck,
  Clock,
  Activity,
  Database,
  BarChart3,
  FileBarChart,
  Brain,
  Layers,
  ArrowRight,
  Sparkles,
  Map,
} from "lucide-react";
import { Card, CardHeader, PageHeader, Bars, Pill } from "@/components/ui-bits";
import {
  ConnectionHealthCard,
  ProgressBar,
  Section,
  SeverityBadge,
} from "@/components/connect/Primitives";
import { ALERTS } from "@/lib/connect-data";
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
import { useQuery } from "@tanstack/react-query";
import { useConnectContext } from "@/lib/connect-context";
import {
  listDevices,
  computeDeviceKpis,
  type MonitoringDevice,
} from "@/services/monitoring/devices-service";
import { listDataSources, type DataSource } from "@/services/monitoring/data-sources-service";
import { listIssues, type QualityIssue } from "@/services/monitoring/quality-rules-service";

export const Route = createFileRoute("/app/connect/")({
  component: Page,
});

/** Relativ dansk tidsangivelse for seneste sync. */
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "nu";
  if (mins < 60) return `${mins} min siden`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} t siden`;
  return `${Math.round(hours / 24)} d siden`;
}

function Page() {
  const activityFeed = useLiveActivityFeed();
  const criticalActions = useLiveCriticalActions();
  const { projectId } = useConnectContext();

  // Ægte KPI-data fra monitoring-tabellerne (tom liste når intet projekt valgt).
  const { data: devices = [] } = useQuery({
    queryKey: ["monitoring-devices", projectId],
    queryFn: () => (projectId ? listDevices(projectId) : Promise.resolve<MonitoringDevice[]>([])),
  });
  const { data: dataSources = [] } = useQuery({
    queryKey: ["monitoring-data-sources", projectId],
    queryFn: () => (projectId ? listDataSources(projectId) : Promise.resolve<DataSource[]>([])),
  });
  const { data: openIssues = [] } = useQuery({
    queryKey: ["quality-issues-open", projectId],
    queryFn: () =>
      projectId
        ? listIssues({ projectId, status: "open" })
        : Promise.resolve<QualityIssue[]>([]),
  });

  const deviceKpis = computeDeviceKpis(devices);
  const activeSources = dataSources.filter((s) => s.status === "active" || s.status === "online").length;
  const totalDataPoints = devices.length + dataSources.length;
  const qualityScore =
    totalDataPoints > 0
      ? Math.max(0, Math.min(100, Math.round(100 - (openIssues.length / Math.max(1, totalDataPoints)) * 100)))
      : null;
  const lastSync = devices
    .map((d) => d.last_seen_at)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1) ??
    dataSources
      .map((s) => s.last_sync_at)
      .filter((t): t is string => !!t)
      .sort()
      .at(-1) ?? null;
  const hasAnyData = devices.length > 0 || dataSources.length > 0;
  return (
    <main className="p-4 sm:p-6 w-full min-w-0 space-y-4">
      <ModuleHeader
        eyebrow="Monitoring & Field Data"
        title="Overblik"
        subtitle="Kontroltårn for feltdata — enheder, datakilder og observationer."
        projectName={PROJECT_FACTS.name}
        freshness="—"
        status={PROJECT_FACTS.status}
        readiness={PROJECT_FACTS.reportReadiness}
        primaryCta={{
          label: "Tilføj enhed",
          to: "/app/connect/devices",
          icon: <Plug className="h-4 w-4" />,
        }}
        secondaryCta={{
          label: "Åbn kort",
          to: "/app/connect/map",
          icon: <Map className="h-4 w-4" />,
        }}
      />

      {!hasAnyData && (
        <Card className="p-4 border-warning/40 bg-warning/5 text-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Ingen enheder eller datakilder endnu</div>
              <p className="text-muted-foreground text-xs mt-1">
                KPI&apos;erne nedenfor viser live-tal fra dine enheder, datakilder og
                kvalitets-issues, så snart de første er oprettet. Start med
                &quot;Tilføj enhed&quot; eller aktivér en datakilde.
              </p>
            </div>
          </div>
        </Card>
      )}

      <PageHeader
        title="Forbindelses-KPI'er"
        description="Realtidsoverblik på datarygradens sundhed."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ConnectionHealthCard
          label="Aktive datakilder"
          value={dataSources.length > 0 ? String(activeSources) : "—"}
          sub={dataSources.length > 0 ? `af ${dataSources.length} i alt` : "Ingen data endnu"}
          icon={<Database className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Online"
          value={devices.length > 0 ? String(deviceKpis.online) : "—"}
          sub={devices.length > 0 ? `af ${deviceKpis.total} enheder` : "Ingen enheder endnu"}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Kræver handling"
          value={devices.length > 0 ? String(deviceKpis.attention) : "—"}
          sub={openIssues.length > 0 ? `${openIssues.length} åbne kvalitets-issues` : "Ingen åbne issues"}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Offline"
          value={devices.length > 0 ? String(deviceKpis.offline) : "—"}
          sub={deviceKpis.lowBattery > 0 ? `${deviceKpis.lowBattery} med lavt batteri` : "Ingen data endnu"}
          icon={<WifiOff className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Ø datakvalitet"
          value={qualityScore != null ? `${qualityScore}%` : "—"}
          sub={qualityScore != null ? `${openIssues.length} åbne issues` : "Afventer data"}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Seneste sync"
          value={relativeTime(lastSync)}
          sub={lastSync ? new Date(lastSync).toLocaleString("da-DK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Ingen data endnu"}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Section title="Status på enheder" subtitle="Fordeling på sundhedstilstand (live)">
          <Bars
            data={[
              { label: "Online", value: deviceKpis.online },
              { label: "Kræver handling", value: deviceKpis.attention },
              { label: "Offline", value: deviceKpis.offline },
              { label: "Lavt batteri", value: deviceKpis.lowBattery },
            ]}
          />
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
                <li
                  key={d.name}
                  className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30"
                >
                  <div className="h-8 w-8 rounded-lg bg-leaf/20 text-primary grid place-items-center">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Sidste routing: {d.last}
                    </div>
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
                  <div className="text-[11px] text-muted-foreground">
                    {a.project} · {a.last}
                  </div>
                </div>
                <Link
                  to="/app/connect/alerts"
                  className="text-xs text-primary inline-flex items-center gap-1"
                >
                  Se <ArrowRight className="h-3 w-3" />
                </Link>
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
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">AI data operations indsigt</div>
              <p className="text-sm mt-2 text-foreground/90">
                Datagrundlaget er stærkt på sensorer og satellitdata, men{" "}
                <strong>manuelle feltdata og droneuploads</strong> kræver bedre metadata før
                rapportering. Anbefaling: tving geotag i Field-app og aktivér
                tredjepartsverifikation på drone-uploads denne uge.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/app/connect/quality"
                  className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5"
                >
                  Åbn datakvalitet
                </Link>
                <Link
                  to="/app/connect/alerts"
                  className="text-xs rounded-lg border bg-card px-3 py-1.5"
                >
                  Se alerts
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Cross-module actions */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            Send datakilde
          </div>
          <button
            onClick={() => actionToast("Sendt til DecisionsIQ", "Klar til ny analyse")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <Brain className="h-3.5 w-3.5" /> Send til DecisionsIQ
          </button>
          <button
            onClick={() => actionToast("Datakilden er sendt til ESG Ledger")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <FileBarChart className="h-3.5 w-3.5" /> Send til ESG Ledger
          </button>
          <button
            onClick={() => actionToast("Tilføjet til rapportudkast")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Brug i rapport
          </button>
          <CrossModuleLink to="/app/connect/map" label="Vis på kort" />
          <span className="ml-auto">
            <ReportReadinessBadge value={82} />
          </span>
        </div>
      </Card>

      {/* Activity + critical actions */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Seneste aktivitet" subtitle="Live fra platformens audit-trail" />
          <ActivityFeed items={activityFeed} />
        </Card>
        <Card>
          <CardHeader
            title="Kritiske handlinger"
            subtitle="Åbne handlinger på tværs af projekter"
          />
          <CriticalActionsPanel items={criticalActions} />
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
          <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-muted text-foreground truncate">
            {row[0]}
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-leaf/20 text-foreground truncate">
            {row[2]}
          </div>
        </div>
      ))}
    </div>
  );
}
