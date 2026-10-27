import { createFileRoute } from "@tanstack/react-router";
import { ProjectWorkspacePage } from "@/components/workspace/ProjectWorkspacePage";
export const Route = createFileRoute("/app/connect/integrations")({
  component: () => <ProjectWorkspacePage page="ledger/sources" />,
});
