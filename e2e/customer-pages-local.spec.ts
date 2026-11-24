import { expect, test } from "@playwright/test";
import { fixture, login } from "./disposable-local-fixture";

test("paged contacts, colleagues and historical addresses remain usable in the real mobile workspace", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const data = await fixture();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, data.registryAdmin, data.organization);
  await page.goto("/app/work-orders?view=customers");
  await page.getByRole("button", { name: new RegExp(data.collections.customerName) }).click();
  await expect(page.getByRole("region", { name: "Kundeoplysninger", exact: true })).toContainText(
    "Version 25",
  );

  const contacts = page.getByRole("region", { name: "Kontaktpersoner", exact: true });
  await expect(contacts.getByText(data.collections.lastContactName, { exact: true })).toHaveCount(
    0,
  );
  await contacts.getByRole("button", { name: "Næste kontaktpersoner", exact: true }).click();
  const last = contacts
    .getByRole("listitem")
    .filter({ has: page.getByText(data.collections.lastContactName, { exact: true }) });
  await last.getByRole("button", { name: "Redigér kontakt", exact: true }).click();
  await page.getByLabel("Telefon", { exact: true }).fill("DEMO-OPDATERET");
  await page.getByRole("button", { name: "Gem kontaktperson", exact: true }).click();
  await expect(contacts).toContainText("DEMO-OPDATERET");
  await expect(contacts.getByText("DEMO · Kontakt 001", { exact: true })).toHaveCount(0);

  const history = page.getByRole("region", { name: "Kundehistorik", exact: true });
  await history.getByRole("button", { name: "Ældre versioner", exact: true }).click();
  await expect(
    history.getByText(`Version 1 · ${data.collections.customerName}`, { exact: true }),
  ).toBeVisible();
  await expect(history).toContainText("Historisk adresse 1");
  await expect(page.getByRole("region", { name: "Kundeoplysninger", exact: true })).toContainText(
    "Historisk adresse 25",
  );

  await page.getByRole("button", { name: "Administrér planlæggere", exact: true }).click();
  await page.getByRole("button", { name: "Næste kolleger", exact: true }).click();
  await page
    .getByLabel("Kollega", { exact: true })
    .selectOption({ label: data.collections.lastMemberName });
  await page.getByLabel("Søg kollega", { exact: true }).fill("Syntetisk planlægger");
  await expect(page.getByLabel("Kollega", { exact: true })).toHaveValue(
    data.collections.lastMemberId,
  );
  await page.getByRole("button", { name: "Gem adgang", exact: true }).click();
  await expect(page.getByRole("region", { name: "Planlægningsadgang", exact: true })).toContainText(
    data.collections.lastMemberName,
  );

  await page.getByRole("button", { name: "Opret sag under kunden", exact: true }).click();
  await page
    .getByLabel("Sagens navn", { exact: true })
    .fill("DEMO · Sag med kontakt fra sidste side");
  await page.getByRole("button", { name: "Næste kontakter", exact: true }).click();
  await page
    .getByLabel("Kontaktperson på sagen", { exact: true })
    .selectOption({ label: data.collections.lastContactName });
  await page.getByLabel("Søg kontaktperson", { exact: true }).fill("DEMO · Kontakt 001");
  await expect(page.getByLabel("Kontaktperson på sagen", { exact: true })).toHaveValue(
    data.collections.lastContactId,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Opret sag", exact: true }).click();
  await page.getByRole("link", { name: "Åbn den nye sag", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Kunde og sagsreference", exact: true }),
  ).toContainText("DEMO-OPDATERET");
  expect(errors).toEqual([]);
});
