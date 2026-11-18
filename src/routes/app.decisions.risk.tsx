import { createFileRoute } from "@tanstack/react-router";
import { ProjectWorkspacePage } from "@/components/workspace/ProjectWorkspacePage";
export const Route = createFileRoute("/app/decisions/risk")({ component: Page });
function Page() {
  return <ProjectWorkspacePage page="decisions/risk" />;
}
