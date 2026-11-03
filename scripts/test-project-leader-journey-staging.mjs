import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

// Staging-only synthetic example. Reuses existing UI, plan and template APIs.
// Requires the existing private test login/session in ignored tmp; sends no email.
assert(process.argv.includes("--staging"));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const dbUrl = "https://xdvqdzdpyceojbdknofi.supabase.co";
const org = "05037ba7-9094-4af7-a0df-c1057c643dac";
const revision = process.env.FREYRA_TEST_REVISION ?? "c93ad0309da4a6b5fa1d43c9d7a278ae8945c510";
const dir = "tmp/project-journey";
await fs.mkdir(dir, { recursive: true });
const env = loadEnv("staging", process.cwd(), "");
assert.equal(env.SUPABASE_URL, dbUrl);
const credentials = JSON.parse(
  await fs.readFile("tmp/private-release/jesper-test-short-login.private.json", "utf8"),
);
assert.equal(credentials.url, dbUrl);
const operator = createClient(dbUrl, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function ok(result, label) {
  if (result.error) throw Error(`${label}: ${result.error.code ?? "failed"}`);
  return result.data;
}
ok(
  await operator.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  }),
  "Operator login",
);
let state;
try {
  state = JSON.parse(await fs.readFile(dir + "/case.json", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  state = { run: randomUUID().slice(0, 8) };
}
state.name = `Prøvesag · Pleje af en tilgroet eng (${state.run})`;
state.description =
  "EKSEMPEL – ikke et rigtigt naturprojekt.\n\nProblem: En eng gror til, og projektlederen mangler et samlet grundlag for at planlægge plejen.\nMål: Planlæg en indsats for mere lysåben natur, og dokumentér grundlaget og det udførte arbejde.\nOpfølgning: Sammenhold før- og eftermateriale og en faglig vurdering. Der er endnu ikke dokumenteret en ændring i naturen.";
const taskTitle = "Besigtig engen og beskriv udgangspunktet (eksempel)";
async function save() {
  await fs.writeFile(dir + "/case.json", JSON.stringify(state, null, 2));
}
await save();
let browser, page;
try {
  const meta = await fetch(base + "/freyra-build.json").then((r) => r.json());
  assert.equal(meta.sourceRevision, revision);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    storageState: "tmp/samling-hosted/operator-storage.private.json",
    viewport: { width: 1280, height: 1000 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.route("**/*", (route) =>
    [base, dbUrl, "https://xdvqdzdpyceojbdknofi.storage.supabase.co"].includes(
      new URL(route.request().url()).origin,
    )
      ? route.continue()
      : route.abort(),
  );
  await page.goto(base + "/app/projects", { waitUntil: "domcontentloaded" });
  await Promise.race([
    page.getByPlaceholder("dig@firma.dk").waitFor(),
    page
      .getByRole("heading", { name: "Fra naturproblem til dokumenteret indsats", exact: true })
      .waitFor(),
  ]);
  if (await page.getByPlaceholder("dig@firma.dk").isVisible()) {
    await page.getByPlaceholder("dig@firma.dk").fill(credentials.email);
    await page.getByPlaceholder("••••••••", { exact: true }).fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname != "/login");
    await page.goto(base + "/app/projects");
  }
  await page
    .getByRole("heading", { name: "Fra naturproblem til dokumenteret indsats", exact: true })
    .waitFor();
  await page.getByText("Jespers testområde", { exact: true }).first().waitFor();
  if (!state.projectId) {
    await page.getByRole("button", { name: "Start et naturprojekt", exact: false }).click();
    const dialog = page.getByRole("dialog", { name: "Opret ny sag", exact: true });
    const purpose = dialog.getByLabel("Hvilket problem vil I løse, og hvad er målet?");
    assert.equal(await purpose.evaluate((el) => !!el.closest("details")), false);
    await dialog.getByLabel("Projektnavn", { exact: false }).fill(state.name);
    await purpose.fill(state.description);
    await dialog.getByRole("button", { name: "Opret projekt", exact: true }).click();
    await page.waitForURL((url) => /\/app\/projects\/[^/]+$/.test(url.pathname));
    const row = ok(
      await operator
        .from("projects")
        .select("id,description")
        .eq("organization_id", org)
        .eq("name", state.name)
        .single(),
      "Read newly created example",
    );
    assert.equal(row.description, state.description);
    state.projectId = row.id;
    state.purposeVisibleOnCreation = true;
    await save();
  }
  const projectScope = ok(
    await operator
      .from("projects")
      .select("name,organization_id")
      .eq("id", state.projectId)
      .single(),
    "Check example scope",
  );
  assert.equal(projectScope.organization_id, org);
  assert.equal(projectScope.name, state.name);
  await page.goto(`${base}/app/projects/${state.projectId}`);
  await page
    .getByRole("heading", { name: "Fra naturproblem til dokumenteret indsats", exact: true })
    .waitFor();
  assert.equal(await page.getByText(state.description, { exact: true }).isVisible(), true);
  assert.equal(
    await page
      .locator("details")
      .filter({ has: page.locator("summary").filter({ hasText: "Alle projektets værktøjer" }) })
      .evaluate((el) => el.open),
    false,
  );
  state.defaultOverviewVerified = true;
  await page.getByRole("button", { name: "Planlæg indsatsen", exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("tab") === "handlinger" && url.searchParams.get("work") === "plan",
  );
  await page.getByRole("heading", { name: "Arbejdsopgaver", exact: true }).waitFor();
  if (!state.actionId) {
    await page.getByRole("button", { name: "Opret arbejdsopgave", exact: true }).click();
    await page.getByLabel("Hvad skal der udføres?", { exact: true }).fill(taskTitle);
    await page.getByRole("button", { name: "Opret opgave", exact: true }).click();
    await page.waitForURL((url) => !!url.searchParams.get("task"));
    state.actionId = new URL(page.url()).searchParams.get("task");
    await save();
  }
  const taskScope = ok(
    await operator.from("actions").select("project_id,title").eq("id", state.actionId).single(),
    "Check task scope",
  );
  assert.equal(taskScope.project_id, state.projectId);
  assert.equal(taskScope.title, taskTitle);
  state.templateId ??= randomUUID();
  state.templateRequestId ??= randomUUID();
  await save();
  const templates = ok(
    await operator
      .from("field_job_template_versions")
      .select("id")
      .eq("template_id", state.templateId),
    "Read example template",
  );
  if (!templates.length)
    ok(
      await operator.rpc("save_field_job_template_version", {
        p_organization_id: org,
        p_project_id: state.projectId,
        p_template_id: state.templateId,
        p_expected_version: 0,
        p_definition: {
          schema: "freyra.field-job-template/v1",
          title: "Besigtigelse før naturpleje (eksempel)",
          domain: "nature",
          fields: [
            { key: "sted", label: "Hvor er du på området?", type: "text", required: true },
            {
              key: "udgangspunkt",
              label: "Hvad ser du før indsatsen?",
              type: "text",
              required: true,
            },
            {
              key: "hensyn",
              label: "Hvilke hensyn skal afklares før arbejdet?",
              type: "text",
              required: false,
            },
          ],
        },
        p_request_id: state.templateRequestId,
      }),
      "Create example template without observations",
    );
  state.templateVersionId = ok(
    await operator
      .from("field_job_template_versions")
      .select("id")
      .eq("template_id", state.templateId)
      .eq("version", 1)
      .single(),
    "Example template identity",
  ).id;
  await save();
  await page.goto(
    `${base}/app/projects/${state.projectId}?tab=handlinger&task=${state.actionId}&work=plan`,
  );
  await page
    .getByRole("heading", { name: "Hvad skal der gøres, og hvem har ansvaret?", exact: true })
    .waitFor();
  const scope = {
    p_action_id: state.actionId,
    p_project_id: state.projectId,
    p_organization_id: org,
  };
  const plans = ok(
    await operator.rpc("get_work_order_plan_history", {
      ...scope,
      p_before_version: null,
      p_page_size: 1,
    }),
    "Read example plan",
  );
  if (!plans.length) {
    await page.getByRole("button", { name: "Opret arbejdsopgavens plan", exact: true }).click();
    await page.getByLabel("Metodeprofil").selectOption("nature");
    await page
      .getByLabel("Arbejdsinstruktion", { exact: true })
      .fill(
        "EKSEMPEL: Skab et fælles grundlag før indsatsen. Beskriv udgangspunktet og aftal dokumentationen. Ingen faktisk besigtigelse er gennemført i denne prøvesag.",
      );
    await page
      .getByLabel("Planlagt metode", { exact: true })
      .fill(
        "EKSEMPEL: Besigtig området før valg af plejemetode. Beskriv de synlige forhold og relevante hensyn, og aftal hvilke førbilleder der skal tages. Ingen fysisk pleje er udført.",
      );
    await page.getByRole("button", { name: "Gem planversion", exact: true }).click();
    await page.getByText(/^Plan(?:version| version) 1 er gemt\./).waitFor();
  }
  await page.getByRole("button", { name: "Rediger plan som ny version", exact: true }).click();
  const method = page.getByLabel("Planlagt metode", { exact: true });
  const savedValue = await method.inputValue();
  await method.fill(savedValue + "\nKladdeprøve – skal ikke gemmes.");
  const draftValue = await method.inputValue();
  assert(draftValue.includes("Kladdeprøve – skal ikke gemmes."));
  await page.getByRole("button", { name: "Videre til feltregistrering →", exact: true }).click();
  await page.getByRole("heading", { name: "Hvad observerer I på stedet?", exact: true }).waitFor();
  const jobcard = page.getByRole("region", { name: "Jobkort", exact: true });
  await jobcard
    .getByLabel("Skabelon", { exact: false })
    .first()
    .selectOption(state.templateVersionId);
  await jobcard.getByLabel("Hvad ser du før indsatsen?", { exact: false }).waitFor();
  await jobcard.getByRole("button", { name: "Fortryd ændringer i jobkort", exact: true }).click();
  state.exampleFieldTemplateVerified = true;
  await page.getByRole("button", { name: "Arbejdsgrundlag", exact: true }).click();
  assert.equal(await method.inputValue(), draftValue);
  await page.getByRole("button", { name: "Fortryd ændringer", exact: true }).click();
  state.draftPreservedOnNext = true;
  await page.getByRole("button", { name: "← Til projektets forløb", exact: true }).click();
  await page
    .getByRole("heading", { name: "Fra naturproblem til dokumenteret indsats", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Åbn udført arbejde", exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("work") === "execution" &&
      url.searchParams.get("task") === state.actionId,
  );
  await page.getByRole("heading", { name: "Hvad blev faktisk gjort?", exact: true }).waitFor();
  state.taskContextPreserved = true;
  await page.getByRole("button", { name: "← Til projektets forløb", exact: true }).click();
  await page.getByRole("button", { name: "Undersøg området først", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("tab") === "grundlag");
  await page.getByRole("button", { name: "← Til projektets forløb", exact: true }).click();
  await page.getByRole("button", { name: "Sammenhold før og efter", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("step") === "sammenligning");
  await page.getByRole("button", { name: "← Til projektets forløb", exact: true }).click();
  await page.getByRole("button", { name: "Åbn rapport og opfølgning", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("tab") === "rapporter");
  state.journeyLinksVerified = true;
  await page.getByRole("button", { name: "← Til projektets forløb", exact: true }).click();
  await page.screenshot({ path: dir + "/desktop.png", fullPage: false });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page
      .getByRole("heading", { name: "Fra naturproblem til dokumenteret indsats", exact: true })
      .scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const box = await page
      .getByRole("button", { name: "Planlæg indsatsen", exact: true })
      .boundingBox();
    assert(box && box.height >= 44);
    await page.screenshot({ path: `${dir}/mobile-${width}.png`, fullPage: false });
  }
  state.mobileWidthsVerified = [320, 390];
  state.sourceRevision = revision;
  await save();
  console.log(JSON.stringify({ result: "PASS", ...state }));
} catch (error) {
  if (page) {
    await fs.writeFile(
      dir + "/failure.txt",
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
    await page.screenshot({ path: dir + "/failure.png", fullPage: false }).catch(() => {});
  }
  console.error(
    JSON.stringify({ result: "FAIL", error: error.message?.replace(/https:\/\/\S+/g, "[URL]") }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await operator.auth.signOut({ scope: "local" });
}
