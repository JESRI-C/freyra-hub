// Staging-only proof using the fixture from the submission test with --indicator-target.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

assert(process.argv.includes("--staging"));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const url = "https://xdvqdzdpyceojbdknofi.supabase.co";
const env = loadEnv("staging", process.cwd(), "");
assert.equal(env.SUPABASE_URL, url);
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const operator = await json("tmp/private-release/jesper-test-short-login.private.json");
const source = await json("tmp/samling-hosted/fixture.private.json");
const fixture = await json("tmp/submission-target-hosted/fixture.private.json");
assert.equal(operator.url, url);
assert.equal(source.organizationId, "05037ba7-9094-4af7-a0df-c1057c643dac");
assert.equal(fixture.projectId, source.projectId);
assert.deepEqual(fixture.indicatorTargetsVerified, [1280, 390]);
const metadata = await fetch(base + "/freyra-build.json").then((response) => response.json());
assert.equal(metadata.sourceRevision, process.env.FREYRA_TEST_REVISION);
const connect = () =>
  createClient(url, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const planner = connect();
const reviewer = connect();
const scope = {
  p_organization_id: source.organizationId,
  p_project_id: fixture.projectId,
  p_action_id: fixture.actionId,
};
function ok(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function rpc(client, name, params = scope) {
  return ok(await client.rpc(name, params), name);
}
async function access() {
  return (
    await rpc(planner, "get_work_order_access_history", {
      ...scope,
      p_user_id: source.external.userId,
      p_before_version: null,
      p_page_size: 1,
    })
  )[0];
}
async function setReviewAccess(active, previous) {
  return rpc(planner, "save_work_order_access", {
    ...scope,
    p_user_id: source.external.userId,
    p_expected_version: previous?.version ?? 0,
    p_active: active,
    p_can_execute: false,
    p_can_review: active,
    p_reason: "TEST · Rapportens versionsbundne mål",
    p_request_id: randomUUID(),
  });
}
async function transition(client, context, operation, targetStatus) {
  const packet = context.packet;
  return rpc(client, "mutate_work_order_lifecycle", {
    ...scope,
    p_expected_version: context.state.version,
    p_values: {
      operation,
      targetStatus,
      submissionVersionId: packet.id,
      planVersionId: packet.plan_version_id,
      assignmentVersionId: packet.assignment_version_id,
      executionRevisionId: packet.execution_revision_id,
      ...(operation === "review" ? { reviewScope: "execution_and_documentation" } : {}),
      reason: "TEST · Rapportens versionsbundne mål",
    },
    p_request_id: randomUUID(),
  });
}
const indicatorLabel = `TEST · Indikatormål ${fixture.run}`;
async function changeTarget(value, expected) {
  ok(
    await planner
      .from("indicators")
      .update({ target_value: value })
      .eq("id", fixture.indicatorId)
      .eq("project_id", fixture.projectId)
      .eq("label", indicatorLabel)
      .eq("target_value", expected)
      .select("id")
      .single(),
    "Change synthetic target",
  );
}

let browser;
let granted = false;
let targetChanged = false;
try {
  const login = ok(await planner.auth.signInWithPassword(operator), "Planner login");
  assert.equal(login.user.id, operator.userId);
  const task = ok(
    await planner
      .from("actions")
      .select("title,linked_indicator_id")
      .eq("id", fixture.actionId)
      .single(),
    "Read synthetic task",
  );
  assert.equal(task.title, `TEST · Fastholdt afleveringsgrundlag ${fixture.run}`);
  assert.equal(task.linked_indicator_id, fixture.indicatorId);
  const context = await rpc(planner, "get_work_order_review_context");
  assert.equal(context.packet.version, fixture.latestVersion);
  if (context.state.status !== "approved") {
    const external = ok(await reviewer.auth.signInWithPassword(source.external), "Reviewer login");
    assert.equal(external.user.id, source.external.userId);
    assert.equal(external.user.app_metadata.qa_tag, "freyra_staging_evidence");
    const previous = await access();
    assert(!previous?.active, "An active grant must not be overwritten");
    await setReviewAccess(true, previous);
    granted = true;
    if (context.state.status === "performed")
      await transition(planner, context, "submit", "submitted");
    const pending = await rpc(reviewer, "get_work_order_review_context");
    assert(pending.can_review);
    assert.equal(pending.packet.id, context.packet.id);
    await transition(reviewer, pending, "review", "approved");
  }
  const approved = await rpc(planner, "get_work_order_review_context");
  assert.equal(approved.state.status, "approved");
  assert.equal(approved.packet.id, context.packet.id);
  await changeTarget(9, 5);
  targetChanged = true;

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const taskUrl = `${base}/app/projects/${fixture.projectId}?tab=handlinger&task=${fixture.actionId}&work=submission`;
  await page.goto(taskUrl);
  await page.getByPlaceholder("dig@firma.dk", { exact: true }).fill(operator.email);
  await page.getByPlaceholder("••••••••", { exact: true }).fill(operator.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((address) => address.pathname !== "/login");
  await page.goto(taskUrl);
  await page
    .getByRole("button", {
      name: `Klargør rapportkladde for afleveringsversion ${approved.packet.version}`,
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Åbn den gemte rapport", exact: true }).click();
  await page.waitForURL((address) => address.pathname === "/app/reports/preview");
  const reportUrl = page.url();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByText(/Mål ved aflevering:.*højst 5 stk\./s).waitFor();
    assert.equal(await page.getByText(/Mål ved aflevering:.*højst 9 stk\./s).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const file = await downloaded;
  assert.match(file.suggestedFilename(), /\.pdf$/i);
  const pdfPath = await file.path();
  const pdf = await readFile(pdfPath);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const pdfText = execFileSync(
    process.env.FREYRA_TEST_PDF_PYTHON ?? "python",
    [
      "-X",
      "utf8",
      "-c",
      "import sys; from pypdf import PdfReader; print(chr(10).join(page.extract_text() for page in PdfReader(sys.argv[1]).pages))",
      pdfPath,
    ],
    { encoding: "utf8" },
  );
  assert(pdfText.includes("højst 5 stk."), "The PDF must include the approved target");
  assert(!pdfText.includes("højst 9 stk."), "The PDF must exclude the later live target");
  console.log(
    JSON.stringify({
      result: "PASS",
      reportUrl,
      widths: [1280, 390],
      format: "PDF",
      sourceRevision: metadata.sourceRevision,
    }),
  );
} finally {
  try {
    if (targetChanged) await changeTarget(5, 9);
  } finally {
    try {
      if (granted) await setReviewAccess(false, await access());
    } finally {
      await browser?.close();
      await planner.auth.signOut({ scope: "local" });
      await reviewer.auth.signOut({ scope: "local" });
    }
  }
}
