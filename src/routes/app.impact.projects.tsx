import { createFileRoute } from "@tanstack/react-router";
import { ProjectWorkspacePage } from "@/components/workspace/ProjectWorkspacePage";
export const Route = createFileRoute("/app/impact/projects")({ component: Page });
function Page() {
  return <ProjectWorkspacePage page="impact/projects" />;
}
