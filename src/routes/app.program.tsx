import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { ProgramMap } from "@/components/ProgramMap";
export const Route = createFileRoute("/app/program")({
  head: () => ({ meta: [{ title: "Programoverblik — Freyra" }] }),
  component: Page,
});
function Page() {
  const { currentProject } = useAuth();
  return (
    <ProgramMap
      key={currentProject?.id ?? "no-project"}
      projectId={currentProject?.id}
      projectName={currentProject?.name}
    />
  );
}
