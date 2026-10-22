import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FilePlus,
  Wrench,
  Eye,
  ShieldCheck,
  LayoutTemplate,
  Library,
  Send,
} from "lucide-react";
import { AppTopbar } from "@/components/AppTopbar";

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: "Report Engine — GoFreyra" }] }),
  component: ReportsLayout,
});

const TABS = [
  { to: "/app/reports", label: "Rapportcenter", icon: LayoutDashboard, exact: true },
  { to: "/app/reports/new", label: "Opret rapport", icon: FilePlus },
  { to: "/app/reports/builder", label: "Rapportbygger", icon: Wrench },
  { to: "/app/reports/preview", label: "Rapportpreview", icon: Eye },
  { to: "/app/reports/readiness", label: "Rapportklarhed", icon: ShieldCheck },
  { to: "/app/reports/templates", label: "Skabeloner", icon: LayoutTemplate },
  { to: "/app/reports/library", label: "Rapportbibliotek", icon: Library },
  { to: "/app/reports/approval", label: "Godkendelse & eksport", icon: Send },
];

function ReportsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <AppTopbar
        title="Report Engine"
        subtitle="Generér Green Tripart-, lodsejer-, metode- og myndighedsnotater fra projektets data"
      />
      <div className="border-b bg-card/60 sticky top-[57px] z-10 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-6">
          <nav className="flex gap-1 overflow-x-auto -mb-px">
            {TABS.map((t) => {
              const active = t.exact ? path === t.to : path.startsWith(t.to);
              const Icon = t.icon;
              return (
                <Link
                  key={t.to}
                  to={t.to as never}
                  className={`inline-flex items-center gap-2 px-3.5 py-3 text-sm border-b-2 whitespace-nowrap transition ${active ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <Outlet />
    </>
  );
}
