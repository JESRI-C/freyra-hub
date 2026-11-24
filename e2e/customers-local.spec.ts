import { expect, test } from "@playwright/test";
import { fixture, login } from "./disposable-local-fixture";

test("administrator creates customer/contact and planner creates a case with three persistent jobs", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const data = await fixture();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, data.registryAdmin, data.organization);
  await page.goto("/app/work-orders?view=customers");
  await page.getByRole("button", { name: "Opret kunde", exact: true }).click();
  await page.getByLabel("Kundenavn", { exact: true }).fill("Fiktiv Dalgas pilotkunde");
  await page.getByLabel("CVR / registreringsnummer", { exact: true }).fill("DEMO-IKKE-CVR");
  await page.getByLabel("Adresse", { exact: true }).fill("Fiktiv faktureringsadresse");
  await page.getByRole("button", { name: "Gem kunde", exact: true }).click();
  await expect(page.getByRole("region", { name: "Kundeoplysninger", exact: true })).toContainText(
    "Fiktiv Dalgas pilotkunde",
  );
  await page.getByRole("button", { name: "Tilføj kontaktperson", exact: true }).click();
  await page.getByLabel("Kontaktens navn", { exact: true }).fill("Fiktiv Dalgas kontakt");
  await page.getByLabel("Telefon", { exact: true }).fill("DEMO-TELEFON");
  await page.getByLabel("E-mail", { exact: true }).fill("demo-contact@example.test");
  await page.getByRole("button", { name: "Gem kontaktperson", exact: true }).click();
  await expect(page.getByRole("region", { name: "Kontaktpersoner", exact: true })).toContainText(
    "DEMO-TELEFON",
  );
  await page.getByRole("button", { name: "Administrér planlæggere", exact: true }).click();
  await page.getByLabel("Kollega", { exact: true }).selectOption({ label: "Syntetisk planlægger" });
  await page.getByRole("button", { name: "Gem adgang", exact: true }).click();
  await expect(page.getByRole("region", { name: "Planlægningsadgang", exact: true })).toContainText(
    "Syntetisk planlægger",
  );

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4179",
    viewport: { width: 390, height: 844 },
    locale: "da-DK",
  });
  try {
    const planner = await context.newPage();
    planner.on("pageerror", (error) => errors.push(error.message));
    await login(planner, data.manager, data.organization);
    await planner.goto("/app/work-orders?view=customers");
    await expect(planner.getByRole("button", { name: "Opret kunde", exact: true })).toHaveCount(0);
    await planner.getByRole("button", { name: /Fiktiv Dalgas pilotkunde/ }).click();
    await planner.getByRole("button", { name: "Opret sag under kunden", exact: true }).click();
    await planner.getByLabel("Sagens navn", { exact: true }).fill("Fiktiv Dalgas plejesag");
    await planner.getByLabel("Sted", { exact: true }).fill("Fiktivt grønt område");
    await planner.getByLabel("Kundens reference", { exact: true }).fill("DALGAS-DEMO-REF");
    await planner
      .getByLabel("Kontaktperson på sagen", { exact: true })
      .selectOption({ label: "Fiktiv Dalgas kontakt" });
    await planner.getByRole("button", { name: "Opret sag", exact: true }).click();
    await planner.getByRole("link", { name: "Åbn den nye sag", exact: true }).click();
    await expect(
      planner.getByRole("region", { name: "Kunde og sagsreference", exact: true }),
    ).toContainText("DALGAS-DEMO-REF");
    const caseUrl = planner.url();
    const titles = [
      "Fiktiv beskæring ved adgang",
      "Fiktiv pleje langs stien",
      "Fiktiv afsluttende oprydning",
    ];
    for (const title of titles) {
      await planner.getByRole("button", { name: "Opret arbejdsopgave", exact: true }).click();
      await planner.getByLabel("Hvad skal der udføres?", { exact: true }).fill(title);
      await planner.getByRole("button", { name: "Opret opgave", exact: true }).click();
      await expect(
        planner.getByRole("heading", { name: title, exact: true }).first(),
      ).toBeVisible();
      await planner.goto(caseUrl);
    }
    await planner.reload();
    for (const title of titles)
      await expect(planner.getByText(title, { exact: true }).first()).toBeVisible();
    const scope = planner.getByRole("region", { name: "Kunde og sagsreference", exact: true });
    await expect(scope).toContainText("Fiktiv Dalgas kontakt");
    await expect(scope).toContainText("DEMO-TELEFON");
    await expect(scope).not.toContainText("Fiktiv faktureringsadresse");
    await expect(scope).not.toContainText("DEMO-IKKE-CVR");
    expect(
      await planner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.getByRole("button", { name: "Redigér kunde", exact: true }).click();
    await page.getByLabel("Kundenavn", { exact: true }).fill("Fiktiv rettet og arkiveret kunde");
    await page.getByLabel("Arkivér kunde · tidligere sager bevares", { exact: true }).check();
    await page.getByRole("button", { name: "Gem kunde", exact: true }).click();
    await expect(page.getByRole("region", { name: "Kundeoplysninger", exact: true })).toContainText(
      "Arkiveret kunde",
    );
    await planner.reload();
    await expect(scope).toContainText("Fiktiv Dalgas pilotkunde");
    await expect(scope).not.toContainText("Fiktiv rettet og arkiveret kunde");
    for (const title of titles)
      await expect(planner.getByText(title, { exact: true }).first()).toBeVisible();
    await planner.goto("/app/work-orders?view=customers");
    await planner.getByLabel("Vis arkiverede", { exact: true }).check();
    await planner.getByRole("button", { name: /Fiktiv rettet og arkiveret kunde/ }).click();
    await planner
      .getByRole("region", { name: "Kundens sager", exact: true })
      .getByRole("link", { name: "Åbn jobs", exact: true })
      .click();
    await expect(scope).toContainText("DALGAS-DEMO-REF");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
