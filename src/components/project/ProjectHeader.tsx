import { MapPin, Calendar, Leaf } from "lucide-react";
import { Pill } from "@/components/ui-bits";
import type { Project } from "@/lib/supabase/types";

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

interface ProjectHeaderProps {
  project: Project;
  sitesCount: number;
  activeDataSourcesCount: number;
  openActionsCount: number;
}

export function ProjectHeader({
  project,
  sitesCount,
  activeDataSourcesCount,
  openActionsCount,
}: ProjectHeaderProps) {
  return (
    <div className="rounded-2xl bg-card border shadow-soft p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-leaf/20 grid place-items-center text-leaf shrink-0">
            <Leaf className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
              {project.project_type && <span>{project.project_type}</span>}
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

      {project.description && (
        <p className="text-sm text-muted-foreground">{project.description}</p>
      )}

      <div className="flex flex-wrap gap-4 pt-2 border-t text-sm text-muted-foreground">
        {(project.start_date || project.end_date) && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {project.start_date
              ? new Date(project.start_date).toLocaleDateString("da-DK", {
                  year: "numeric",
                  month: "short",
                })
              : ""}
            {project.start_date && project.end_date && " – "}
            {project.end_date
              ? new Date(project.end_date).toLocaleDateString("da-DK", {
                  year: "numeric",
                  month: "short",
                })
              : ""}
          </div>
        )}
        <span>{sitesCount} sites</span>
        <span>{activeDataSourcesCount} aktive datakilder</span>
        {openActionsCount > 0 && (
          <span className="text-amber-600 font-medium">{openActionsCount} åbne handlinger</span>
        )}
      </div>
    </div>
  );
}
