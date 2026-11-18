/** Isolated staging acceptance. Credentials are read locally and never logged.
 * node scripts/test-project-workspace-staging.mjs <qa-session.json> <publishable-env-file> <playwright-module> [baseURL]
 * Creates explicitly labelled technical test cases; does not touch customer cases or production.
 */
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const [qaPath, envPath, playwrightPath, base = "http://127.0.0.1:8788"] = process.argv.slice(2);
if (!qaPath || !envPath || !playwrightPath)
  throw new Error("Supply local QA/config/runtime paths.");
assert.ok(
  ["127.0.0.1", "localhost", "gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev"].includes(
    new URL(base).hostname,
  ),
);
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
const clientFor = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const client = clientFor();
const login = await client.auth.signInWithPassword({ email: qa.email, password: qa.password });
assert.equal(login.error, null, "Operator authentication");
const previous =
  process.env.WORKSPACE_RESUME === "1"
    ? JSON.parse(await fs.readFile("tmp/workspace-acceptance/result.json", "utf8"))
    : null;
const run = previous?.run ?? randomUUID().slice(0, 8),
  org = qa.organizationId;
const projects = previous
  ? previous.projects.map((p, i) => ({ ...p, slug: `workspace-${run}-${i === 0 ? "a" : "b"}` }))
  : ["A", "B"].map((letter) => ({
      id: randomUUID(),
      organization_id: org,
      slug: `workspace-${run}-${letter.toLowerCase()}`,
      name: `TEKNISK FANETEST ${run} ${letter}`,
      project_type: letter === "A" ? "Parkering" : "Naturgenopretning",
      municipality: "Haderslev",
      description: "Isoleret teknisk acceptprøve. Ingen faglig godkendelse.",
    }));
const ok = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const reader = clientFor();
ok(await reader.auth.signInWithPassword({ email: qa.viewer.email, password: qa.viewer.password }));
if (!previous) {
  await ok(await client.from("projects").insert(projects));
  const a = projects[0],
    b = projects[1];
  await ok(
    await client
      .from("project_members")
      .insert(
        projects.map((p) => ({ project_id: p.id, user_id: qa.viewer.userId, role: "viewer" })),
      ),
  );
  await ok(
    await client.from("indicators").insert({
      project_id: a.id,
      key: "qa_measured",
      label: `TEKNISK indikator ${run}`,
      value: 37.25,
      unit: "test-enhed",
      category: "qa",
    }),
  );
  await ok(
    await client.from("environmental_risks").insert({
      project_id: a.id,
      title: `TEKNISK risiko ${run}`,
      severity: "Høj",
      status: "Åben",
      description: "Kun test af adgang og visning.",
    }),
  );
  await ok(
    await client.from("data_sources").insert({
      project_id: a.id,
      name: `TEKNISK kilde ${run}`,
      source_type: "manual",
      status: "active",
      provider: "Teknisk acceptprøve",
    }),
  );
  await ok(
    await client
      .from("actions")
      .insert({ project_id: a.id, title: `TEKNISK handling ${run}`, status: "Åben" }),
  );
  const payloads = {
    scenario: {
      assumptions: "Teknisk test; ingen beregnet miljøeffekt.",
      source: "Acceptprøve",
      horizon: "12",
      focus: "Vand",
      investment: "Lav",
      expectedEffect: "Ikke beregnet",
    },
    stakeholder: { role: "Teknisk kontakt", status: "Uafklaret" },
    decision_note: { basis: "Teknisk grundlag", source: "Acceptprøve" },
    esrs: { code: "TEST-E3", notes: "Teknisk testafgrænsning", status: "Mangler" },
    co2_entry: {
      category: "Udledning",
      quantity: "1.25",
      period: "Teknisk testperiode",
      boundary: "Testscope",
      method: "Testmetode; ikke kundetal",
      source: "Acceptprøve",
    },
    funding: { organization: "TEKNISK testfond", amount: "1250", status: "Mulighed" },
    partner: { role: "Teknisk testpartner", type: "Kommune" },
    public_page: {
      summary: "TEKNISK kladde",
      limitations: "Ikke kundemateriale",
      source: "Acceptprøve",
    },
  };
  const entryId = randomUUID();
  const entries = Object.entries(payloads).map(([kind, payload]) => ({
    entry_id: kind === "decision_note" ? entryId : randomUUID(),
    organization_id: org,
    project_id: a.id,
    kind,
    title: `TEKNISK ${kind} ${run}`,
    version: 1,
    payload,
  }));
  await ok(await client.from("project_workspace_entries").insert(entries));
  await ok(
    await client.from("project_workspace_entries").insert({
      ...entries.find((e) => e.kind === "decision_note"),
      version: 2,
      title: `TEKNISK notat version 2 ${run}`,
    }),
  );
  assert.ok(
    (
      await client
        .from("project_workspace_entries")
        .insert({ ...entries.find((e) => e.kind === "decision_note"), version: 2 })
    ).error,
    "Stale save rejected",
  );
  assert.equal(
    ok(await reader.from("project_workspace_entries").select("id").eq("project_id", a.id)).length,
    9,
  );
  assert.ok(
    (
      await reader
        .from("project_workspace_entries")
        .insert({ ...entries[0], entry_id: randomUUID() })
    ).error,
    "Reader write rejected",
  );
  assert.ok(
    (
      await client
        .from("project_workspace_entries")
        .insert({ ...entries[0], entry_id: randomUUID(), organization_id: randomUUID() })
    ).error,
    "Forged scope rejected",
  );
  assert.equal(
    ok(await client.from("project_workspace_entries").select("id").eq("project_id", b.id)).length,
    0,
  );
}
const a = projects[0],
  b = projects[1];
if (previous) {
  const verified = ok(
    await client
      .from("projects")
      .select("id,name")
      .in("id", [a.id, b.id])
      .like("name", "TEKNISK FANETEST " + run + "%"),
  );
  assert.equal(verified.length, 2, "Resume is restricted to this labelled test run");
  ok(
    await client
      .from("actions")
      .update({ status: "Åben", started_at: null, completed_at: null })
      .eq("project_id", a.id),
  );
  ok(await client.from("environmental_risks").update({ status: "Åben" }).eq("project_id", a.id));
}
const noteTitle = "UI-gemt notat " + run + " " + randomUUID().slice(0, 4);
await fs.mkdir("tmp/workspace-acceptance", { recursive: true });
const result = {
  run,
  base,
  projects: projects.map((p) => ({ id: p.id, name: p.name })),
  backend: {
    versionConflict: true,
    readerRead: true,
    readerWriteDenied: true,
    forgedScopeDenied: true,
    projectBEmpty: true,
  },
  routes: [],
  errors: [],
};
const save = () =>
  fs.writeFile("tmp/workspace-acceptance/result.json", JSON.stringify(result, null, 2));
await save();
console.log("PASS staging persistence, version conflicts and reader isolation");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(180000);
  await page.addInitScript(
    ({ org, id }) =>
      localStorage.setItem(
        "freyra-auth-selection-v1",
        JSON.stringify({ orgId: org, projectId: id }),
      ),
    { org, id: a.id },
  );
  await page.goto(base + "/login?next=%2Fapp%2Fdecisions%2Frecommendations");
  await page.locator('input[type="email"]').fill(qa.email);
  await page.locator('input[type="password"]').fill(qa.password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await page.waitForURL("**/app/**", { timeout: 180000 });
  console.log("PASS browser login");
  await page.locator("[data-workspace-page]").waitFor({ timeout: 180000 });
  const pages = {
    decisions: ["recommendations", "risk", "scenarios", "data-quality", "notes", "assistant"],
    ledger: ["metrics", "csrd", "co2", "sources", "audit", "documents", "reporting"],
    impact: [
      "projects",
      "project",
      "portfolio",
      "credits",
      "verification",
      "organizations",
      "reports",
    ],
  };
  for (const [module, tabs] of Object.entries(pages))
    for (const tab of tabs) {
      const route = `/app/${module}/${tab}`;
      await page.goto(`${base}${route}?project=${a.id}`);
      const main = page.locator("[data-workspace-page]");
      await main.waitFor();
      await page
        .getByText("Indlæser projektdata…", { exact: true })
        .waitFor({ state: "hidden", timeout: 120000 });
      assert.ok((await main.innerText()).includes(a.name), `${route}: correct project`);
      assert.ok(
        !(await main.innerText()).includes("Denne datakilde kunne ikke indlæses"),
        `${route}: data loaded`,
      );
      assert.equal(new URL(page.url()).pathname, route);
      result.routes.push({ route, pass: true });
      await save();
      console.log(`PASS ${route}`);
    }
  console.log("START browser save/reload/project switch");
  await page.goto(`${base}/app/decisions/assistant?project=${a.id}`);
  await page
    .getByLabel("Spørgsmål", { exact: true })
    .fill("Hvilket datagrundlag findes for denne tekniske testsag?");
  await page.getByRole("button", { name: "Spørg AI om projektet", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Lovables hemmelige servernøgle mangler" })
    .waitFor();
  result.aiBoundary =
    "Authenticated hosted server path reached; missing key shown; provider inference not tested.";
  await save();
  console.log("PASS AI missing-key boundary");
  await page.goto(`${base}/app/decisions/notes?project=${a.id}`);
  await page.getByRole("button", { name: "Opret beslutningsnotat", exact: true }).click();
  await page.getByLabel("Titel", { exact: true }).fill(noteTitle);
  await page
    .getByLabel("Beslutningsgrundlag", { exact: true })
    .fill("Registreret gennem browseren.");
  await page.getByLabel("Kilde / rapportversion", { exact: true }).fill("Teknisk acceptprøve");
  await page.getByRole("button", { name: "Gem registrering", exact: true }).click();
  await page.getByRole("heading", { name: noteTitle, exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: noteTitle, exact: true }).waitFor();
  result.browserPersistence = true;
  await save();
  console.log("PASS browser save and reload");
  await page.goto(`${base}/app/decisions/notes?project=${b.id}`);
  await page.getByText(b.name, { exact: false }).first().waitFor();
  assert.equal(await page.getByRole("heading", { name: noteTitle, exact: true }).count(), 0);
  result.browserProjectSwitch = true;
  await save();
  console.log("PASS browser project switch");
  await page.goto(base + "/app/decisions/recommendations?project=" + a.id);
  await page.getByRole("button", { name: "I gang", exact: true }).click();
  await page
    .locator("span")
    .filter({ hasText: /^I gang$/ })
    .waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Færdig", exact: true }).click();
  await page
    .locator("span")
    .filter({ hasText: /^Lukket$/ })
    .waitFor();
  await page.reload();
  await page
    .locator("span")
    .filter({ hasText: /^Lukket$/ })
    .waitFor();
  assert.equal(
    ok(await client.from("actions").select("status").eq("project_id", a.id).single()).status,
    "Lukket",
  );
  result.actionPersistence = true;
  await save();
  console.log("PASS action status persistence");
  await page.goto(base + "/app/decisions/risk?project=" + a.id);
  await page.getByRole("button", { name: "Markér kontrolleret", exact: true }).click();
  await page
    .getByRole("button", { name: "Markér kontrolleret", exact: true })
    .waitFor({ state: "hidden" });
  await page.reload();
  await page.getByText("Kontrolleret", { exact: true }).waitFor();
  assert.equal(
    ok(await client.from("environmental_risks").select("status").eq("project_id", a.id).single())
      .status,
    "Kontrolleret",
  );
  result.riskPersistence = true;
  await save();
  console.log("PASS risk status persistence");
  const categories = [
    "/app/sources",
    "/app/overview",
    "/app/projects",
    "/app/reports",
    "/app/connect/map",
    "/app/construction",
    "/app/connect",
    "/app/lavbund",
    "/app/decisions",
    "/app/ledger",
    "/app/connect/registry",
    "/app/impact",
    "/app/public-impact",
    "/app/settings",
    "/app/settings/users",
    "/app/system-test",
    ...["projects", "access", "frameworks", "modules", "notifications", "security", "billing"].map(
      (tab) => `/app/settings/${tab}`,
    ),
  ];
  for (const route of categories) {
    const response = await page.goto(`${base}${route}?project=${a.id}`);
    await page.locator("aside").waitFor();
    assert.ok(!response || response.status() < 400, `${route}: status`);
    assert.equal(new URL(page.url()).pathname.replace(/\/$/, ""), route);
    const text = await page.locator("body").innerText();
    assert.ok(
      !/An unexpected error|Noget gik galt|Internal Server Error/.test(text),
      `${route}: no error page`,
    );
    result.routes.push({ route, pass: true });
    await save();
    console.log(`PASS category ${route}`);
  }
  await page.goto(`${base}/app/ledger/metrics?project=${a.id}`);
  await page.getByText(`TEKNISK indikator ${run}`, { exact: false }).waitFor();
  await page.screenshot({ path: "tmp/workspace-acceptance/metrics.png", fullPage: true });
  const readerContext = await browser.newContext();
  const readerPage = await readerContext.newPage();
  readerPage.setDefaultTimeout(120000);
  await readerPage.addInitScript(
    ({ org, id, session }) => {
      localStorage.setItem(
        "freyra-auth-selection-v1",
        JSON.stringify({ orgId: org, projectId: id }),
      );
      localStorage.setItem("sb-xdvqdzdpyceojbdknofi-auth-token", JSON.stringify(session));
    },
    { org, id: a.id, session: (await reader.auth.getSession()).data.session },
  );
  await readerPage.goto(`${base}/app/decisions/notes?project=${a.id}`);
  await readerPage.getByText("Din adgang er læseadgang.", { exact: true }).waitFor();
  assert.equal(
    await readerPage.getByRole("button", { name: "Opret beslutningsnotat", exact: true }).count(),
    0,
  );
  assert.equal(await readerPage.getByRole("button", { name: "Redigér", exact: true }).count(), 0);
  result.readerBrowser = true;
  assert.equal(result.errors.length, 0, "No browser runtime errors");
  await save();
  console.log(
    "PASS all 20 tabs, 16 categories, browser persistence, project switch and reader access",
  );
} catch (error) {
  result.failure = error.message;

  await save();
  throw error;
} finally {
  await browser.close();
}
