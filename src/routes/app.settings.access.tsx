import { createFileRoute } from "@tanstack/react-router";
import { ProjectTeamPage } from "@/components/workspace/ProjectTeamPage";
export const Route = createFileRoute("/app/settings/access")({ component: ProjectTeamPage });
