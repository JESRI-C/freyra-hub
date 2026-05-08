import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Brain, ListChecks, ShieldAlert, FlaskConical, Database, FileText, MessageSquare } from "lucide-react";
import { AppTopbar } from "@/components/AppTopbar";

export const Route = createFileRoute("/app/decisions")({
  head: () => ({ meta: [{ title: "DecisionsIQ — GoFreyra" }] }),
  component: DecisionsLayout,
});

const TABS: { to: string; label: string; icon: typeof Brain; exact?: boolean }[] = [
  { to: "/app/decisions", label: "AI-overblik", icon: Brain, exact: true },
  { to: "/app/decisions/recommendations", label: "Anbefalinger", icon: ListChecks },
  { to: "/app/decisions/risk", label: "Risikoanalyse", icon: ShieldAlert },
  { to: "/app/decisions/scenarios", label: "Scenarier", icon: FlaskConical },
  { to: "/app/decisions/data-quality", label: "Datakvalitet", icon: Database },
  { to: "/app/decisions/notes", label: "Beslutningsnotater", icon: FileText },
  { to: "/app/decisions/assistant", label: "AI-assistent", icon: MessageSquare },
];

function DecisionsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <AppTopbar title="DecisionsIQ" subtitle="AI-drevet beslutningsintelligens for projektets data" />
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
