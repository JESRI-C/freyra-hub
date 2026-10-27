/** Real browser acceptance; explicitly labelled technical cases, staging only.
 * node scripts/test-photo-atlas-staging.mjs <qa.json> <staging.env> <reference-atlas.html> [reader-receipt.json]
 * Private inputs/downloads stay in ignored tmp; no credentials are printed. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const [qaPath, envPath, atlasPath, readerPath] = process.argv.slice(2);
assert.ok(qaPath && envPath && atlasPath);
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const qa = JSON.parse(await fs.readFile(qaPath, "utf8"));
const env = Object.fromEntries(
  (await fs.readFile(envPath, "utf8"))
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, "xdvqdzdpyceojbdknofi.supabase.co");
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = await client.auth.signInWithPassword({ email: qa.email, password: qa.password });
assert.equal(auth.error, null);
await fs.mkdir("tmp/photo-atlas-acceptance", { recursive: true });
await fs.mkdir("docs/screens/photo-atlas", { recursive: true });
let saved;
try {
  saved = JSON.parse(await fs.readFile("tmp/photo-atlas-acceptance/project.json", "utf8"));
} catch {}
const project = saved ?? {
  id: randomUUID(),
  organization_id: qa.organizationId,
  slug: "atlas-" + randomUUID().slice(0, 8),
  name: "TEKNISK FOTOATLAS – originalt rapportgrundlag",
  project_type: "Vandløbsmonitorering",
  municipality: "Haderslev",
  description:
    "TEKNISK acceptprøve af fotoatlas. Ingen kundegodkendelse eller dokumenteret indsats.",
};
if (!saved) {
  const insert = await client.from("projects").insert(project);
  assert.equal(insert.error, null);
  await fs.writeFile("tmp/photo-atlas-acceptance/project.json", JSON.stringify(project));
}
const result = {
  base,
  projectId: project.id,
  source: await (await fetch(base + "/freyra-build.json")).json(),
  steps: [],
  errors: [],
  passed: false,
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
let currentPage;
async function contextFor(session, viewport = { width: 1440, height: 1100 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.addInitScript(
    ({ session, org, project }) => {
      localStorage.setItem("sb-xdvqdzdpyceojbdknofi-auth-token", JSON.stringify(session));
      localStorage.setItem(
        "freyra-auth-selection-v1",
        JSON.stringify({ orgId: org, projectId: project }),
      );
    },
    { session, org: qa.organizationId, project: project.id },
  );
  return context;
}
try {
  const context = await contextFor(auth.data.session),
    page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => result.errors.push(e.message));
  await page.goto(base + "/app/projects/" + project.id, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Fotoatlas", exact: true }).click();
  const atlas = page.getByRole("region", { name: "Projektets fotoatlas og baseline" });
  await atlas.getByRole("heading", { name: "Fotoatlas og baseline", exact: true }).waitFor();
  await atlas.getByText("Indlæser fotoatlas…", { exact: true }).waitFor({ state: "hidden" });
  const existing = await atlas.getByLabel("Gemte fotoatlas og baselines").count();
  if (existing) {
    const reference = await client
      .from("evidence_files")
      .select("id")
      .eq("project_id", project.id)
      .eq("evidence_type", "freyra_photo_atlas_v1")
      .order("created_at", { ascending: false })
      .limit(1);
    assert.equal(reference.error, null);
    if (reference.data[0])
      await atlas.getByLabel("Gemte fotoatlas og baselines").selectOption(reference.data[0].id);
  }
  if (!existing) {
    await atlas
      .getByText("Indlæs eksisterende fotoatlas eller baselinedata", { exact: true })
      .click();
    await atlas
      .getByLabel("Importér fotoatlas eller baseline")
      .setInputFiles(path.resolve(atlasPath));
    await atlas.getByText(/274 fotos ·/).waitFor();
    await page.screenshot({
      path: "docs/screens/photo-atlas/01-importkontrol.png",
      fullPage: true,
    });
    await atlas.getByRole("button", { name: "Gem fotoatlasset på projektet", exact: true }).click();
  }
  await atlas
    .getByRole("status")
    .filter({ hasText: "274 af 274 fotos" })
    .waitFor({ timeout: 240000 });
  result.steps.push("274 reference photos persisted and loaded through private storage");
  const importedSourceId = await atlas.getByLabel("Gemte fotoatlas og baselines").inputValue();
  console.log("PASS private source load");
  assert.equal(await atlas.getByLabel("Optagedato").locator("option").count(), 4);
  assert.equal(await atlas.getByLabel("Vandløb").locator("option").count(), 5);
  await atlas.getByLabel("Vandløb").selectOption("Uafklaret");
  assert.ok(!(await atlas.innerText()).includes("274 af 274 fotos"));
  await atlas.getByLabel("Vandløb").selectOption("");
  console.log("PASS dates and unresolved watercourse filter");
  await atlas.getByLabel("Søg i fotoatlas").fill("DRN-001");
  await atlas.getByRole("status").filter({ hasText: "1 af 274 fotos" }).waitFor();
  await atlas.getByRole("button", { name: /DRN-001 ·/ }).click();
  const dialog = page.getByRole("dialog");
  console.log("Opened photo dialog");
  await dialog.getByRole("heading", { name: /DRN-001 ·/ }).waitFor();
  await dialog.getByLabel("Billedzoom").fill("2");
  assert.ok((await dialog.innerText()).includes("tidszone ukendt"));
  await dialog.getByLabel("Status for artsbestemmelse").selectOption("field_confirmed");
  await dialog.getByLabel("Dokumentation for artskontrol og metode").fill("");
  await dialog.getByRole("button", { name: "Gem fotogennemgang som ny version" }).click();
  await dialog.getByRole("alert").filter({ hasText: "Bekræftet art kræver" }).waitFor();
  await dialog.getByLabel("Status for artsbestemmelse").selectOption("suggestion");
  await dialog
    .getByLabel("Synligt på fotoet")
    .fill("TEKNISK gemmeprøve – den faglige beskrivelse afventer godkendelse.");
  await dialog
    .getByLabel("Synlige adgangsforhold og praktiske udfordringer")
    .fill("TEKNISK notat; adgang skal undersøges på stedet.");
  await dialog
    .getByLabel("Planteforslag, arter og stedbunden placering")
    .fill("TEKNISK forslag; intet antal eller udførelse fastslået.");
  await dialog
    .getByLabel("Pleje, efterplantning og senere opfølgning")
    .fill("TEKNISK kontrol af opfølgning; kræver fagperson.");
  await dialog.getByLabel("Sammenlign med en anden optagelse").selectOption({ index: 2 });
  await dialog
    .getByRole("heading", { name: "To optagelser – indsatsrelation ikke dokumenteret" })
    .waitFor();
  await page.screenshot({ path: "docs/screens/photo-atlas/02-fotogennemgang.png", fullPage: true });
  await dialog.getByRole("button", { name: "Gem fotogennemgang som ny version" }).click();
  await dialog.waitFor({ state: "hidden" });
  console.log("PASS saved review");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Fotoatlas", exact: true }).click();
  await atlas.getByRole("status").filter({ hasText: "274 af 274 fotos" }).waitFor();
  await atlas.getByLabel("Søg i fotoatlas").fill("TEKNISK gemmeprøve");
  await atlas.getByRole("status").filter({ hasText: "1 af 274 fotos" }).waitFor();
  result.steps.push(
    "Search, dates, unresolved watercourses, zoom, invalid field confirmation, reviewed note and reload persistence",
  );
  await atlas.getByLabel("Søg i fotoatlas").fill("");
  await atlas.getByText("Kort over kamerapositioner", { exact: true }).click();
  await page.screenshot({ path: "docs/screens/photo-atlas/03-atlas-kort.png", fullPage: true });
  const htmlDownload = page.waitForEvent("download");
  await atlas.getByRole("button", { name: "Hent søgbart HTML-fotoatlas" }).click();
  const html = await htmlDownload;
  const htmlPath = path.resolve("tmp/photo-atlas-acceptance/export.html");
  await html.saveAs(htmlPath);
  assert.equal(await html.failure(), null);
  const offline = await context.newPage();
  await offline.goto("file:///" + htmlPath.replaceAll("\\", "/"));
  await offline.getByRole("status").filter({ hasText: "274 af 274 fotos" }).waitFor();
  console.log("PASS offline atlas initialization");
  await offline.locator("#search").fill("DRN-001");
  await offline.getByRole("status").filter({ hasText: "1 af 274 fotos" }).waitFor();
  await offline.getByRole("button", { name: /DRN-001 ·/ }).click();
  await offline.getByRole("dialog").waitFor();
  await offline.locator("#zoom").fill("2");
  await offline.screenshot({ path: "docs/screens/photo-atlas/04-eksporteret-atlas.png" });
  await offline.close();
  result.steps.push("Standalone 274-photo HTML export opens, searches and zooms without the app");
  const jsonDownload = page.waitForEvent("download");
  await atlas.getByRole("button", { name: "Hent fotobaseline som JSON" }).click();
  const json = await jsonDownload;
  const jsonPath = path.resolve("tmp/photo-atlas-acceptance/baseline.json");
  await json.saveAs(jsonPath);
  const baseline = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  assert.equal(baseline.image_count, 274);
  assert.equal(baseline.observations[0].review.observation.startsWith("TEKNISK"), true);
  await atlas.getByRole("button", { name: "Gem rapportkladde fra fotoatlasset" }).click();
  await atlas
    .getByRole("status")
    .filter({ hasText: /Rapportkladde version/ })
    .waitFor();
  const reportLink = atlas.getByRole("link", { name: "Åbn gemt rapport", exact: true });
  const reportUrl = await reportLink.getAttribute("href");
  const pdfDownload = page.waitForEvent("download", { timeout: 240000 });
  await atlas.getByRole("button", { name: "Eksporter rapport og fotoatlas som PDF" }).click();
  const pdf = await pdfDownload;
  console.log("PASS PDF downloaded");
  await pdf.saveAs(path.resolve("tmp/photo-atlas-acceptance/report.pdf"));
  assert.equal(await pdf.failure(), null);
  result.steps.push("Saved report versions, 274-photo PDF, JSON baseline with persisted reviews");
  await page.goto(base + reportUrl, { waitUntil: "networkidle" });
  await page
    .getByText(/fotobaseret baseline/)
    .first()
    .waitFor();
  await page.screenshot({ path: "docs/screens/photo-atlas/05-rapport.png", fullPage: false });
  await page.goto(base + "/app/projects/" + project.id, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Fotoatlas", exact: true }).click();
  await atlas.getByRole("status").filter({ hasText: "274 af 274 fotos" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await atlas.getByLabel("Søg i fotoatlas").fill("DRN-001");
  await atlas.getByRole("button", { name: /DRN-001 ·/ }).click();
  await dialog.waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: "docs/screens/photo-atlas/06-mobil.png" });
  await page.keyboard.press("Escape");
  result.steps.push("Mobile 390px atlas and dialog without page overflow");
  const other = JSON.parse(await fs.readFile("tmp/workspace-acceptance/result.json", "utf8"))
    .projects[1];
  await page.goto(base + "/app/projects/" + other.id, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Fotoatlas", exact: true }).click();
  await atlas.getByText(/Der er endnu ikke tilknyttet et fotoatlas/).waitFor();
  result.steps.push(
    "Other project remains empty; imported case data does not follow project navigation",
  );
  await context.close();
  if (readerPath) {
    const reader = JSON.parse(await fs.readFile(readerPath, "utf8"));
    const readerClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await readerClient.auth.signInWithPassword({
      email: reader.email,
      password: reader.password,
    });
    assert.equal(login.error, null);
    const readContext = await contextFor(login.data.session),
      readPage = await readContext.newPage();
    await readPage.goto(base + "/app/projects/" + project.id, { waitUntil: "networkidle" });
    await readPage.getByRole("button", { name: "Fotoatlas", exact: true }).click();
    const readAtlas = readPage.getByRole("region", { name: "Projektets fotoatlas og baseline" });
    await readAtlas.getByLabel("Gemte fotoatlas og baselines").selectOption(importedSourceId);
    await readAtlas
      .getByRole("status")
      .filter({ hasText: "274 af 274 fotos" })
      .waitFor({ timeout: 120000 });
    assert.equal(
      await readAtlas.getByRole("button", { name: "Gem rapportkladde fra fotoatlasset" }).count(),
      0,
    );
    assert.equal(await readAtlas.getByLabel("Importér fotoatlas eller baseline").count(), 0);
    const rows = await readerClient
      .from("project_workspace_entries")
      .select("*")
      .eq("project_id", project.id)
      .limit(1);
    assert.equal(rows.error, null);
    assert.ok(rows.data.length);
    const row = rows.data[0];
    const denied = await readerClient.from("project_workspace_entries").insert({
      organization_id: qa.organizationId,
      project_id: project.id,
      kind: row.kind,
      title: "TEKNISK AFVIST LÆSER",
      payload: row.payload,
    });
    assert.ok(denied.error, "Viewer must not write review");
    assert.equal(
      denied.error.code,
      "42501",
      "Review rejection must come from RLS, not malformed input",
    );
    const upload = await readerClient.storage
      .from("evidence-files")
      .upload(`${project.id}/viewer-denied.json`, new Blob(["{}"], { type: "application/json" }));
    assert.ok(upload.error, "Viewer must not upload evidence");
    assert.match(upload.error.message, /row.level security|policy|permission/i);
    const foreign = await readerClient
      .from("evidence_files")
      .select("id")
      .eq("project_id", other.id);
    assert.equal(foreign.error, null);
    assert.equal(foreign.data.length, 0);
    await readPage.screenshot({ path: "docs/screens/photo-atlas/07-laeser.png", fullPage: true });
    result.steps.push(
      "Fresh viewer context reads 274 photos; no mutation controls; real backend review insert and evidence upload denied",
    );
    await readContext.close();
    await readerClient.auth.signOut({ scope: "local" });
  }
  assert.deepEqual(result.errors, []);
  result.passed = true;
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: "tmp/photo-atlas-acceptance/failure.png" });
    console.log("Visible alerts:", await currentPage.getByRole("alert").allTextContents());
  }
  throw error;
} finally {
  await browser.close();
  await client.auth.signOut({ scope: "local" });
  await fs.writeFile(
    "docs/release-1.0/photo-atlas-browser.json",
    JSON.stringify(result, null, 2) + "\n",
  );
}
console.log(
  `PASS: ${result.steps.length} hosted atlas checks; ${result.source.revision ?? "revision recorded"}`,
);
