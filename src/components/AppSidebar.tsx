import { Link, useRouterState } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Database,
  Coins,
  Globe,
  Settings,
  ChevronsUpDown,
  Map,
  Building2,
  Cable,
  Brain,
  BookCheck,
  Users,
  FlaskConical,
  Droplets,
  Menu,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import logoMark from "@/assets/gofreyra-logo.png";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

type SidebarItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type SidebarGroup = { label: string; items: SidebarItem[] };

const GROUPS: SidebarGroup[] = [
  {
    label: "Arbejdsflow",
    items: [
      { to: "/app/overview", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/projects", label: "Naturprojekter", icon: FolderOpen },
      { to: "/app/reports", label: "Rapporter", icon: FileText },
    ],
  },
  {
    label: "Projektværktøjer",
    items: [
      { to: "/app/connect/map", label: "Kort & zoner", icon: Map },
      { to: "/app/construction", label: "Byggeri & natur", icon: Building2 },
      { to: "/app/connect", label: "Monitoring & feltdata", icon: Cable },
      { to: "/app/lavbund", label: "LavbundsMRV", icon: Droplets },
      { to: "/app/decisions", label: "Project Intelligence", icon: Brain },
      { to: "/app/ledger", label: "Dokumentation & audit", icon: BookCheck },
    ],
  },
  {
    label: "Data & metoder",
    items: [{ to: "/app/connect/registry", label: "Data & metoder", icon: Database }],
  },
  {
    label: "Finansiering & impact",
    items: [
      { to: "/app/impact", label: "Funding & impact", icon: Coins },
      { to: "/app/public-impact", label: "Public impact", icon: Globe },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/app/settings", label: "Indstillinger", icon: Settings },
      { to: "/app/settings/users", label: "Brugere & roller", icon: Users },
      { to: "/app/system-test", label: "System Test", icon: FlaskConical },
    ],
  },
];

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { currentOrg: org, currentProject: project } = useAuth();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-5 flex items-center gap-2.5 border-b border-sidebar-border">
        <img src={logoMark} alt="GoFreyra" className="h-9 w-9 object-contain" />
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">GoFreyra</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-muted">
            Naturprojekt-platform
          </div>
        </div>
      </div>

      <Link
        to="/select"
        onClick={onNavigate}
        className="mx-3 mt-3 rounded-xl bg-sidebar-accent/60 hover:bg-sidebar-accent transition border border-sidebar-border p-3 flex items-center gap-3"
      >
        <div className="h-8 w-8 shrink-0 rounded-lg bg-leaf/30 text-leaf grid place-items-center text-xs font-semibold">
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

      <nav className="flex-1 p-3 overflow-y-auto">
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
                    onClick={onNavigate}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${
                      active
                        ? "bg-leaf text-leaf-foreground font-medium shadow-soft"
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

      <div className="p-4 border-t border-sidebar-border">
        <div className="rounded-xl bg-sidebar-accent/60 border border-sidebar-border p-3">
          <div className="text-xs text-sidebar-muted">Metodekvalitet</div>
          <div className="text-sm font-medium mt-0.5">Dokumenteret & sporbar</div>
          <div className="mt-2 h-1.5 rounded-full bg-sidebar-border overflow-hidden">
            <div className="h-full w-[82%] bg-leaf" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border">
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
          className="md:hidden h-9 w-9 grid place-items-center rounded-xl border bg-card hover:bg-muted transition"
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
