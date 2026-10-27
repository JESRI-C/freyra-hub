import { createFileRoute } from "@tanstack/react-router";
import { ProjectWorkspacePage } from "@/components/workspace/ProjectWorkspacePage";
export const Route = createFileRoute("/app/public-impact")({ component: Page });
function Page() {
  return <ProjectWorkspacePage page="public-impact" />;
}
