import { createFileRoute } from "@tanstack/react-router";
import { ProjectWorkspacePage } from "@/components/workspace/ProjectWorkspacePage";
export const Route = createFileRoute("/app/settings/frameworks")({ component: Page });
function Page() {
  return <ProjectWorkspacePage page="ledger/csrd" />;
}
