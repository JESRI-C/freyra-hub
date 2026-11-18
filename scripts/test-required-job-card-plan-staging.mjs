import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
assert(process.argv.includes("--staging"));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const env = loadEnv("staging", process.cwd(), "");
assert.equal(env.SUPABASE_URL, "https://xdvqdzdpyceojbdknofi.supabase.co");
const fixture = JSON.parse(
  await fs.readFile("tmp/submission-required-hosted/fixture.private.json", "utf8"),
);
const source = JSON.parse(await fs.readFile("tmp/samling-hosted/fixture.private.json", "utf8"));
const login = JSON.parse(
  await fs.readFile("tmp/private-release/jesper-test-short-login.private.json", "utf8"),
);
assert.equal(login.url, env.SUPABASE_URL);
assert.equal(
  (await (await fetch(base + "/freyra-build.json")).json()).sourceRevision,
  process.env.FREYRA_TEST_REVISION,
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const authenticated = await db.auth.signInWithPassword({
  email: login.email,
  password: login.password,
});
assert.equal(authenticated.error, null);
const templates = await db
  .from("field_job_template_versions")
  .select("id,version,definition")
  .eq("template_id", fixture.requiredTemplateId)
  .eq("project_id", source.projectId)
  .order("version");
assert.equal(templates.error, null);
assert.equal(templates.data.length, 2);
const plans = () =>
  db
    .from("work_order_plan_versions")
    .select("id,version,plan")
    .eq("action_id", fixture.actionId)
    .eq("project_id", source.projectId)
    .order("version");
const before = await plans();
assert.equal(before.error, null);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const context = await browser.newContext({
    storageState: "tmp/samling-hosted/operator-storage.private.json",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(error.name));
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const url =
      base +
      "/app/projects/" +
      source.projectId +
      "?tab=handlinger&task=" +
      fixture.actionId +
      "&work=plan";
    await page.goto(url);
    await Promise.race([
      page.getByRole("region", { name: "Arbejdsopgavens plan", exact: true }).waitFor(),
      page.getByPlaceholder("dig@firma.dk").waitFor(),
    ]);
    if (await page.getByPlaceholder("dig@firma.dk").isVisible()) {
      await page.getByPlaceholder("dig@firma.dk").fill(login.email);
      await page.getByPlaceholder("••••••••", { exact: true }).fill(login.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((u) => u.pathname !== "/login");
      await page.goto(url);
    }
    const panel = page.getByRole("region", { name: "Arbejdsopgavens plan", exact: true });
    await panel.getByRole("button", { name: "Rediger plan som ny version", exact: true }).click();
    const requirements = panel.getByRole("group", { name: "Dokumentationskrav", exact: true });
    await requirements
      .getByRole("button", {
        name: "Fjern krav: " + templates.data[0].definition.title + " · version 1",
        exact: true,
      })
      .click();
    await requirements.locator("select").selectOption(templates.data[1].id);
    await requirements
      .getByText(templates.data[1].definition.title + " · version 2", { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await requirements.screenshot({
      path: "tmp/submission-required-hosted/plan-draft-" + width + ".png",
    });
    await panel.getByRole("button", { name: "Fortryd ændringer", exact: true }).click();
    await panel
      .getByText(templates.data[0].definition.title + " · version 1", { exact: true })
      .first()
      .waitFor();
    await page.screenshot({
      path: "tmp/submission-required-hosted/plan-" + width + ".png",
      fullPage: false,
    });
  }
  assert.deepEqual((await plans()).data, before.data);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      widths: [390, 1280],
      draftVersionSelection: true,
      cancelPreservesSavedPlan: true,
      pageErrors: 0,
    }),
  );
} finally {
  await browser.close();
  await db.auth.signOut({ scope: "local" });
}
