import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { ProgramMap } from "@/components/ProgramMap";
import { canViewDevelopment } from "@/lib/development-access";
export const Route = createFileRoute("/app/program")({
  head: () => ({ meta: [{ title: "Projektstyring — Freyra" }] }),
  validateSearch: (search: Record<string, unknown>): { visning?: "skyhost" } =>
    search.visning === "skyhost" ? { visning: "skyhost" } : {},
  component: Page,
});
function Page() {
  const { currentProject, currentOrg } = useAuth();
  const { visning } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ProgramMap
      key={currentProject?.id ?? "no-project"}
      projectId={currentProject?.id}
      projectName={currentProject?.name}
      showDevelopment={canViewDevelopment(currentOrg?.role)}
      mode={visning ?? "program"}
      onModeChange={(mode) =>
        void navigate({ search: mode === "skyhost" ? { visning: "skyhost" } : {} })
      }
    />
  );
}
