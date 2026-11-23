import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
assert(process.argv.includes("--staging"));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const revision = process.env.FREYRA_TEST_REVISION ?? "92c638baa0cdabd8d09b12569b86afd35268a327";
const dir = "tmp/program-map-hosted";
await fs.mkdir(dir, { recursive: true });
const credentials = JSON.parse(
  await fs.readFile("tmp/private-release/jesper-test-short-login.private.json", "utf8"),
);
assert.equal(credentials.url, "https://xdvqdzdpyceojbdknofi.supabase.co");
const fixture = JSON.parse(await fs.readFile("tmp/submission-hosted/fixture.private.json", "utf8"));
assert.equal(fixture.projectId, "342591a9-5e90-4e34-8777-934a8d2a68dd");
assert.equal(fixture.actionId, "f5ef08af-ecc9-40ac-a7c1-bfbe632280a8");
const inventory = JSON.parse(
  await fs.readFile("docs/program-map/inventory-2026-11-02.json", "utf8"),
);
const meta = await fetch(base + "/freyra-build.json").then((r) => r.json());
assert.equal(meta.sourceRevision, revision);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  storageState: "tmp/samling-hosted/operator-storage.private.json",
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.replace(/https:\/\/\S+/g, "[URL]")));
await page.route("**/*", (route) =>
  [base, "https://xdvqdzdpyceojbdknofi.supabase.co"].includes(new URL(route.request().url()).origin)
    ? route.continue()
    : route.abort(),
);
const result = {
  schema: "freyra.program-map-hosted/v1",
  sourceRevision: revision,
  syntheticReadOnlyFixture: true,
};
async function overflow() {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
try {
  await page.goto(
    `${base}/app/projects/${fixture.projectId}?tab=handlinger&task=${fixture.actionId}&work=submission`,
  );
  if (new URL(page.url()).pathname === "/login") {
    await page.getByPlaceholder("dig@firma.dk").fill(credentials.email);
    await page.getByPlaceholder("••••••••", { exact: true }).fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname != "/login");
    await page.goto(
      `${base}/app/projects/${fixture.projectId}?tab=handlinger&task=${fixture.actionId}&work=submission`,
    );
  }
  await page
    .getByRole("region", { name: "Opgavens afleveringsgrundlag", exact: true })
    .getByRole("heading", { name: "Afleveringsversion 3", exact: true })
    .waitFor();
  assert.equal(await page.getByLabel("Valgt arbejdsopgave").inputValue(), fixture.actionId);
  result.submissionDeepLink = true;
  const taskGuide = inventory.features.find((x) => x.id === "work:submission");
  await page
    .getByRole("region", { name: "Formål og resultat", exact: true })
    .filter({ hasText: taskGuide.question })
    .getByText(taskGuide.output, { exact: false })
    .waitFor();
  result.sharedTaskGuide = true;
  await page.getByRole("link", { name: "Programoverblik", exact: true }).click();
  await page.getByRole("heading", { name: "Programoverblik", exact: true }).waitFor();
  await page.getByText("Telefonprøve – samlet forløb", { exact: false }).first().waitFor();
  const catalog = page.locator("main");
  await catalog.getByLabel("Søg i programmet", { exact: true }).fill("materialer");
  const materials = catalog
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Materialer og forbrug", exact: true }) });
  await materials.waitFor();
  assert.equal(await materials.getByRole("link").count(), 0);
  result.plannedHasNoAction = true;
  await catalog.getByLabel("Arbejdsområde", { exact: true }).selectOption("overview");
  await catalog.getByText("Ingen funktioner matcher søgningen.", { exact: true }).waitFor();
  await catalog.getByRole("button", { name: "Vis alle funktioner igen", exact: true }).click();
  result.emptyFilterRecovery = true;
  await catalog.getByLabel("Vis funktioner", { exact: true }).selectOption("planned");
  assert.equal(await catalog.getByRole("article").getByRole("link").count(), 0);
  await catalog.getByLabel("Vis funktioner", { exact: true }).selectOption("all");
  result.accessibleFilters = true;
  await catalog.getByLabel("Søg i programmet", { exact: true }).fill("Geotag");
  await catalog.getByRole("link", { name: "Åbn Feltregistrering", exact: true }).waitFor();
  await page.screenshot({ path: dir + "/program-desktop.png", fullPage: false });
  result.skyhostSearchFindsExistingTools = true;
  await catalog.getByLabel("Søg i programmet", { exact: true }).fill("Aflevering");
  const submissionLink = catalog.getByRole("link", { name: "Åbn Aflevering", exact: true });
  await submissionLink.waitFor();
  const link = new URL(await submissionLink.getAttribute("href"), base);
  assert.equal(link.pathname, "/app/projects/" + fixture.projectId);
  assert.equal(link.searchParams.get("work"), "submission");
  result.selectedProjectLinks = true;
  await catalog.getByLabel("Søg i programmet", { exact: true }).fill("");
  await catalog.getByRole("button", { name: "Skyhosts ti jobområder", exact: true }).click();
  const skyhost = catalog.getByRole("region", {
    name: "Skyhost-jobkortets funktioner",
    exact: true,
  });
  await skyhost.getByRole("heading", { name: "Tjeklister", exact: true }).waitFor();
  assert.equal(await skyhost.getByRole("listitem").count(), 10);
  for (const title of ["Timer", "Materialer", "Booking", "Ruter"]) {
    const li = skyhost
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    assert.equal(await li.getByRole("link").count(), 0);
  }
  result.skyhostTenAreas = true;
  await overflow();
  await page.screenshot({ path: dir + "/skyhost-desktop.png", fullPage: false });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await skyhost.getByRole("heading", { name: "Detaljer", exact: true }).scrollIntoViewIfNeeded();
    await overflow();
    await page.screenshot({ path: `${dir}/skyhost-mobile-${width}.png`, fullPage: false });
  }
  result.mobileWidths = [390, 320];
  await page.setViewportSize({ width: 1280, height: 1000 });
  for (const path of ["/app/settings/modules", "/app/reports/library"]) {
    await page.goto(base + path);
    const guide = inventory.features.find((x) => x.id === path);
    const section = page.getByRole("region", { name: "Formål og resultat", exact: true });
    await section.getByText(guide.question, { exact: true }).waitFor();
    await section.getByText(guide.output, { exact: false }).waitFor();
    await overflow();
  }
  result.sharedGlobalGuide = true;
  await page.goto(
    `${base}/app/projects/${fixture.projectId}?tab=handlinger&task=${fixture.actionId}&work=evidence`,
  );
  await page.getByRole("region", { name: "Opgavens dokumentation", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Valgt arbejdsopgave").inputValue(), fixture.actionId);
  result.evidenceDeepLink = true;
  await page.goto(`${base}/app/projects/${fixture.projectId}?step=baseline`);
  const baseline = inventory.features.find((x) => x.id === "step:baseline");
  await page
    .getByRole("region", { name: "Formål og resultat", exact: true })
    .getByText(baseline.question, { exact: true })
    .waitFor();
  result.sharedProjectGuide = true;
  assert.deepEqual(errors, []);
  result.result = "PASS";
  await fs.writeFile(dir + "/receipt.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  await fs.writeFile(
    dir + "/failure.private.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => ""),
  );
  await page.screenshot({ path: dir + "/failure.private.png", fullPage: false }).catch(() => {});
  console.error(
    JSON.stringify({ result: "FAIL", error: e.message?.replace(/https:\/\/\S+/g, "[URL]") }),
  );
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
