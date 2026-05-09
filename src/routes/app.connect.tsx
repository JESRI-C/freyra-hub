import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Cpu,
  Database,
  Plug,
  Activity,
  Map,
  ShieldCheck,
  Bell,
  Plus,
  UploadCloud,
} from "lucide-react";
import { AppTopbar } from "@/components/AppTopbar";

export const Route = createFileRoute("/app/connect")({
  head: () => ({ meta: [{ title: "Smart Connect — GoFreyra" }] }),
  component: ConnectLayout,
});

const TABS = [
  { to: "/app/connect", label: "Overblik", icon: LayoutDashboard, exact: true },
  { to: "/app/connect/devices", label: "Enheder", icon: Cpu },
  { to: "/app/connect/sources", label: "Datakilder", icon: Database },
  { to: "/app/connect/integrations", label: "Integrationer", icon: Plug },
  { to: "/app/connect/live", label: "Live data", icon: Activity },
  { to: "/app/connect/map", label: "Kort & zoner", icon: Map },
  { to: "/app/connect/upload", label: "Upload center", icon: UploadCloud },
  { to: "/app/connect/quality", label: "Datakvalitet", icon: ShieldCheck },
  { to: "/app/connect/alerts", label: "Alerts", icon: Bell },
  { to: "/app/connect/add", label: "Tilføj datakilde", icon: Plus },
];

function ConnectLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <AppTopbar
        title="Smart Connect"
        subtitle="Datarygraden i GoFreyra — sensorer, satellit, drone, API'er og felt"
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
