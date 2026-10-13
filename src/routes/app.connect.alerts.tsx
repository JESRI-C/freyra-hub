import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Clock,
  Sparkles,
  Send,
  ExternalLink,
  Plus,
  PlayCircle,
  Loader2,
} from "lucide-react";
import { Card, PageHeader, Bars } from "@/components/ui-bits";
import {
  ConnectionHealthCard,
  SeverityBadge,
  Drawer,
  Section,
  Chip,
} from "@/components/connect/Primitives";
import { ALERTS } from "@/lib/connect-data";
import { RuleDrawer } from "@/components/monitoring/RuleDrawer";
import { useConnectContext } from "@/lib/connect-context";
import { listAlertRules, toggleAlertRule } from "@/services/monitoring/alert-rules-service";
import { runAlertEvaluation } from "@/services/monitoring/alert-engine";
import {
  listAlerts,
  resolveAlert,
  acknowledgeAlert,
  type MonitoringAlert,
} from "@/services/monitoring/alerts-service";
import { supabase } from "@/lib/supabase/client";
import { isDemoDataEnabled, requireCustomerDatabase } from "@/lib/data-mode";

export const Route = createFileRoute("/app/connect/alerts")({
  component: Page,
});

type LiveAlert = MonitoringAlert & { __live: true };
type DemoAlert = (typeof ALERTS)[0] & { __live?: false };
type AnyAlert = LiveAlert | DemoAlert;

function severityRank(s: string): "critical" | "medium" | "low" {
  if (s === "critical" || s === "high") return "critical";
  if (s === "medium" || s === "warning") return "medium";
  return "low";
}

function Page() {
  const { projectId } = useConnectContext();
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<AnyAlert | null>(null);
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{ fired: number; detected: number; ranAt: string } | null>(
    null,
  );

  const liveAlertsQuery = useQuery({
    queryKey: ["monitoring-alerts", projectId],
    queryFn: async (): Promise<LiveAlert[]> => {
      if (!projectId) return [];
      requireCustomerDatabase();
      const rows = await listAlerts(projectId, { limit: 100 });
      return rows.map((r) => ({ ...r, __live: true as const }));
    },
    enabled: !!projectId && !isDemoDataEnabled,
  });

  const live = liveAlertsQuery.isError ? [] : (liveAlertsQuery.data ?? []);
  const useDemo = isDemoDataEnabled;
  const source: AnyAlert[] = useDemo ? (ALERTS as AnyAlert[]) : live;
  const filtered =
    filter === "all" ? source : source.filter((a) => severityRank(a.severity) === filter);

  const rulesQuery = useQuery({
    queryKey: ["alert-rules", projectId],
    queryFn: () => {
      requireCustomerDatabase();
      return listAlertRules(projectId);
    },
    enabled: !!projectId && !useDemo,
  });
  const hasLiveSnapshot = !!projectId && liveAlertsQuery.isSuccess && !liveAlertsQuery.isError;
  const activeAlerts = live.filter(
    (alert) => alert.status === "active" || alert.status === "acknowledged",
  );
  const acknowledgementTimes = live.flatMap((alert) => {
    if (!alert.acknowledged_at) return [];
    const duration = Date.parse(alert.acknowledged_at) - Date.parse(alert.triggered_at);
    return Number.isFinite(duration) && duration >= 0 ? [duration] : [];
  });
  const averageAcknowledgementHours = acknowledgementTimes.length
    ? acknowledgementTimes.reduce((sum, duration) => sum + duration, 0) /
      acknowledgementTimes.length /
      3_600_000
    : null;
  const countLabel = (count: number) => (hasLiveSnapshot ? String(count) : "—");

  async function handleRunNow() {
    if (!projectId) {
      toast.error("Vælg et projekt først");
      return;
    }
    setRunning(true);
    try {
      const res = await runAlertEvaluation(projectId);
      setLastRun({ fired: res.fired, detected: res.detected, ranAt: res.ranAt });
      toast.success(
        `Alarmregler kørt: ${res.detected} fund, ${res.fired} nye alarmer, ${res.skippedDuplicates} eksisterende`,
      );
      await liveAlertsQuery.refetch();
    } catch (e) {
      toast.error(`Fejl under kørsel: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Alerts"
          description="Aktive alerts, hændelser og data-operations issues."
        />
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <button
            onClick={handleRunNow}
            disabled={running}
            className="text-xs rounded-lg border px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            Kør alarmregler nu
          </button>
          <button
            onClick={() => setRuleDrawerOpen(true)}
            className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Ny alarmregel
          </button>
        </div>
      </div>

      {lastRun && (
        <div className="text-xs text-muted-foreground">
          Senest kørt {new Date(lastRun.ranAt).toLocaleTimeString()} — {lastRun.detected} fund,{" "}
          {lastRun.fired} nye alarmer.
        </div>
      )}

      {!useDemo && !projectId && (
        <Card className="p-4 text-sm text-muted-foreground">
          Vælg et projekt for at se dets alarmer.
        </Card>
      )}
      {!useDemo && liveAlertsQuery.isError && (
        <Card className="p-4 text-sm text-destructive">
          <div role="alert">
            Alarmer kunne ikke hentes. Oversigten og tallene er ikke tilgængelige.
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void liveAlertsQuery.refetch()}
            >
              Prøv igen
            </button>
          </div>
        </Card>
      )}
      {useDemo && (
        <Card className="p-4 text-sm text-muted-foreground">Demovisning med eksempelalarmer.</Card>
      )}

      <Section
        title="Aktive alarmregler"
        subtitle={
          useDemo
            ? "Regler kræver en kundedatabase"
            : !projectId
              ? "Vælg et projekt"
              : rulesQuery.isError
                ? "Regler kunne ikke hentes"
                : rulesQuery.isLoading
                  ? "Henter…"
                  : `${rulesQuery.data?.length ?? 0} regler i backend`
        }
      >
        {rulesQuery.isError && (
          <p className="mb-2 text-sm text-destructive" role="alert">
            Alarmregler kunne ikke hentes. Prøv igen senere.
          </p>
        )}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-4 py-3">Navn</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Aktiv</th>
                  <th className="px-4 py-3">Oprettet</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(rulesQuery.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-xs">
                      <Chip>{r.trigger_type}</Chip>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <SeverityBadge
                        severity={
                          (r.severity === "critical" ||
                          r.severity === "medium" ||
                          r.severity === "low"
                            ? r.severity
                            : "low") as "critical" | "medium" | "low"
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={r.is_active}
                          onChange={async (e) => {
                            try {
                              await toggleAlertRule(r.id, e.target.checked);
                              await rulesQuery.refetch();
                            } catch {
                              toast.error("Alarmreglen kunne ikke opdateres.");
                            }
                          }}
                        />
                        {r.is_active ? "Aktiv" : "Inaktiv"}
                      </label>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {!useDemo &&
                  !!projectId &&
                  !rulesQuery.isLoading &&
                  !rulesQuery.isError &&
                  (rulesQuery.data ?? []).length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-sm text-muted-foreground"
                      >
                        Ingen regler endnu — tryk "Ny alarmregel".
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <RuleDrawer
        open={ruleDrawerOpen}
        onClose={() => setRuleDrawerOpen(false)}
        variant="alert"
        projectId={projectId}
        onCreated={() => rulesQuery.refetch()}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ConnectionHealthCard
          label="Aktive alerts"
          value={useDemo ? "17" : countLabel(activeAlerts.length)}
          icon={<Bell className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Kritiske"
          value={
            useDemo
              ? "3"
              : countLabel(
                  activeAlerts.filter((alert) => severityRank(alert.severity) === "critical")
                    .length,
                )
          }
          tone="danger"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Medium"
          value={
            useDemo
              ? "6"
              : countLabel(
                  activeAlerts.filter((alert) => severityRank(alert.severity) === "medium").length,
                )
          }
          tone="warning"
          icon={<AlertCircle className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Lav"
          value={
            useDemo
              ? "8"
              : countLabel(
                  activeAlerts.filter((alert) => severityRank(alert.severity) === "low").length,
                )
          }
          icon={<Info className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label={useDemo ? "Løst denne uge" : "Løst (hentede)"}
          value={
            useDemo ? "12" : countLabel(live.filter((alert) => alert.status === "resolved").length)
          }
          tone="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label={useDemo ? "Ø svartid" : "Ø tid til bekræftelse"}
          value={
            useDemo
              ? "2 t"
              : hasLiveSnapshot && averageAcknowledgementHours !== null
                ? `${averageAcknowledgementHours.toLocaleString("da-DK", { maximumFractionDigits: 1 })} t`
                : "—"
          }
          icon={<Clock className="h-5 w-5" />}
        />
      </div>
      {!useDemo && projectId && (
        <p className="text-xs text-muted-foreground">
          {liveAlertsQuery.isLoading
            ? "Henter alarmer…"
            : hasLiveSnapshot
              ? `Tallene er beregnet fra de senest hentede ${live.length} alarmer (højst 100).`
              : "Alarmtal er ikke tilgængelige."}
        </p>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Severity:</span>
          {[
            ["all", "Alle"],
            ["critical", "Kritisk"],
            ["medium", "Medium"],
            ["low", "Lav"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`text-xs px-3 py-1.5 rounded-lg border ${filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Alert</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Kilde</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Først</th>
                <th className="px-4 py-3">Sidst</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((a) => {
                const r = toRow(a);
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() => setSelected(a)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-[11px] text-muted-foreground">{r.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={r.sev} />
                    </td>
                    <td className="px-4 py-3 text-xs">{r.project}</td>
                    <td className="px-4 py-3 text-xs">{r.source}</td>
                    <td className="px-4 py-3 text-xs">
                      <Chip>{r.type}</Chip>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.first}</td>
                    <td className="px-4 py-3 text-xs">{r.last}</td>
                    <td className="px-4 py-3 text-xs">
                      <Chip
                        tone={r.status === "Åben" || r.status === "active" ? "muted" : "primary"}
                      >
                        {r.status}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.owner}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (useDemo || hasLiveSnapshot) && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Ingen alarmer i dette filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {useDemo && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Alerts over tid" subtitle="Sidste 7 dage by severity">
            <Bars
              data={[
                { label: "Man", value: 4 },
                { label: "Tir", value: 6 },
                { label: "Ons", value: 3 },
                { label: "Tor", value: 8 },
                { label: "Fre", value: 5 },
                { label: "Lør", value: 2 },
                { label: "Søn", value: 7 },
              ]}
            />
          </Section>

          <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Operationelle anbefalinger</div>
                <ul className="text-sm mt-2 space-y-1.5 text-foreground/90 list-disc pl-5">
                  <li>
                    Indfør automatisk batteri-alert ved 25% for kameratraps for at reducere "Low
                    battery" alerts.
                  </li>
                  <li>
                    Aktivér token rotation på Airtable for at undgå tilbagevendende "Expiring
                    token".
                  </li>
                  <li>
                    Tilføj duplikat-detektion på Scope 3 CSV-import for at undgå manuelle
                    re-uploads.
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected?.id}
        footer={
          useDemo ? (
            <>
              <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5">
                Marker som løst
              </button>
              <button className="text-xs rounded-lg border bg-card px-3 py-1.5">
                Opret opgave
              </button>
              <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" /> Send til DecisionsIQ
              </button>
              <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Se datakilde
              </button>
            </>
          ) : undefined
        }
      >
        {selected &&
          (() => {
            const r = toRow(selected);
            const isLive = selected.__live === true;
            return (
              <>
                <p className="text-sm">{r.title}</p>
                <Section title="Hvorfor det er vigtigt">
                  <p className="text-sm text-muted-foreground">
                    {isLive
                      ? "Læs alarmens meddelelse og kontrollér datakilden før opfølgning."
                      : r.sev === "critical"
                        ? "Påvirker direkte rapporteringsklarhed og kan blokere ESG Ledger entries."
                        : "Reducerer datakvalitet og kan udløse falske anbefalinger i DecisionsIQ."}
                  </p>
                </Section>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <KV label="Severity" v={<SeverityBadge severity={r.sev} />} />
                  <KV label="Type" v={r.type} />
                  <KV label="Først detekteret" v={r.first} />
                  <KV label="Sidst detekteret" v={r.last} />
                  <KV label="Projekt" v={r.project} />
                  <KV label="Kilde" v={r.source} />
                </div>
                <Section title="Anbefalet handling">
                  <p className="text-sm">{r.action}</p>
                </Section>
                <Section title="Tidslinje">
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>{r.first} — Alert udløst</li>
                    <li>{r.last} — Sidste forekomst</li>
                    {!isLive && <li>Owner notificeret · {r.owner}</li>}
                  </ul>
                </Section>
                {isLive && (
                  <Section title="Handlinger">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await resolveAlert(r.id);
                            toast.success("Alarm markeret som løst");
                            setSelected(null);
                            await liveAlertsQuery.refetch();
                          } catch (e) {
                            toast.error(`Kunne ikke opdatere: ${(e as Error).message}`);
                          }
                        }}
                        className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Marker som løst
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            if (!supabase) throw new Error("Kundedatabasen er ikke konfigureret.");
                            const { data: auth, error } = await supabase.auth.getUser();
                            if (error || !auth.user)
                              throw new Error("Log ind igen for at bekræfte alarmen.");
                            await acknowledgeAlert(r.id, auth.user.id);
                            toast.success("Alarm bekræftet");
                            await liveAlertsQuery.refetch();
                          } catch (e) {
                            toast.error(`Kunne ikke bekræfte: ${(e as Error).message}`);
                          }
                        }}
                        className="text-xs rounded-lg border bg-card px-3 py-1.5"
                      >
                        Bekræft
                      </button>
                    </div>
                  </Section>
                )}
              </>
            );
          })()}
      </Drawer>
    </main>
  );
}

function toRow(a: AnyAlert): {
  id: string;
  title: string;
  sev: "critical" | "medium" | "low";
  type: string;
  project: string;
  source: string;
  first: string;
  last: string;
  owner: string;
  action: string;
  status: string;
} {
  if (a.__live === true) {
    const live = a as LiveAlert;
    return {
      id: live.id,
      title: live.title,
      sev: severityRank(live.severity),
      type: live.alert_type,
      project: live.project_id.slice(0, 8),
      source: live.source_type ?? "system",
      first: new Date(live.triggered_at).toLocaleString(),
      last: new Date(live.updated_at).toLocaleString(),
      owner: live.assigned_to ? live.assigned_to.slice(0, 8) : "—",
      action: live.message ?? "Se detaljer i konteksten.",
      status: live.status,
    };
  }
  const demo = a as DemoAlert;
  return {
    id: demo.id,
    title: demo.title,
    sev: severityRank(demo.severity),
    type: demo.type,
    project: demo.project,
    source: demo.source,
    first: demo.first,
    last: demo.last,
    owner: demo.owner,
    action: demo.action,
    status: demo.status,
  };
}

function KV({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{v}</div>
    </div>
  );
}
