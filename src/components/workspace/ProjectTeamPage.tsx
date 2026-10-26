import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useConnectContext } from "@/lib/connect-context";
import { getMyProjectRole, permissionsFor } from "@/services/project-members-service";
import { ProjectMembersPanel } from "@/components/project/ProjectMembersPanel";
export function ProjectTeamPage() {
  const auth = useAuth();
  const { project, projectId } = useConnectContext();
  const role = useQuery({
    queryKey: ["project-role", auth.user?.id, projectId],
    queryFn: () => getMyProjectRole(projectId!, auth.user!.id),
    enabled: !!(projectId && auth.user),
  });
  const permissions = permissionsFor(
    ["owner", "admin"].includes(auth.currentOrg?.role ?? "") ? "admin" : role.data,
  );
  return (
    <main className="p-6 max-w-[1400px] mx-auto w-full space-y-4">
      <h1 className="text-2xl font-semibold">Brugere & roller</h1>
      <p>
        {auth.currentOrg?.name} · {project?.name ?? "Vælg et projekt"}
      </p>
      {projectId && auth.user ? (
        <ProjectMembersPanel
          key={projectId}
          projectId={projectId}
          currentUserId={auth.user.id}
          permissions={permissions}
        />
      ) : (
        <p>Vælg et projekt for at se dets faktiske medlemmer og adgang.</p>
      )}
    </main>
  );
}
