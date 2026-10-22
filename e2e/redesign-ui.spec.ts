import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} mangler til redesignets læsende browserprøve.`);
  return value;
};

async function capture(page: Page, name: string) {
  if (process.env.FREYRA_CAPTURE_SCREENS !== "1") return;
  const steps = page.getByRole("navigation", { name: "Sagens seks trin" });
  if (await steps.count()) {
    await expect(steps).not.toContainText("Henter status");
    await expect(
      page.getByRole("region", { name: "Aktivitetsbakke" }).first().getByRole("status"),
    ).toContainText("Ingen registrerede hentninger eller gemninger i gang.");
  }
  await mkdir("docs/screens", { recursive: true });
  await page.screenshot({
    path: path.resolve("docs/screens", name + ".png"),
    fullPage: false,
    animations: "disabled",
    // Private original pixels, exact map geometry and account context never enter Git.
    mask: [
      page.locator(".leaflet-container, [role=img], pre, code"),
      page.locator('img:not([alt="Freyra"])'),
      page.locator('input[type="email"], input[type="password"]'),
      page.locator('a[href="/select"]'),
    ],
    maskColor: "#e6e9e3",
  });
}

test("redesign: fem startvalg, seks trin, nulstilling og læseadgang på desktop og mobil", async ({
  page,
  baseURL,
}) => {
  const email = required("HADERSLEV_READER_EMAIL");
  const password = required("HADERSLEV_READER_PASSWORD");
  const orgId = required("HADERSLEV_E2E_ORG_ID");
  const projectId = required("HADERSLEV_UI_PROJECT_ID");
  const roundId = required("HADERSLEV_UI_ROUND_ID");
  const oldRoundId = required("HADERSLEV_UI_OLDER_ROUND_ID");
  const caseName = required("HADERSLEV_UI_PROJECT_NAME");
  expect([
    "localhost",
    "127.0.0.1",
    "gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev",
  ]).toContain(new URL(baseURL!).hostname);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(
    ({ orgId, projectId }) =>
      localStorage.setItem("freyra-auth-selection-v1", JSON.stringify({ orgId, projectId })),
    { orgId, projectId },
  );
  await page.goto("/login?next=%2Fapp%2Fprojects");
  await expect(page.locator('input[type="email"]')).toBeEnabled();
  await expect(
    page
      .getByText("Sporbar dokumentation af naturprojekter – fra dronefoto til godkendt baseline.", {
        exact: true,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await capture(page, "01-login-desktop");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hvad vil du gøre?" })).toBeVisible();
  // Login resets the previous tenant. The fixture also owns a separate personal organisation.
  await page.goto("/select");
  const readerOrganisation = page.getByRole("button").filter({ hasText: /projekter · viewer/ });
  await expect(readerOrganisation).toHaveCount(1);
  await readerOrganisation.click();
  await page.getByRole("button", { name: /^Åbn / }).click();
  await expect(page.getByRole("heading", { name: "Hvad vil du gøre?" })).toBeVisible();
  await expect(page.locator("button.start-action")).toHaveCount(5);
  // A read-only user retains every navigation choice but cannot create or upload.
  await expect(
    page.locator("button.start-action").filter({ hasText: "Start en ny sag" }),
  ).toBeDisabled();
  const menu = page.getByRole("navigation", { name: "Hovedmenu" });
  await expect(menu.getByRole("link")).toHaveCount(2);
  await expect(menu.getByRole("link", { name: "Sager", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Kilder", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('500 24px "Source Serif 4"'))).toBe(true);
  await capture(page, "02-startside-desktop");
  await page.locator("button.start-action").filter({ hasText: "Upload dronefotos" }).click();
  await expect(page).toHaveURL(/\/app\/projects\/?$/);
  await expect(page.getByText("Vælg den sag, du vil arbejde med.", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Søg efter sagsnavn, placering eller type…").fill(caseName);
  const caseLink = page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: caseName, exact: true }) });
  await expect(caseLink).toHaveCount(1);
  await expect(caseLink).toHaveAttribute("href", /step=billeder/);
  await caseLink.click();
  await expect(
    page.getByRole("button", { name: "Tilføj dronebilleder", exact: true }),
  ).toBeDisabled();
  await capture(page, "03-billeder-desktop");

  // Regression: opening an existing case without a round must offer a direct way to resume.
  await page.goto(`/app/projects/${projectId}?step=gennemgang`);
  await expect(page.getByLabel("Åbn gemt undersøgelse", { exact: true })).toBeVisible();
  await page.getByLabel("Åbn gemt undersøgelse", { exact: true }).selectOption(roundId);
  await expect(page).toHaveURL(new RegExp(`round=${roundId}`));
  await expect(
    page.getByRole("region", { name: "Verifikation pr. fotopunkt" }).locator(":scope > details"),
  ).toHaveCount(6);

  const openCase = async (step: string, selected = roundId) => {
    await page.goto(`/app/projects/${projectId}?step=${step}&round=${selected}`);
    await expect(page.getByRole("navigation", { name: "Sagens seks trin" })).toBeVisible();
    await expect(page.getByText("Kommunal læseadgang", { exact: true })).toBeVisible();
  };
  await openCase("gennemgang");
  const nav = page.getByRole("navigation", { name: "Sagens seks trin" });
  await expect(nav.getByRole("button")).toHaveCount(6);
  await expect(
    page.getByRole("region", { name: "Verifikation pr. fotopunkt" }).locator(":scope > details"),
  ).toHaveCount(6);
  await capture(page, "05-verificering-desktop");
  // All six steps remain open; navigation preserves the selected immutable round.
  for (const [name, screen] of [
    ["Datagrundlag", "04-datagrundlag-desktop"],
    ["Baseline", "06-baseline-desktop"],
    ["Beplantning", "07-beplantning-desktop"],
    ["Rapport", "08-rapport-desktop"],
  ]) {
    await nav.getByRole("button", { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(new RegExp(`round=${roundId}`));
    if (name === "Baseline")
      await expect(
        page.getByText(/Du ser den valgte undersøgelses fastlåste datagrundlag/),
      ).toBeVisible();
    if (name === "Rapport")
      await expect(
        page.getByRole("button", { name: "Hent samlet PDF", exact: true }),
      ).toBeEnabled();
    if (name === "Beplantning") {
      await expect(page.getByRole("img", { name: /Beplantningsskitse 10 meter/ })).toBeVisible();
      const settings = page
        .locator("details.advanced-settings")
        .filter({ hasText: "Afstand fra vandløbslinje vælger" });
      await expect(settings).not.toHaveAttribute("open");
      await capture(page, screen);
      await settings.locator(":scope > summary").click();
      const distance = page.getByLabel(/^Afstand fra vandløbslinje/);
      await expect(distance).toHaveValue("10");
      await distance.selectOption("20");
      await expect(page.getByRole("img", { name: /Beplantningsskitse 20 meter/ })).toBeVisible();
      await page.getByLabel("Vis beplantningslag", { exact: true }).uncheck();
      await settings.getByRole("button", { name: "Nulstil til standard", exact: true }).click();
      await expect(distance).toHaveValue("10");
      await expect(page.getByLabel("Vis beplantningslag", { exact: true })).toBeChecked();
      await expect(page).toHaveURL(new RegExp(`round=${roundId}`));
      await capture(page, "09-avancerede-indstillinger");
    } else await capture(page, screen);
  }
  await openCase("baseline", oldRoundId);
  await expect(
    page.getByText(/Du ser den valgte undersøgelses fastlåste datagrundlag/),
  ).toBeVisible();
  // The visible version selector is pinned, so it cannot silently change the investigation's sources.
  await expect(page.getByLabel(/^Gemt version/)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Hent og gem ny version", exact: true }),
  ).toHaveCount(0);
  await menu.getByRole("link", { name: "Kilder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hvad bygger dokumentationen på?" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Søg i kilder" }).fill("___ingen_kilde___");
  await expect(
    page.getByRole("heading", { name: "Ingen kilder matcher din søgning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vis alle kilder", exact: true }).click();
  await capture(page, "10-kilder-desktop");

  // An obsolete bookmark must offer recovery, never wait forever or show another baseline.
  await openCase("baseline", "00000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("alert")).toContainText(
    "Den valgte undersøgelses datagrundlag kunne ikke åbnes.",
  );
  await expect(page.getByLabel(/^Gemt version/)).toHaveCount(0);
  await capture(page, "13-ugyldigt-undersoegelseslink");
  await page.getByRole("button", { name: "Vælg en anden undersøgelse", exact: true }).click();
  await page.getByLabel("Åbn gemt undersøgelse", { exact: true }).selectOption(roundId);
  await expect(page).toHaveURL(new RegExp(`round=${roundId}`));

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/projects");
  await expect(page.getByRole("heading", { name: "Hvad vil du gøre?" })).toBeVisible();
  await capture(page, "11-startside-mobil");
  await page.getByRole("button", { name: "Åbn menu", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("navigation", { name: "Hovedmenu" }).getByRole("link"),
  ).toHaveCount(2);
  await page.keyboard.press("Escape");
  await openCase("baseline");
  for (const name of [
    "Billeder",
    "Datagrundlag",
    "Verificering",
    "Baseline",
    "Beplantning",
    "Rapport",
  ]) {
    const button = nav.getByRole("button", { name: new RegExp(name) });
    await expect(button).toBeVisible();
    const bounds = await button.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(376);
    await button.click();
    await expect(page).toHaveURL(new RegExp(`round=${roundId}`));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
  await nav.getByRole("button", { name: /Baseline/ }).click();
  await capture(page, "12-sagsforloeb-mobil");
  await page.getByRole("button", { name: "Åbn aktivitetsbakke", exact: true }).click();
  await expect(page.getByRole("region", { name: "Aktivitetsbakke" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Luk aktivitetsbakke", exact: true }).click();
  expect(errors).toEqual([]);
});

// Separate integrity gate: local preview needs the same server bindings as staging.
// A navigation PASS never substitutes for this exact saved-file comparison.
test("redesign: gemt rapport genhentes med generalprøvens kontrolsum", async ({ page }) => {
  const projectId = required("HADERSLEV_UI_PROJECT_ID");
  const roundId = required("HADERSLEV_UI_ROUND_ID");
  const target = "/app/projects/" + projectId + "?step=rapport&round=" + roundId;
  await page.goto("/login?next=" + encodeURIComponent(target));
  await expect(page.locator('input[type="email"]')).toBeEnabled();
  await page.locator('input[type="email"]').fill(required("HADERSLEV_READER_EMAIL"));
  await page.locator('input[type="password"]').fill(required("HADERSLEV_READER_PASSWORD"));
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  const reportButton = page.getByRole("button", { name: "Hent samlet PDF", exact: true });
  await expect(reportButton).toBeEnabled();
  const downloading = page.waitForEvent("download");
  await reportButton.click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    required("HADERSLEV_UI_REPORT_SHA256"),
  );
});
