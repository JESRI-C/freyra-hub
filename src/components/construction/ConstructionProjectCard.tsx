import { Link } from "@tanstack/react-router";
import { MapPin, ArrowRight, AlertTriangle } from "lucide-react";
import { Pill } from "@/components/ui-bits";
import type { ConstructionProjectSummary } from "@/lib/supabase/types";

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

function scoreTone(score: "low" | "medium" | "high" | "critical"): string {
  switch (score) {
    case "critical":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

function scoreLabel(score: "low" | "medium" | "high" | "critical"): string {
  switch (score) {
    case "critical":
      return "Kritisk";
    case "high":
      return "Høj";
    case "medium":
      return "Medium";
    default:
      return "Lav";
  }
}

interface Props {
  summary: ConstructionProjectSummary;
}

export function ConstructionProjectCard({ summary }: Props) {
  const { project, risks, readinessScore, runoffRiskScore, natureSensitivityScore } = summary;

  const openHighRisks = risks.filter(
    (r) => r.status === "Åben" && (r.severity === "Kritisk" || r.severity === "Høj"),
  ).length;

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-snug truncate">{project.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {summary.constructionExt?.construction_type ?? project.project_type ?? "Byggeri"}
          </div>
        </div>
        <Pill tone={statusTone(project.status)}>{project.status ?? "Ukendt"}</Pill>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {project.location_name ?? project.municipality ?? project.country}
          {project.municipality && project.municipality !== project.location_name
            ? `, ${project.municipality}`
            : ""}
        </span>
      </div>

      {/* Phase */}
      {summary.constructionExt?.construction_phase && (
        <div className="text-xs text-muted-foreground">
          Fase:{" "}
          <span className="font-medium text-foreground">
            {summary.constructionExt.construction_phase}
          </span>
        </div>
      )}

      {/* Score chips */}
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreTone(natureSensitivityScore)}`}
        >
          Natur: {scoreLabel(natureSensitivityScore)}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreTone(runoffRiskScore)}`}
        >
          Afstrømning: {scoreLabel(runoffRiskScore)}
        </span>
      </div>

      {/* Readiness bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Myndighedsklarhed</span>
          <span className="font-medium tabular-nums">{readinessScore}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              readinessScore >= 80
                ? "bg-emerald-500"
                : readinessScore >= 50
                  ? "bg-amber-400"
                  : "bg-red-400"
            }`}
            style={{ width: `${readinessScore}%` }}
          />
        </div>
      </div>

      {/* Open risks */}
      {openHighRisks > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{openHighRisks} åbne høje/kritiske risici</span>
        </div>
      )}

      {/* Link */}
      <Link
        to="/app/construction/projects/$slug"
        params={{ slug: project.slug ?? project.id }}
        className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
      >
        Åbn projekt <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
