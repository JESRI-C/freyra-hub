import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  Cloud,
  Plug,
  ScrollText,
  FileText,
  FileBarChart,
} from "lucide-react";
import { AppTopbar } from "@/components/AppTopbar";

export const Route = createFileRoute("/app/ledger")({
  head: () => ({ meta: [{ title: "ESG Ledger — GoFreyra" }] }),
  component: LedgerLayout,
});

const TABS: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/app/ledger", label: "Overblik", icon: LayoutDashboard, exact: true },
  { to: "/app/ledger/metrics", label: "ESG-metrics", icon: BarChart3 },
  { to: "/app/ledger/csrd", label: "CSRD/ESRS", icon: ClipboardList },
  { to: "/app/ledger/co2", label: "CO₂-regnskab", icon: Cloud },
  { to: "/app/ledger/sources", label: "Datakilder", icon: Plug },
  { to: "/app/ledger/audit", label: "Audit trail", icon: ScrollText },
  { to: "/app/ledger/documents", label: "Dokumenter", icon: FileText },
  { to: "/app/ledger/reporting", label: "Rapportering", icon: FileBarChart },
];

function LedgerLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <AppTopbar
        title="ESG Ledger"
        subtitle="Dokumentation, audit trail og rapporteringsklar ESG-data"
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
                  to={t.to}
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
