import { Link } from "@tanstack/react-router";
import { ChevronsUpDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
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

        <span className="ml-auto hidden md:inline text-muted-foreground">
          Datagrundlag og rapportstatus vurderes pr. rapportversion
        </span>
      </div>
    </div>
  );
}
