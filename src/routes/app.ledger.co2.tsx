import { createFileRoute } from "@tanstack/react-router";
import { ProjectWorkspacePage } from "@/components/workspace/ProjectWorkspacePage";
export const Route = createFileRoute("/app/ledger/co2")({ component: Page });
function Page() {
  return <ProjectWorkspacePage page="ledger/co2" />;
}
