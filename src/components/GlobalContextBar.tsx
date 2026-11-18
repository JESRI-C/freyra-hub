import { Link } from "@tanstack/react-router";
import { Activity, ChevronsUpDown, Sparkles } from "lucide-react";
import { MUNICIPAL_WORKFLOW } from "@/lib/municipal-workflow";
import { useAuth } from "@/lib/auth";
import { isDemoDataEnabled as isOfflineDemoMode } from "@/lib/data-mode";
import { ActivityTray } from "@/components/redesign/ActivityTray";
import { MobileSidebarTrigger } from "@/components/AppSidebar";
export function GlobalContextBar() {
  const { currentOrg: org, currentProject: project } = useAuth();
  return (
    <div className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
      <div className="flex items-center gap-2 px-3 sm:px-6 py-2 text-xs min-w-0">
        <MobileSidebarTrigger />

        <Link
          to="/select"
          className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted transition min-w-0"
          title="Skift organisation eller projekt"
        >
          <span className="h-5 w-5 shrink-0 rounded bg-leaf/30 text-primary grid place-items-center text-[10px] font-semibold">
            {org?.name.slice(0, 2).toUpperCase() ?? "—"}
          </span>
          <span className="font-medium text-foreground truncate max-w-[110px] sm:max-w-[180px]">
            {org?.name ?? "Vælg organisation"}
          </span>
          <span className="hidden sm:inline text-muted-foreground">·</span>
          <span className="hidden sm:inline text-foreground truncate max-w-[200px]">
            {project?.name ?? "Intet projekt"}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Link>

        <span className="hidden md:inline-block h-4 w-px bg-border" />

        {project ? (
          <Link
            to="/app/projects/$slug"
            params={{ slug: project.slug ?? project.id }}
            search={MUNICIPAL_WORKFLOW ? { step: "datagrundlag" } : {}}
            className="hidden md:inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Activity className="h-3.5 w-3.5" /> Se sagens datagrundlag
          </Link>
        ) : (
          <span className="hidden md:inline-flex items-center gap-1.5 text-muted-foreground">
            Vælg sag for at se datagrundlag
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {false}
          <ActivityTray projectId={project?.id} />
        </div>
      </div>
    </div>
  );
}
