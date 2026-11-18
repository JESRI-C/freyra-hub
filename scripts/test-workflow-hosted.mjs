/** Staging-only synthetic acceptance. No signUp, invitations, mail, model calls or customer writes.
 * Credentials and artifacts stay under ignored tmp/workflow-qa. Admin is used only for fixture setup.
 * All behavior checks use an editor or viewer session; admin is never placed in the browser.
 */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
const BASE = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const REF = "xdvqdzdpyceojbdknofi";
const dir = "tmp/workflow-qa";
const receiptPath = dir + "/hosted-fixture.private.json";
const env = Object.fromEntries(
  (await fs.readFile(".env.staging.local", "utf8"))
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
    }),
);
assert.equal(env.SUPABASE_URL, "https://" + REF + ".supabase.co");
const adminKey = (
  await fs.readFile("tmp/private-release/staging-admin-key.private", "utf8")
).trim();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, adminKey, options);
const client = () => createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const ok = (result, label) => {
  if (result.error) throw new Error(label + ": " + result.error.message);
  return result.data;
};
const result = {
  schema: "freyra.workflow-hosted-acceptance/v1",
  base: BASE,
  checks: [],
  errors: [],
  noMail: true,
  syntheticOnly: true,
  customerAcceptance: false,
};
const saveResult = () => fs.writeFile(dir + "/hosted-result.json", JSON.stringify(result, null, 2));
const pass = async (name) => {
  result.checks.push({ name, passed: true });
  await saveResult();
  console.log("PASS " + name);
};
await fs.mkdir(dir, { recursive: true });
let receipt;
try {
  receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
} catch {
  const run = randomUUID().slice(0, 8);
  receipt = {
    run,
    orgId: randomUUID(),
    otherOrgId: randomUUID(),
    projectId: randomUUID(),
    projectB: randomUUID(),
    projectC: randomUUID(),
    mediaIds: [randomUUID(), randomUUID()],
    writer: {
      email: "workflow-editor-" + run + "@freyra.invalid",
      password: randomBytes(32).toString("base64url"),
    },
    viewer: {
      email: "workflow-viewer-" + run + "@freyra.invalid",
      password: randomBytes(32).toString("base64url"),
    },
  };
  await fs.writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
}
for (const [role, account] of [
  ["writer", receipt.writer],
  ["viewer", receipt.viewer],
]) {
  assert.ok(account.email.endsWith("@freyra.invalid"));
  if (!account.id) {
    const existing = ok(
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      "Find fixture user",
    ).users.find((user) => user.email === account.email);
    const user =
      existing ??
      ok(
        await admin.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: { full_name: "SYNTHETIC workflow " + role },
        }),
        "Create no-mail fixture user",
      ).user;
    account.id = user.id;
    await fs.writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
  }
}
ok(
  await admin.from("organizations").upsert([
    {
      id: receipt.orgId,
      name: "TEKNISK WORKFLOW " + receipt.run,
      type: "test",
      country: "Denmark",
    },
    {
      id: receipt.otherOrgId,
      name: "TEKNISK FREMMED ORG " + receipt.run,
      type: "test",
      country: "Denmark",
    },
  ]),
  "Setup isolated organizations",
);
ok(
  await admin.from("organization_memberships").upsert(
    [
      { user_id: receipt.writer.id, organization_id: receipt.orgId, role: "viewer" },
      { user_id: receipt.viewer.id, organization_id: receipt.orgId, role: "viewer" },
    ],
    { onConflict: "user_id,organization_id" },
  ),
  "Setup fixture org roles",
);
ok(
  await admin.from("projects").upsert([
    {
      id: receipt.projectId,
      organization_id: receipt.orgId,
      name: "TEKNISK WORKFLOW " + receipt.run + " A",
      slug: "workflow-" + receipt.run + "-a",
      project_type: "Naturgenopretning",
      description: "SYNTHETIC acceptance only. No actual cutting or customer findings.",
    },
    {
      id: receipt.projectB,
      organization_id: receipt.orgId,
      name: "TEKNISK WORKFLOW " + receipt.run + " B",
      slug: "workflow-" + receipt.run + "-b",
      project_type: "Naturgenopretning",
    },
    {
      id: receipt.projectC,
      organization_id: receipt.otherOrgId,
      name: "TEKNISK WORKFLOW " + receipt.run + " C",
      slug: "workflow-" + receipt.run + "-c",
      project_type: "Naturgenopretning",
    },
  ]),
  "Setup isolated projects",
);
ok(
  await admin.from("project_members").upsert(
    [
      { project_id: receipt.projectId, user_id: receipt.writer.id, role: "editor" },
      { project_id: receipt.projectId, user_id: receipt.viewer.id, role: "viewer" },
    ],
    { onConflict: "project_id,user_id" },
  ),
  "Setup project editor and viewer",
);
const editor = client(),
  reader = client();
ok(await editor.auth.signInWithPassword(receipt.writer), "Editor login");
ok(await reader.auth.signInWithPassword(receipt.viewer), "Viewer login");
assert.equal(
  ok(await editor.rpc("workflow_report_contract_version"), "Contract"),
  "freyra.workflow-report/v1",
);
for (const id of [receipt.projectB, receipt.projectC])
  assert.equal(
    ok(await editor.from("projects").select("id").eq("id", id), "Foreign project denial").length,
    0,
  );
await pass("editor scope, same-organization project isolation and foreign organization isolation");
const meta = await (await fetch(BASE + "/freyra-build.json")).json();
assert.equal(meta.sourceRevision, "b39b81b456f9dd5e58c23dfac9ce689624b4ea9c");
result.sourceRevision = meta.sourceRevision;
await pass("hosted build revision and migrated contract");
const browser = await chromium.launch({ channel: "msedge", headless: true });
let activePage;
async function contextFor(account, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.addInitScript(
    ({ orgId, projectId }) =>
      localStorage.setItem("freyra-auth-selection-v1", JSON.stringify({ orgId, projectId })),
    { orgId: receipt.orgId, projectId: receipt.projectId },
  );
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => result.errors.push(error.message));
  await page.goto(BASE + "/login");
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { context, page };
}
const projectUrl = (step) => BASE + "/app/projects/" + receipt.projectId + "?step=" + step;
try {
  const { context, page } = await contextFor(receipt.writer);
  await page.goto(projectUrl("udfoerelse"));
  const panel = page.locator('section[aria-label="Faktisk udførelse"]');
  await panel.getByLabel("Ny planlagt handling", { exact: true }).waitFor();
  if (!receipt.actionId) {
    await panel
      .getByLabel("Ny planlagt handling", { exact: true })
      .fill("SYNTHETIC grødeskæring " + receipt.run);
    await panel.getByRole("button", { name: "Opret handling", exact: true }).click();
    await page.waitForTimeout(1200);
    const actions = ok(
      await editor
        .from("actions")
        .select("id")
        .eq("project_id", receipt.projectId)
        .eq("title", "SYNTHETIC grødeskæring " + receipt.run),
      "Read UI action",
    );
    assert.equal(actions.length, 1);
    receipt.actionId = actions[0].id;
    await fs.writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
  }
  let history = ok(
    await editor
      .from("project_workspace_entries")
      .select("*")
      .eq("entry_id", receipt.actionId)
      .order("version", { ascending: false }),
    "Read executions",
  );
  if (!history.length) {
    // Explicit synthetic source classification; not a customer observation or actual cutting.
    const execution = {
      schema: "freyra.action-execution/v1",
      actionId: receipt.actionId,
      surveyRoundId: null,
      dataBasis: "synthetic",
      workType: "weed_cutting",
      stage: "planned",
      actualDate: null,
      actualEndDate: null,
      method: null,
      reach: "",
      performedBy: null,
      sourceReference: "",
      evidenceIds: [],
      deviation: "",
      correctionReason: "",
      coverage: "unknown",
      coverageDescription: "",
    };
    ok(
      await editor.from("project_workspace_entries").insert({
        entry_id: receipt.actionId,
        organization_id: receipt.orgId,
        project_id: receipt.projectId,
        kind: "decision_note",
        version: 1,
        title: "SYNTHETIC execution draft",
        payload: {
          basis: "SYNTHETIC fixture only",
          source: "action-execution:" + receipt.actionId,
          decision: JSON.stringify(execution),
        },
      }),
      "Setup typed synthetic draft",
    );
  }
  await page.reload();
  await panel.getByLabel(new RegExp("^Handling")).selectOption(receipt.actionId);
  await panel.getByLabel(new RegExp("^Status")).selectOption("performed");
  for (const [label, value] of [
    ["Faktisk startdato", "2026-08-30"],
    ["Faktisk metode", "SYNTHETIC method only"],
    ["Udført delstrækning", "SYNTHETIC reach only"],
    ["Udførende", "SYNTHETIC contributor"],
    ["Arbejdslog", "SYNTHETIC log; no actual work"],
    ["Faktisk dækning, metode", "SYNTHETIC limited visibility"],
    ["Årsag til rettelse", "SYNTHETIC hosted acceptance"],
  ])
    await panel.getByLabel(new RegExp(label)).fill(value);
  await panel.getByLabel(new RegExp("^Faktisk undersøgelsesdækning")).selectOption("limited");
  await panel.getByRole("button", { name: "Gem udførelsesversion", exact: true }).click();
  await panel.getByText(/Udførelsesregistrering gemt som version/).waitFor();
  history = ok(
    await editor
      .from("project_workspace_entries")
      .select("*")
      .eq("entry_id", receipt.actionId)
      .order("version", { ascending: false }),
    "Execution persisted",
  );
  let execution = history[0];
  assert.equal(JSON.parse(execution.payload.decision).dataBasis, "synthetic");
  await page.reload();
  await panel.getByLabel(new RegExp("^Handling")).selectOption(receipt.actionId);
  assert.equal(
    await panel.getByLabel("Faktisk startdato", { exact: true }).inputValue(),
    "2026-08-30",
  );
  await pass(
    "editor saves and reopens versioned execution while preserving synthetic classification",
  );
  // Deliberately synthetic pixel files, not substitute customer originals.
  const pixels = await page.evaluate(async () => {
    const items = [];
    for (const color of ["#334455", "#8899aa"]) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 64, 64);
      items.push(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
    }
    return items;
  });
  for (let i = 0; i < 2; i++) {
    const bytes = Buffer.from(pixels[i], "base64"),
      path = receipt.projectId + "/synthetic-" + receipt.mediaIds[i] + ".jpg";
    const stored = await admin.storage
      .from("project-media")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (stored.error && !/already|duplicate|exists/i.test(stored.error.message))
      throw Error("Synthetic upload: " + stored.error.message);
    ok(
      await admin.from("project_media").upsert({
        id: receipt.mediaIds[i],
        project_id: receipt.projectId,
        title: "SYNTHETIC " + (i ? "after" : "before") + " pixels",
        category: "field_photo",
        source: "field_upload",
        file_path: path,
        url: "",
        captured_at: i ? "2026-09-07T10:00:00Z" : "2026-08-24T10:00:00Z",

        metadata: {
          synthetic: true,
          fixture: "workflow-hosted",
          original_sha256: createHash("sha256").update(bytes).digest("hex"),
          original_file_name: "synthetic-" + i + ".jpg",
        },
      }),
      "Synthetic photo metadata",
    );
  }
  await page.goto(projectUrl("sammenligning"));
  const compare = page.locator('section[aria-label="Før og efter"]');
  await compare
    .getByRole("button", { name: "Opret beskrivende sammenligning", exact: true })
    .click();
  await compare.getByLabel(new RegExp("^Udførelsesversion")).selectOption(execution.id);
  await compare.getByLabel(new RegExp("^Før-original")).selectOption(receipt.mediaIds[0]);
  await compare.getByLabel(new RegExp("^Efter-original")).selectOption(receipt.mediaIds[1]);
  await compare.getByLabel(new RegExp("^Fælles synlig dækning")).selectOption("limited");
  for (const [label, value] of [
    ["Samme sted", "SYNTHETIC same-place explanation; no real geography"],
    ["Fælles dækket", "SYNTHETIC visible area only"],
    ["Skjulte/udeladte", "SYNTHETIC exclusions; no vegetation measurement"],
    ["Forskelle i sæson", "SYNTHETIC colors, no nature photography"],
    ["Beskrivende observation", "SYNTHETIC comparison only; no improvement or effect"],
  ])
    await compare.getByLabel(new RegExp(label)).fill(value);
  await compare.getByRole("button", { name: "Gem sammenligningsversion", exact: true }).click();
  await compare
    .getByText("Beskrivende – ingen kvantitativ effekt", { exact: true })
    .first()
    .waitFor();
  await page.reload();
  await compare
    .getByText("Beskrivende – ingen kvantitativ effekt", { exact: true })
    .first()
    .waitFor();
  await page.screenshot({ path: dir + "/comparison-desktop.png", fullPage: true });
  await pass("source-bound descriptive comparison saves and reopens without quantitative effect");
  // Change actual method through the UI: old comparison must require reassessment.
  await page.goto(projectUrl("udfoerelse"));
  await panel.getByLabel(new RegExp("^Handling")).selectOption(receipt.actionId);
  await panel.getByLabel(/Faktisk metode/).fill("SYNTHETIC corrected method");
  await panel.getByLabel(/Årsag til rettelse/).fill("SYNTHETIC change requires reassessment");
  await panel.getByRole("button", { name: "Gem udførelsesversion", exact: true }).click();
  await panel.getByText(/Udførelsesregistrering gemt som version/).waitFor();
  await page.goto(projectUrl("sammenligning"));
  await compare.getByText("Kræver ny vurdering", { exact: true }).first().waitFor();
  await pass("changed execution revision visibly invalidates prior comparison assessment");
  await page.goto(projectUrl("rapport"));
  const tasks = page.locator('section[aria-label="Næste opfølgning"]');
  await tasks.getByText("Afklar fotopar og sammenlignelighed", { exact: true }).first().waitFor();
  const notes = () =>
    editor
      .from("project_workspace_entries")
      .select("*")
      .eq("project_id", receipt.projectId)
      .like("payload->>source", "workflow-followup:%")
      .order("version", { ascending: false });
  let taskRows = ok(await notes(), "Read generated followup tasks");
  const byEntry = new Map();
  for (const row of taskRows) if (!byEntry.has(row.entry_id)) byEntry.set(row.entry_id, row);
  const target = Array.from(byEntry.values()).find(
    (row) => JSON.parse(row.payload.decision).title === "Afklar fotopar og sammenlignelighed",
  );
  assert.ok(target);
  const card = tasks
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: "Afklar fotopar og sammenlignelighed", exact: true }),
    })
    .first();
  await card.getByRole("button", { name: "Redigér opfølgning", exact: true }).click();
  const form = tasks.locator("form");
  await form.getByLabel(new RegExp("^Status")).selectOption("dismissed");
  await form
    .getByLabel("Begrundelse for afvisning eller afslutning", { exact: true })
    .fill("SYNTHETIC dismissal retained until source changes");
  await form.getByRole("button", { name: "Gem opfølgningsversion", exact: true }).click();
  await form.waitFor({ state: "hidden" });
  const countBefore = ok(await notes(), "Count followups").length;
  await page.reload();
  await tasks.getByText("Afvist", { exact: false }).first().waitFor();
  await page.waitForTimeout(1200);
  assert.equal(ok(await notes(), "Repeated followups").length, countBefore);
  const mirror = ok(
    await editor.from("actions").select("status,action_type").eq("id", target.entry_id).single(),
    "Read action mirror",
  );
  assert.equal(mirror.status, "Lukket");
  assert.equal(mirror.action_type, "workflow_followup");
  await pass(
    "automatic followup is idempotent, dismissal survives reload and existing action list stays in sync",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await tasks.getByRole("heading", { name: "Næste opfølgning", exact: true }).waitFor();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    "Mobile horizontal overflow",
  );
  await page.screenshot({ path: dir + "/workflow-mobile.png", fullPage: true });
  await pass("mobile workflow renders without horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const reportPanel = page.locator('section[aria-label="Før og efter rapport"]');
  await reportPanel.getByRole("button", { name: "Gem før/efter-rapport", exact: true }).click();
  await reportPanel
    .getByRole("alert")
    .filter({ hasText: /Eksempeldata|Ugyldigt workflowinput/ })
    .waitFor();
  await pass("customer report generation refuses synthetic execution data");
  // Explicit technical API draft for export/reopen. Not a customer report or pilot acceptance.
  const entries = ok(
    await editor
      .from("project_workspace_entries")
      .select("*")
      .eq("project_id", receipt.projectId)
      .order("version", { ascending: false }),
    "Read technical report inputs",
  );
  const latest = new Map();
  for (const row of entries) if (!latest.has(row.entry_id)) latest.set(row.entry_id, row);
  const inputs = Array.from(latest.values());
  const comparisons = inputs.filter((row) => row.payload.source.startsWith("photo-comparison:"));
  for (const row of comparisons) {
    const id = JSON.parse(row.payload.decision).executionRevisionId;
    if (!inputs.some((item) => item.id === id)) inputs.push(entries.find((item) => item.id === id));
  }
  assert.ok(inputs.every(Boolean));
  const snapshot = {
    schema: "freyra.workflow-report/v1",
    generatorVersion: "workflow-report/v1",
    projectId: receipt.projectId,
    organizationId: receipt.orgId,
    dataBasis: "synthetic",
    inputs,
    baselines: [],
    plans: [],
    rounds: [],
    limitations: [
      "SYNTHETIC fixture. No customer observations, actual cutting, baseline or professional acceptance.",
    ],
    review: null,
  };
  const content = {
    templateId: "watercourse",
    title: "TEKNISK SYNTETISK WORKFLOW " + receipt.run,
    projectName: "SYNTHETIC",
    organizationName: "SYNTHETIC",
    scope: "Synthetic API/export acceptance only",
    audience: "Technical QA",
    workflowSnapshot: snapshot,
    sources: receipt.mediaIds.map((id) => ({
      id: "media:" + id,
      title: "SYNTHETIC pixels",
      kind: "field_photo",
      capturedAt: null,
      checksum: null,
      position: null,
      method: "Synthetic fixture only",
      version: "1",
    })),
    sections: [
      {
        id: "limitations",
        title: "SYNTHETIC technical test",
        text: snapshot.limitations[0],
        sourceIds: receipt.mediaIds.map((id) => "media:" + id),
        reviewed: false,
        basis: "not_measured",
      },
    ],
  };
  const saved = ok(
    await editor.rpc("save_report_revision", {
      _report_id: null,
      _organization_id: receipt.orgId,
      _project_id: receipt.projectId,
      _expected_version: 0,
      _status: "draft",
      _content: content,
    }),
    "Save explicit synthetic report",
  );
  receipt.reportId = saved.report_id;
  await fs.writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
  await page.goto(
    BASE +
      "/app/reports/preview?report=" +
      saved.report_id +
      "&version=" +
      saved.version +
      "&project=" +
      receipt.projectId,
  );
  await page.getByRole("heading", { name: content.title, exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: content.title, exact: true }).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Hent PDF og kildepakke fra denne version", exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs(dir + "/hosted-synthetic-package.zip");
  const zip = await fs.readFile(dir + "/hosted-synthetic-package.zip");
  const files = new Map();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18),
      n = zip.readUInt16LE(offset + 26),
      extra = zip.readUInt16LE(offset + 28),
      name = zip.subarray(offset + 30, offset + 30 + n).toString(),
      start = offset + 30 + n + extra;
    files.set(name, zip.subarray(start, start + size));
    offset = start + size;
  }
  assert.equal(files.get("rapport.pdf").subarray(0, 5).toString(), "%PDF-");
  const manifest = JSON.parse(files.get("manifest.json"));
  for (const f of manifest.files) {
    assert.equal(files.get(f.name).length, f.bytes);
    assert.equal(createHash("sha256").update(files.get(f.name)).digest("hex"), f.sha256);
  }
  assert.equal(JSON.parse(files.get("inputversioner.json")).dataBasis, "synthetic");
  await fs.writeFile(dir + "/hosted-synthetic-report.pdf", files.get("rapport.pdf"));
  await pass(
    "explicit synthetic draft reopens in hosted app and exports real PDF/ZIP with valid file manifest",
  );
  const { context: readerContext, page: readerPage } = await contextFor(receipt.viewer);
  await readerPage.goto(
    BASE + "/app/reports/preview?report=" + saved.report_id + "&project=" + receipt.projectId,
  );
  await readerPage.getByRole("heading", { name: content.title, exact: true }).waitFor();
  assert.equal(
    await readerPage
      .getByRole("button", { name: "Gem kladde som ny version", exact: true })
      .count(),
    0,
  );
  const denied = await reader.rpc("save_workflow_followup_revision", {
    _entry_id: target.entry_id,
    _organization_id: receipt.orgId,
    _project_id: receipt.projectId,
    _expected_version: 999,
    _title: "DENIED",
    _payload: target.payload,
  });
  assert.ok(denied.error);
  assert.equal(denied.error.code, "42501");
  await readerPage.screenshot({ path: dir + "/viewer-report.png", fullPage: true });
  await pass(
    "fresh viewer password login reads report while followup write RPC is denied by authorization",
  );
  ok(
    await admin
      .from("project_members")
      .delete()
      .eq("project_id", receipt.projectId)
      .eq("user_id", receipt.viewer.id),
    "Revoke fixture membership",
  );
  assert.equal(
    ok(
      await reader.from("report_documents").select("id").eq("project_id", receipt.projectId),
      "Read after revocation",
    ).length,
    0,
  );
  assert.equal(
    ok(
      await reader
        .from("project_workspace_entries")
        .select("id")
        .eq("project_id", receipt.projectId),
      "Workspace after revocation",
    ).length,
    0,
  );
  await pass("revoked project membership denies new report and workflow requests");
  await readerContext.close();
  await context.close();
  result.projectId = receipt.projectId;
  result.passed = result.errors.length === 0;
  await saveResult();
  assert.deepEqual(result.errors, []);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage
      .screenshot({ path: dir + "/failure.private.png", fullPage: true })
      .catch(() => {});
    await fs.writeFile(
      dir + "/failure.private.txt",
      activePage.url() +
        "\n" +
        (await activePage
          .locator("body")
          .innerText()
          .catch(() => "Body unavailable")),
    );
  }
  result.failure = error instanceof Error ? error.message : "Unknown failure";
  await saveResult();
  console.error("FAIL hosted workflow; see private result file");
  process.exitCode = 1;
} finally {
  await browser.close();
}
