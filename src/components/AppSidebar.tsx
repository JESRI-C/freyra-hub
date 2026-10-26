import { Link, useRouterState } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { FolderOpen, Database, ChevronsUpDown, Menu } from "lucide-react";
import { useAuth } from "@/lib/auth";
import logoMark from "@/assets/gofreyra-logo.png";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { WORKSPACE_TOOLS } from "@/components/redesign/WorkspaceTools";

type SidebarItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type SidebarGroup = { label: string; items: SidebarItem[] };

const GROUPS: SidebarGroup[] = [
  {
    label: "Dit arbejde",
    items: [
      { to: "/app/projects", label: "Sager", icon: FolderOpen },
      { to: "/app/sources", label: "Kilder", icon: Database },
    ],
  },
];

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { currentOrg: org, currentProject: project } = useAuth();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-5 flex items-center gap-2.5 border-b border-sidebar-border">
        <img src={logoMark} alt="Freyra" className="h-9 w-9 object-contain" />
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">Freyra</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-muted">
            Naturdokumentation
          </div>
        </div>
      </div>

      <Link
        to="/select"
        onClick={onNavigate}
        className="mx-3 mt-3 rounded-xl bg-sidebar-accent/60 hover:bg-sidebar-accent transition border border-sidebar-border p-3 flex items-center gap-3"
      >
        <div className="h-8 w-8 shrink-0 rounded-lg bg-leaf/30 text-sidebar-foreground grid place-items-center text-xs font-semibold">
          {org?.name.slice(0, 2).toUpperCase() ?? "—"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-sidebar-muted truncate">
            {org?.name ?? "Vælg organisation"}
          </div>
          <div className="text-sm font-medium truncate">{project?.name ?? "Intet projekt"}</div>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-muted" />
      </Link>

      <div className="flex-1 overflow-y-auto">
        <nav aria-label="Hovedmenu" className="p-3">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    path === item.to ||
                    (item.to !== "/app/settings" && path.startsWith(item.to + "/")) ||
                    (item.to === "/app/settings" && path === "/app/settings");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${
                        active
                          ? "bg-white text-primary font-medium shadow-soft"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <details
          className="mx-3 mb-4 rounded-lg border border-sidebar-border p-3"
          open={
            WORKSPACE_TOOLS.some((tool) => path === tool.to || path.startsWith(tool.to + "/")) ||
            undefined
          }
        >
          <summary className="cursor-pointer text-sm font-medium">Alle kategorier</summary>
          <nav aria-label="Alle kategorier" className="mt-2 space-y-1">
            {WORKSPACE_TOOLS.map((tool) => (
              <Link
                key={tool.to}
                to={tool.to}
                onClick={onNavigate}
                aria-current={path === tool.to ? "page" : undefined}
                className="block rounded px-2 py-2 text-xs leading-5 hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-2"
              >
                {tool.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <Link
          to="/select"
          onClick={onNavigate}
          className="mb-4 block text-xs text-sidebar-foreground underline underline-offset-4"
        >
          Arbejdsplads og log ud
        </Link>
        <div className="rounded-xl bg-sidebar-accent/60 border border-sidebar-border p-3">
          <div className="text-xs text-sidebar-muted">Fra billeder til aflevering</div>
          <div className="text-sm font-medium mt-0.5">Én samlet sag</div>
          <p className="mt-2 text-xs text-sidebar-muted">
            Kildestatus og faglig vurdering fremgår af den enkelte rapport.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-sidebar-border">
      <SidebarBody />
    </aside>
  );
}

export function MobileSidebarTrigger() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Åbn menu"
          className="md:hidden h-11 w-11 grid place-items-center rounded-xl border bg-card hover:bg-muted transition"
        >
          <Menu className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72 max-w-[85vw] bg-sidebar border-sidebar-border">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarBody onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
