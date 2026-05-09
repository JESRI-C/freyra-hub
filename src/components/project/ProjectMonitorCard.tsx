import { Link } from "@tanstack/react-router";
import { MapPin, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { Pill } from "@/components/ui-bits";
import type { NatureProjectSummary } from "@/lib/supabase/types";

function statusTone(status: string | null): "success" | "warning" | "info" | "default" {
  switch (status) {
    case "Verificeret":
      return "success";
    case "Under verifikation":
      return "warning";
    case "Afsluttet":
      return "info";
    default:
      return "default";
  }
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "up") return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

interface ProjectMonitorCardProps {
  summary: NatureProjectSummary;
}

export function ProjectMonitorCard({ summary }: ProjectMonitorCardProps) {
  const { project, indicators, activeDataSources, openActions, latestAuditEvent } = summary;

  const bioIndicator = indicators.find((i) => i.key === "biodiversity_index");
  const qualityIndicator = indicators.find((i) => i.key === "data_quality");

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-snug truncate">{project.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Freyra Demo</div>
        </div>
        <Pill tone={statusTone(project.status)}>{project.status ?? "Ukendt"}</Pill>
      </div>

      {/* Location + type */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {project.location_name ?? project.country}
          {project.project_type ? ` · ${project.project_type}` : ""}
        </span>
      </div>

      {/* Key indicators */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Biodiversitet", ind: bioIndicator },
          { label: "Datakvalitet", ind: qualityIndicator },
        ].map(({ label, ind }) => (
          <div key={label} className="rounded-lg bg-muted/50 px-2.5 py-2">
            <div className="text-[10px] text-muted-foreground">{label}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-sm font-semibold tabular-nums">
                {ind ? `${ind.value}${ind.unit ?? ""}` : "—"}
              </span>
              {ind && <TrendIcon trend={ind.trend} />}
            </div>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-2">
        <span>{activeDataSources} datakilder</span>
        {openActions > 0 && (
          <span className="text-amber-600 font-medium">{openActions} handlinger</span>
        )}
      </div>

      {/* Latest audit event */}
      {latestAuditEvent && (
        <div className="text-xs text-muted-foreground truncate" title={latestAuditEvent.title}>
          {latestAuditEvent.actor} ·{" "}
          {new Date(latestAuditEvent.created_at).toLocaleDateString("da-DK")}
        </div>
      )}

      {/* Link */}
      <Link
        to="/app/projects/$slug"
        params={{ slug: project.slug ?? project.id }}
        className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
      >
        Åbn projekt <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
