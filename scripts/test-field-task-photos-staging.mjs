// Exact-revision STAGING proof. Reuses existing fixture setup, uploader and task APIs.
// Synthetic photos/data only. Temporary project membership and own sessions are revoked.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

assert(process.argv.includes("--staging"), "Explicit staging flag required");
const revision = process.env.FREYRA_TEST_REVISION;
assert.match(revision ?? "", /^[a-f0-9]{40}$/, "Exact candidate revision required");
const dir = process.env.FREYRA_FIELD_PHOTO_QA_DIR ?? "tmp/field-task-photo-hosted";
assert(path.resolve(dir).startsWith(path.resolve("tmp") + path.sep));
await fs.mkdir(dir, { recursive: true });
const stateFile = dir + "/capture.private.json";
try {
  await fs.access(stateFile);
  throw Error("Use a fresh capture fixture directory");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const base =
  process.env.FREYRA_FIELD_PHOTO_QA_BASE ??
  "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const target = new URL(base);
assert.equal(target.protocol, "https:");
assert.equal(target.origin, base);
assert.match(
  target.hostname,
  /^(?:[a-f0-9]{8}-)?gofreyra-p0-staging\.gofreyra-jesri-staging\.workers\.dev$/,
);
const dbUrl = "https://xdvqdzdpyceojbdknofi.supabase.co";
assert.equal(
  (await fetch(base + "/freyra-build.json").then((r) => r.json())).sourceRevision,
  revision,
);
const original = path.resolve("../freyra-hub-bykaer");
const env = loadEnv("staging", original, "");
assert.equal(env.SUPABASE_URL, dbUrl);
const json = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const credentials = await json(
  path.join(original, "tmp/private-release/jesper-test-short-login.private.json"),
);
const source = await json(path.join(original, "tmp/samling-hosted/fixture.private.json"));
assert.equal(credentials.url, dbUrl);
assert.equal(source.organizationId, "05037ba7-9094-4af7-a0df-c1057c643dac");
execFileSync(
  process.execPath,
  ["scripts/test-offline-required-cards-staging.mjs", "--staging", "--prepare"],
  {
    env: { ...process.env, FREYRA_OFFLINE_QA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const fixture = await json(dir + "/fixture.private.json");
assert.notEqual(fixture.projectId, source.projectId);
const state = {
  run: fixture.run,
  projectId: fixture.projectId,
  actionId: fixture.actionId,
  sourceRevision: revision,
  stage: "prepared",
  sessions: {},
};
const persist = () => fs.writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
await persist();
const connect = () =>
  createClient(dbUrl, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const owner = connect(),
  worker = connect(),
  browserSession = connect();
const scope = {
  p_action_id: fixture.actionId,
  p_project_id: fixture.projectId,
  p_organization_id: source.organizationId,
};
function ok(r, label) {
  if (r.error) throw Error(label + ": " + (r.error.code ?? "unavailable"));
  return r.data;
}
const rpc = async (client, name, args = scope) => ok(await client.rpc(name, args), name);
const first = (rows) => {
  assert.equal(rows.length, 1);
  return rows[0];
};
let context, page, membership, receipt;
let temporaryReviewGrant;
const errors = [];
const profile = path.join(os.tmpdir(), "freyra-task-photo-" + fixture.run);
const launch = (offline) =>
  chromium.launchPersistentContext(profile, {
    channel: "chrome",
    timeout: 60000,
    headless: true,
    offline,
    viewport: { width: 390, height: 1000 },
  });
const fieldUrl = base + "/felt?project=" + fixture.projectId + "&task=" + fixture.actionId;
const readItems = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("freyra-field-offline-v1", 1);
        open.onerror = () => reject(Error("Queue unavailable"));
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction("items", "readonly").objectStore("items").getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => {
            db.close();
            reject(Error("Queue read failed"));
          };
        };
      }),
  );
function rememberOwnSession(kind, session) {
  const token = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url"));
  assert([credentials.userId, source.external.userId].includes(token.sub));
  assert.match(token.session_id, /^[a-f0-9-]{36}$/);
  state.sessionHistory ??= [];
  if (!state.sessionHistory.some((row) => row.sessionId === token.session_id))
    state.sessionHistory.push({ kind, sessionId: token.session_id, userId: token.sub });
}
async function revokeOwnBrowserSession(session) {
  const token = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url"));
  assert([credentials.userId, source.external.userId].includes(token.sub));
  assert.match(token.session_id, /^[a-f0-9-]{36}$/);
  const result = await browserSession.auth.admin.signOut(session.access_token, "local");
  if (result.error && ![401, 403, 404].includes(result.error.status))
    throw Error("Own browser signout unavailable");
}
async function mark(stage) {
  state.stage = stage;
  await persist();
  console.log(JSON.stringify({ stage, run: fixture.run }));
}
async function localOriginalHash(id) {
  return page.evaluate(
    ({ actorId, id }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("freyra-field-offline-v1", 1);
        open.onerror = () => reject(Error("Original store unavailable"));
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction("blobs", "readonly").objectStore("blobs").get([actorId, id]);
          read.onerror = () => {
            db.close();
            reject(Error("Original unavailable"));
          };
          read.onsuccess = () => {
            db.close();
            const blob = read.result?.blob;
            if (!blob) {
              resolve(null);
              return;
            }
            blob
              .arrayBuffer()
              .then((bytes) => crypto.subtle.digest("SHA-256", bytes))
              .then(
                (hash) =>
                  resolve(
                    Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
                      "",
                    ),
                  ),
                reject,
              );
          };
        };
      }),
    { actorId: source.external.userId, id },
  );
}
async function loginPage(identity) {
  await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("dig@firma.dk").fill(identity.email);
  await page.getByPlaceholder("••••••••", { exact: true }).fill(identity.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname !== "/login");
  const session = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sb-xdvqdzdpyceojbdknofi-auth-token") ?? "null"),
  );
  assert(session?.access_token);
  assert.equal(session.user.id, identity.userId);
  rememberOwnSession("browser", session);
  state.sessions.browser = session;
  await persist();
}
async function openMyTask() {
  await page.goto(base + "/opgaver", { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: "Find opgave efter titel" }).fill(fixture.run);
  await page.getByRole("button", { name: "Søg", exact: true }).click();
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "TEST · To krævede jobkort " + fixture.run,
      exact: true,
    }),
  });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Åbn opgave", exact: true }).click();
  await expect(
    card.getByRole("region", { name: "Opgavens instruktion", exact: true }),
  ).toBeVisible();
  return card;
}
async function documentation(card) {
  const toggle = card.locator("summary").filter({ hasText: /^Dokumentation$/ });
  await toggle.click();
  const panel = card.getByRole("region", { name: "Opgavens dokumentation", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}
try {
  const ownerLogin = ok(
    await owner.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    }),
    "Owner login",
  );
  const workerLogin = ok(
    await worker.auth.signInWithPassword({
      email: source.external.email,
      password: source.external.password,
    }),
    "Worker login",
  );
  assert.equal(ownerLogin.user.id, credentials.userId);
  assert.equal(workerLogin.user.id, source.external.userId);
  assert.notEqual(ownerLogin.user.id, workerLogin.user.id);
  rememberOwnSession("owner", ownerLogin.session);
  rememberOwnSession("worker", workerLogin.session);
  state.sessions.owner = ownerLogin.session;
  state.sessions.worker = workerLogin.session;
  await persist();
  membership = first(
    ok(
      await owner
        .from("project_members")
        .insert({ project_id: fixture.projectId, user_id: source.external.userId, role: "field" })
        .select("id,role"),
      "Own temporary field membership",
    ),
  );
  state.membershipId = membership.id;
  await persist();
  const photo = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#27543D" },
  })
    .png()
    .toBuffer();
  const sha256 = createHash("sha256").update(photo).digest("hex");
  await mark("launching_browser");
  context = await launch(false);
  await mark("browser_launched");
  page = await context.newPage();
  for (const tab of context.pages()) if (tab !== page) await tab.close();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.name));
  await loginPage(source.external);
  const ownTasks = await rpc(worker, "search_my_work_orders", {
    p_after_action_id: null,
    p_page_size: 20,
    p_filter: "all",
    p_search: fixture.run,
  });
  const assignedTask = ownTasks.find((row) => row.action_id === fixture.actionId);
  assert(assignedTask);
  assert.equal(assignedTask.can_execute, true);
  assert.equal(assignedTask.can_plan, false);
  const initialTask = await openMyTask();
  await expect(
    initialTask.getByRole("link", { name: "Fotos og jobkort på opgaven", exact: true }),
  ).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await initialTask.scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/my-task-" + width + ".png" });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await initialTask.getByRole("link", { name: "Fotos og jobkort på opgaven", exact: true }).click();
  await page.waitForURL(
    (u) =>
      u.pathname === "/felt" &&
      u.searchParams.get("task") === fixture.actionId &&
      u.searchParams.get("project") === fixture.projectId,
  );
  await page.getByRole("button", { name: "Klargør sagen til offlinebrug", exact: true }).click();
  await expect(
    page.getByText("Programfiler til offlinebrug er gemt.", { exact: true }),
  ).toBeVisible({ timeout: 150000 });
  await mark("field_ready");
  const photos = () => page.getByRole("region", { name: "Feltfotos på telefonen", exact: true });
  const jobs = () => page.getByRole("region", { name: "Jobkort på telefonen", exact: true });
  await expect(photos().getByRole("radio", { name: /Opgaven:/ })).toBeChecked();
  await expect(photos().getByRole("button", { name: "Tag foto", exact: true })).toBeEnabled();
  await context.setOffline(true);
  await photos()
    .getByLabel("Tag originalfoto til feltkøen", { exact: true })
    .setInputFiles({
      name: "TEST-capture-" + fixture.run + ".png",
      mimeType: "image/png",
      buffer: photo,
    });
  await expect(photos().getByRole("status")).toHaveText("1 af 1 originaler er gemt på telefonen.");
  const selector = jobs().getByLabel("Jobkort i opgavepakken", { exact: true });
  await selector.selectOption(fixture.cardIds[0]);

  await jobs()
    .getByLabel(/Antal.*nødvendigt/)
    .fill("0");
  await jobs()
    .getByLabel(/Kontrolleret.*nødvendigt/)
    .selectOption("false");
  await jobs()
    .getByRole("combobox", { name: /^Status/ })
    .selectOption("recorded");
  await jobs()
    .getByLabel("Begrundelse for registreringen", { exact: true })
    .fill("TEST · Artsbesøg med original");
  await jobs().getByRole("button", { name: "Gem registrering på telefonen", exact: true }).click();
  await selector.selectOption(fixture.cardIds[1]);
  await jobs()
    .getByLabel(/Habitat.*nødvendigt/)
    .fill("TEST · Syntetisk habitat");
  await jobs()
    .getByRole("combobox", { name: /^Status/ })
    .selectOption("recorded");
  await jobs()
    .getByLabel("Begrundelse for registreringen", { exact: true })
    .fill("TEST · Habitatbesøg med original");
  await jobs().getByRole("button", { name: "Gem registrering på telefonen", exact: true }).click();
  await expect.poll(async () => (await readItems()).length).toBe(3);
  await mark("offline_saved");
  const before = await readItems();
  const capture = before.find((i) => i.kind === "photo");
  assert(capture);
  state.uploadId = capture.id;
  await persist();
  assert.deepEqual(capture.payload.workOrder, {
    schema: "freyra.field-photo-work-order/v1",
    organizationId: source.organizationId,
    actionId: fixture.actionId,
    planVersionId: fixture.plan1,
  });
  assert.equal(capture.payload.sha256, sha256);
  assert.equal(await localOriginalHash(capture.id), sha256);
  await page.goto("about:blank");
  for (const tab of context.pages()) if (tab !== page) await tab.close();
  await context.close();
  context = undefined;
  context = await launch(true);
  page = await context.newPage();
  for (const tab of context.pages()) if (tab !== page) await tab.close();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.name));
  await page.goto(fieldUrl, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await readItems()).length).toBe(3);
  await expect(page.getByRole("heading", { name: "Freyra i felten", exact: true })).toBeVisible();
  await expect(jobs().getByRole("combobox", { name: /^Opgave/ })).toHaveValue(fixture.actionId);
  await expect(jobs().getByLabel(/Antal.*nødvendigt/)).toHaveValue("0");
  await expect(jobs().getByLabel(/Kontrolleret.*nødvendigt/)).toHaveValue("false");
  await expect(page.getByRole("heading", { name: /Telefonens kø.*3 afventer/ })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const reopened = await readItems();
  assert(reopened.every((i) => i.attempts === 0));
  assert.deepEqual(reopened.find((i) => i.kind === "photo").payload, capture.payload);
  assert.equal(await localOriginalHash(capture.id), sha256);
  await page.screenshot({ path: dir + "/offline-reopened.png", fullPage: true });
  await mark("offline_reopened");
  let lost = false;
  await page.route("**/rest/v1/rpc/finalize_field_photo_upload", async (route) => {
    const response = await route.fetch();
    if (response.ok() && !lost) {
      lost = true;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => lost, { timeout: 120000 }).toBe(true);
  await expect
    .poll(async () => (await readItems()).find((i) => i.kind === "photo")?.state, {
      timeout: 60000,
    })
    .toBe("retry");
  const pending = await readItems();
  assert.equal(
    pending.find((i) => i.kind === "photo").payload.workOrder.actionId,
    fixture.actionId,
  );
  assert.equal(await localOriginalHash(capture.id), sha256);
  await page.getByRole("button", { name: "Prøv samme registrering igen", exact: true }).click();
  await expect
    .poll(async () => (await readItems()).filter((i) => i.state === "complete").length, {
      timeout: 150000,
    })
    .toBe(3);
  assert.equal(await localOriginalHash(capture.id), null);
  await mark("original_received");
  const uploads = ok(
    await owner
      .from("field_photo_uploads")
      .select("*")
      .eq("id", capture.id)
      .eq("project_id", fixture.projectId),
    "Exact captured original",
  );
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].captured_action_id, fixture.actionId);
  assert.equal(uploads[0].captured_plan_version_id, fixture.plan1);
  const verified = first(
    ok(
      await owner.from("field_photo_receipts").select("*").eq("upload_id", capture.id),
      "Byte receipt",
    ),
  );
  assert.equal(verified.status, "verified");
  assert.equal(verified.sha256, sha256);
  const records = ok(
    await owner
      .from("field_job_versions")
      .select("*")
      .eq("project_id", fixture.projectId)
      .eq("action_id", fixture.actionId)
      .order("version"),
    "Server cards",
  );
  assert.equal(records.length, 2);
  assert.equal(records[0].values.count, 0);
  assert.equal(records[0].values.checked, false);
  let myTask = await openMyTask();
  let evidencePanel = await documentation(myTask);
  await expect(
    page.getByRole("region", { name: "Fotos optaget til opgaven", exact: true }),
  ).toContainText(capture.payload.title);
  const popupReady = context.waitForEvent("page");
  await page
    .getByRole("button", { name: "Åbn optaget original: " + capture.payload.title, exact: true })
    .click();
  const originalTab = await popupReady;
  await originalTab.waitForURL(
    (u) => u.origin === dbUrl && u.pathname.startsWith("/storage/v1/object/sign/"),
  );
  const originalBytes = Buffer.from(
    await (await fetch(originalTab.url(), { redirect: "error" })).arrayBuffer(),
  );
  assert.equal(createHash("sha256").update(originalBytes).digest("hex"), sha256);
  await originalTab.close();
  await mark("original_opened");
  const assignment = first(
    ok(
      await owner
        .from("work_order_assignment_versions")
        .select("*")
        .eq("action_id", fixture.actionId),
      "Assignment",
    ),
  );
  await myTask.getByRole("link", { name: "Registrér udført arbejde", exact: true }).click();
  await page.waitForURL(
    (u) =>
      u.searchParams.get("task") === fixture.actionId && u.searchParams.get("work") === "execution",
  );
  const executionPanel = page.getByRole("region", { name: "Faktisk udførelse", exact: true });
  await executionPanel
    .getByRole("button", { name: "Åbn udførelsesregistrering", exact: true })
    .click();
  await executionPanel
    .getByRole("combobox", { name: /^Registreringstype/ })
    .selectOption("synthetic");
  await executionPanel.getByRole("combobox", { name: /^Status/ }).selectOption("performed");
  await executionPanel.getByRole("combobox", { name: /^Indsats/ }).selectOption("other");
  await executionPanel.getByLabel("Faktisk startdato", { exact: true }).fill("2026-11-04");
  await executionPanel
    .getByLabel("Faktisk metode – tomt felt betyder uafklaret", { exact: true })
    .fill("TEST · Softwareprøve");
  await executionPanel
    .getByLabel("Udført delstrækning og stedreference", { exact: true })
    .fill("TEST · Syntetisk område");
  await executionPanel
    .getByLabel("Arbejdslog, feltregistrering eller anden udførelseskilde", { exact: true })
    .fill("TEST · Offline optagelse");
  await executionPanel
    .getByRole("combobox", { name: /^Faktisk undersøgelsesdækning/ })
    .selectOption("limited");
  await executionPanel
    .getByLabel("Faktisk dækning, metode og begrænsninger", { exact: true })
    .fill("TEST · Kun syntetiske data");
  await executionPanel.getByRole("button", { name: "Gem udførelsesversion", exact: true }).click();
  await expect(
    executionPanel.getByText(/^Udførelsesregistrering gemt som version 1\./),
  ).toBeVisible();
  const execution = first(
    ok(
      await worker
        .from("work_order_execution_bindings")
        .select("*")
        .eq("action_id", fixture.actionId)
        .eq("project_id", fixture.projectId),
      "Browser execution binding",
    ),
  );
  assert.equal(execution.performed_by_id, source.external.userId);
  assert.equal(execution.plan_version_id, fixture.plan1);
  myTask = await openMyTask();
  evidencePanel = await documentation(myTask);
  for (const record of records) {
    await evidencePanel
      .getByRole("button", { name: "Knyt til registrering: " + capture.payload.title, exact: true })
      .click();
    await evidencePanel
      .getByRole("combobox", { name: /^Gemt feltregistrering/ })
      .selectOption(record.id);
    await expect(
      evidencePanel.getByRole("combobox", { name: /^Verificeret originalfoto/ }),
    ).toHaveValue(capture.id);
    await evidencePanel
      .getByRole("combobox", { name: /^Udført arbejde/ })
      .selectOption(execution.workspace_entry_id);
    await evidencePanel
      .getByLabel("Begrundelse", { exact: true })
      .fill("TEST · Opgavefoto underbygger gemt registrering");
    await evidencePanel.getByRole("button", { name: "Gem dokumentation", exact: true }).click();
    await expect(
      evidencePanel.getByRole("heading", { name: "Ny kobling", exact: true }),
    ).toHaveCount(0);
  }
  await mark("execution_and_evidence_saved_in_browser");
  for (const status of ["draft", "planned", "assigned", "started", "performed"]) {
    const c = first(await rpc(owner, "get_work_order_lifecycle_context"));
    await rpc(
      status === "started" || status === "performed" ? worker : owner,
      "mutate_work_order_lifecycle",
      {
        ...scope,
        p_expected_version: c.state?.version ?? 0,
        p_values: {
          operation: "transition",
          targetStatus: status,
          planVersionId: fixture.plan1,
          assignmentVersionId: assignment.id,
          executionRevisionId: execution.workspace_entry_id,
          ...(status === "started"
            ? {
                startedAt: new Date(Date.now() - 60000).toISOString(),
                startedSource: "TEST · Syntetisk start",
              }
            : {}),
        },
        p_request_id: randomUUID(),
      },
    );
  }
  const ready = await rpc(worker, "get_work_order_submission_context");
  assert.deepEqual(ready.gaps, []);
  myTask = await openMyTask();
  await myTask.getByRole("button", { name: "Gå til aflevering", exact: true }).click();
  await myTask
    .getByLabel("Bemærkning til afleveringen", { exact: true })
    .fill("TEST · Offlinefoto og to krævede jobkort");
  await myTask.getByRole("button", { name: "Gem afleveringsversion", exact: true }).click();
  await expect(
    myTask.getByRole("heading", { name: "Afleveringsversion 1", exact: true }),
  ).toBeVisible();
  const submission = first(
    await rpc(worker, "list_work_order_submissions", {
      ...scope,
      p_before_version: null,
      p_page_size: 5,
    }),
  );
  for (const evidence of submission.snapshot.evidence) {
    assert.equal(evidence.original_snapshot.sha256, sha256);
    assert.deepEqual(evidence.original_snapshot.workOrder, capture.payload.workOrder);
  }
  const toSubmit = await rpc(worker, "get_work_order_review_context");
  assert.equal(toSubmit.can_submit, true);
  await myTask.getByRole("button", { name: "Aflevér til gennemgang", exact: true }).click();
  await myTask
    .getByLabel("Begrundelse for afleveringshandlingen", { exact: true })
    .fill("TEST · Send det fastholdte grundlag til teknisk gennemgang");
  await myTask.getByRole("button", { name: "Gem afleveringshandling", exact: true }).click();
  await expect
    .poll(async () => (await rpc(worker, "get_work_order_review_context")).state.status)
    .toBe("submitted");
  await mark("submitted");
  const previousReview = await rpc(owner, "get_work_order_access_history", {
    ...scope,
    p_user_id: credentials.userId,
    p_before_version: null,
    p_page_size: 1,
  });
  assert(!previousReview[0]?.active, "Do not replace an unrelated review grant");
  temporaryReviewGrant = first(
    await rpc(owner, "save_work_order_access", {
      ...scope,
      p_user_id: credentials.userId,
      p_expected_version: previousReview[0]?.version ?? 0,
      p_active: true,
      p_can_execute: false,
      p_can_review: true,
      p_reason: "TEST · Midlertidig uafhængig gennemgang",
      p_request_id: randomUUID(),
    }),
  );
  state.temporaryReviewGrant = {
    id: temporaryReviewGrant.id,
    version: temporaryReviewGrant.version,
  };
  await persist();
  const review = await rpc(owner, "get_work_order_review_context");
  assert.equal(review.can_review, true);
  assert.equal(review.self_review, false);
  await rpc(owner, "mutate_work_order_lifecycle", {
    ...scope,
    p_expected_version: review.state.version,
    p_request_id: randomUUID(),
    p_values: {
      operation: "review",
      targetStatus: "approved",
      submissionVersionId: submission.id,
      planVersionId: submission.plan_version_id,
      assignmentVersionId: submission.assignment_version_id,
      executionRevisionId: submission.execution_revision_id,
      reviewScope: "execution_and_documentation",
      reason: "TEST · Teknisk kilde- og versionsprøve. Ingen faglig naturgodkendelse.",
    },
  });
  const approved = await rpc(owner, "get_work_order_review_context");
  assert.equal(approved.state.status, "approved");
  await mark("reviewed");
  const reportInput = { ...scope, p_submission_id: submission.id, p_review_id: approved.state.id };
  const report = await rpc(owner, "save_approved_work_order_report", reportInput);
  assert.deepEqual(await rpc(owner, "save_approved_work_order_report", reportInput), report);
  assert.equal(report.content.workOrderApproval.executionDataBasis, "synthetic");
  assert.equal(report.content.workOrderApproval.executionRevisionId, execution.workspace_entry_id);
  assert.equal(report.content.workOrderApproval.submissionId, submission.id);
  assert.equal(report.content.sources.length, 2);
  assert(report.content.sources.every((s) => s.checksum === sha256));
  await page.evaluate(() => {
    localStorage.removeItem("sb-xdvqdzdpyceojbdknofi-auth-token");
    localStorage.removeItem("freyra-field-device-v1");
  });
  state.stage = "report_created";
  state.submissionId = submission.id;
  state.reportId = report.report_id;
  await persist();
  await page.goto("about:blank");
  await context.close();
  context = undefined;
  if (state.sessions.browser) {
    await revokeOwnBrowserSession(state.sessions.browser);
    delete state.sessions.browser;
    await persist();
  }
  context = await chromium.launchPersistentContext(
    path.join(os.tmpdir(), "freyra-task-report-" + fixture.run),
    { channel: "chrome", headless: true, viewport: { width: 390, height: 1000 } },
  );
  page = await context.newPage();
  for (const tab of context.pages()) if (tab !== page) await tab.close();
  page.setDefaultTimeout(30000);
  await loginPage(credentials);
  const taskUrl =
    base +
    "/app/projects/" +
    fixture.projectId +
    "?tab=handlinger&task=" +
    fixture.actionId +
    "&work=submission";
  await page.goto(taskUrl);
  await page
    .getByRole("button", {
      name: "Klargør rapportkladde for afleveringsversion " + submission.version,
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Åbn den gemte rapport", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/app/reports/preview");
  assert.equal(new URL(page.url()).searchParams.get("report"), report.report_id);
  await page
    .getByText(
      new RegExp("^Grundlag · Godkendt afleveringsversion " + submission.version + "(?![0-9])"),
    )
    .waitFor();
  const classification = page.getByRole("status", {
    name: "Udførelsens datagrundlag",
    exact: true,
  });
  await expect(classification).toContainText("Syntetiske prøvedata");
  await expect(classification).toContainText("ikke en faktisk naturindsats");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: dir + "/report-" + width + ".png" });
    await classification.scrollIntoViewIfNeeded();
    await page.screenshot({ path: dir + "/report-classification-" + width + ".png" });
  }
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const pdf = await downloading;
  const pdfBytes = await fs.readFile(await pdf.path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  await pdf.saveAs(dir + "/report.pdf");
  const reportExports = {};
  for (const [format, label] of [
    ["docx", "DOCX"],
    ["csv", "CSV"],
    ["geojson", "GEOJSON"],
    ["references.zip", "Hent PDF og kildepakke fra denne version"],
    ["originals.zip", "Hent ZIP med verificerede originalfotos"],
  ]) {
    const completed = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const downloaded = await completed;
    assert.equal(await downloaded.failure(), null);
    const bytes = await fs.readFile(await downloaded.path());
    assert(bytes.length > 0 && bytes.length < 27 * 1024 * 1024);
    await downloaded.saveAs(dir + "/report." + format);
    reportExports[format] = {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  await fs.writeFile(
    dir + "/report-export-expected.json",
    JSON.stringify(
      {
        reportId: report.report_id,
        revisionId: report.id,
        executionRevisionId: execution.workspace_entry_id,
        dataBasis: "synthetic",
        approval: report.content.workOrderApproval,
        sources: report.content.sources,
        originalSha256: sha256,
        pdfSha256: createHash("sha256").update(pdfBytes).digest("hex"),
        downloaded: reportExports,
      },
      null,
      2,
    ),
  );
  const legacy = await json("docs/field-task-handoff-staging-receipt-2026-11-04.json");
  assert.notEqual(legacy.reportId, report.report_id);
  const legacyRows = async () =>
    ok(
      await owner.from("report_revisions").select("*").eq("report_id", legacy.reportId),
      "Historical report readback",
    );
  const legacyBefore = first(await legacyRows());
  assert.equal(legacyBefore.content.workOrderApproval.executionDataBasis, undefined);
  await page.goto(
    base +
      "/app/projects/" +
      legacy.projectId +
      "?tab=handlinger&task=" +
      legacy.actionId +
      "&work=submission",
  );
  await page
    .getByRole("button", { name: "Klargør rapportkladde for afleveringsversion 1", exact: true })
    .click();
  await page.getByRole("link", { name: "Åbn den gemte rapport", exact: true }).click();
  await page.waitForURL(
    (u) =>
      u.pathname === "/app/reports/preview" && u.searchParams.get("report") === legacy.reportId,
  );
  await expect(
    page.getByRole("status", { name: "Udførelsens datagrundlag", exact: true }),
  ).toContainText("Registreringstype ikke gemt i rapportversionen");
  const oldDownloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const oldPdf = await oldDownloading;
  const oldBytes = await fs.readFile(await oldPdf.path());
  assert.equal(createHash("sha256").update(oldBytes).digest("hex"), legacy.pdfSha256);
  assert.deepEqual(first(await legacyRows()), legacyBefore);
  await oldPdf.saveAs(dir + "/historical-report.pdf");
  assert.equal(
    (await fetch(base + "/freyra-build.json", { cache: "no-store" }).then((r) => r.json()))
      .sourceRevision,
    revision,
  );
  assert.deepEqual(errors, []);
  receipt = {
    schema: "freyra.field-task-photo-staging/v1",
    result: "PASS",
    sourceRevision: revision,
    testedBase: base,
    entry: "my-work-orders",
    fieldUserWithoutPlanningAccess: true,
    browserExecutionAndEvidence: true,
    browserSubmission: true,
    reportExecutionDataBasis: report.content.workOrderApproval.executionDataBasis,
    reportExecutionRevisionId: report.content.workOrderApproval.executionRevisionId,
    historicalReportId: legacy.reportId,
    historicalReportUnchanged: true,
    historicalPdfSha256: legacy.pdfSha256,
    run: fixture.run,
    projectId: fixture.projectId,
    actionId: fixture.actionId,
    uploadId: capture.id,
    capturedPlanId: fixture.plan1,
    sha256,
    offlineCloseReopen: true,
    offlineTaskVisibleBeforeReconnect: true,
    lostUploadReplyRecoveredOnce: true,
    fieldAccountDistinct: true,
    originalOpenedAndHashMatched: true,
    requiredCards: records.length,
    submissionId: submission.id,
    reportId: report.report_id,
    reportWidths: [390, 1280],
    pdfSha256: createHash("sha256").update(pdfBytes).digest("hex"),
    browserDownloadedExports: reportExports,
    independentExportValidation: "pending scripts/check-work-order-report-exports.py",
    physicalPhoneAccepted: false,
  };
} catch (error) {
  await Promise.race([
    (async () => {
      if (page && !page.isClosed()) {
        state.failurePage = {
          url: page.url().replace(/token=[^&]+/g, "token=[REDACTED_SECRET]"),
          title: await page.title().catch(() => "unavailable"),
        };
        await page.screenshot({ path: dir + "/failure.png" }).catch(() => {});
      }
    })(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  state.stage = "failed";
  state.error = String(error.message)
    .replaceAll(credentials.password, "[REDACTED_SECRET]")
    .replaceAll(source.external.password, "[REDACTED_SECRET]")
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "[REDACTED_SECRET]")
    .slice(0, 2000);
  await persist();
  throw Error(state.error);
} finally {
  const failures = [];
  const step = async (label, run) => {
    try {
      await run();
    } catch {
      failures.push(label);
    }
  };
  state.cleanupSessionIds =
    state.sessionHistory ??
    Object.values(state.sessions ?? {}).map((session) => {
      const token = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url"));
      return { sessionId: token.session_id, userId: token.sub };
    });
  await step("browser_session", async () => {
    if (state.sessions.browser) {
      await revokeOwnBrowserSession(state.sessions.browser);
      delete state.sessions.browser;
    }
  });
  await step("browser_close", async () => {
    if (context) {
      if (page && !page.isClosed() && new URL(page.url()).origin === base)
        await page.evaluate(() => {
          localStorage.removeItem("sb-xdvqdzdpyceojbdknofi-auth-token");
          localStorage.removeItem("freyra-field-device-v1");
        });
      await context.close();
    }
  });
  await step("review_grant", async () => {
    if (temporaryReviewGrant) {
      let history = await rpc(owner, "get_work_order_access_history", {
        ...scope,
        p_user_id: credentials.userId,
        p_before_version: null,
        p_page_size: 1,
      });
      assert(history[0]);
      if (history[0].active) {
        assert.equal(history[0].id, temporaryReviewGrant.id);
        await rpc(owner, "save_work_order_access", {
          ...scope,
          p_user_id: credentials.userId,
          p_expected_version: history[0].version,
          p_active: false,
          p_can_execute: false,
          p_can_review: false,
          p_reason: "TEST · Luk midlertidig gennemgang",
          p_request_id: randomUUID(),
        });
      }
      history = await rpc(owner, "get_work_order_access_history", {
        ...scope,
        p_user_id: credentials.userId,
        p_before_version: null,
        p_page_size: 1,
      });
      assert.equal(history[0].active, false);
      assert.equal(history[0].can_review, false);
      delete state.temporaryReviewGrant;
    }
  });
  await step("field_membership", async () => {
    if (membership)
      ok(
        await owner
          .from("project_members")
          .delete()
          .eq("id", membership.id)
          .eq("project_id", fixture.projectId)
          .eq("user_id", source.external.userId)
          .eq("role", "field"),
        "Remove own field membership",
      );
    const remaining = ok(
      await owner
        .from("project_members")
        .select("id")
        .eq("project_id", fixture.projectId)
        .eq("user_id", source.external.userId),
      "Membership cleanup readback",
    );
    assert.equal(remaining.length, 0);
  });
  await step("owner_session", async () =>
    ok(await owner.auth.signOut({ scope: "local" }), "Own owner signout"),
  );
  await step("worker_session", async () =>
    ok(await worker.auth.signOut({ scope: "local" }), "Own worker signout"),
  );
  state.cleanupFailures = failures;
  if (!failures.length) state.sessions = {};
  await persist();
  assert.deepEqual(failures, [], "Own cleanup must finish");
}

if (receipt) {
  receipt.temporaryFieldMembershipsRemaining = 0;
  receipt.temporaryReviewGrantsRemaining = 0;
  receipt.ownSessionsRevoked = true;
  state.stage = "complete";
  await persist();
  await fs.writeFile(dir + "/receipt.json", JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
