import { useEffect, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { resolveProjectSelection } from "@/lib/project-selection";

export function ProjectContextBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { projectId, selectProject } = auth;
  const location = useRouterState({ select: (s) => s.location });
  const search = location.search as Record<string, unknown>;
  const match = location.pathname.match(/^\/app\/projects\/(?:map\/|geometry\/)?([^/]+)\/?$/);
  const requested = typeof search.project === "string" ? search.project : undefined;
  const selection = resolveProjectSelection(
    auth.organizations,
    auth.orgId,
    auth.projectId,
    requested,
    match ? decodeURIComponent(match[1]) : undefined,
  );
  useEffect(() => {
    if (!selection.invalid && selection.projectId && selection.projectId !== projectId)
      selectProject(selection.projectId);
  }, [selection.invalid, selection.projectId, projectId, selectProject]);
  if (selection.invalid)
    return (
      <div role="alert" className="p-6 space-y-3">
        <h2 className="font-semibold">Projektet er ikke tilgængeligt i den valgte kontekst</h2>
        <p>Vælg organisation og projekt igen. Der er ikke valgt et erstatningsprojekt.</p>
        <Link to="/select" className="text-primary underline">
          Vælg projekt
        </Link>
      </div>
    );
  if (selection.projectId !== projectId) return <p className="p-6">Indlæser projektvalg…</p>;
  return children;
}
