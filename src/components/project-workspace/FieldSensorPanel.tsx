import { useState } from "react";
import { Battery, Signal, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import type { IoTSensor } from "@/services/iot-simulation-service";
import { SENSOR_TYPE_LABELS, getLiveReading } from "@/services/iot-simulation-service";
import { Card, CardHeader } from "@/components/ui-bits";

interface FieldSensorPanelProps {
  sensors: IoTSensor[];
  className?: string;
}

const STATUS_STYLE = {
  online: { dot: "bg-emerald-500", label: "Online", badge: "bg-emerald-100 text-emerald-700" },
  warning: { dot: "bg-amber-400", label: "Advarsel", badge: "bg-amber-100 text-amber-700" },
  offline: { dot: "bg-red-400", label: "Offline", badge: "bg-red-100 text-red-700" },
} as const;

function TrendIcon({ trend }: { trend: IoTSensor["trend"] }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function BatteryBar({ pct }: { pct: number }) {
  const color = pct < 20 ? "bg-red-400" : pct < 40 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Battery className="h-3.5 w-3.5" />
      <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "Lige nu";
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} t siden`;
}

export function FieldSensorPanel({ sensors, className }: FieldSensorPanelProps) {
  const [readings, setReadings] = useState<Record<string, number>>({});

  function refreshAll() {
    const updated: Record<string, number> = {};
    for (const s of sensors) {
      updated[s.id] = getLiveReading(s);
    }
    setReadings(updated);
  }

  const online = sensors.filter((s) => s.status === "online").length;
  const warning = sensors.filter((s) => s.status === "warning").length;
  const offline = sensors.filter((s) => s.status === "offline").length;

  return (
    <Card className={className}>
      <CardHeader
        title="Feltsensorer (IoT)"
        subtitle={`${sensors.length} simulerede sensorer — ${online} online`}
        action={
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Opdatér
          </button>
        }
      />

      {/* Summary row */}
      <div className="px-5 pb-3 flex gap-4 text-xs">
        <span className="flex items-center gap-1 text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
          {online} online
        </span>
        {warning > 0 && (
          <span className="flex items-center gap-1 text-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
            {warning} advarsel
          </span>
        )}
        {offline > 0 && (
          <span className="flex items-center gap-1 text-red-700">
            <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
            {offline} offline
          </span>
        )}
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">SIMULERET</span>
      </div>

      <div className="divide-y border-t">
        {sensors.map((sensor) => {
          const liveValue = readings[sensor.id] ?? sensor.latestValue;
          const st = STATUS_STYLE[sensor.status];
          return (
            <div
              key={sensor.id}
              className="px-5 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors"
            >
              {/* Status dot */}
              <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${st.dot}`} />

              {/* Label + type */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{sensor.label}</span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${st.badge}`}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {SENSOR_TYPE_LABELS[sensor.type]}
                </div>
                <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                  <BatteryBar pct={sensor.batteryPercent} />
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Signal className="h-3.5 w-3.5" />
                    {sensor.signalStrength}%
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Sidst set:</span>
                    <span>{formatLastSeen(sensor.lastSeen)}</span>
                  </div>
                </div>
              </div>

              {/* Value + trend */}
              <div className="text-right shrink-0">
                <div className="text-base font-semibold tabular-nums">
                  {liveValue}
                  <span className="text-xs font-normal text-muted-foreground ml-0.5">
                    {sensor.unit}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-0.5 mt-0.5">
                  <TrendIcon trend={sensor.trend} />
                  <span className="text-[10px] text-muted-foreground">
                    {sensor.trend === "up"
                      ? "Stigende"
                      : sensor.trend === "down"
                        ? "Faldende"
                        : "Stabil"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
