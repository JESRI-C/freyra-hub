/** Fresh password login for an isolated test reader; never injects an auth session. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const [receiptPath] = process.argv.slice(2);
if (!receiptPath) throw new Error("Private test-reader receipt required");
const reader = JSON.parse(await fs.readFile(receiptPath, "utf8"));
assert.ok(reader.email.endsWith("@freyra.invalid"));
assert.equal(reader.role, "viewer");
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const result = {
  schema: "freyra.reader-browser/v1",
  base,
  cleanContext: true,
  passwordLogin: false,
  projectId: reader.projectId,
  routes: [],
  errors: [],
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => result.errors.push(error.message));
  assert.equal(await page.evaluate(() => Object.keys(localStorage).length).catch(() => 0), 0);
  await page.goto(base + "/login");
  await page.locator('input[type="email"]').fill(reader.email);
  await page.locator('input[type="password"]').fill(reader.password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  result.passwordLogin = true;
  await page.goto(base + "/app/projects/" + reader.projectId);
  await page.getByRole("navigation", { name: "Sagens seks trin" }).waitFor();
  await page.screenshot({ path: "docs/screens/release-1.0/08-laeser-ren-login.png" });
  for (const route of ["/app/reports", "/app/reports/new", "/app/reports/templates"]) {
    await page.goto(base + route);
    await page
      .getByText(/Din adgang er læseadgang/)
      .first()
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Gem kladde som ny version", exact: true }).count(),
      0,
    );
    assert.equal(await page.locator('a[href*="/app/reports/new?template="]').count(), 0);
    assert.equal(await page.locator("main").last().locator("textarea").count(), 0);
    result.routes.push({ route, readOnly: true });
  }
  await page.screenshot({ path: "docs/screens/release-1.0/09-laeser-rapportadgang.png" });
  assert.deepEqual(result.errors, []);
  result.passed = true;
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(
    "docs/release-1.0/reader-browser.json",
    JSON.stringify(result, null, 2) + "\n",
  );
}
console.log("PASS fresh reader login and read-only report routes");
