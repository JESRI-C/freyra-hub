import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

type Fixture = {
  organization: string;
  manager: { email: string; password: string };
  field: { email: string; password: string };
};

async function fixture(): Promise<Fixture> {
  if (process.env.FREYRA_PLANNING_E2E !== "disposable-local")
    throw new Error("Planning acceptance requires the disposable local runner.");
  return JSON.parse(await readFile("tmp/planning-e2e/fixture.private.json", "utf8"));
}

async function login(page: Page, user: Fixture["manager"], organization: string) {
  await page.goto("/login?next=%2Fselect");
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Adgangskode", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page).toHaveURL(/\/select\/?$/);
  await page.getByRole("button", { name: new RegExp(`^${organization}`) }).click();
  await page.getByRole("button", { name: `Åbn ${organization}`, exact: true }).click();
  await expect(page.getByRole("link", { name: /^Planlæg arbejde/ })).toBeVisible();
}

test("planner saves a new version through the real server and retains it after reload", async ({
  page,
}) => {
  const data = await fixture();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, data.manager, data.organization);
  await page.getByRole("link", { name: /^Planlæg arbejde/ }).click();
  await expect(page).toHaveURL(/\/app\/work-orders\?view=planning$/);
  await page.getByLabel("Dato i ugen", { exact: true }).fill("2026-11-23");
  const week = page.getByRole("region", { name: "Ugeplan på tværs af sager", exact: true });
  const monday = week.getByRole("region", { name: "Plan for 2026-11-23", exact: true });
  const tuesday = week.getByRole("region", { name: "Plan for 2026-11-24", exact: true });
  const wednesday = week.getByRole("region", { name: "Plan for 2026-11-25", exact: true });
  await expect(monday).toContainText("Syntetisk opgave A");
  await expect(tuesday).toContainText("Syntetisk opgave B");
  await expect(week.getByRole("region", { name: "Opgaver uden fuld planperiode" })).toContainText(
    "Syntetisk opgave uden datoer",
  );
  await expect(tuesday).not.toContainText("Syntetisk opgave uden datoer");
  await expect(page.locator("body")).not.toContainText("Skjult syntetisk opgave");
  await monday
    .getByRole("button", { name: "Planlæg Syntetisk opgave A i Syntetisk sag A", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("button", { name: "Rediger plan som ny version", exact: true }).click();
  await editor.getByLabel("Planlagt fra", { exact: true }).fill("2026-11-25");
  await editor.getByLabel("Planlagt til", { exact: true }).fill("2026-11-26");
  await editor.getByLabel("Årsag til planændring", { exact: true }).fill("Syntetisk omplanlægning");
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("alert")).toContainText("Gem eller fortryd din kladde");
  await expect(editor.getByLabel("Planlagt fra", { exact: true })).toHaveValue("2026-11-25");
  await editor.getByRole("button", { name: "Gem planversion", exact: true }).click();
  await expect(editor.getByText("Planversion 2 er gemt.", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(wednesday).toContainText("Syntetisk opgave A");
  await expect(monday).not.toContainText("Syntetisk opgave A");
  await expect(tuesday).toContainText("Syntetisk opgave B");
  await page.reload();
  await expect(page.getByLabel("Dato i ugen", { exact: true })).toHaveValue("2026-11-23");
  await expect(wednesday).toContainText("Syntetisk opgave A");
  await expect(monday).not.toContainText("Syntetisk opgave A");
  await mkdir("tmp/planning-e2e/screens", { recursive: true });
  await week.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "tmp/planning-e2e/screens/desktop.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await wednesday.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "tmp/planning-e2e/screens/mobile.png", fullPage: false });
  expect(errors).toEqual([]);
});

test("field account is denied the planner by the real server", async ({ page }) => {
  const data = await fixture();
  await login(page, data.field, data.organization);
  await page.getByRole("link", { name: /^Planlæg arbejde/ }).click();
  await expect(
    page.getByText(
      "Arbejdsordrerne kunne ikke hentes. Kontrollér forbindelsen og din projektlederadgang.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Ugeplan på tværs af sager" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Syntetisk opgave A");
});
