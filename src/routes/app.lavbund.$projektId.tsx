import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
  Navigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Map, Leaf, Droplets, BookCheck, FileText, ArrowLeft } from "lucide-react";
import { Pill } from "@/components/ui-bits";
import { getProject } from "@/services/lavbundService";
import type { ProjektStatus } from "@/types/lavbund";

export const Route = createFileRoute("/app/lavbund/$projektId")({
  head: () => ({ meta: [{ title: "LavbundsMRV — Projekt" }] }),
  component: ProjektLayout,
});

const TABS = [
  { to: "kort", label: "Feltkort & tidsserie", icon: Map },
  { to: "klima", label: "Klima · CO₂", icon: Leaf },
  { to: "fosfor", label: "Fosfor · brinkerosion", icon: Droplets },
  { to: "revisionsspor", label: "Revisionsspor", icon: BookCheck },
  { to: "rapport", label: "Rapport", icon: FileText },
] as const;

const STATUS_LABEL: Record<ProjektStatus, string> = {
  planlagt: "Planlagt",
  etablering: "Etablering",
  maaling: "Under måling",
  verificeret: "Verificeret",
  overdraget: "Overdraget",
};
const STATUS_TONE: Record<ProjektStatus, "default" | "success" | "warning" | "info"> = {
  planlagt: "default",
  etablering: "info",
  maaling: "warning",
  verificeret: "success",
  overdraget: "default",
};

function ProjektLayout() {
  const { projektId } = Route.useParams();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const q = useQuery({
    queryKey: ["lavbund", "project", projektId],
    queryFn: () => getProject(projektId),
  });

  // Redirect /app/lavbund/:id → /app/lavbund/:id/kort
  if (path === `/app/lavbund/${projektId}` || path === `/app/lavbund/${projektId}/`) {
    return <Navigate to="/app/lavbund/$projektId/kort" params={{ projektId }} />;
  }

  return (
    <div className="min-w-0">
      <div className="border-b bg-card/60">
        <div className="w-full px-4 sm:px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/app/lavbund"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Alle lavbundsprojekter
            </Link>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-semibold tracking-tight truncate">
                {q.data?.navn ?? (q.isLoading ? "Indlæser…" : "Ukendt projekt")}
              </h1>
              {q.data && (
                <>
                  <Pill tone={STATUS_TONE[q.data.status]}>{STATUS_LABEL[q.data.status]}</Pill>
                  <span className="text-xs text-muted-foreground">
                    {q.data.kommune} · {q.data.samletArealHa.toLocaleString("da-DK")} ha
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="w-full px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto -mb-px">
            {TABS.map((t) => {
              const full = `/app/lavbund/${projektId}/${t.to}`;
              const active = path.startsWith(full);
              const Icon = t.icon;
              return (
                <Link
                  key={t.to}
                  to={`/app/lavbund/$projektId/${t.to}` as never}
                  params={{ projektId }}
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
