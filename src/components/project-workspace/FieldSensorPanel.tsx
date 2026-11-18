import { Battery, Signal, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import type { MapDevice } from "@/services/monitoring/map-devices-service";
import { Card, CardHeader } from "@/components/ui-bits";

interface FieldSensorPanelProps {
  sensors: MapDevice[] | null;
  status: string;
  refreshing?: boolean;
  onRefresh?: () => unknown;
  className?: string;
}
const statuses = {
  online: { dot: "bg-emerald-500", label: "Online" },
  partial: { dot: "bg-amber-400", label: "Delvis forbindelse" },
  attention: { dot: "bg-amber-400", label: "Kræver opmærksomhed" },
  offline: { dot: "bg-red-400", label: "Offline" },
  not_activated: { dot: "bg-slate-400", label: "Ikke aktiveret" },
};
function BatteryBar({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100)
    return (
      <span className="text-xs text-muted-foreground">Batteriniveau mangler eller er ugyldigt</span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Battery className="h-3.5 w-3.5" />
      {value}%
    </span>
  );
}
function lastSeen(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.now())
    return "Tidspunkt ukendt";
  return new Date(value).toLocaleString("da-DK");
}
export function FieldSensorPanel({
  sensors,
  status,
  refreshing,
  onRefresh,
  className,
}: FieldSensorPanelProps) {
  const online = sensors?.filter((sensor) => sensor.status === "online").length ?? 0;
  return (
    <Card className={className}>
      <CardHeader
        title="Registrerede enheder"
        subtitle={
          sensors ? `${sensors.length} enheder · ${online} online` : "Ingen aktuelle enhedsdata"
        }
        action={
          onRefresh && (
            <button
              type="button"
              aria-label="Opdatér registrerede enheder"
              disabled={refreshing}
              onClick={() => void onRefresh()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-60"
            >
              <RefreshCw className="h-3 w-3" />
              {refreshing ? "Henter…" : "Opdatér"}
            </button>
          )
        }
      />
      <p role="status" className="px-5 pb-3 text-sm text-muted-foreground">
        {status}
      </p>
      <div className="divide-y border-t">
        {sensors?.map((sensor) => {
          const state = statuses[sensor.status];
          const Trend =
            sensor.trend === "up" ? TrendingUp : sensor.trend === "down" ? TrendingDown : Minus;
          return (
            <article
              key={sensor.id}
              data-device-id={sensor.id}
              className="min-w-0 space-y-2 break-words px-5 py-3 [overflow-wrap:anywhere]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${state.dot}`} />
                <h3 className="text-sm font-medium">{sensor.label}</h3>
                <span className="text-xs text-muted-foreground">{state.label}</span>
              </div>
              <div className="text-base font-semibold tabular-nums">
                {sensor.measurement
                  ? `${sensor.measurement.value}${sensor.measurement.unit ? " " + sensor.measurement.unit : ""}`
                  : "Ingen måling registreret"}
              </div>
              {sensor.measurement && (
                <div className="text-xs text-muted-foreground">
                  Målt: {sensor.measurement.measuredAt} · Datakvalitet:{" "}
                  {sensor.measurement.qualityStatus}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <BatteryBar value={sensor.batteryPercent} />
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Signal className="h-3.5 w-3.5" />
                  {sensor.signalStrength === null || !Number.isFinite(sensor.signalStrength)
                    ? "Signalstyrke mangler"
                    : `Signalværdi: ${sensor.signalStrength} (enhed ikke angivet)`}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Sidst set: {lastSeen(sensor.lastSeen)}
              </div>
              <div className="text-xs text-muted-foreground">
                {sensor.coordinates
                  ? `Position: ${sensor.coordinates.lat}, ${sensor.coordinates.lng} · ${sensor.coordinates.source === "measurement" ? "fra gemt måling" : "registreret enhedsposition, ikke aktuel GPS"}`
                  : "Position mangler – vises ikke på kortet"}
              </div>
              <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Trend className="h-3.5 w-3.5" />
                {sensor.trend === "up"
                  ? "Stigende"
                  : sensor.trend === "down"
                    ? "Faldende"
                    : sensor.trend === "stable"
                      ? "Uændret"
                      : "Trend ikke beregnet"}
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
