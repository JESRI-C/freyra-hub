import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "@/components/workspace/AccountSettingsPage";
export const Route = createFileRoute("/app/settings/notifications")({ component: Page });
function Page() {
  return <AccountSettingsPage page="notifications" />;
}
