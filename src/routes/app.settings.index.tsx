import { createFileRoute } from "@tanstack/react-router";
import { OrganizationProfilePage } from "@/components/workspace/OrganizationProfilePage";
export const Route = createFileRoute("/app/settings/")({ component: OrganizationProfilePage });
