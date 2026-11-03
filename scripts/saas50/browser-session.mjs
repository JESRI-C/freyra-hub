import { chromium } from "@playwright/test";
import { fixture } from "./common.mjs";

export function launch() {
  return chromium.launch({ channel: "chrome", headless: true });
}
export async function openSession(browser, user, session, tenant, width = 390) {
  const selection =
    tenant && !["external", "unassigned"].includes(user.role)
      ? { orgId: tenant.organizationId, projectId: tenant.projectId }
      : { orgId: null, projectId: null };
  const context = await browser.newContext({
    viewport: { width, height: width > 1000 ? 1000 : 844 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: fixture.app,
          localStorage: [
            { name: "sb-xdvqdzdpyceojbdknofi-auth-token", value: JSON.stringify(session) },
            { name: "freyra-auth-selection-v1", value: JSON.stringify(selection) },
          ],
        },
      ],
    },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return { context, page };
}
export function taskUrl(tenant, part) {
  return `${fixture.app}/app/projects/${tenant.projectId}?tab=handlinger&task=${tenant.actionId}&work=${part}`;
}
