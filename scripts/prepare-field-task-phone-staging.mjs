// Owned, synthetic phone demo. Existing fixture APIs and normal actor permissions only.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
assert(process.argv.includes("--staging"));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev",
  url = "https://xdvqdzdpyceojbdknofi.supabase.co";
const revision = process.env.FREYRA_TEST_REVISION;
assert.match(revision ?? "", /^[a-f0-9]{40}$/);
assert.equal(
  (await fetch(base + "/freyra-build.json").then((r) => r.json())).sourceRevision,
  revision,
);
const dir = "tmp/field-task-phone-ready",
  out = dir + "/phone-ready.json",
  privateFile = dir + "/phone.private.json";
await fs.mkdir(dir, { recursive: true });
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const original = "../freyra-hub-bykaer";
const env = loadEnv("staging", original, "");
assert.equal(env.SUPABASE_URL, url);
const credentials = await read(
    original + "/tmp/private-release/jesper-test-short-login.private.json",
  ),
  source = await read(original + "/tmp/samling-hosted/fixture.private.json");
assert.equal(credentials.url, url);
let existing;
try {
  existing = await read(out);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (!existing)
  execFileSync(
    process.execPath,
    ["scripts/test-offline-required-cards-staging.mjs", "--staging", "--prepare"],
    { env: { ...process.env, FREYRA_OFFLINE_QA_DIR: dir }, stdio: ["ignore", "pipe", "pipe"] },
  );
const fixture = await read(dir + "/fixture.private.json");
assert.notEqual(fixture.projectId, source.projectId);
let state;
try {
  state = await read(privateFile);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  state = {};
}
const persist = () => fs.writeFile(privateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
const owner = createClient(url, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ok = (r, l) => {
  if (r.error) throw Error(l + ":" + (r.error.code ?? "unavailable"));
  return r.data;
};
const rpc = async (name, args = scope) => ok(await owner.rpc(name, args), name);
const scope = {
  p_action_id: fixture.actionId,
  p_project_id: fixture.projectId,
  p_organization_id: source.organizationId,
};
const name = "TEST · Telefonprøve – opgavefotos",
  taskTitle = "TEST · Dokumentér arbejdet på telefonen";
const screens = "docs/screens/field-task-photos";
await fs.mkdir(screens, { recursive: true });
let context, page, metadata;
const profile = path.join(os.tmpdir(), "freyra-phone-ready-" + fixture.run);
const launch = (offline) =>
  chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    timeout: 60000,
    offline,
    viewport: { width: 390, height: 1000 },
  });
const ownSessionId = (s) => {
  const t = JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url"));
  assert.equal(t.sub, credentials.userId);
  return t.session_id;
};
try {
  const signed = ok(
    await owner.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    }),
    "Owner login",
  );
  assert.equal(signed.user.id, credentials.userId);
  state.ownerSession = signed.session;
  state.ownerSessionId = ownSessionId(signed.session);
  await persist();
  const project = ok(
    await owner
      .from("projects")
      .select("id,name,organization_id")
      .eq("id", fixture.projectId)
      .single(),
    "Own demo project",
  );
  assert.equal(project.organization_id, source.organizationId);
  assert(project.name.includes("TEST"));
  if (!existing) {
    ok(
      await owner
        .from("projects")
        .update({
          name,
          description:
            "TEST · Telefonens kamera, lokal lagring og opgavekobling. Ingen faktisk naturvurdering.",
        })
        .eq("id", fixture.projectId)
        .eq("organization_id", source.organizationId),
      "Phone project title",
    );
    ok(
      await owner
        .from("actions")
        .update({ title: taskTitle })
        .eq("id", fixture.actionId)
        .eq("project_id", fixture.projectId),
      "Phone task title",
    );
    const plans = ok(
      await owner
        .from("work_order_plan_versions")
        .select("*")
        .eq("action_id", fixture.actionId)
        .eq("project_id", fixture.projectId)
        .order("version", { ascending: false })
        .limit(1),
      "Own plan",
    );
    assert(plans[0]);
    state.planInput ??= {
      ...scope,
      p_expected_version: plans[0].version,
      p_plan: {
        ...plans[0].plan,
        title: taskTitle,
        description: "TEST · Prøv telefonens foto og de to jobkort.",
        instructions:
          "Dette er en softwareprøve. Tag et ufølsomt prøvefoto til denne opgave. Udfyld Artsbesøg og Habitatbesøg, og gem dem på telefonen. Brug samme login, når du sender registreringerne.",
        responsibleId: credentials.userId,
        locationNote: "TEST · Selvvalgt prøvested; ingen faktisk naturindsats er dokumenteret.",
      },
      p_correction_reason: "TEST · Klargør særskilt telefonprøve",
      p_request_id: randomUUID(),
    };
    await persist();
    const plan = (await rpc("save_work_order_plan", state.planInput))[0];
    assert(plan);
    const assignments = ok(
      await owner
        .from("work_order_assignment_versions")
        .select("id,version")
        .eq("action_id", fixture.actionId)
        .eq("project_id", fixture.projectId)
        .order("version", { ascending: false })
        .limit(1),
      "Own assignment",
    );
    assert(assignments[0]);
    state.assignmentInput ??= {
      ...scope,
      p_expected_version: assignments[0].version,
      p_plan_version_id: plan.id,
      p_mode: "person",
      p_candidate_user_ids: [credentials.userId],
      p_source_group_version_id: null,
      p_reason: "TEST · Produktejerens egen telefonprøve",
      p_request_id: randomUUID(),
    };
    await persist();
    const assignment = (await rpc("configure_work_order_assignment", state.assignmentInput))[0];
    assert(assignment);
    metadata = {
      schema: "freyra.field-phone-ready/v1",
      sourceRevision: revision,
      projectId: fixture.projectId,
      actionId: fixture.actionId,
      projectName: name,
      taskTitle,
      planVersion: plan.version,
      assignmentVersion: assignment.version,
      fieldUrl: base + "/felt?project=" + fixture.projectId + "&task=" + fixture.actionId,
      taskUrl:
        base +
        "/app/projects/" +
        fixture.projectId +
        "?tab=handlinger&task=" +
        fixture.actionId +
        "&work=field",
      physicalPhoneAccepted: false,
    };
    await fs.writeFile(out, JSON.stringify(metadata, null, 2));
  } else metadata = existing;
  const access = await rpc("get_work_order_photo_capture_access");
  assert.equal(access.actorId, credentials.userId);
  assert.equal(access.canCapture, true);
  assert.equal(
    ok(
      await owner
        .from("project_members")
        .select("id")
        .eq("project_id", fixture.projectId)
        .eq("user_id", source.external.userId),
      "Temporary setup membership readback",
    ).length,
    0,
  );
  context = await launch(false);
  page = await context.newPage();
  for (const tab of context.pages()) if (tab !== page) await tab.close();
  page.setDefaultTimeout(30000);
  await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("dig@firma.dk").fill(credentials.email);
  await page.getByPlaceholder("••••••••", { exact: true }).fill(credentials.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname !== "/login");
  state.browserSession = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sb-xdvqdzdpyceojbdknofi-auth-token") ?? "null"),
  );
  assert(state.browserSession?.access_token);
  state.browserSessionId = ownSessionId(state.browserSession);
  await persist();
  await page.goto(metadata.fieldUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^(Klargør|Opdater) sagen til offlinebrug$/ }).click();
  await expect(
    page.getByText("Programfiler til offlinebrug er gemt.", { exact: true }),
  ).toBeVisible({ timeout: 150000 });
  await context.setOffline(true);
  await page.goto("about:blank");
  for (const tab of context.pages()) if (tab !== page) await tab.close();
  await context.close();
  context = undefined;
  context = await launch(true);
  page = await context.newPage();
  for (const tab of context.pages()) if (tab !== page) await tab.close();
  page.setDefaultTimeout(30000);
  await page.goto(metadata.fieldUrl, { waitUntil: "domcontentloaded" });
  const job = page.getByRole("region", { name: "Jobkort på telefonen", exact: true });
  const selected = job.getByRole("combobox", { name: /^Opgave/ });
  await expect(selected).toHaveValue(fixture.actionId);
  await selected.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screens + "/phone-context-390.png" });
  const photos = page.getByRole("region", { name: "Feltfotos på telefonen", exact: true });
  await expect(photos.getByRole("radio", { name: /Opgaven:/ })).toBeChecked();
  await expect(photos.getByRole("button", { name: "Tag foto", exact: true })).toBeEnabled();
  await photos.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screens + "/phone-camera-390.png" });
  const count = job.getByLabel(/Antal.*nødvendigt/);
  await count.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screens + "/phone-card-390.png" });
  await page.getByRole("heading", { name: /Telefonens kø/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: screens + "/phone-queue-390.png" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(
    ok(
      await owner.from("field_job_versions").select("id").eq("project_id", fixture.projectId),
      "No synthetic responses added",
    ).length,
    0,
  );
  assert.equal(
    ok(
      await owner.from("field_photo_uploads").select("id").eq("project_id", fixture.projectId),
      "No camera originals added",
    ).length,
    0,
  );
  metadata.offlineUiReopened = true;
  metadata.phoneCameraEnabled = true;
  metadata.horizontalOverflow = false;
  metadata.noFieldResultsCreated = true;
  metadata.screens = [
    "phone-context-390.png",
    "phone-camera-390.png",
    "phone-card-390.png",
    "phone-queue-390.png",
  ];
} catch (error) {
  state.error = String(error.message).replaceAll(credentials.password, "[REDACTED_SECRET]");
  throw Error(state.error);
} finally {
  const failures = [];
  const step = async (label, fn) => {
    try {
      await fn();
    } catch {
      failures.push(label);
    }
  };
  await step("browser_session", async () => {
    if (state.browserSession) {
      ownSessionId(state.browserSession);
      const r = await owner.auth.admin.signOut(state.browserSession.access_token, "local");
      if (r.error && ![401, 403, 404].includes(r.error.status)) throw Error("Own browser signout");
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
  await step("owner_session", async () =>
    ok(await owner.auth.signOut({ scope: "local" }), "Own owner signout"),
  );
  state.cleanupFailures = failures;
  if (!failures.length) {
    delete state.ownerSession;
    delete state.browserSession;
  }
  await persist();
  assert.deepEqual(failures, []);
}
metadata.ownSessionsRevoked = true;
metadata.temporaryFieldMembershipsRemaining = 0;
await fs.writeFile(out, JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata));
