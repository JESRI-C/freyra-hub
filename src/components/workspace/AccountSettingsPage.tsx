import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useConnectContext } from "@/lib/connect-context";
import { supabase } from "@/integrations/supabase/client";
import { loadProjectWorkspace, type ProjectWorkspace } from "@/services/project-workspace-service";
import { listAlertRules } from "@/services/monitoring/alert-rules-service";
const titles = {
  modules: "Moduler",
  notifications: "Notifikationer",
  security: "API & sikkerhed",
  billing: "Abonnement",
};
export function AccountSettingsPage({ page }: { page: keyof typeof titles }) {
  const auth = useAuth();
  const { projectId, project } = useConnectContext();
  const workspace = useQuery({
    queryKey: ["project-workspace", auth.user?.id, auth.orgId, projectId],
    queryFn: () => loadProjectWorkspace({ organizationId: auth.orgId!, projectId: projectId! }),
    enabled: !!(projectId && auth.orgId && auth.user),
  });
  const security = useQuery({
    queryKey: ["account-security", auth.user?.id],
    enabled: page === "security" && !!auth.user,
    queryFn: async () => {
      const [level, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (level.error) throw new Error(level.error.message);
      if (factors.error) throw new Error(factors.error.message);
      return {
        level: level.data.currentLevel,
        factors: factors.data.all.filter((f) => f.status === "verified").length,
      };
    },
  });
  const alerts = useQuery({
    queryKey: ["alert-rules", auth.user?.id, auth.orgId, projectId],
    queryFn: async () =>
      (await listAlertRules(projectId)).filter(
        (rule) =>
          rule.project_id === projectId ||
          (rule.project_id === null && rule.organization_id === auth.orgId),
      ),
    enabled: page === "notifications" && !!(auth.user && auth.orgId && projectId),
  });
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{titles[page]}</h1>
      <p>
        {auth.currentOrg?.name} · {project?.name ?? "Vælg et projekt"}
      </p>
      {page === "modules" && (
        <>
          <p>Åbn projektets tilgængelige værktøjer. Datastatus er knyttet til den valgte sag.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              ["/app/connect", "Monitoring & feltdata", "sources"],
              ["/app/decisions", "Project Intelligence", "actions"],
              ["/app/ledger", "Dokumentation & audit", "indicators"],
              ["/app/impact", "Funding & impact", "units"],
            ].map(([to, label, resource]) => (
              <section className="border rounded p-4" key={to}>
                <Link to={to as never}>{label}</Link>
                <p>
                  {!projectId
                    ? "Vælg et projekt"
                    : workspace.isPending
                      ? "Indlæser…"
                      : workspace.error
                        ? "Datastatus ukendt"
                        : workspace.data?.errors[resource as keyof ProjectWorkspace["errors"]]
                          ? "Datakilden kunne ikke indlæses"
                          : `${(workspace.data?.[resource as "sources"] ?? []).length} registreringer på projektet`}
                </p>
              </section>
            ))}
          </div>
          <Link to="/app/reports">Rapporter og skabeloner</Link>
          <Link to="/app/construction">Byggeri & natur</Link>
          <Link to="/app/lavbund">LavbundsMRV</Link>
        </>
      )}
      {page === "notifications" && (
        <>
          <p>Projektets registrerede alarmregler:</p>
          {!projectId ? (
            <p>Vælg et projekt.</p>
          ) : alerts.isPending ? (
            <p>Indlæser regler…</p>
          ) : alerts.error ? (
            <p role="alert">Regler kunne ikke indlæses: {alerts.error.message}</p>
          ) : alerts.data?.length ? (
            alerts.data.map((rule) => (
              <article className="border rounded p-3" key={rule.id}>
                <h2>{rule.name}</h2>
                <p>
                  {rule.is_active ? "Aktiv regel" : "Inaktiv regel"} · {rule.severity}
                </p>
              </article>
            ))
          ) : (
            <p>Ingen alarmregler registreret.</p>
          )}
          <Link to="/app/connect/alerts" search={{ project: projectId } as never}>
            Opret og redigér projektets alarmregler
          </Link>
          <p className="text-sm text-muted-foreground">
            En registreret regel dokumenterer ikke, at en mail eller anden besked er afsendt.
          </p>
        </>
      )}
      {page === "security" && (
        <>
          {security.isPending ? (
            <p>Indlæser kontosikkerhed…</p>
          ) : security.error ? (
            <p role="alert">Sikkerhedsstatus kunne ikke indlæses: {security.error.message}</p>
          ) : (
            <dl>
              <dt>Aktuelt login</dt>
              <dd>{security.data?.level ?? "Ukendt"}</dd>
              <dt>Bekræftede ekstra loginfaktorer på din konto</dt>
              <dd>{security.data?.factors ?? "Ukendt"}</dd>
            </dl>
          )}
          <p>Adgang til sager styres af organisationens og projektets faktiske medlemskaber.</p>
          <Link to="/app/settings/access">Administrér projektadgang</Link>
          <Link to="/app/connect/integrations">Administrér dataforbindelser</Link>
        </>
      )}
      {page === "billing" && (
        <>
          <section className="border rounded p-4 space-y-2">
            <h2>Abonnements- og fakturagrundlag</h2>
            <p>
              Pris, abonnement, kvoter og fakturaer er ikke registreret i den tilknyttede
              projektbase. Status er ukendt.
            </p>
            <p>
              Tilgængelige projekter i organisationen:{" "}
              {auth.currentOrg?.projects.length ?? "Ukendt"}
            </p>
            <p>
              Dokumenter på den valgte sag:{" "}
              {workspace.data?.errors.documents || workspace.error
                ? "Ukendt"
                : (workspace.data?.documents?.length ?? "Indlæser…")}
            </p>
          </section>
          <Link to="/app/settings/projects">Se organisationens projekter</Link>
          <Link to="/app/impact/credits">Se sagens registrerede finansiering</Link>
        </>
      )}
    </main>
  );
}
