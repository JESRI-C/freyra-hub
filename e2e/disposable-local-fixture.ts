import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

export type FixtureActor = { id: string; email: string; password: string };
export type LocalFixture = {
  organization: string;
  manager: FixtureActor;
  field: FixtureActor;
  registryAdmin: FixtureActor;
  collections: {
    customerId: string;
    customerName: string;
    lastContactId: string;
    lastContactName: string;
    lastMemberId: string;
    lastMemberName: string;
  };
  startActionId: string;
  workflow: {
    actionId: string;
    organizationId: string;
    projectId: string;
    planId: string;
    cardIds: string[];
  };
  api: { url: string; anonKey: string };
};
export async function fixture(): Promise<LocalFixture> {
  if (process.env.FREYRA_PLANNING_E2E !== "disposable-local")
    throw new Error("Browser acceptance requires the disposable local runner.");
  const data = JSON.parse(
    await readFile("tmp/planning-e2e/fixture.private.json", "utf8"),
  ) as LocalFixture;
  if (data.api.url !== "http://127.0.0.1:54321") throw new Error("Disposable local API required.");
  return data;
}
export async function login(page: Page, user: FixtureActor, organization: string) {
  await page.goto("/login?next=%2Fselect");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Adgangskode", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page).toHaveURL(/\/select\/?$/);
  await page.getByRole("button", { name: new RegExp(`^${organization}`) }).click();
  await page.getByRole("button", { name: `Åbn ${organization}`, exact: true }).click();
  await expect(page.getByRole("link", { name: /^Planlæg arbejde/ })).toBeVisible();
}
