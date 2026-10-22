import { Link } from "@tanstack/react-router";
import { Calendar, Activity, ShieldCheck, ChevronsUpDown, Bell, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PROJECT_FACTS } from "@/lib/platform-data";
import { DemoModeBadge, StatusBadge } from "@/components/platform/Primitives";
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

        <span className="hidden md:inline-flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" /> Q2 2026
        </span>
        <span className="hidden md:inline-flex items-center gap-1.5 text-muted-foreground">
          <Activity className="h-3.5 w-3.5" /> Datafriskhed{" "}
          <span className="text-foreground font-medium">3 min</span>
        </span>
        <span className="hidden lg:inline-flex items-center gap-1.5 text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Datakvalitet{" "}
          <span className="text-foreground font-medium">{PROJECT_FACTS.dataQuality}%</span>
        </span>
        <span className="hidden lg:inline-flex">
          <StatusBadge status={PROJECT_FACTS.status} />
        </span>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex">
            <DemoModeBadge />
          </span>
          <Link
            to="/app/overview"
            className="hidden md:inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1 hover:bg-muted text-foreground"
            title="Start guidet demo"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Start demo
          </Link>
          <button
            className="relative h-7 w-7 grid place-items-center rounded-lg border bg-background hover:bg-muted"
            title="Notifikationer"
          >
            <Bell className="h-3.5 w-3.5" />
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-destructive" />
          </button>
        </div>
      </div>
    </div>
  );
}
