// Staging-only synthetic integration proof. Reuses private local QA credentials and an existing original.
// No Auth users, invitations, messages, provider calls, original uploads or production mutations.
// Temporary task grants are closed in finally. Existing data and earlier test tasks are preserved.
import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
assert(process.argv.includes("--staging"));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const url = "https://xdvqdzdpyceojbdknofi.supabase.co";
const revision = process.env.FREYRA_TEST_REVISION ?? "2e04787f13a042b36df44b3b3bb2a4bb4a25f6f3";
const env = loadEnv("staging", process.cwd(), "");
assert.equal(env.SUPABASE_URL, url);
const dir = "tmp/review-hosted";
await fs.mkdir(dir, { recursive: true });
const credentials = JSON.parse(
  await fs.readFile("tmp/private-release/jesper-test-short-login.private.json", "utf8"),
);
assert.equal(credentials.url, url);
const source = JSON.parse(await fs.readFile("tmp/samling-hosted/fixture.private.json", "utf8"));
assert.equal(source.organizationId, "05037ba7-9094-4af7-a0df-c1057c643dac");
let state;
try {
  state = JSON.parse(await fs.readFile(dir + "/fixture.private.json", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  state = {
    run: randomUUID().slice(0, 8),
    actionId: randomUUID(),
    evidenceId: randomUUID(),
    requests: {},
  };
}
const task = {
  actionId: state.actionId,
  projectId: source.projectId,
  organizationId: source.organizationId,
};
const scope = {
  p_action_id: task.actionId,
  p_project_id: task.projectId,
  p_organization_id: task.organizationId,
};
const client = createClient(url, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const reader = createClient(url, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function ok(r, label) {
  if (r.error) throw Error(`${label}: ${r.error.code ?? "failed"}`);
  return r.data;
}
const login = ok(
  await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  }),
  "Operator login",
);
assert.equal(login.user.id, credentials.userId);
async function save() {
  await fs.writeFile(dir + "/fixture.private.json", JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
}
async function req(key) {
  state.requests[key] ??= randomUUID();
  await save();
  return state.requests[key];
}
async function rpc(name, args) {
  return ok(await client.rpc(name, args), name);
}
let browser,
  page,
  externalGrantActive = false,
  operatorGrantActive = false;
try {
  const meta = await fetch(base + "/freyra-build.json").then((r) => r.json());
  assert.equal(meta.sourceRevision, revision);
  const project = ok(
    await client.from("projects").select("organization_id,name").eq("id", task.projectId).single(),
    "Test project",
  );
  assert.equal(project.organization_id, task.organizationId);
  assert(project.name.includes("TEST"));
  const receipt = ok(
    await client
      .from("field_photo_receipts")
      .select("status,sha256,size_bytes")
      .eq("upload_id", source.uploadId)
      .eq("project_id", task.projectId)
      .single(),
    "Existing original receipt",
  );
  assert.equal(receipt.status, "verified");
  assert.equal(receipt.sha256, source.originalSha256);
  const title = `TEST · Gennemgang af aflevering ${state.run}`;
  let action = ok(
    await client.from("actions").select("id,title").eq("id", task.actionId).maybeSingle(),
    "Read fixture task",
  );
  if (!action) {
    ok(
      await client.from("actions").insert({
        id: task.actionId,
        project_id: task.projectId,
        title,
        description: "TEST · Syntetisk afleveringsprøve. Ingen faktisk naturindsats.",
        status: "Åben",
      }),
      "Create fixture task",
    );
  } else assert.equal(action.title, title);
  if (
    !ok(
      await client
        .from("work_orders")
        .select("action_id")
        .eq("action_id", task.actionId)
        .maybeSingle(),
      "Work order",
    )
  )
    await rpc("initialize_work_order", {
      ...scope,
      p_expected_version: 0,
      p_request_id: await req("init"),
    });
  let plans = await rpc("get_work_order_plan_history", {
    ...scope,
    p_before_version: null,
    p_page_size: 1,
  });
  if (!plans.length)
    plans = await rpc("save_work_order_plan", {
      ...scope,
      p_expected_version: 0,
      p_plan: {
        schema: "freyra.work-order-plan/v1",
        title,
        description: "TEST · Kun afprøvning af fastholdte kilder.",
        instructions:
          "TEST · Kontroller sammenhængen mellem plan, udførelse, registrering og originalfoto.",
        profile: "nature",
        responsibleId: credentials.userId,
        siteId: null,
        watercourseVersionId: null,
        locationNote: "TEST · Prøveområde",
        plannedStart: null,
        plannedEnd: null,
        priority: null,
        plannedMethod: "TEST · Visuel prøve",
        watercourse: null,
      },
      p_correction_reason: "",
      p_request_id: await req("plan"),
    });
  const plan = plans[0];
  let assignments = ok(
    await client
      .from("work_order_assignment_versions")
      .select("id,version")
      .eq("action_id", task.actionId)
      .order("version", { ascending: false })
      .limit(1),
    "Assignment",
  );
  if (!assignments.length)
    assignments = await rpc("configure_work_order_assignment", {
      ...scope,
      p_expected_version: 0,
      p_plan_version_id: plan.id,
      p_mode: "person",
      p_candidate_user_ids: [credentials.userId],
      p_source_group_version_id: null,
      p_reason: "TEST · Egen prøvetildeling",
      p_request_id: await req("assignment"),
    });
  const assignment = assignments[0];
  let executions = ok(
    await client
      .from("work_order_execution_bindings")
      .select("*")
      .eq("action_id", task.actionId)
      .order("version", { ascending: false })
      .limit(1),
    "Execution",
  );
  if (!executions.length)
    executions = await rpc("save_work_order_execution", {
      ...scope,
      p_plan_version_id: plan.id,
      p_expected_plan_version: plan.version,
      p_expected_version: 0,
      p_execution: {
        schema: "freyra.action-execution/v1",
        actionId: task.actionId,
        surveyRoundId: null,
        dataBasis: "synthetic",
        workType: "other",
        stage: "performed",
        actualDate: "2026-11-02",
        actualEndDate: null,
        method: "TEST · Manuel kontrol",
        reach: "TEST · Prøveområde",
        performedBy: "TEST · Kontrolleret testkonto",
        sourceReference: "TEST · Automatisk acceptprøve",
        evidenceIds: [],
        deviation: "",
        correctionReason: "",
        coverage: "limited",
        coverageDescription: "TEST · Kun den syntetiske sag er omfattet.",
      },
      p_performed_by_id: credentials.userId,
      p_deviation_reason: "",
      p_request_id: await req("execution"),
      p_expected_assignment_version_id: assignment.id,
      p_expected_assignment_version: assignment.version,
    });
  const execution = executions[0];
  let jobs = ok(
    await client
      .from("field_job_versions")
      .select("id")
      .eq("action_id", task.actionId)
      .order("version", { ascending: false })
      .limit(1),
    "Observation",
  );
  if (!jobs.length)
    jobs = await rpc("save_field_job_version", {
      p_organization_id: task.organizationId,
      p_project_id: task.projectId,
      p_action_id: task.actionId,
      p_template_version_id: source.templateVersionId,
      p_expected_version: 0,
      p_values: { note: "TEST · Registrering til afleveringspakken.", count: 0, checked: false },
      p_status: "recorded",
      p_correction_reason: "",
      p_request_id: await req("observation"),
    });
  let evidence = ok(
    await client
      .from("work_order_evidence_versions")
      .select("*")
      .eq("evidence_id", state.evidenceId)
      .order("version", { ascending: false })
      .limit(1),
    "Evidence",
  );
  async function attach(expected, status, reason, request) {
    return (
      await rpc("save_work_order_evidence", {
        ...scope,
        p_evidence_id: state.evidenceId,
        p_expected_version: expected,
        p_observation_version_id: jobs[0].id,
        p_upload_id: source.uploadId,
        p_execution_revision_id: execution.workspace_entry_id,
        p_state: status,
        p_reason: reason,
        p_request_id: request,
      })
    )[0];
  }
  if (!evidence.length)
    evidence = [
      await attach(
        0,
        "attached",
        "TEST · Dokumentation til afleveringsgrundlag",
        await req("evidence"),
      ),
    ];
  if (evidence[0].state === "withdrawn")
    evidence = [
      await attach(
        evidence[0].version,
        "attached",
        "TEST · Genetabler efter afbrudt prøve",
        randomUUID(),
      ),
    ];
  if (!state.seeded)
    for (const status of ["draft", "planned", "assigned", "started", "performed"]) {
      const context = (await rpc("get_work_order_lifecycle_context", scope))[0];
      const targetIndex = ["draft", "planned", "assigned", "started", "performed"].indexOf(
        context.state?.status,
      );
      if (
        context.state &&
        targetIndex >= ["draft", "planned", "assigned", "started", "performed"].indexOf(status)
      )
        continue;
      await rpc("mutate_work_order_lifecycle", {
        ...scope,
        p_expected_version: context.state?.version ?? 0,
        p_values: {
          operation: "transition",
          targetStatus: status,
          planVersionId: plan.id,
          assignmentVersionId: assignment.id,
          executionRevisionId: execution.workspace_entry_id,
          ...(status === "started"
            ? { startedAt: "2026-11-02T08:00:00Z", startedSource: "TEST · Fast prøvetidspunkt" }
            : {}),
        },
        p_request_id: await req("state-" + status),
      });
    }
  if (!state.seeded) {
    const preflight = await rpc("get_work_order_submission_context", scope);
    assert.deepEqual(preflight.gaps, []);
    state.seeded = true;
    await save();
  }
  const external = ok(
    await reader.auth.signInWithPassword({
      email: source.external.email,
      password: source.external.password,
    }),
    "Synthetic reviewer login",
  );
  assert(source.external.email.endsWith("@example.test"));
  assert.equal(external.user.id, source.external.userId);
  assert.equal(external.user.app_metadata.qa_tag, "freyra_staging_evidence");
  async function grant(userId, active, review) {
    const history = await rpc("get_work_order_access_history", {
      ...scope,
      p_user_id: userId,
      p_before_version: null,
      p_page_size: 1,
    });
    return rpc("save_work_order_access", {
      ...scope,
      p_user_id: userId,
      p_expected_version: history[0]?.version ?? 0,
      p_active: active,
      p_can_execute: false,
      p_can_review: review,
      p_reason: "TEST · Afgrænset reviewprøve, ingen mail",
      p_request_id: randomUUID(),
    });
  }
  externalGrantActive = true;
  operatorGrantActive = true;
  await grant(source.external.userId, true, true);
  await grant(credentials.userId, true, true);
  const reviewValues = (context, operation, target, reason) => ({
    operation,
    targetStatus: target,
    submissionVersionId: context.packet.id,
    planVersionId: context.packet.plan_version_id,
    assignmentVersionId: context.packet.assignment_version_id,
    executionRevisionId: context.packet.execution_revision_id,
    ...(operation === "review" ? { reviewScope: "execution_and_documentation" } : {}),
    reason,
  });
  const rc = () => rpc("get_work_order_review_context", scope);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const browserContext = await browser.newContext({
    storageState: "tmp/samling-hosted/operator-storage.private.json",
    viewport: { width: 1280, height: 1000 },
  });
  page = await browserContext.newPage();
  page.setDefaultTimeout(30000);
  const target = `${base}/app/projects/${task.projectId}?tab=handlinger&task=${task.actionId}&work=submission`;
  async function loginBrowser(p, who, targetUrl) {
    await p.goto(targetUrl);
    await Promise.race([
      p.getByPlaceholder("dig@firma.dk", { exact: true }).waitFor(),
      p.getByRole("heading", { name: /Arbejdsopgaver|Mine opgaver/, exact: true }).waitFor(),
    ]);
    if (await p.getByPlaceholder("dig@firma.dk", { exact: true }).isVisible()) {
      await p.getByPlaceholder("dig@firma.dk", { exact: true }).fill(who.email);
      await p.getByPlaceholder("••••••••", { exact: true }).fill(who.password);
      await p.locator('button[type="submit"]').click();
      await p.waitForURL((u) => u.pathname != "/login");
      await p.goto(targetUrl);
    }
  }
  await loginBrowser(page, credentials, target);
  const panel = page.getByRole("region", { name: "Opgavens afleveringsgrundlag", exact: true });
  const review = panel.getByRole("region", {
    name: "Aflevering og faglig gennemgang",
    exact: true,
  });
  async function act(region, label, note) {
    await region.getByRole("button", { name: label, exact: true }).click();
    await region.getByRole("textbox").fill(note);
    await region.getByRole("button", { name: "Gem afleveringshandling", exact: true }).click();
    await region.getByRole("textbox").waitFor({ state: "hidden" });
  }
  async function refresh(pnl) {
    await pnl.getByRole("button", { name: "Hent aktuelt grundlag", exact: true }).click();
  }
  let packets = await rpc("list_work_order_submissions", {
    ...scope,
    p_before_version: null,
    p_page_size: 5,
  });
  if (!packets.length) {
    await panel
      .getByLabel("Bemærkning til afleveringen")
      .fill("TEST · Første materiale til uafhængig gennemgang");
    await panel.getByRole("button", { name: "Gem afleveringsversion", exact: true }).click();
    await panel.getByText(/Afleveringsversion 1 er gemt/).waitFor();
  }
  packets = await rpc("list_work_order_submissions", {
    ...scope,
    p_before_version: null,
    p_page_size: 5,
  });
  state.firstPacketHash ??= createHash("sha256")
    .update(JSON.stringify(packets.at(-1)))
    .digest("hex");
  await save();
  let context = await rc();
  if (context.state.status === "performed" && packets[0].version === 1) {
    await act(review, "Aflevér til gennemgang", "TEST · Første aflevering til faglig gennemgang");
    context = await rc();
    assert.equal(context.state.status, "submitted");
  }
  if (!state.selfReviewDenied) {
    assert.equal(context.self_review, true);
    assert.equal(context.can_review, false);
    const denied = await client.rpc("mutate_work_order_lifecycle", {
      ...scope,
      p_expected_version: context.state.version,
      p_values: reviewValues(context, "review", "approved", "TEST · Skal afvises som eget arbejde"),
      p_request_id: randomUUID(),
    });
    assert.equal(denied.error?.code, "42501");
    state.selfReviewDenied = true;
    await save();
  }
  if (!state.staleEvidenceCreated) {
    evidence = [
      await attach(
        evidence[0].version,
        "attached",
        "TEST · Præcisering efter første aflevering",
        await req("correction"),
      ),
    ];
    state.staleEvidenceCreated = true;
    await save();
  }
  const externalBrowserContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    externalPage = await externalBrowserContext.newPage();
  externalPage.setDefaultTimeout(30000);
  await loginBrowser(externalPage, source.external, base + "/login?next=%2Fopgaver");
  await externalPage.goto(base + "/opgaver");
  const externalTask = externalPage
    .getByRole("article")
    .filter({ has: externalPage.getByRole("heading", { name: title, exact: true }) });
  await externalTask.getByRole("button", { name: "Åbn opgave", exact: true }).click();
  await externalTask.getByText("Se afleveringsversioner", { exact: true }).click();
  const externalPanel = externalTask.getByRole("region", {
      name: "Opgavens afleveringsgrundlag",
      exact: true,
    }),
    externalReview = externalPanel.getByRole("region", {
      name: "Aflevering og faglig gennemgang",
      exact: true,
    });
  await externalReview
    .getByRole("heading", { name: "Aflevering og faglig gennemgang", exact: true })
    .waitFor();
  assert.equal(
    await externalPanel
      .getByRole("button", { name: "Gem afleveringsversion", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await externalReview
      .getByRole("button", { name: "Aflevér til gennemgang", exact: true })
      .count(),
    0,
  );
  state.reviewOnlyEntryVerified = true;
  if (!state.returned) {
    await externalReview
      .getByRole("button", { name: "Godkend denne aflevering", exact: true })
      .waitFor();
    assert(
      await externalReview
        .getByRole("button", { name: "Godkend denne aflevering", exact: true })
        .isDisabled(),
    );
    assert(
      await externalReview
        .getByRole("button", { name: "Returnér med mangler", exact: true })
        .isEnabled(),
    );
    const readerContext = ok(
      await reader.rpc("get_work_order_review_context", scope),
      "Reviewer context",
    );
    assert.equal(readerContext.packet_current, false);
    const stale = await reader.rpc("mutate_work_order_lifecycle", {
      ...scope,
      p_expected_version: readerContext.state.version,
      p_values: reviewValues(
        readerContext,
        "review",
        "approved",
        "TEST · Forældet materiale må ikke godkendes",
      ),
      p_request_id: randomUUID(),
    });
    assert.equal(stale.error?.code, "PT409");
    await act(
      externalReview,
      "Returnér med mangler",
      "TEST · Udførelse og dokumentation gennemgået. Fasthold den rettede registrering i en ny version.",
    );
    assert.equal((await rc()).state.status, "returned");
    state.returned = true;
    state.staleApprovalDenied = true;
    await save();
  }
  if (!state.reopened) {
    await refresh(panel);
    await act(
      review,
      "Genåbn til rettelse",
      "TEST · Ret dokumentationsgrundlaget efter faglig returnering",
    );
    assert.equal((await rc()).state.status, "reopened");
    state.reopened = true;
    await save();
  }
  if (!state.performedAgain) {
    await page.getByRole("button", { name: "Arbejdsgrundlag", exact: true }).click();
    const status = page.getByRole("region", { name: "Operationel status og logbog", exact: true });
    await status.getByRole("button", { name: "Bekræft udført", exact: true }).click();
    await status.getByRole("button", { name: "Gem statusversion", exact: true }).click();
    await status
      .getByRole("button", { name: "Gem statusversion", exact: true })
      .waitFor({ state: "hidden" });
    await status.getByRole("button", { name: "Gemmer…", exact: true }).waitFor({ state: "hidden" });
    assert.equal((await rc()).state.status, "performed");
    state.performedAgain = true;
    await save();
    await page.getByRole("button", { name: "Aflevering", exact: true }).click();
  }
  packets = await rpc("list_work_order_submissions", {
    ...scope,
    p_before_version: null,
    p_page_size: 5,
  });
  if (packets.length === 1) {
    await refresh(panel);
    await panel
      .getByLabel("Bemærkning til afleveringen")
      .fill("TEST · Rettet materiale til ny gennemgang");
    await panel.getByRole("button", { name: "Gem afleveringsversion", exact: true }).click();
    await panel.getByText(/Afleveringsversion 2 er gemt/).waitFor();
  }
  context = await rc();
  if (context.state.status === "performed") {
    await act(
      review,
      "Aflevér til gennemgang",
      "TEST · Anden aflevering efter dokumentationsrettelse",
    );
    assert.equal((await rc()).state.status, "submitted");
  }
  await refresh(externalPanel);
  if (!state.approved) {
    await externalReview
      .getByRole("button", { name: "Godkend denne aflevering", exact: true })
      .waitFor();
    assert(
      await externalReview
        .getByRole("button", { name: "Godkend denne aflevering", exact: true })
        .isEnabled(),
    );
  }
  const article = externalPanel.locator("article").first();
  await article.getByText("Se det fastholdte grundlag", { exact: true }).click();
  const [popup] = await Promise.all([
    externalPage.waitForEvent("popup"),
    article.getByRole("button", { name: "Åbn fastholdt originalfoto", exact: true }).click(),
  ]);
  await popup.waitForURL(
    (u) => u.origin === url && u.pathname.startsWith("/storage/v1/object/sign/"),
  );
  const original = await externalBrowserContext.request.get(popup.url());
  assert.equal(original.status(), 200);
  assert.equal(
    createHash("sha256")
      .update(await original.body())
      .digest("hex"),
    source.originalSha256,
  );
  await popup.close();
  state.originalHashVerified = true;
  if (!state.approved) {
    const note = `TEST · review-lost-${state.run} · Registreret udførelse og vedlagt dokumentation er gennemgået. Ingen naturvirkning vurderet.`;
    let dropped = false;
    const identities = [];
    await externalPage.route(base + "/**", async (route) => {
      const request = route.request(),
        body = request.postData() ?? "";
      if (request.method() === "POST" && body.includes(`review-lost-${state.run}`)) {
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
    await externalReview
      .getByRole("button", { name: "Godkend denne aflevering", exact: true })
      .click();
    await externalReview.getByRole("textbox").fill(note);
    await externalReview
      .getByRole("button", { name: "Gem afleveringshandling", exact: true })
      .click();
    await externalReview
      .getByRole("button", { name: "Prøv samme handling igen", exact: true })
      .waitFor();
    assert(dropped);
    assert.equal((await rc()).state.status, "approved");
    assert.equal(await externalReview.getByRole("textbox").inputValue(), note);
    await externalReview
      .getByRole("button", { name: "Prøv samme handling igen", exact: true })
      .click();
    await externalReview.getByRole("textbox").waitFor({ state: "hidden" });
    assert.equal(identities.length, 2);
    assert.deepEqual(identities[0], identities[1]);
    state.lostReplyRetryVerified = true;
    const decisions = ok(
      await client
        .from("work_order_lifecycle_versions")
        .select("*")
        .eq("action_id", task.actionId)
        .eq("operation", "review")
        .eq("reason", note),
      "Approval rows",
    );
    assert.equal(decisions.length, 1);
    state.approvalRequestId = decisions[0].request_id;
    state.approvalPreviousVersion = decisions[0].version - 1;
    state.approvalValues = reviewValues(await rc(), "review", "approved", note);
    state.approved = true;
    await save();
  }
  context = await rc();
  assert.equal(context.state.status, "approved");
  assert.equal(context.recent_reviews.length, 2);
  assert.deepEqual(
    context.recent_reviews.map((r) => [r.state.status, r.submission_version]),
    [
      ["approved", 2],
      ["returned", 1],
    ],
  );
  state.historyPreserved = true;
  packets = await rpc("list_work_order_submissions", {
    ...scope,
    p_before_version: null,
    p_page_size: 5,
  });
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(packets.at(-1)))
      .digest("hex"),
    state.firstPacketHash,
  );
  assert.equal(packets[0].snapshot.evidence[0].observation_snapshot.values.count, 0);
  assert.equal(packets[0].snapshot.evidence[0].observation_snapshot.values.checked, false);
  for (const width of [390, 320]) {
    await externalPage.setViewportSize({ width, height: 844 });
    await externalReview
      .getByRole("heading", { name: "Aflevering og faglig gennemgang", exact: true })
      .scrollIntoViewIfNeeded();
    assert(await externalPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await externalPage.screenshot({ path: `${dir}/review-mobile-${width}.png`, fullPage: false });
  }
  await refresh(panel);
  await review.getByText("Status: Godkendt · afleveringsversion 2", { exact: true }).waitFor();
  await review
    .getByRole("heading", { name: "Aflevering og faglig gennemgang", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + "/review-desktop.png", fullPage: false });
  state.viewportChecks = [1280, 390, 320];
  await grant(source.external.userId, false, false);
  externalGrantActive = false;
  const deniedContext = await reader.rpc("get_work_order_review_context", scope);
  assert.equal(deniedContext.error?.code, "42501");
  const deniedReceipt = await reader.rpc("mutate_work_order_lifecycle", {
    ...scope,
    p_expected_version: state.approvalPreviousVersion,
    p_values: state.approvalValues,
    p_request_id: state.approvalRequestId,
  });
  assert.equal(deniedReceipt.error?.code, "42501");
  await refresh(externalPanel);
  await externalPanel.getByRole("alert").first().waitFor();
  assert.equal(await externalPanel.getByRole("article").count(), 0);
  assert.equal(
    await externalReview.getByText("Seneste faglige gennemgange", { exact: true }).count(),
    0,
  );
  state.revocationQuarantineVerified = true;
  await externalPage.getByRole("button", { name: "Opdater opgaver", exact: true }).click();
  await externalTask.waitFor({ state: "hidden" });
  state.revokedTaskRemoved = true;
  await grant(credentials.userId, false, false);
  operatorGrantActive = false;
  state.sourceRevision = revision;
  state.projectId = task.projectId;
  state.organizationId = task.organizationId;
  state.originalSha256 = source.originalSha256;
  state.latestSubmissionVersion = packets[0].version;
  state.lifecycleVersion = context.state.version;
  await save();
  console.log(
    JSON.stringify({
      result: "PASS",
      ...Object.fromEntries(
        Object.entries(state).filter(
          ([k]) => !["requests", "approvalValues", "approvalRequestId"].includes(k),
        ),
      ),
    }),
  );
} catch (e) {
  if (page) {
    await fs.writeFile(
      dir + "/failure.private.txt",
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
    await page.screenshot({ path: dir + "/failure.private.png", fullPage: false }).catch(() => {});
  }
  console.error(
    JSON.stringify({ result: "FAIL", error: e.message?.replace(/https:\/\/\S+/g, "[URL]") }),
  );
  process.exitCode = 1;
} finally {
  for (const [active, userId] of [
    [externalGrantActive, source.external.userId],
    [operatorGrantActive, credentials.userId],
  ]) {
    if (!active) continue;
    const history = await client.rpc("get_work_order_access_history", {
      ...scope,
      p_user_id: userId,
      p_before_version: null,
      p_page_size: 1,
    });
    if (history.error) {
      console.error("Check cleanup of the test-only review grant");
      process.exitCode = 1;
    } else if (history.data?.[0]?.active) {
      const cleanup = await client.rpc("save_work_order_access", {
        ...scope,
        p_user_id: userId,
        p_expected_version: history.data[0].version,
        p_active: false,
        p_can_execute: false,
        p_can_review: false,
        p_reason: "TEST · Luk efter afbrudt reviewprøve",
        p_request_id: randomUUID(),
      });
      if (cleanup.error) {
        console.error("Check cleanup of the test-only review grant");
        process.exitCode = 1;
      }
    }
  }
  await browser?.close();
  await client.auth.signOut({ scope: "local" });
  await reader.auth.signOut({ scope: "local" });
}
