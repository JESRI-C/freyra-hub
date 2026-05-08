import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Layers,
  FileBadge,
  Briefcase,
  Coins,
  ShieldCheck,
  Building2,
  FileBarChart,
} from "lucide-react";
import { AppTopbar } from "@/components/AppTopbar";

export const Route = createFileRoute("/app/impact")({
  head: () => ({ meta: [{ title: "Impact Exchange — GoFreyra" }] }),
  component: ImpactLayout,
});

const TABS: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/app/impact", label: "Overblik", icon: LayoutDashboard, exact: true },
  { to: "/app/impact/projects", label: "Projekter", icon: Layers },
  { to: "/app/impact/project", label: "Projektprofil", icon: FileBadge },
  { to: "/app/impact/portfolio", label: "Min portefølje", icon: Briefcase },
  { to: "/app/impact/credits", label: "Credits & aktiver", icon: Coins },
  { to: "/app/impact/verification", label: "Verifikation", icon: ShieldCheck },
  { to: "/app/impact/organizations", label: "Organisationer", icon: Building2 },
  { to: "/app/impact/reports", label: "Impact-rapporter", icon: FileBarChart },
];

function ImpactLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <AppTopbar
        title="Impact Exchange"
        subtitle="Find, vurdér og dokumentér verificerede natur- og klimaprojekter"
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
                  to={t.to as any}
                  className={`inline-flex items-center gap-2 px-3.5 py-3 text-sm border-b-2 whitespace-nowrap transition ${
                    active
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
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
