import { createFileRoute } from "@tanstack/react-router";
import { ProjectWorkspacePage } from "@/components/workspace/ProjectWorkspacePage";
export const Route = createFileRoute("/app/connect/add")({
  component: () => <ProjectWorkspacePage page="ledger/sources" />,
});
