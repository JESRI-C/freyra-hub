import { createFileRoute } from "@tanstack/react-router";
import { ProjectWorkspacePage } from "@/components/workspace/ProjectWorkspacePage";
export const Route = createFileRoute("/app/impact/organizations")({ component: Page });
function Page() {
  return <ProjectWorkspacePage page="impact/organizations" />;
}
