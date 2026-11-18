// Continues the synthetic --required-job-cards staging fixture through review and report.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
assert(process.argv.includes("--staging"));
const env = loadEnv("staging", process.cwd(), "");
assert.equal(env.SUPABASE_URL, "https://xdvqdzdpyceojbdknofi.supabase.co");
const app = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
assert.equal(
  (await (await fetch(app + "/freyra-build.json")).json()).sourceRevision,
  process.env.FREYRA_TEST_REVISION,
);
const fixture = JSON.parse(
  await fs.readFile("tmp/submission-required-hosted/fixture.private.json", "utf8"),
);
const source = JSON.parse(await fs.readFile("tmp/samling-hosted/fixture.private.json", "utf8"));
const credentials = JSON.parse(
  await fs.readFile("tmp/private-release/jesper-test-short-login.private.json", "utf8"),
);
assert.equal(credentials.url, env.SUPABASE_URL);
assert(fixture.missingRequiredCardRejected);
assert.deepEqual(fixture.requiredJobCardsVerified, [1280, 390]);
const scope = {
  p_action_id: fixture.actionId,
  p_project_id: source.projectId,
  p_organization_id: source.organizationId,
};
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const manager = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
const reviewer = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options);
function ok(result, label) {
  if (result.error) throw new Error(label + ": " + result.error.code);
  return result.data;
}
const call = async (client, name, params) => ok(await client.rpc(name, params), name);
let temporaryGrant;
try {
  const signed = ok(
    await manager.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    }),
    "Manager login",
  );
  assert.equal(signed.user.id, credentials.userId);
  const project = ok(
    await manager
      .from("projects")
      .select("name,organization_id")
      .eq("id", source.projectId)
      .single(),
    "Test project",
  );
  assert(project.name.includes("TEST"));
  assert.equal(project.organization_id, source.organizationId);
  const context = () => call(manager, "get_work_order_review_context", scope);
  const before = await context();
  assert(before.packet);
  const submission = (
    await call(manager, "list_work_order_submissions", {
      ...scope,
      p_before_version: null,
      p_page_size: 1,
    })
  )[0];
  assert.equal(submission.id, before.packet.id);
  assert.equal(submission.snapshot.ruleSet, "freyra.submission-requirements/v1");
  const frozen = JSON.stringify(submission.snapshot);
  if (before.state.status !== "approved") {
    if (before.state.status === "performed") {
      assert(before.can_submit);
      await call(manager, "mutate_work_order_lifecycle", {
        ...scope,
        p_expected_version: before.state.version,
        p_request_id: randomUUID(),
        p_values: {
          operation: "submit",
          targetStatus: "submitted",
          reason: "TEST · Send de kontrollerede jobkort og originaler til teknisk gennemgang.",
          submissionVersionId: submission.id,
          planVersionId: submission.plan_version_id,
          assignmentVersionId: submission.assignment_version_id,
          executionRevisionId: submission.execution_revision_id,
        },
      });
    }
    const grants = await call(manager, "get_work_order_access_history", {
      ...scope,
      p_user_id: source.external.userId,
      p_before_version: null,
      p_page_size: 1,
    });
    assert(!grants[0]?.active, "Do not replace an unrelated active test grant");
    temporaryGrant = (
      await call(manager, "save_work_order_access", {
        ...scope,
        p_user_id: source.external.userId,
        p_expected_version: grants[0]?.version ?? 0,
        p_active: true,
        p_can_execute: false,
        p_can_review: true,
        p_reason: "TEST · Midlertidig uafhængig kravprøve",
        p_request_id: randomUUID(),
      })
    )[0];
    const signedReviewer = ok(
      await reviewer.auth.signInWithPassword({
        email: source.external.email,
        password: source.external.password,
      }),
      "Reviewer login",
    );
    assert.equal(signedReviewer.user.id, source.external.userId);
    assert.notEqual(signedReviewer.user.id, signed.user.id);
    const ready = await call(reviewer, "get_work_order_review_context", scope);
    assert(ready.can_review);
    assert.equal(ready.self_review, false);
    await call(reviewer, "mutate_work_order_lifecycle", {
      ...scope,
      p_expected_version: ready.state.version,
      p_request_id: randomUUID(),
      p_values: {
        operation: "review",
        targetStatus: "approved",
        submissionVersionId: submission.id,
        planVersionId: submission.plan_version_id,
        assignmentVersionId: submission.assignment_version_id,
        executionRevisionId: submission.execution_revision_id,
        reviewScope: "execution_and_documentation",
        reason:
          "TEST · Teknisk prøve af valgte jobkort, original og fastholdte versioner. Ingen faglig naturvurdering.",
      },
    });
  }
  const approved = await context();
  assert.equal(approved.state.status, "approved");
  const reportInput = {
    p_organization_id: source.organizationId,
    p_project_id: source.projectId,
    p_action_id: fixture.actionId,
    p_submission_id: submission.id,
    p_review_id: approved.state.id,
  };
  const report = await call(manager, "save_approved_work_order_report", reportInput);
  assert.deepEqual(await call(manager, "save_approved_work_order_report", reportInput), report);
  assert.equal(report.content.workOrderApproval.submissionVersion, submission.version);
  assert.equal(report.content.workOrderApproval.reviewId, approved.state.id);
  assert.equal(
    JSON.stringify(
      (
        await call(manager, "list_work_order_submissions", {
          ...scope,
          p_before_version: null,
          p_page_size: 1,
        })
      )[0].snapshot,
    ),
    frozen,
  );
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let pdfSha256;
  let reportPage;
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      acceptDownloads: true,
    });
    reportPage = page;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.name));
    const taskUrl =
      app +
      "/app/projects/" +
      source.projectId +
      "?tab=handlinger&task=" +
      fixture.actionId +
      "&work=submission";
    await page.goto(taskUrl);
    await page.getByPlaceholder("dig@firma.dk", { exact: true }).fill(credentials.email);
    await page.getByPlaceholder("••••••••", { exact: true }).fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname !== "/login");
    await page.goto(taskUrl);
    await page
      .getByRole("button", {
        name: "Klargør rapportkladde for afleveringsversion " + submission.version,
        exact: true,
      })
      .click();
    await page.getByRole("link", { name: "Åbn den gemte rapport", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/app/reports/preview");
    assert.equal(new URL(page.url()).searchParams.get("report"), report.report_id);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page
        .getByText(
          new RegExp("^Grundlag · Godkendt afleveringsversion " + submission.version + "(?![0-9])"),
        )
        .waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({ path: "tmp/submission-required-hosted/report-" + width + ".png" });
    }
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    const file = await downloaded;
    const bytes = await fs.readFile(await file.path());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert(bytes.length > 2000);
    pdfSha256 = createHash("sha256").update(bytes).digest("hex");
    await file.saveAs("tmp/submission-required-hosted/required-card-report.pdf");
    await page
      .getByRole("link", { name: "Åbn opgavens aflevering og originalfotos", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("task") === fixture.actionId &&
        url.searchParams.get("submissionVersion") === String(submission.version),
    );
    const detail = page
      .getByRole("region", { name: "Opgavens afleveringsgrundlag", exact: true })
      .locator("article details")
      .first();
    await detail.locator("summary").first().click();
    await detail.getByText("Jobkort der kræves ved aflevering", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } catch (error) {
    if (reportPage) {
      await fs.writeFile(
        "tmp/submission-required-hosted/report-failure.private.txt",
        await reportPage.locator("body").innerText(),
      );
      await reportPage.screenshot({
        path: "tmp/submission-required-hosted/report-failure.private.png",
      });
    }
    throw error;
  } finally {
    await browser.close();
  }
  await fs.writeFile(
    "tmp/submission-required-hosted/review-report-receipt.json",
    JSON.stringify(
      {
        sourceRevision: process.env.FREYRA_TEST_REVISION,
        actionId: fixture.actionId,
        submissionVersion: submission.version,
        reviewId: approved.state.id,
        reportId: report.report_id,
        browserWidths: [1280, 390],
        pdfSha256,
        sourceReturnVerified: true,
        result: "PASS",
        independentReviewer: true,
        reportRetryStable: true,
        frozenRequirementsPreserved: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      result: "PASS",
      independentReviewer: true,
      reportRetryStable: true,
      frozenRequirementsPreserved: true,
    }),
  );
} finally {
  if (temporaryGrant) {
    await call(manager, "save_work_order_access", {
      ...scope,
      p_user_id: source.external.userId,
      p_expected_version: temporaryGrant.version,
      p_active: false,
      p_can_execute: false,
      p_can_review: false,
      p_reason: "TEST · Luk midlertidig kravprøve",
      p_request_id: randomUUID(),
    });
    const after = await call(manager, "get_work_order_access_history", {
      ...scope,
      p_user_id: source.external.userId,
      p_before_version: null,
      p_page_size: 1,
    });
    assert.equal(after[0].active, false);
  }
  await manager.auth.signOut({ scope: "local" });
  await reviewer.auth.signOut({ scope: "local" });
}
