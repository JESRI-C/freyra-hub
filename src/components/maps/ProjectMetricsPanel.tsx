import { Ruler, Leaf, Radio, Waves, Satellite, Database } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import type { ProjectMetrics } from "@/services/geospatial-service";

interface ProjectMetricsPanelProps {
  metrics: ProjectMetrics;
  className?: string;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "emerald" | "blue" | "amber" | "violet" | "neutral";
}

function MetricCard({ icon, label, value, sub, tone = "neutral" }: MetricCardProps) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    neutral: "bg-muted/40 text-muted-foreground border-muted",
  };
  const iconTones = {
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    violet: "text-violet-600",
    neutral: "text-muted-foreground",
  };

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${tones[tone]}`}>
      <div className={`${iconTones[tone]}`}>{icon}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function ProjectMetricsPanel({ metrics, className }: ProjectMetricsPanelProps) {
  const ndviLabel =
    metrics.latestNdvi !== null
      ? `${metrics.latestNdvi.toFixed(2)}`
      : "—";

  const ndviSub =
    metrics.latestNdvi !== null
      ? metrics.latestNdvi > 0.6
        ? "God vegetation"
        : metrics.latestNdvi > 0.4
          ? "Moderat vegetation"
          : "Lav vegetation"
      : "Ikke tilgængeligt";

  const distSub =
    metrics.nearestWatercourseDistanceM !== null
      ? metrics.nearestWatercourseDistanceM < 100
        ? "Inden for 100 m"
        : metrics.nearestWatercourseDistanceM < 500
          ? "Inden for 500 m"
          : "Mere end 500 m"
      : "Ukendt";

  return (
    <Card className={className}>
      <CardHeader
        title="Geodata-metrics"
        subtitle="Beregnet fra projekt­geometri og observationsdata"
        action={
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            SIMULERET
          </span>
        }
      />
      <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard
          icon={<Ruler className="h-4 w-4" />}
          label="Samlet areal"
          value={`${metrics.totalAreaHa} ha`}
          tone="emerald"
        />
        <MetricCard
          icon={<Leaf className="h-4 w-4" />}
          label="Beskyttet natur"
          value={metrics.protectedNatureOverlapHa !== null ? `${metrics.protectedNatureOverlapHa} ha` : "—"}
          sub="Overlap med §3"
          tone="emerald"
        />
        <MetricCard
          icon={<Radio className="h-4 w-4" />}
          label="Observationer"
          value={String(metrics.observationCount)}
          sub="Geo-punkter"
          tone="blue"
        />
        <MetricCard
          icon={<Waves className="h-4 w-4" />}
          label="Nærmeste vandløb"
          value={metrics.nearestWatercourseDistanceM !== null ? `${metrics.nearestWatercourseDistanceM} m` : "—"}
          sub={distSub}
          tone="blue"
        />
        <MetricCard
          icon={<Satellite className="h-4 w-4" />}
          label="NDVI (Sentinel-2)"
          value={ndviLabel}
          sub={ndviSub}
          tone="violet"
        />
        <MetricCard
          icon={<Database className="h-4 w-4" />}
          label="Datakomplethed"
          value={metrics.dataCompletenessScore !== null ? `${metrics.dataCompletenessScore}%` : "—"}
          tone={
            metrics.dataCompletenessScore !== null
              ? metrics.dataCompletenessScore >= 80
                ? "emerald"
                : metrics.dataCompletenessScore >= 60
                  ? "amber"
                  : "amber"
              : "neutral"
          }
        />
      </div>
    </Card>
  );
}
