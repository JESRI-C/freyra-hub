// Notification center — viser åbne alerts og lader brugeren bekræfte/løse.
import * as React from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, X, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui-bits";
import { Section } from "@/components/connect/Primitives";
import { listAlerts, acknowledgeAlert, resolveAlert, severityTone, type MonitoringAlert } from "@/services/monitoring/alerts-service";
import { useAuth } from "@/lib/auth";

const alertsQuery = (projectId: string | null) => ({
  queryKey: ["monitoring-alerts", projectId] as const,
  queryFn: () => (projectId ? listAlerts(projectId, { limit: 50 }) : Promise.resolve<MonitoringAlert[]>([])),
});

export function NotificationCenter({ projectId }: { projectId: string | null }) {
  const { data: alerts } = useSuspenseQuery(alertsQuery(projectId));
  const qc = useQueryClient();
  const { user } = useAuth();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["monitoring-alerts", projectId] });

  const open = alerts.filter((a) => a.status === "open");
  const acked = alerts.filter((a) => a.status === "acknowledged");
  const resolved = alerts.filter((a) => a.status === "resolved");

  if (alerts.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Bell className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm font-medium">Ingen aktive alarmer</div>
        <p className="text-xs text-muted-foreground mt-1">
          Alarmer udløses fra anomali-detektion, offline-enheder eller tærskler.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Åbne alarmer" subtitle={`${open.length} nye · ${acked.length} bekræftet · ${resolved.length} løst`}>
        <ul className="space-y-2">
          {open.length === 0 && <li className="text-xs text-muted-foreground p-3">Ingen åbne alarmer.</li>}
          {open.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              actions={
                <>
                  <button
                    onClick={() => user && acknowledgeAlert(a.id, user.id).then(invalidate)}
                    className="text-xs px-2 py-1 rounded border bg-card hover:bg-muted inline-flex items-center gap-1"
                    title="Bekræft"
                  >
                    <Check className="h-3 w-3" /> Bekræft
                  </button>
                  <button
                    onClick={() => resolveAlert(a.id).then(invalidate)}
                    className="text-xs px-2 py-1 rounded border bg-card hover:bg-muted inline-flex items-center gap-1"
                    title="Løs"
                  >
                    <X className="h-3 w-3" /> Løs
                  </button>
                </>
              }
            />
          ))}
        </ul>
      </Section>

      {acked.length > 0 && (
        <Section title="Bekræftet">
          <ul className="space-y-2">
            {acked.slice(0, 10).map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                muted
                actions={
                  <button
                    onClick={() => resolveAlert(a.id).then(invalidate)}
                    className="text-xs px-2 py-1 rounded border bg-card hover:bg-muted inline-flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Løs
                  </button>
                }
              />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function AlertRow({ alert, actions, muted }: { alert: MonitoringAlert; actions?: React.ReactNode; muted?: boolean }) {
  const tone = severityTone(alert.severity);
  const Icon = tone === "danger" ? AlertCircle : tone === "warning" ? AlertTriangle : Info;
  const toneClass =
    tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-primary";
  return (
    <li className={`flex items-start gap-3 p-3 rounded-lg border bg-muted/20 ${muted ? "opacity-60" : ""}`}>
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${toneClass}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{alert.title}</div>
        {alert.message && <div className="text-xs text-muted-foreground mt-0.5">{alert.message}</div>}
        <div className="text-[10px] text-muted-foreground mt-1">
          {new Date(alert.triggered_at).toLocaleString("da-DK")} · {alert.alert_type}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </li>
  );
}
