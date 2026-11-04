import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

assert(process.argv.includes("--staging"), "Explicit staging flag required");
const prepareOnly = process.argv.includes("--prepare");
const checkAcceptedPlanChange = process.argv.includes("--accepted-plan-change");
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const url = "https://xdvqdzdpyceojbdknofi.supabase.co";
const sourceRoot = path.resolve("../freyra-hub-bykaer");
const env = loadEnv("staging", sourceRoot, "");
assert.equal(env.SUPABASE_URL, url);
const credentials = JSON.parse(
  await fs.readFile(
    path.join(sourceRoot, "tmp/private-release/jesper-test-short-login.private.json"),
    "utf8",
  ),
);
const source = JSON.parse(
  await fs.readFile(path.join(sourceRoot, "tmp/samling-hosted/fixture.private.json"), "utf8"),
);
assert.equal(credentials.url, url);
assert.equal(source.organizationId, "05037ba7-9094-4af7-a0df-c1057c643dac");
const dir = process.env.FREYRA_OFFLINE_QA_DIR ?? "tmp/offline-required-hosted";
assert(
  path.resolve(dir).startsWith(path.resolve("tmp") + path.sep),
  "Keep fixtures in ignored checkout tmp",
);
await fs.mkdir(dir, { recursive: true });
const fixtureFile = dir + "/fixture.private.json";
let state;
try {
  state = JSON.parse(await fs.readFile(fixtureFile, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  state = {
    run: randomUUID().slice(0, 8),
    projectId: randomUUID(),
    actionId: randomUUID(),
    templates: [randomUUID(), randomUUID()],
    requests: {},
  };
}
assert(!state.completed, "Use a fresh fixture directory for a new complete run");
const organizationId = source.organizationId;
const workerId = source.external.userId;
const scope = {
  p_organization_id: organizationId,
  p_project_id: state.projectId,
  p_action_id: state.actionId,
};
const sdk = () =>
  createClient(url, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const owner = sdk(),
  worker = sdk(),
  browserSession = sdk();
function ok(result, label) {
  if (result.error) throw new Error(label + ": " + (result.error.code ?? "failed"));
  return result.data;
}
async function saveState() {
  await fs.writeFile(fixtureFile, JSON.stringify(state, null, 2), { mode: 0o600 });
}
async function request(key) {
  state.requests[key] ??= randomUUID();
  await saveState();
  return state.requests[key];
}
async function rpc(name, args) {
  return ok(await owner.rpc(name, args), name);
}
let context, page, acceptedReceipt;
let browserCleanupFailed = false;
const errors = [];
let grantActive = false;
try {
  ok(
    await owner.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    }),
    "Owner login",
  );
  const signedWorker = ok(
    await worker.auth.signInWithPassword({
      email: source.external.email,
      password: source.external.password,
    }),
    "Worker login",
  );
  assert.equal(signedWorker.user.id, workerId);
  state.cleanupSessions = {
    owner: (await owner.auth.getSession()).data.session,
    worker: signedWorker.session,
  };
  await saveState();
  const name = "TEST Offline required cards " + state.run;
  let project = ok(
    await owner
      .from("projects")
      .select("id,name,organization_id")
      .eq("id", state.projectId)
      .maybeSingle(),
    "Project lookup",
  );
  if (!project) {
    await saveState();
    ok(
      await owner.from("projects").insert({
        id: state.projectId,
        organization_id: organizationId,
        name,
        slug: "test-offline-cards-" + state.run,
        project_type: "nature_restoration",
        status: "planning",
        description: "TEST · Syntetisk offlineprøve; ingen faktisk naturregistrering.",
      }),
      "Create isolated test project",
    );
    project = ok(
      await owner
        .from("projects")
        .select("id,name,organization_id")
        .eq("id", state.projectId)
        .single(),
      "Reopen project",
    );
  }
  assert.equal(project.name, name);
  assert.equal(project.organization_id, organizationId);
  let membership = ok(
    await owner
      .from("project_members")
      .select("id,role")
      .eq("project_id", state.projectId)
      .eq("user_id", workerId)
      .maybeSingle(),
    "Worker membership",
  );
  if (!membership)
    membership = ok(
      await owner
        .from("project_members")
        .insert({ project_id: state.projectId, user_id: workerId, role: "field" })
        .select("id,role")
        .single(),
      "Temporary field membership",
    );
  assert.equal(membership.role, "field");
  state.membershipId = membership.id;
  grantActive = true;
  assert.equal(
    ok(
      await worker.from("projects").select("id").eq("id", state.projectId),
      "Worker project access",
    ).length,
    1,
  );
  let action = ok(
    await owner.from("actions").select("id,title").eq("id", state.actionId).maybeSingle(),
    "Task lookup",
  );
  const title = "TEST · To krævede jobkort " + state.run;
  if (!action) {
    ok(
      await owner
        .from("actions")
        .insert({ id: state.actionId, project_id: state.projectId, title }),
      "Create test task",
    );
    await rpc("initialize_work_order", {
      ...scope,
      p_expected_version: 0,
      p_request_id: await request("init"),
    });
  } else assert.equal(action.title, title);
  const definitions = [
    {
      schema: "freyra.field-job-template/v1",
      title: "TEST · Artsbesøg " + state.run,
      domain: "nature",
      fields: [
        { key: "count", label: "Antal", type: "number", required: true },
        { key: "checked", label: "Kontrolleret", type: "boolean", required: true },
      ],
    },
    {
      schema: "freyra.field-job-template/v1",
      title: "TEST · Habitatbesøg " + state.run,
      domain: "nature",
      fields: [{ key: "habitat", label: "Habitat", type: "text", required: true }],
    },
  ];
  const cards = [];
  for (let i = 0; i < 2; i++) {
    let rows = ok(
      await owner
        .from("field_job_template_versions")
        .select("*")
        .eq("project_id", state.projectId)
        .eq("template_id", state.templates[i])
        .order("version"),
      "Required template",
    );
    if (!rows.length)
      rows = await rpc("save_field_job_template_version", {
        p_organization_id: organizationId,
        p_project_id: state.projectId,
        p_template_id: state.templates[i],
        p_expected_version: 0,
        p_definition: definitions[i],
        p_request_id: await request("template" + i),
      });
    const t = rows[0];
    cards.push({
      templateVersionId: t.id,
      templateId: t.template_id,
      version: t.version,
      definition: t.definition,
    });
  }
  state.cardIds = cards.map((c) => c.templateVersionId);
  let plans = ok(
    await owner
      .from("work_order_plan_versions")
      .select("*")
      .eq("project_id", state.projectId)
      .eq("action_id", state.actionId)
      .order("version"),
    "Plans",
  );
  if (!plans.length)
    plans = await rpc("save_work_order_plan", {
      ...scope,
      p_expected_version: 0,
      p_plan: {
        schema: "freyra.work-order-plan/v1",
        title,
        description: "TEST · Offline genoptagelse",
        instructions: "TEST · Læs begge jobkort før registrering.",
        profile: "nature",
        responsibleId: credentials.userId,
        siteId: null,
        watercourseVersionId: null,
        locationNote: "TEST · Syntetisk område",
        plannedStart: null,
        plannedEnd: null,
        priority: null,
        plannedMethod: "TEST · Softwareprøve",
        watercourse: null,
        requiredJobCards: cards,
      },
      p_correction_reason: "",
      p_request_id: await request("plan1"),
    });
  state.plan1 = plans[0].id;
  const assignments = ok(
    await owner
      .from("work_order_assignment_versions")
      .select("id")
      .eq("project_id", state.projectId)
      .eq("action_id", state.actionId),
    "Assignments",
  );
  if (!assignments.length)
    await rpc("configure_work_order_assignment", {
      ...scope,
      p_expected_version: 0,
      p_plan_version_id: state.plan1,
      p_mode: "person",
      p_candidate_user_ids: [workerId],
      p_source_group_version_id: null,
      p_reason: "TEST · Separat feltudfører",
      p_request_id: await request("assignment"),
    });
  await saveState();
  if (prepareOnly) {
    console.log(
      JSON.stringify({
        result: "PREPARED",
        projectId: state.projectId,
        actionId: state.actionId,
        cards: 2,
        fieldAccountDistinct: true,
      }),
    );
  } else {
    assert(process.env.FREYRA_TEST_REVISION, "Exact source revision required");
    const meta = await (await fetch(base + "/freyra-build.json")).json();
    assert.equal(meta.sourceRevision, process.env.FREYRA_TEST_REVISION);
    const records = async () =>
      ok(
        await owner
          .from("field_job_versions")
          .select("*")
          .eq("project_id", state.projectId)
          .eq("action_id", state.actionId)
          .order("version"),
        "Server registrations",
      );
    assert.equal((await records()).length, 0, "Browser test starts before any registration");
    // Chromium's IndexedDB backing-store path can exceed Windows path limits in this checkout.
    // Keep the persistent test profile private and short; preserve it for close/reopen evidence.
    const profile = path.join(os.tmpdir(), "freyra-offline-" + state.run);
    const launch = (offline = false) =>
      chromium.launchPersistentContext(profile, {
        channel: "chrome",
        headless: true,
        offline,
        viewport: { width: 390, height: 1000 },
      });
    context = await launch();
    page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(30000);
    page.on("pageerror", (e) => errors.push(e.name));
    await page.goto(base + "/login");
    await page.getByPlaceholder("dig@firma.dk").fill(source.external.email);
    await page.getByPlaceholder("••••••••", { exact: true }).fill(source.external.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname !== "/login");
    state.cleanupSessions.browser = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sb-xdvqdzdpyceojbdknofi-auth-token") ?? "null"),
    );
    assert(
      state.cleanupSessions.browser?.access_token,
      "Keep own browser session for scoped cleanup",
    );
    await saveState();
    const fieldUrl = base + "/felt?project=" + state.projectId + "&task=" + state.actionId;
    await page.goto(fieldUrl, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    console.log(JSON.stringify({ stage: "field_page_open" }));
    await page.getByRole("button", { name: "Klargør sagen til offlinebrug", exact: true }).click();
    await expect(
      page.getByText("Programfiler til offlinebrug er gemt.", { exact: true }),
    ).toBeVisible({ timeout: 150000 });
    console.log(JSON.stringify({ stage: "offline_pack_saved" }));
    const panel = () => page.getByRole("region", { name: "Jobkort på telefonen", exact: true });
    const selector = () => panel().getByLabel("Jobkort i opgavepakken", { exact: true });
    const reason = () => panel().getByLabel("Begrundelse for registreringen", { exact: true });
    const readItems = () =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("freyra-field-offline-v1", 1);
            request.onsuccess = () => {
              const db = request.result;
              const r = db.transaction("items", "readonly").objectStore("items").getAll();
              r.onsuccess = () => {
                db.close();
                resolve(r.result);
              };
              r.onerror = () => reject(new Error("Read local queue"));
            };
            request.onerror = () => reject(new Error("Open local queue"));
          }),
      );
    const localRows = async () =>
      (await readItems()).filter(
        (i) => i.projectId === state.projectId && i.actorId === workerId && i.kind === "job",
      );
    const waitLocal = async (check) => {
      await expect
        .poll(async () => check(await localRows()), { timeout: 90000, intervals: [200, 500, 1000] })
        .toBe(true);
    };
    const save = async (note) => {
      await panel()
        .getByRole("combobox", { name: /^Status/ })
        .selectOption("recorded");
      await reason().fill(note);
      await panel()
        .getByRole("button", { name: "Gem registrering på telefonen", exact: true })
        .click();
      await expect(
        page.getByText(
          "Registreringen er gemt på telefonen. Serverkvittering afventer synkronisering.",
          { exact: true },
        ),
      ).toBeVisible();
    };
    await context.setOffline(true);
    await selector().selectOption(state.cardIds[0]);
    await panel().getByRole("spinbutton", { name: /Antal/ }).fill("0");
    await panel()
      .getByRole("combobox", { name: /Kontrolleret/ })
      .selectOption("false");
    await save("TEST · Første artsbesøg");
    await selector().selectOption(state.cardIds[1]);
    await panel()
      .getByRole("textbox", { name: /Habitat/ })
      .fill("Eng");
    await save("TEST · Habitatbesøg");
    await waitLocal((rows) => rows.length === 2 && rows.every((r) => r.state === "queued"));
    console.log(JSON.stringify({ stage: "two_cards_local" }));
    assert.equal((await records()).length, 0);
    await context.close();
    context = await launch(true);
    context.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (
        pathname === "/auth/v1/user" ||
        pathname.includes("/_serverFn/") ||
        pathname.includes("/rpc/save_field_job_version")
      )
        console.log(
          JSON.stringify({ stage: "network_request", method: request.method(), pathname }),
        );
    });
    page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(30000);
    page.on("pageerror", (e) => errors.push(e.name));
    await page.goto(fieldUrl, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    await expect(panel()).toBeVisible();
    await waitLocal(
      (rows) => rows.length === 2 && rows.every((r) => r.state === "queued" && r.attempts === 0),
    );
    await expect(
      panel().getByText("Instruktion: TEST · Læs begge jobkort før registrering.", { exact: true }),
    ).toBeVisible();
    await selector().selectOption(state.cardIds[0]);
    await expect(panel().getByRole("spinbutton", { name: /Antal/ })).toHaveValue("0");
    await expect(panel().getByRole("combobox", { name: /Kontrolleret/ })).toHaveValue("false");
    await selector().selectOption(state.cardIds[1]);
    await expect(panel().getByRole("textbox", { name: /Habitat/ })).toHaveValue("Eng");
    await page.screenshot({ path: dir + "/offline-reopened-390.png", fullPage: true });
    state.offlineCloseReopen = true;
    console.log(JSON.stringify({ stage: "reopened_offline" }));
    let aborted = false,
      firstPayload;
    const payloads = [];
    await context.route("**/rest/v1/rpc/save_field_job_version_for_plan", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const payload = route.request().postDataJSON();
      payloads.push(payload);
      if (!aborted) {
        console.log(
          JSON.stringify({ stage: "intercepted_save", method: route.request().method() }),
        );
        const response = await route.fetch({ timeout: 30000 });
        console.log(JSON.stringify({ stage: "save_response", status: response.status() }));
        if (response.status() !== 200) return route.fulfill({ response });
        firstPayload = payload;
        aborted = true;
        await route.abort("failed");
      } else await route.continue();
    });
    await context.setOffline(false);
    await waitLocal((rows) => rows.some((r) => r.state === "retry"));
    assert.equal((await records()).length, 1);
    await page.getByRole("button", { name: "Prøv samme registrering igen", exact: true }).click();
    await waitLocal((rows) => rows.length === 2 && rows.every((r) => r.state === "complete"));
    const recovered = payloads.filter((p) => p.p_request_id === firstPayload.p_request_id);
    assert(recovered.length >= 2);
    assert.deepEqual(recovered[0], recovered[1]);
    let saved = await records();
    assert.equal(saved.length, 2);
    assert.deepEqual(
      saved.map((r) => r.version),
      [1, 2],
    );
    assert(saved.every((r) => r.required_plan_version_id === state.plan1));
    assert.deepEqual(saved[0].values, { count: 0, checked: false });
    assert.deepEqual(saved[1].values, { habitat: "Eng" });
    state.lostReplyRecoveredOnce = true;
    console.log(JSON.stringify({ stage: "lost_reply_recovered" }));
    await context.setOffline(true);
    await selector().selectOption(state.cardIds[0]);
    await panel().getByRole("spinbutton", { name: /Antal/ }).fill("4");
    await save("TEST · Bevar ved ændret plan");
    await waitLocal((rows) => rows.length === 3);
    const original = (await localRows()).find((r) => r.state === "queued");
    const current = plans[0];
    const updated = await rpc("save_work_order_plan", {
      ...scope,
      p_expected_version: 1,
      p_plan: { ...current.plan, instructions: "TEST · Ny instruks skal gennemgås før genbrug." },
      p_correction_reason: "TEST · Ændret instruktion under netudfald",
      p_request_id: await request("plan2"),
    });
    state.plan2 = updated[0].id;
    await saveState();
    await context.setOffline(false);
    await waitLocal((rows) => rows.some((r) => r.id === original.id && r.state === "conflict"));
    assert.equal((await records()).length, 2);
    await page.getByRole("button", { name: "Opdater sagen til offlinebrug", exact: true }).click();
    console.log(JSON.stringify({ stage: "stale_plan_rejected" }));
    await expect(
      panel().getByText("Instruktion: TEST · Ny instruks skal gennemgås før genbrug.", {
        exact: true,
      }),
    ).toBeVisible();
    await panel()
      .getByRole("button", { name: "Brug den bevarede registrering som ny kladde", exact: true })
      .click();
    await expect(panel().getByRole("spinbutton", { name: /Antal/ })).toHaveValue("4");
    await save("TEST · Gennemgået ny instruks; bevar svar");
    await waitLocal(
      (rows) =>
        rows.length === 4 &&
        rows.find((r) => r.id === original.id)?.supersededBy &&
        rows.filter((r) => r.state === "complete").length === 3,
    );
    const preserved = (await localRows()).find((r) => r.id === original.id);
    assert.equal(preserved.state, "conflict");
    assert.equal(preserved.payload.requiredPlanVersionId, state.plan1);
    assert.equal(preserved.payload.values.count, 4);
    saved = await records();
    assert.equal(saved.length, 3);
    assert.equal(saved[2].required_plan_version_id, state.plan2);
    assert.equal(saved[2].values.count, 4);
    assert.equal(
      (await localRows()).filter((r) => r.state !== "complete" && !r.supersededBy).length,
      0,
    );
    state.explicitRebasePreservesOriginal = true;
    console.log(JSON.stringify({ stage: "correction_accepted" }));
    let expectedServerVersions = 3;
    if (checkAcceptedPlanChange) {
      const nextPlan = (
        await rpc("save_work_order_plan", {
          ...scope,
          p_expected_version: 2,
          p_plan: {
            ...updated[0].plan,
            instructions: "TEST · Gennemgå allerede modtagne svar efter ny plan.",
          },
          p_correction_reason: "TEST · Ny plan efter modtaget registrering",
          p_request_id: await request("plan3"),
        })
      )[0];
      state.plan3 = nextPlan.id;
      await saveState();
      await page
        .getByRole("button", { name: "Opdater sagen til offlinebrug", exact: true })
        .click();
      await expect(
        panel().getByText("Instruktion: TEST · Gennemgå allerede modtagne svar efter ny plan.", {
          exact: true,
        }),
      ).toBeVisible();
      await panel()
        .getByRole("button", { name: "Brug den bevarede registrering som ny kladde", exact: true })
        .click();
      await expect(panel().getByRole("spinbutton", { name: /Antal/ })).toHaveValue("4");
      await save("TEST · Modtagne svar gennemgået efter endnu en plan");
      await waitLocal(
        (rows) => rows.length === 5 && rows.filter((r) => r.state === "complete").length === 4,
      );
      saved = await records();
      assert.equal(saved.length, 4);
      assert.equal(saved[3].required_plan_version_id, state.plan3);
      const received = (await localRows()).find((r) => r.receipt?.id === saved[3].id);
      assert.equal(received.supersedesId, undefined);
      const earlierReceived = (await localRows()).find((r) => r.receipt?.id === saved[2].id);
      assert.equal(earlierReceived.state, "complete");
      assert.equal(earlierReceived.supersededBy, undefined);
      expectedServerVersions = 4;
      console.log(JSON.stringify({ stage: "received_card_reused_on_new_plan" }));
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({ path: dir + "/corrected-" + width + ".png", fullPage: true });
    }
    await context.setOffline(true);
    await panel().getByRole("spinbutton", { name: /Antal/ }).fill("5");
    await save("TEST · Afvis efter tilbagekaldelse");
    await waitLocal((rows) => rows.length === expectedServerVersions + 2);
    ok(
      await owner
        .from("project_members")
        .delete()
        .eq("id", state.membershipId)
        .eq("project_id", state.projectId)
        .eq("user_id", workerId),
      "Revoke temporary field membership",
    );
    grantActive = false;
    await context.setOffline(false);
    await waitLocal((rows) => rows.some((r) => r.state === "blocked"));
    assert.equal((await records()).length, expectedServerVersions);
    assert.equal((await localRows()).filter((r) => r.state === "blocked").length, 1);
    await expect(panel().getByText(/Afklar adgangen eller fejlen/)).toBeVisible();
    assert.equal(
      (await (await fetch(base + "/freyra-build.json")).json()).sourceRevision,
      meta.sourceRevision,
    );
    assert.deepEqual(errors, []);
    acceptedReceipt = {
      schema: "freyra.offline-required-cards-staging/v1",
      result: "PASS",
      sourceRevision: meta.sourceRevision,
      run: state.run,
      projectId: state.projectId,
      actionId: state.actionId,
      fieldAccountDistinct: true,
      cards: 2,
      offlineCloseReopen: true,
      lostReplyRecoveredOnce: true,
      explicitRebasePreservesOriginal: true,
      receivedCardReusedAfterPlanChange: checkAcceptedPlanChange,
      revocationPreservesBlockedDraft: true,
      serverVersions: saved.map((r) => ({
        id: r.id,
        version: r.version,
        planVersionId: r.required_plan_version_id,
      })),
      localRows: expectedServerVersions + 2,
      expectedBlockedDrafts: 1,
      widths: [390, 1280],
      pageErrors: 0,
      physicalPhone: false,
    };
  }
} catch (error) {
  if (page && !page.isClosed()) {
    const diagnostics = async () => {
      await page
        .screenshot({ path: dir + "/failure.png", fullPage: true, timeout: 5000 })
        .catch(() => {});
      const alerts = await page
        .locator('[role="alert"]')
        .allTextContents()
        .catch(() => []);
      const state = await page
        .evaluate(async () => ({
          online: navigator.onLine,
          visibility: document.visibilityState,
          queue: await new Promise((resolve, reject) => {
            const r = indexedDB.open("freyra-field-offline-v1", 1);
            r.onsuccess = () => {
              const db = r.result;
              const q = db.transaction("items", "readonly").objectStore("items").getAll();
              q.onsuccess = () => {
                db.close();
                resolve(
                  q.result.map((i) => ({
                    id: i.id,
                    state: i.state,
                    attempts: i.attempts,
                    lastError: i.lastError,
                    updatedAt: i.updatedAt,
                    leaseUntil: i.leaseUntil,
                  })),
                );
              };
              q.onerror = () => reject(q.error);
            };
            r.onerror = () => reject(r.error);
          }),
        }))
        .catch(() => null);
      await fs.writeFile(
        dir + "/failure.private.json",
        JSON.stringify({ alerts, errors, state }, null, 2),
      );
    };
    await Promise.race([
      diagnostics().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  throw error;
} finally {
  if (state.cleanupSessions?.browser) {
    try {
      const session = state.cleanupSessions.browser;
      if (session?.access_token && session?.refresh_token) {
        ok(await browserSession.auth.setSession(session), "Own browser session");
        ok(await browserSession.auth.signOut({ scope: "local" }), "Revoke own browser session");
      }
    } catch {
      browserCleanupFailed = true;
      console.error("Browser session cleanup requires verification");
    }
  }
  if (context) await context.close();
  if (grantActive)
    ok(
      await owner
        .from("project_members")
        .delete()
        .eq("id", state.membershipId)
        .eq("project_id", state.projectId)
        .eq("user_id", workerId),
      "Cleanup temporary field membership",
    );
  const remaining = ok(
    await owner
      .from("project_members")
      .select("id")
      .eq("project_id", state.projectId)
      .eq("user_id", workerId),
    "Read back membership cleanup",
  );
  assert.equal(remaining.length, 0);
  const signedOut = await Promise.all([
    owner.auth.signOut({ scope: "local" }),
    worker.auth.signOut({ scope: "local" }),
  ]);
  signedOut.forEach((result) => ok(result, "Revoke own test session"));
  if (!browserCleanupFailed) {
    delete state.cleanupSessions;
    await saveState();
  }
  assert.equal(browserCleanupFailed, false, "Own browser session must be revoked");
}
if (acceptedReceipt) {
  acceptedReceipt.temporaryFieldMembershipsRemaining = 0;
  acceptedReceipt.ownBrowserSessionRevoked = true;
  state.completed = true;
  await fs.writeFile(dir + "/receipt.json", JSON.stringify(acceptedReceipt, null, 2));
  await saveState();
  console.log(JSON.stringify(acceptedReceipt));
}
