import { Link, useRouterState } from "@tanstack/react-router";
import React from "react";
import {
  LayoutDashboard,
  Brain,
  Repeat2,
  BookCheck,
  Cable,
  FileText,
  Settings,
  Leaf,
  ChevronsUpDown,
  Map,
  Upload,
  Users,
  FolderOpen,
  Globe,
  FlaskConical,
  Building2,
} from "lucide-react";
import { useAuth, getCurrentOrg, getCurrentProject } from "@/lib/auth";

type SidebarItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type SidebarGroup = { label: string; items: SidebarItem[] };

const GROUPS: SidebarGroup[] = [
  {
    label: "Hovedmenu",
    items: [{ to: "/app/overview", label: "Oversigt", icon: LayoutDashboard }],
  },
  {
    label: "Data & Intelligence",
    items: [
      { to: "/app/connect", label: "Smart Connect", icon: Cable },
      { to: "/app/connect/map", label: "Kort & zoner", icon: Map },
      { to: "/app/connect/upload", label: "Upload Center", icon: Upload },
      { to: "/app/connect/registry", label: "Connector Registry", icon: Globe },
      { to: "/app/decisions", label: "DecisionsIQ", icon: Brain },
    ],
  },
  {
    label: "Impact & Dokumentation",
    items: [
      { to: "/app/projects", label: "Projekter", icon: FolderOpen },
      { to: "/app/construction", label: "Byggeri & Natur", icon: Building2 },
      { to: "/app/impact", label: "Impact Exchange", icon: Repeat2 },
      { to: "/app/ledger", label: "ESG Ledger", icon: BookCheck },
    ],
  },
  {
    label: "Output",
    items: [{ to: "/app/reports", label: "Rapporter", icon: FileText }],
  },
  {
    label: "Administration",
    items: [
      { to: "/app/settings", label: "Organisation", icon: Settings },
      { to: "/app/settings/users", label: "Brugere & roller", icon: Users },
    ],
  },
  {
    label: "System",
    items: [{ to: "/app/system-test", label: "System Test", icon: FlaskConical }],
  },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { orgId, projectId } = useAuth();
  const org = getCurrentOrg(orgId);
  const project = getCurrentProject(orgId, projectId);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-5 flex items-center gap-2.5 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-xl bg-leaf grid place-items-center text-leaf-foreground">
          <Leaf className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">GoFreyra</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-muted">Platform</div>
        </div>
      </div>

      <Link
        to="/select"
        className="mx-3 mt-3 rounded-xl bg-sidebar-accent/60 hover:bg-sidebar-accent transition border border-sidebar-border p-3 flex items-center gap-3"
      >
        <div className="h-8 w-8 rounded-lg bg-leaf/30 text-leaf grid place-items-center text-xs font-semibold">
          {org?.name.slice(0, 2).toUpperCase() ?? "—"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-sidebar-muted truncate">
            {org?.name ?? "Vælg organisation"}
          </div>
          <div className="text-sm font-medium truncate">{project?.name ?? "Intet projekt"}</div>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-sidebar-muted" />
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
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${
                      active
                        ? "bg-leaf text-leaf-foreground font-medium shadow-soft"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="rounded-xl bg-sidebar-accent/60 border border-sidebar-border p-3">
          <div className="text-xs text-sidebar-muted">Verificeret data</div>
          <div className="text-sm font-medium mt-0.5">98% dækning</div>
          <div className="mt-2 h-1.5 rounded-full bg-sidebar-border overflow-hidden">
            <div className="h-full w-[98%] bg-leaf" />
          </div>
        </div>
      </div>
    </aside>
  );
}
