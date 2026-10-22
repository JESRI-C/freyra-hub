import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Cpu,
  Database,
  Plug,
  Activity,
  Map,
} from "lucide-react";
import { AppTopbar } from "@/components/AppTopbar";
import { ConnectTopbar } from "@/components/connect/ConnectTopbar";

export const Route = createFileRoute("/app/connect")({
  head: () => ({
    meta: [
      { title: "Monitoring & Field Data — GoFreyra" },
      {
        name: "description",
        content:
          "Operationelt datalag for naturprojekter — enheder, datakilder, integrationer, live data og kort.",
      },
    ],
  }),
  component: ConnectLayout,
});

const TABS = [
  { to: "/app/connect", label: "Overblik", icon: LayoutDashboard, exact: true },
  { to: "/app/connect/devices", label: "Enheder", icon: Cpu },
  { to: "/app/connect/sources", label: "Datakilder", icon: Database },
  { to: "/app/connect/integrations", label: "Integrationer", icon: Plug },
  { to: "/app/connect/live", label: "Live data", icon: Activity },
  { to: "/app/connect/map", label: "Kort & zoner", icon: Map },
];

function ConnectLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-w-0 overflow-x-hidden">
      <AppTopbar
        title="Monitoring & Field Data"
        subtitle="Data fra sensorer, satellit, drone, felt og offentlige API'er"
      />
      <ConnectTopbar />
      <div className="border-b bg-card/60 sticky top-[57px] z-10 backdrop-blur">
        <div className="w-full px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto -mb-px">
            {TABS.map((t) => {
              const active = t.exact ? path === t.to : path.startsWith(t.to);
              const Icon = t.icon;
              return (
                <Link
                  key={t.to}
                  to={t.to as never}
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
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
