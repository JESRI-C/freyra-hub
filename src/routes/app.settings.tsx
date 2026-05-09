import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  FolderKanban,
  Users,
  ShieldCheck,
  Boxes,
  BookOpen,
  Bell,
  KeyRound,
  CreditCard,
} from "lucide-react";
import { AppTopbar } from "@/components/AppTopbar";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Indstillinger — GoFreyra" }] }),
  component: SettingsLayout,
});

const TABS = [
  { to: "/app/settings", label: "Organisationsprofil", icon: Building2, exact: true },
  { to: "/app/settings/projects", label: "Projekter", icon: FolderKanban },
  { to: "/app/settings/users", label: "Brugere & roller", icon: Users },
  { to: "/app/settings/access", label: "Adgang & rettigheder", icon: ShieldCheck },
  { to: "/app/settings/modules", label: "Moduler", icon: Boxes },
  { to: "/app/settings/frameworks", label: "Standarder & frameworks", icon: BookOpen },
  { to: "/app/settings/notifications", label: "Notifikationer", icon: Bell },
  { to: "/app/settings/security", label: "API & sikkerhed", icon: KeyRound },
  { to: "/app/settings/billing", label: "Abonnement", icon: CreditCard },
];

function SettingsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      <AppTopbar
        title="Indstillinger"
        subtitle="Kontrolcenter for organisation, projekter, brugere og platform"
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
