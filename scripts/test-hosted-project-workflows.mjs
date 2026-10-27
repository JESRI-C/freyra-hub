/** Hosted staging-only acceptance; use labelled technical cases from test-project-workspace-staging.mjs.
 * node scripts/test-hosted-project-workflows.mjs <qa-session.json> <staging-env> <absolute-playwright-module> [baseURL]
 * Never prints credentials, invokes AI providers, or approves a professional result. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
const [
  qaPath,
  envPath,
  playwrightPath,
  base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev",
] = process.argv.slice(2);
if (!qaPath || !envPath || !playwrightPath)
  throw new Error("Supply local QA/config/runtime paths.");
assert.equal(new URL(base).hostname, "gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const result = JSON.parse(await fs.readFile("tmp/workspace-acceptance/result.json", "utf8"));
const qa = JSON.parse(await fs.readFile(qaPath, "utf8"));
const env = Object.fromEntries(
  (await fs.readFile(envPath, "utf8"))
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      let i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, "xdvqdzdpyceojbdknofi.supabase.co");
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const login = await client.auth.signInWithPassword({ email: qa.email, password: qa.password });
assert.equal(login.error, null);
const project = result.projects[0];
assert.ok(project.name.startsWith("TEKNISK FANETEST"));
const report = { base, projectId: project.id, steps: [], templates: [], exports: [], errors: [] };
const save = () =>
  fs.writeFile("tmp/workspace-acceptance/hosted-functional.json", JSON.stringify(report, null, 2));
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.addInitScript(
    ({ org, id, session }) => {
      localStorage.setItem(
        "freyra-auth-selection-v1",
        JSON.stringify({ orgId: org, projectId: id }),
      );
      localStorage.setItem("sb-xdvqdzdpyceojbdknofi-auth-token", JSON.stringify(session));
    },
    { org: qa.organizationId, id: project.id, session: login.data.session },
  );
  await page.goto(base + "/app/projects/" + project.id);
  const steps = page.getByRole("navigation", { name: "Sagens seks trin" });
  await steps.waitFor();
  for (const label of [
    "Billeder",
    "Datagrundlag",
    "Verificering",
    "Baseline",
    "Beplantning",
    "Rapport",
  ]) {
    await steps.getByRole("button", { name: new RegExp(label) }).click();
    await page.waitForTimeout(750);
    assert.ok(
      !(await page.locator("body").innerText()).match(
        /An unexpected error|Noget gik galt|Internal Server Error/,
      ),
    );
    report.steps.push({ label, pass: true });
    await save();
    console.log("PASS guided step " + label);
  }
  for (const [id, title] of [
    ["watercourse", "Vegetation og grundlag for træplantning"],
    ["construction_baseline", "Naturbaseline for byggeprojekt"],
    ["nature_baseline", "Naturbaseline"],
    ["annual_followup", "Årsstatus og pleje"],
  ]) {
    await page.goto(base + "/app/reports/new?template=" + id + "&project=" + project.id);
    await page.getByLabel("Titel", { exact: true }).waitFor();
    assert.ok((await page.getByLabel("Titel", { exact: true }).inputValue()).includes(title));
    report.templates.push({ id, pass: true });
    console.log("PASS report template " + id);
    await save();
  }
  const title = "TEKNISK EKSPORTRAPPORT " + result.run + " " + Date.now();
  await page.getByLabel("Titel", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Gem kladde som ny version", exact: true }).click();
  await page.waitForURL("**/app/reports/builder?**");
  let search = new URL(page.url()).searchParams;
  const reportId = search.get("report");
  assert.ok(reportId);
  report.reportId = reportId;
  await page.reload();
  await page.getByLabel("Titel", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Titel", { exact: true }).inputValue(), title);
  report.savedReloaded = true;
  await save();
  await page.goto(base + "/app/reports/approval?report=" + reportId + "&project=" + project.id);
  await page
    .getByRole("heading", { name: "Rapporten er ikke klar til kundegodkendelse", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Godkend som ny version", exact: true }).isDisabled(),
    true,
  );
  report.unreviewedApprovalBlocked = true;
  await page.goto(base + "/app/reports/preview?report=" + reportId + "&project=" + project.id);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.getByText("KLADDE - ikke godkendt", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Vis kort og fotoatlas før PDF/DOCX-eksport", exact: true })
    .click();
  await page.getByRole("button", { name: "PDF", exact: true }).waitFor({ state: "visible" });
  for (const format of ["PDF", "DOCX", "CSV", "GEOJSON"]) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    await download.saveAs("tmp/workspace-acceptance/" + filename);
    const bytes = await fs.readFile("tmp/workspace-acceptance/" + filename);
    assert.ok(bytes.length > 20);
    if (format === "PDF") assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    if (format === "DOCX") assert.equal(bytes.subarray(0, 2).toString(), "PK");
    if (format === "GEOJSON") assert.equal(JSON.parse(bytes.toString()).type, "FeatureCollection");
    report.exports.push({ format, bytes: bytes.length, pass: true });
    await save();
    console.log("PASS hosted export " + format);
  }
  assert.equal(report.errors.length, 0);
  report.pass = true;
  await save();
} catch (error) {
  report.failure = error.message;
  await save();
  throw error;
} finally {
  await browser.close();
}
