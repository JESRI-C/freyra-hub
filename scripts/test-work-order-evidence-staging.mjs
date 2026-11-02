// Authorized STAGING-only journey. Private credentials/session remain in ignored tmp.
// Phases: inspect, core, photo, evidence, probes, external (in that order).
// Set FREYRA_HOSTED_PHASE; require --staging. All mutations target the labelled fixture.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { loadEnv } from "vite";
assert(process.argv.includes("--staging"), "Explicit staging flag required");
const phase = process.env.FREYRA_HOSTED_PHASE ?? "inspect";
assert(["inspect", "core", "photo", "evidence", "probes", "external"].includes(phase));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const dbUrl = "https://xdvqdzdpyceojbdknofi.supabase.co";
const storageUrl = "https://xdvqdzdpyceojbdknofi.storage.supabase.co";
const dir = path.resolve("tmp/samling-hosted"),
  statePath = path.join(dir, "fixture.private.json");
await fs.mkdir(dir, { recursive: true });
const env = loadEnv("staging", process.cwd(), "");
assert.equal(env.SUPABASE_URL, dbUrl);
const credentials = JSON.parse(
  await fs.readFile("tmp/private-release/jesper-test-short-login.private.json", "utf8"),
);
assert.equal(credentials.url, dbUrl);
const operator = createClient(dbUrl, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      assert.equal(new URL(input).origin, dbUrl);
      return fetch(input, { ...init, signal: AbortSignal.timeout(25000) });
    },
  },
});
function ok(r, label) {
  if (r.error) throw Error(`${label}: ${r.error.code ?? r.error.status ?? "failed"}`);
  return r.data;
}
const login = ok(
  await operator.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  }),
  "Operator login",
);
assert.equal(login.user.id, credentials.userId);
let state;
try {
  state = JSON.parse(await fs.readFile(statePath, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  state = {
    schema: "freyra.hosted-evidence-fixture/v1",
    run: randomUUID().slice(0, 8),
    organizationId: "05037ba7-9094-4af7-a0df-c1057c643dac",
    projectId: randomUUID(),
    templateId: randomUUID(),
    templateRequest: randomUUID(),
    operatorId: login.user.id,
    checkpoints: [],
  };
}
assert.equal(state.operatorId, login.user.id);
assert.equal(state.organizationId, "05037ba7-9094-4af7-a0df-c1057c643dac");
async function save() {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}
await save();
const project = ok(
  await operator.from("projects").select("id,name").eq("id", state.projectId).maybeSingle(),
  "Test scope lookup",
);
if (!project)
  ok(
    await operator.from("projects").insert({
      id: state.projectId,
      organization_id: state.organizationId,
      name: `Telefonprøve – samlet forløb (TEST ${state.run})`,
      project_type: "Naturgenopretning",
      description: "TEST · Syntetisk acceptprøve. Ingen faktisk naturindsats eller natureffekt.",
      municipality: "Haderslev",
    }),
    "Create labelled test project",
  );
else assert(project.name.includes(`TEST ${state.run}`));
const ownMembership = ok(
  await operator
    .from("project_members")
    .select("id")
    .eq("project_id", state.projectId)
    .eq("user_id", state.operatorId)
    .maybeSingle(),
  "Own test membership",
);
if (!ownMembership)
  ok(
    await operator
      .from("project_members")
      .insert({ project_id: state.projectId, user_id: state.operatorId, role: "project_manager" }),
    "Explicit own test membership",
  );
const templates = ok(
  await operator
    .from("field_job_template_versions")
    .select("id")
    .eq("template_id", state.templateId),
  "Template scope",
);
if (!templates.length)
  ok(
    await operator.rpc("save_field_job_template_version", {
      p_organization_id: state.organizationId,
      p_project_id: state.projectId,
      p_template_id: state.templateId,
      p_expected_version: 0,
      p_definition: {
        schema: "freyra.field-job-template/v1",
        title: "TEST · Besigtigelse og foto",
        domain: "nature",
        fields: [
          { key: "note", label: "Testnotat", type: "text", required: true },
          { key: "count", label: "Testantal", type: "number", required: true },
          { key: "checked", label: "Testkontrol", type: "boolean", required: true },
        ],
      },
      p_request_id: state.templateRequest,
    }),
    "Create technical template",
  );
state.templateVersionId = ok(
  await operator
    .from("field_job_template_versions")
    .select("id")
    .eq("template_id", state.templateId)
    .eq("version", 1)
    .single(),
  "Template identity",
).id;
await save();
async function prepareExternalFixture() {
  assert(state.latestEvidenceVersionId && state.uploadId);
  state.externalRevocationVerified = false;
  let adminKey = (
    await fs.readFile("tmp/private-release/staging-admin-key.private", "utf8")
  ).trim();
  if (adminKey.startsWith("{")) {
    const keys = JSON.parse(adminKey);
    adminKey = keys.key ?? keys.service_role_key ?? keys.api_key;
  }
  assert.equal(typeof adminKey, "string");
  const admin = createClient(dbUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!state.external) {
    state.external = {
      email: `qa-evidence-${state.run}@example.test`,
      password: randomUUID() + randomUUID(),
    };
    await save();
  }
  if (!state.external.userId) {
    const created = await admin.auth.admin.createUser({
      email: state.external.email,
      password: state.external.password,
      email_confirm: true,
      user_metadata: { full_name: "TEST · Ekstern opgavelæser" },
      app_metadata: { qa_tag: "freyra_staging_evidence" },
    });
    if (created.error) {
      const existing = ok(
        await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        "Find exact test account",
      ).users.find((u) => u.email === state.external.email);
      assert(existing);
      state.external.userId = existing.id;
    } else state.external.userId = created.data.user.id;
    await save();
  }
  assert.equal(state.external.email, `qa-evidence-${state.run}@example.test`);
  const testAccount = ok(
    await admin.auth.admin.getUserById(state.external.userId),
    "Validate isolated external test account",
  ).user;
  assert.equal(testAccount.email, state.external.email);
  assert.equal(testAccount.app_metadata.qa_tag, "freyra_staging_evidence");
  const orgMember = ok(
    await admin
      .from("organization_memberships")
      .select("user_id")
      .eq("organization_id", state.organizationId)
      .eq("user_id", state.external.userId)
      .maybeSingle(),
    "External test organization scope",
  );
  if (!orgMember)
    ok(
      await admin.from("organization_memberships").insert({
        organization_id: state.organizationId,
        user_id: state.external.userId,
        role: "viewer",
      }),
      "External test organization membership",
    );
  const projectMember = ok(
    await admin
      .from("project_members")
      .select("role")
      .eq("project_id", state.projectId)
      .eq("user_id", state.external.userId)
      .maybeSingle(),
    "External project scope",
  );
  if (!projectMember)
    ok(
      await admin
        .from("project_members")
        .insert({ project_id: state.projectId, user_id: state.external.userId, role: "external" }),
      "External test project membership",
    );
  else assert.equal(projectMember.role, "external");
  let grants = ok(
    await operator.rpc("get_work_order_access_history", {
      p_action_id: state.actionId,
      p_organization_id: state.organizationId,
      p_project_id: state.projectId,
      p_user_id: state.external.userId,
      p_before_version: null,
      p_page_size: 1,
    }),
    "Read external exact-task grant",
  );
  if (!grants[0]?.active)
    grants = ok(
      await operator.rpc("save_work_order_access", {
        p_action_id: state.actionId,
        p_organization_id: state.organizationId,
        p_project_id: state.projectId,
        p_user_id: state.external.userId,
        p_expected_version: grants[0]?.version ?? 0,
        p_active: true,
        p_can_execute: true,
        p_can_review: false,
        p_reason: "TEST · Afgrænset adgang til telefonprøvens opgave",
        p_request_id: randomUUID(),
      }),
      "Grant own synthetic task",
    );
  state.external.grantVersion = grants[0].version;
  state.externalRevocationVerified = false;
  await save();
}
const target =
  phase === "external"
    ? "/opgaver"
    : `/app/projects/${state.projectId}?tab=handlinger${state.actionId ? "&task=" + state.actionId : ""}`;
const storageName =
  phase === "external" ? "external-storage.private.json" : "operator-storage.private.json";
const landingHeading = phase === "external" ? "Mine opgaver" : "Arbejdsopgaver";
const errors = [];
let browser, page, context;
try {
  if (phase === "external") await prepareExternalFixture();
  const browserLogin = phase === "external" ? state.external : credentials;
  const meta = await fetch(base + "/freyra-build.json", {
    signal: AbortSignal.timeout(20000),
  }).then((r) => r.json());
  assert.equal(
    meta.sourceRevision,
    process.env.FREYRA_TEST_REVISION ?? "46bf6dfc96b72866fafc1c1b0333e9ecc8aa2b4e",
  );
  state.appRevision = meta.sourceRevision;
  await save();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  let storageState;
  try {
    await fs.access(path.join(dir, storageName));
    storageState = path.join(dir, storageName);
  } catch {}
  context = await browser.newContext({
    storageState,
    viewport: phase === "photo" ? { width: 390, height: 844 } : { width: 1280, height: 1000 },
    isMobile: phase === "photo",
    hasTouch: phase === "photo",
    acceptDownloads: true,
  });
  context.on("requestfailed", (r) => {
    const u = new URL(r.url());
    if (u.origin === storageUrl)
      console.log(
        JSON.stringify({
          network: "storage-request-failed",
          path: u.pathname,
          error: r.failure()?.errorText,
        }),
      );
  });
  context.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin === storageUrl && r.method() !== "OPTIONS") {
      const a = r.headers().authorization ?? "";
      console.log(
        JSON.stringify({
          network: "storage-auth-shape",
          method: r.method(),
          bearerCount: (a.match(/Bearer /g) ?? []).length,
          containsComma: a.includes(","),
          apiKeyPresent: !!r.headers().apikey,
        }),
      );
    }
  });
  context.on("response", async (r) => {
    const u = new URL(r.url());
    if (u.origin === storageUrl && r.status() >= 400) {
      const detail = await r.json().catch(() => ({}));
      console.log(
        JSON.stringify({
          network: "storage-http-error",
          path: u.pathname,
          status: r.status(),
          code: typeof detail.code === "string" ? detail.code : "unparsed",
          statusCode: detail.statusCode,
        }),
      );
    }
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) =>
    errors.push(e.message.replace(/https:\/\/\S+/g, "[URL]").slice(0, 160)),
  );
  await page.route("**/*", (route) => {
    const origin = new URL(route.request().url()).origin;
    return [base, dbUrl, storageUrl].includes(origin) ? route.continue() : route.abort();
  });
  await page.goto(base + target, { waitUntil: "domcontentloaded" });
  await Promise.race([
    page.getByPlaceholder("dig@firma.dk").waitFor({ timeout: 45000 }),
    page.getByRole("heading", { name: landingHeading, exact: true }).waitFor({ timeout: 45000 }),
  ]);
  if (
    phase === "external" &&
    (await page
      .getByRole("link", { name: "Log ind for at se dine opgaver", exact: true })
      .isVisible())
  ) {
    await page.getByRole("link", { name: "Log ind for at se dine opgaver", exact: true }).click();
    await page.getByPlaceholder("dig@firma.dk").waitFor();
  }
  if (await page.getByPlaceholder("dig@firma.dk").isVisible()) {
    await page.getByPlaceholder("dig@firma.dk").fill(browserLogin.email);
    await page.getByPlaceholder("••••••••", { exact: true }).fill(browserLogin.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 45000 });
    await page.goto(base + target, { waitUntil: "domcontentloaded" });
    console.log(JSON.stringify({ step: "browser-login-completed" }));
  }
  await page
    .getByRole("heading", { name: landingHeading, exact: true })
    .waitFor({ timeout: 45000 });
  await context.storageState({ path: path.join(dir, storageName) });
  if (phase === "inspect") {
    await page.screenshot({ path: path.join(dir, "01-project.png"), fullPage: true });
    if (!state.actionId) {
      await page.getByRole("button", { name: "Opret arbejdsopgave", exact: true }).click();
      await page
        .getByLabel("Hvad skal der udføres?", { exact: true })
        .fill(`TEST · Samlet forløb ${state.run}`);
      await page.getByRole("button", { name: "Opret opgave", exact: true }).click();
      await page.getByLabel("Valgt arbejdsopgave").waitFor();
      state.actionId = await page.getByLabel("Valgt arbejdsopgave").inputValue();
      assert.match(state.actionId, /^[a-f0-9-]{36}$/);
      await save();
    }
  }
  if (phase === "core") {
    assert(state.actionId);
    const args = {
      p_action_id: state.actionId,
      p_organization_id: state.organizationId,
      p_project_id: state.projectId,
    };
    let plans = ok(
      await operator.rpc("get_work_order_plan_history", {
        ...args,
        p_before_version: null,
        p_page_size: 1,
      }),
      "Read test plans",
    );
    if (!plans.length) {
      await page.getByRole("button", { name: "Opret arbejdsopgavens plan", exact: true }).click();
      const form = page;
      await form.getByLabel("Metodeprofil").selectOption("nature");
      await form
        .getByLabel("Arbejdsinstruktion", { exact: true })
        .fill(
          "TEST · Samlet telefonprøve: registrér, upload originalfoto og kobl dokumentationen. Ingen faktisk naturindsats.",
        );
      await form
        .getByLabel("Planlagt metode", { exact: true })
        .fill("TEST · Manuel visuel kontrol");
      await form.getByRole("button", { name: "Gem planversion", exact: true }).click();
      await page
        .getByText(/Planversion 1 er gemt|Planen er gemt|Plan version 1/)
        .first()
        .waitFor({ timeout: 30000 });
      plans = ok(
        await operator.rpc("get_work_order_plan_history", {
          ...args,
          p_before_version: null,
          p_page_size: 1,
        }),
        "Verify browser plan",
      );
    }
    assert(plans[0]);
    state.planId = plans[0].id;
    assert.equal(plans[0].plan.plannedStart, null);
    await save();
    console.log(JSON.stringify({ step: "plan-saved-and-readback", version: plans[0].version }));
    let jobs = ok(
      await operator
        .from("field_job_versions")
        .select("id,version,values,status")
        .eq("action_id", state.actionId)
        .order("version", { ascending: false }),
      "Read task observations",
    );
    if (!jobs.length) {
      await page.getByRole("button", { name: "Feltregistrering", exact: true }).click();
      const panel = page.getByRole("region", { name: "Jobkort", exact: true });
      await panel
        .locator("select")
        .filter({ has: page.locator(`option[value="${state.templateVersionId}"]`) })
        .selectOption(state.templateVersionId);
      await panel
        .getByLabel("Testnotat", { exact: false })
        .fill("TEST · Syntetisk feltregistrering til originalfoto.");
      await panel.getByLabel("Testantal", { exact: false }).fill("0");
      await panel.getByLabel("Testkontrol", { exact: false }).selectOption("false");
      await panel.getByLabel("Vurderingsstatus").selectOption("recorded");
      await panel.getByRole("button", { name: "Gem registreringsversion", exact: true }).click();
      await panel
        .getByText("Registrering gemt som version 1. Det er ikke en ekspertgodkendelse.", {
          exact: true,
        })
        .waitFor();
      jobs = ok(
        await operator
          .from("field_job_versions")
          .select("id,version,values,status")
          .eq("action_id", state.actionId)
          .order("version", { ascending: false }),
        "Read saved observation",
      );
    }
    state.observationVersionId = jobs[0].id;
    assert.equal(jobs[0].values.count, 0);
    assert.equal(jobs[0].values.checked, false);
    assert.equal(jobs[0].status, "recorded");
    await save();
    console.log(JSON.stringify({ step: "field-observation-saved", zeroAndFalsePreserved: true }));
    let bindings = ok(
      await operator
        .from("work_order_execution_bindings")
        .select("*")
        .eq("action_id", state.actionId)
        .order("version", { ascending: false }),
      "Read test execution",
    );
    if (!bindings.length) {
      state.plannedExecutionRequest ??= randomUUID();
      await save();
      const execution = {
        schema: "freyra.action-execution/v1",
        actionId: state.actionId,
        surveyRoundId: null,
        dataBasis: "synthetic",
        workType: "other",
        stage: "planned",
        actualDate: null,
        actualEndDate: null,
        method: null,
        reach: "",
        performedBy: null,
        sourceReference: "TEST · Syntetisk planlagt registrering",
        evidenceIds: [],
        deviation: "",
        correctionReason: "",
        coverage: "unknown",
        coverageDescription: "",
      };
      bindings = ok(
        await operator.rpc("save_work_order_execution", {
          ...args,
          p_plan_version_id: state.planId,
          p_expected_plan_version: 1,
          p_expected_version: 0,
          p_execution: execution,
          p_performed_by_id: null,
          p_deviation_reason: "",
          p_request_id: state.plannedExecutionRequest,
          p_expected_assignment_version_id: null,
          p_expected_assignment_version: 0,
        }),
        "Seed synthetic planned execution",
      );
    }
    if (bindings[0].documentation_gaps.includes("execution_not_performed")) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Udført arbejde", exact: true }).click();
      await page.getByRole("button", { name: "Åbn udførelsesregistrering", exact: true }).click();
      const panel = page.getByRole("region", { name: "Faktisk udførelse", exact: true });
      await panel.getByLabel("Status").selectOption("performed");
      await panel.getByLabel("Faktisk startdato", { exact: true }).fill("2026-11-02");
      await panel
        .getByLabel("Faktisk metode – tomt felt betyder uafklaret", { exact: true })
        .fill("TEST · Manuel visuel kontrol");
      await panel
        .getByLabel("Udført delstrækning og stedreference", { exact: true })
        .fill("TEST · Prøveområde uden faglig geometri");
      await panel
        .getByLabel("Arbejdslog, feltregistrering eller anden udførelseskilde", { exact: true })
        .fill("TEST · Syntetisk browserprøve, ingen faktisk naturindsats");
      await panel
        .getByLabel("Årsag til rettelse (kræves ved ny version)", { exact: true })
        .fill("TEST · Skift fra planlagt til syntetisk udført registrering");
      await panel.getByRole("button", { name: "Gem udførelsesversion", exact: true }).click();
      await panel
        .getByText(
          "Udførelsesregistrering gemt som version 2. Den er ikke en faglig godkendelse.",
          { exact: true },
        )
        .waitFor();
      bindings = ok(
        await operator
          .from("work_order_execution_bindings")
          .select("*")
          .eq("action_id", state.actionId)
          .order("version", { ascending: false }),
        "Verify browser execution",
      );
    }
    state.executionRevisionId = bindings[0].workspace_entry_id;
    assert.equal(bindings[0].actual_start, "2026-11-02");
    await save();
    console.log(JSON.stringify({ step: "actual-execution-saved", version: bindings[0].version }));
  }
  if (phase === "photo") {
    const title = `TEST · Prøvefoto ${state.run}`;
    // Same PNG chunk construction as test-field-photo-images.mjs; no remote image service.
    function chunk(type, data) {
      const name = Buffer.from(type),
        length = Buffer.alloc(4),
        check = Buffer.alloc(4);
      let crc = 0xffffffff;
      for (const byte of Buffer.concat([name, data])) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      length.writeUInt32BE(data.length);
      check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
      return Buffer.concat([length, name, data, check]);
    }
    const width = 160,
      height = 96,
      ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const pixels = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const offset = y * (1 + width * 4) + 1 + x * 4;
        pixels[offset] = Math.floor(x / 20) * 30;
        pixels[offset + 1] = Math.floor(y / 16) * 40;
        pixels[offset + 2] = 120;
        pixels[offset + 3] = 255;
      }
    const bytes = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(pixels)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    state.originalSha256 = createHash("sha256").update(bytes).digest("hex");
    state.originalSize = bytes.length;
    await fs.writeFile(path.join(dir, "phone-test-original.png"), bytes);
    await save();
    let uploads = ok(
      await operator
        .from("field_photo_uploads")
        .select("id,payload,received_at")
        .eq("project_id", state.projectId)
        .eq("payload->>title", title),
      "Read own synthetic uploads",
    );
    const existing = uploads.length
      ? ok(
          await operator
            .from("field_photo_receipts")
            .select("*")
            .in(
              "upload_id",
              uploads.map((u) => u.id),
            ),
          "Read synthetic receipt",
        )
      : [];
    if (!existing.some((r) => r.status === "verified")) {
      const fieldPath = `/felt?project=${state.projectId}&task=${state.actionId}`;
      await page.goto(base + fieldPath, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Freyra i felten", exact: true }).waitFor();
      await page
        .getByRole("button", {
          name: /Klargør sagen til offlinebrug|Opdater sagen til offlinebrug/,
        })
        .click();
      await page
        .getByText("Programfiler til offlinebrug er gemt.", { exact: true })
        .waitFor({ timeout: 90000 });
      await page
        .getByLabel("Send automatisk for mine gemte sager, mens feltsiden er åben")
        .uncheck();
      await page.getByText("Titel og note (valgfrit, før foto)", { exact: true }).click();
      await page.getByLabel("Titel", { exact: true }).fill(title);
      await context.setOffline(true);
      await page
        .getByLabel("Vælg originalfotos til feltkøen", { exact: true })
        .setInputFiles({ name: "phone-test-original.png", mimeType: "image/png", buffer: bytes });
      await page.getByText("Gemt på telefonen", { exact: true }).waitFor({ timeout: 30000 });
      await page.screenshot({
        path: path.join(dir, "02-mobile-offline-queued.png"),
        fullPage: true,
      });
      await page.close();
      page = await context.newPage();
      page.setDefaultTimeout(25000);
      await page.goto(base + fieldPath, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Freyra i felten", exact: true }).waitFor();
      await page.getByText("Gemt på telefonen", { exact: true }).waitFor();
      assert((await page.locator("body").innerText()).includes(title));
      state.offlineCloseReopen = true;
      await save();
      console.log(JSON.stringify({ step: "offline-original-survived-page-close" }));
      await context.setOffline(false);
      await page.getByLabel("Send automatisk for mine gemte sager, mens feltsiden er åben").check();
      await page
        .getByText("Modtaget og kontrolleret på serveren", { exact: true })
        .waitFor({ timeout: 90000 });
      await page.screenshot({
        path: path.join(dir, "03-mobile-original-verified.png"),
        fullPage: true,
      });
      uploads = ok(
        await operator
          .from("field_photo_uploads")
          .select("id,payload,received_at")
          .eq("project_id", state.projectId)
          .eq("payload->>title", title),
        "Read actual browser upload",
      );
    }
    const receipts = ok(
      await operator
        .from("field_photo_receipts")
        .select("*")
        .in(
          "upload_id",
          uploads.map((u) => u.id),
        ),
      "Verify original receipt",
    );
    const receipt = receipts.find((r) => r.status === "verified");
    assert(receipt);
    assert.equal(receipt.sha256, state.originalSha256);
    assert.equal(receipt.size_bytes, state.originalSize);
    state.uploadId = receipt.upload_id;
    state.receiptVerified = true;
    await save();
    console.log(
      JSON.stringify({
        step: "real-tus-and-server-verification-passed",
        sha256: receipt.sha256,
        bytes: receipt.size_bytes,
      }),
    );
  }
  if (phase === "evidence") {
    assert(state.uploadId && state.observationVersionId && state.executionRevisionId);
    const args = {
      p_action_id: state.actionId,
      p_organization_id: state.organizationId,
      p_project_id: state.projectId,
    };
    await page.getByRole("button", { name: "Dokumentation", exact: true }).click();
    const panel = page.getByRole("region", { name: "Opgavens dokumentation", exact: true });
    let rows = ok(
      await operator
        .from("work_order_evidence_versions")
        .select("*")
        .eq("action_id", state.actionId)
        .order("version"),
      "Read evidence history",
    );
    const reason = `TEST · lost-reply-${state.run}${rows.length ? " · correction" : ""}`;
    if (!rows.length || (!state.lostReplyRetryVerified && rows.length === 1)) {
      const targetCount = rows.length + 1;
      await panel
        .getByRole("button", {
          name: rows.length ? "Ret kobling" : "Tilknyt registrering og foto",
          exact: true,
        })
        .click();
      await panel.getByLabel("Gemt feltregistrering").selectOption(state.observationVersionId);
      await panel.getByLabel("Verificeret originalfoto").selectOption(state.uploadId);
      await panel.getByLabel("Udført arbejde (valgfrit)").selectOption(state.executionRevisionId);
      await panel.getByLabel("Begrundelse").fill(reason);
      let dropped = false;
      const identities = [];
      await page.route(base + "/**", async (route) => {
        const r = route.request(),
          body = r.postData() ?? "";
        if (r.method() === "POST" && body.includes(`lost-reply-${state.run}`)) {
          identities.push(
            [...body.matchAll(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g)]
              .map((m) => m[0])
              .sort(),
          );
          if (!dropped) {
            const response = await route.fetch();
            assert.equal(response.status(), 200);
            dropped = true;
            await route.abort("failed");
            return;
          }
        }
        await route.fallback();
      });
      await panel.getByRole("button", { name: "Gem dokumentation", exact: true }).click();
      await panel.getByRole("alert").waitFor();
      assert(dropped);
      assert.equal(await panel.getByLabel("Begrundelse").inputValue(), reason);
      rows = ok(
        await operator
          .from("work_order_evidence_versions")
          .select("*")
          .eq("action_id", state.actionId),
        "Verify lost response committed",
      );
      assert.equal(rows.length, targetCount);
      await panel.getByRole("button", { name: "Gem dokumentation", exact: true }).click();
      await panel
        .getByText("Dokumentationen er gemt som en ny version.", { exact: true })
        .waitFor();
      assert.equal(identities.length, 2);
      assert.deepEqual(identities[0], identities[1]);
      rows = ok(
        await operator
          .from("work_order_evidence_versions")
          .select("*")
          .eq("action_id", state.actionId)
          .order("version"),
        "Verify idempotent recovery",
      );
      assert.equal(rows.length, targetCount);
      state.lostReplyRetryVerified = true;
      await save();
    }
    const first = rows[0];
    state.evidenceId = first.evidence_id;
    state.evidenceVersionId = first.id;
    assert.equal(first.execution_revision_id, state.executionRevisionId);
    if (rows.length === 1) {
      await panel.getByRole("button", { name: "Ret kobling", exact: true }).click();
      await panel
        .getByLabel("Begrundelse", { exact: true })
        .fill("TEST · Præcisering uden at ændre de valgte originaler");
      await panel.getByRole("button", { name: "Gem dokumentation", exact: true }).click();
      await panel
        .getByText("Dokumentationen er gemt som en ny version.", { exact: true })
        .waitFor();
      rows = ok(
        await operator
          .from("work_order_evidence_versions")
          .select("*")
          .eq("action_id", state.actionId)
          .order("version"),
        "Read corrected history",
      );
    }
    assert(rows.length >= 2);
    assert.deepEqual(rows[0], first);
    assert.deepEqual(rows[1].original_snapshot, first.original_snapshot);
    assert.deepEqual(rows[1].observation_snapshot, first.observation_snapshot);
    if (rows.at(-1).upload_id !== state.uploadId) {
      const historyBefore = rows;
      await panel.getByRole("button", { name: "Ret kobling", exact: true }).click();
      await panel.getByLabel("Verificeret originalfoto").selectOption(state.uploadId);
      await panel
        .getByLabel("Begrundelse")
        .fill("TEST · Brug synligt prøvebillede; tidligere testoriginal og historik bevares");
      await panel.getByRole("button", { name: "Gem dokumentation", exact: true }).click();
      await panel
        .getByText("Dokumentationen er gemt som en ny version.", { exact: true })
        .waitFor();
      rows = ok(
        await operator
          .from("work_order_evidence_versions")
          .select("*")
          .eq("action_id", state.actionId)
          .order("version"),
        "Read image fixture correction",
      );
      assert.equal(rows.length, historyBefore.length + 1);
      assert.deepEqual(rows.slice(0, -1), historyBefore);
    }
    assert.equal(rows.at(-1).original_snapshot.sha256, state.originalSha256);
    assert.equal(rows.at(-1).execution_revision_id, state.executionRevisionId);
    state.latestEvidenceVersionId = rows.at(-1).id;
    state.latestEvidenceNumber = rows.at(-1).version;
    const latestArticle = panel.locator("article").filter({
      has: page.getByRole("heading", {
        name: `TEST · Besigtigelse og foto · kobling version ${state.latestEvidenceNumber}`,
        exact: true,
      }),
    });
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      latestArticle.getByRole("button", { name: "Åbn originalfoto", exact: true }).click(),
    ]);
    await popup.waitForURL(
      (url) => url.origin === dbUrl && url.pathname.startsWith("/storage/v1/object/sign/"),
    );
    await popup.waitForLoadState("domcontentloaded");
    const original = await context.request.get(popup.url());
    assert.equal(original.status(), 200);
    const bytes = await original.body();
    assert.equal(createHash("sha256").update(bytes).digest("hex"), state.originalSha256);
    await popup.locator("img").evaluate((image) => image.decode());
    assert.deepEqual(
      await popup.locator("img").evaluate((image) => [image.naturalWidth, image.naturalHeight]),
      [160, 96],
    );
    state.originalImageDecoded = true;
    await popup.close();
    state.originalDownloadVerified = true;
    await latestArticle.getByText("Se tilknyttet udførelse", { exact: true }).click();
    await latestArticle
      .getByText(/Udførelse version 2/)
      .first()
      .waitFor();
    await page.screenshot({
      path: path.join(dir, "04-linked-evidence-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel
      .getByRole("heading", { name: "Dokumentation", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(dir, "05-linked-evidence-mobile.png"),
      fullPage: false,
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await save();
    console.log(
      JSON.stringify({
        step: "linked-evidence-and-original-download-passed",
        historyVersions: rows.length,
        lostReplyRetry: state.lostReplyRetryVerified,
      }),
    );
  }
  if (phase === "probes") {
    assert(state.uploadId && state.evidenceId);
    state.probeActionId ??= randomUUID();
    state.probeInitRequest ??= randomUUID();
    state.probeJobRequest ??= randomUUID();
    state.probeEvidenceId ??= randomUUID();
    state.probeEvidenceRequest ??= randomUUID();
    state.probeWithdrawRequest ??= randomUUID();
    await save();
    const action = ok(
      await operator.from("actions").select("id,title").eq("id", state.probeActionId).maybeSingle(),
      "Read negative test action",
    );
    if (!action)
      ok(
        await operator.from("actions").insert({
          id: state.probeActionId,
          project_id: state.projectId,
          title: `TEST · Adgang og tilbagetrækning ${state.run}`,
        }),
        "Create own negative test action",
      );
    else assert(action.title.startsWith("TEST · "));
    const args = {
      p_action_id: state.probeActionId,
      p_organization_id: state.organizationId,
      p_project_id: state.projectId,
    };
    const root = ok(
      await operator
        .from("work_orders")
        .select("action_id")
        .eq("action_id", state.probeActionId)
        .maybeSingle(),
      "Read negative task identity",
    );
    if (!root)
      ok(
        await operator.rpc("initialize_work_order", {
          ...args,
          p_expected_version: 0,
          p_request_id: state.probeInitRequest,
        }),
        "Initialize own negative task",
      );
    let jobs = ok(
      await operator.from("field_job_versions").select("id").eq("action_id", state.probeActionId),
      "Read own negative observation",
    );
    if (!jobs.length)
      jobs = ok(
        await operator.rpc("save_field_job_version", {
          p_organization_id: state.organizationId,
          p_project_id: state.projectId,
          p_action_id: state.probeActionId,
          p_template_version_id: state.templateVersionId,
          p_expected_version: 0,
          p_values: { note: "TEST · Tilbagetrækning", count: 0, checked: false },
          p_status: "recorded",
          p_correction_reason: "",
          p_request_id: state.probeJobRequest,
        }),
        "Save negative test observation",
      );
    const common = {
      ...args,
      p_evidence_id: state.probeEvidenceId,
      p_expected_version: 0,
      p_upload_id: state.uploadId,
      p_execution_revision_id: null,
      p_state: "attached",
      p_reason: "TEST · Afgrænset tilbagetrækningsprøve",
      p_request_id: state.probeEvidenceRequest,
    };
    const wrong = await operator.rpc("save_work_order_evidence", {
      ...common,
      p_observation_version_id: state.observationVersionId,
    });
    assert(wrong.error);
    assert.equal(wrong.error.code, "22023");
    const own = { ...common, p_observation_version_id: jobs[0].id };
    const first = ok(
      await operator.rpc("save_work_order_evidence", own),
      "Save withdrawal test binding",
    )[0];
    const withdrawn = ok(
      await operator.rpc("save_work_order_evidence", {
        ...own,
        p_expected_version: 1,
        p_state: "withdrawn",
        p_reason: "TEST · Kobling trukket tilbage med bevaret historik",
        p_request_id: state.probeWithdrawRequest,
      }),
      "Withdraw own test binding",
    )[0];
    assert.equal(withdrawn.version, 2);
    assert.deepEqual(withdrawn.original_snapshot, first.original_snapshot);
    const denied = await operator.rpc("get_work_order_evidence_original", {
      ...args,
      p_id: first.id,
    });
    assert.equal(denied.error?.code, "42501");
    state.withdrawalVerified = true;
    state.crossTaskDenied = true;
    await save();
    console.log(JSON.stringify({ step: "cross-task-denial-and-historical-withdrawal-passed" }));
  }
  if (phase === "external") {
    const reader = createClient(dbUrl, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    ok(
      await reader.auth.signInWithPassword({
        email: state.external.email,
        password: state.external.password,
      }),
      "External scoped login",
    );
    await page.getByRole("button", { name: "Åbn opgave", exact: true }).click();
    await page.getByText("Se dokumentation", { exact: true }).click();
    const panel = page.getByRole("region", { name: "Opgavens dokumentation", exact: true });
    await panel.getByRole("button", { name: "Åbn originalfoto", exact: true }).first().waitFor();
    const latestArticle = panel.locator("article").filter({
      has: page.getByRole("heading", {
        name: `TEST · Besigtigelse og foto · kobling version ${state.latestEvidenceNumber}`,
        exact: true,
      }),
    });
    assert.equal(
      await panel
        .getByRole("button", { name: "Tilknyt registrering og foto", exact: true })
        .count(),
      0,
    );
    assert.equal(await panel.getByRole("button", { name: "Ret kobling", exact: true }).count(), 0);
    const args = {
      p_action_id: state.actionId,
      p_organization_id: state.organizationId,
      p_project_id: state.projectId,
    };
    const sources = await reader.rpc("list_work_order_evidence_sources", {
      ...args,
      p_kind: "photo",
      p_after_id: null,
      p_page_size: 20,
    });
    assert.equal(sources.error?.code, "42501");
    const media = ok(
      await reader.from("project_media").select("id").eq("project_id", state.projectId),
      "External project-media denial",
    );
    assert.equal(media.length, 0);
    const otherTask = await reader.rpc("list_work_order_evidence", {
      ...args,
      p_action_id: state.probeActionId,
      p_after_id: null,
      p_page_size: 20,
    });
    assert.equal(otherTask.error?.code, "42501");
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      latestArticle.getByRole("button", { name: "Åbn originalfoto", exact: true }).click(),
    ]);
    await popup.waitForURL(
      (url) => url.origin === dbUrl && url.pathname.startsWith("/storage/v1/object/sign/"),
    );
    await popup.waitForLoadState("domcontentloaded");
    const original = await context.request.get(popup.url());
    assert.equal(original.status(), 200);
    assert.equal(
      createHash("sha256")
        .update(await original.body())
        .digest("hex"),
      state.originalSha256,
    );
    await popup.locator("img").evaluate((image) => image.decode());
    assert.deepEqual(
      await popup.locator("img").evaluate((image) => [image.naturalWidth, image.naturalHeight]),
      [160, 96],
    );
    await popup.close();
    await page.screenshot({ path: path.join(dir, "06-external-read-only.png"), fullPage: true });
    ok(
      await operator.rpc("save_work_order_access", {
        ...args,
        p_user_id: state.external.userId,
        p_expected_version: state.external.grantVersion,
        p_active: false,
        p_can_execute: false,
        p_can_review: false,
        p_reason: "TEST · Tilbagekaldelse efter læseprøve",
        p_request_id: randomUUID(),
      }),
      "Revoke test-only task grant",
    );
    const revoked = await reader.rpc("get_work_order_evidence_original", {
      ...args,
      p_id: state.latestEvidenceVersionId,
    });
    assert.equal(revoked.error?.code, "42501");
    await latestArticle.getByRole("button", { name: "Åbn originalfoto", exact: true }).click();
    await panel.getByRole("alert").waitFor();
    state.externalReadAndOriginalVerified = true;
    state.externalRevocationVerified = true;
    state.externalSourceEnumerationDenied = true;
    await save();
    await reader.auth.signOut({ scope: "local" });
    console.log(
      JSON.stringify({
        step: "external-read-only-original-and-revocation-passed",
        noEmailSent: true,
      }),
    );
  }
  await fs.writeFile(
    path.join(dir, "current-ui.private.txt"),
    await page.locator("body").innerText(),
  );
  await page.screenshot({ path: path.join(dir, "current-ui.private.png"), fullPage: true });
  await save();
  console.log(
    JSON.stringify({
      result: "checkpoint",
      phase,
      projectId: state.projectId,
      actionId: state.actionId,
      ui: path.join(dir, "current-ui.private.txt"),
      errors,
    }),
  );
} catch (error) {
  if (page) {
    await fs.writeFile(
      path.join(dir, "failure-ui.private.txt"),
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
    await page
      .screenshot({ path: path.join(dir, "failure.private.png"), fullPage: true })
      .catch(() => {});
  }
  console.error(
    JSON.stringify({
      result: "FAIL",
      phase,
      error: error.message?.replace(/https:\/\/\S+/g, "[URL]"),
      errors,
    }),
  );
  process.exitCode = 1;
} finally {
  if (phase === "external" && !state.externalRevocationVerified && state.external?.userId) {
    const args = {
      p_action_id: state.actionId,
      p_organization_id: state.organizationId,
      p_project_id: state.projectId,
      p_user_id: state.external.userId,
    };
    const current = await operator.rpc("get_work_order_access_history", {
      ...args,
      p_before_version: null,
      p_page_size: 1,
    });
    if (current.error) {
      console.error("Test-only grant cleanup could not be checked; inspect the private fixture.");
      process.exitCode = 1;
    }
    if (current.data?.[0]?.active) {
      const cleanup = await operator.rpc("save_work_order_access", {
        ...args,
        p_expected_version: current.data[0].version,
        p_active: false,
        p_can_execute: false,
        p_can_review: false,
        p_reason: "TEST · Luk midlertidig adgang efter afbrudt browserprøve",
        p_request_id: randomUUID(),
      });
      if (cleanup.error) {
        console.error("Test-only grant cleanup failed; inspect the private fixture.");
        process.exitCode = 1;
      }
    }
  }
  await context?.close();
  await browser?.close();
  await operator.auth.signOut({ scope: "local" });
}
