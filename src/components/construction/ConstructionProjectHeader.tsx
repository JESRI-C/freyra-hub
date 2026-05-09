import { Building2, MapPin } from "lucide-react";
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

export function ConstructionProjectHeader({ summary }: Props) {
  const {
    project,
    constructionExt,
    submissions,
    readinessScore,
    runoffRiskScore,
    natureSensitivityScore,
  } = summary;

  const latestSubmission = [...submissions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];

  return (
    <div className="rounded-2xl bg-card border shadow-soft p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-amber-100 grid place-items-center text-amber-700 shrink-0">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground flex-wrap">
              {constructionExt?.construction_type && (
                <span>{constructionExt.construction_type}</span>
              )}
              {constructionExt?.construction_phase && (
                <>
                  <span>·</span>
                  <span>Fase: {constructionExt.construction_phase}</span>
                </>
              )}
              {project.location_name && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {project.location_name}
                    {project.municipality && project.municipality !== project.location_name
                      ? `, ${project.municipality}`
                      : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <Pill tone={statusTone(project.status)}>{project.status ?? "Ukendt status"}</Pill>
      </div>

      {/* Parties row */}
      {constructionExt && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {constructionExt.developer_name && (
            <span>
              <span className="font-medium text-foreground">Bygherre:</span>{" "}
              {constructionExt.developer_name}
            </span>
          )}
          {constructionExt.contractor_name && (
            <span>
              <span className="font-medium text-foreground">Entreprenør:</span>{" "}
              {constructionExt.contractor_name}
            </span>
          )}
          {constructionExt.consultant_name && (
            <span>
              <span className="font-medium text-foreground">Rådgiver:</span>{" "}
              {constructionExt.consultant_name}
            </span>
          )}
        </div>
      )}

      {project.description && (
        <p className="text-sm text-muted-foreground">{project.description}</p>
      )}

      {/* Score chips + authority status */}
      <div className="flex flex-wrap gap-2 pt-2 border-t items-center">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground text-xs">Klarhed:</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              readinessScore >= 80
                ? "bg-emerald-100 text-emerald-700"
                : readinessScore >= 50
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-red-100 text-red-700"
            }`}
          >
            {readinessScore}%
          </span>
        </div>
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
        {latestSubmission && (
          <span className="text-xs text-muted-foreground ml-auto">
            Seneste myndighedspakke:{" "}
            <span className="font-medium text-foreground">{latestSubmission.status}</span>
          </span>
        )}
      </div>
    </div>
  );
}
