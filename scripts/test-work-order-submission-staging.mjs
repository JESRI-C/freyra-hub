import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
assert(process.argv.includes("--staging"));
const base = "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev";
const url = "https://xdvqdzdpyceojbdknofi.supabase.co";
const revision = process.env.FREYRA_TEST_REVISION ?? "06c438b8f78fb4827a5f29a0b63173ac309847ce";
const env = loadEnv("staging", process.cwd(), "");
assert.equal(env.SUPABASE_URL, url);
const checkIndicatorTarget = process.argv.includes("--indicator-target");
const checkRequiredCards = process.argv.includes("--required-job-cards");
const dir = checkRequiredCards
  ? "tmp/submission-required-hosted"
  : checkIndicatorTarget
    ? "tmp/submission-target-hosted"
    : "tmp/submission-hosted";
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
if (checkIndicatorTarget) state.indicatorId ??= randomUUID();
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
  externalGrantActive = false;
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
  const title = `TEST · Fastholdt afleveringsgrundlag ${state.run}`;
  const indicatorLabel = `TEST · Indikatormål ${state.run}`;
  if (checkIndicatorTarget) {
    await save();
    ok(
      await client.from("indicators").upsert(
        {
          id: state.indicatorId,
          project_id: task.projectId,
          key: `submission_target_${state.run}`,
          label: indicatorLabel,
          unit: "stk.",
          target_value: 0,
          target_direction: "at_most",
          target_unit: "stk.",
        },
        { onConflict: "id", ignoreDuplicates: true },
      ),
      "Create test indicator",
    );
  }
  let requiredCards;
  if (checkRequiredCards) {
    state.requiredTemplateId ??= randomUUID();
    await save();
    const originalTemplate = ok(
      await client
        .from("field_job_template_versions")
        .select("definition")
        .eq("id", source.templateVersionId)
        .eq("project_id", task.projectId)
        .single(),
      "Source template",
    );
    let templates = ok(
      await client
        .from("field_job_template_versions")
        .select("*")
        .eq("template_id", state.requiredTemplateId)
        .eq("project_id", task.projectId)
        .order("version"),
      "Required templates",
    );
    if (!templates.length)
      templates = await rpc("save_field_job_template_version", {
        p_organization_id: task.organizationId,
        p_project_id: task.projectId,
        p_template_id: state.requiredTemplateId,
        p_expected_version: 0,
        p_definition: {
          ...originalTemplate.definition,
          title: "TEST · Påkrævet jobkort " + state.run,
        },
        p_request_id: await req("required-template"),
      });
    const template = templates[0];
    requiredCards = [
      {
        templateVersionId: template.id,
        templateId: template.template_id,
        version: template.version,
        definition: template.definition,
      },
    ];
  }
  let action = ok(
    await client
      .from("actions")
      .select("id,title,linked_indicator_id")
      .eq("id", task.actionId)
      .maybeSingle(),
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
        ...(checkIndicatorTarget ? { linked_indicator_id: state.indicatorId } : {}),
      }),
      "Create fixture task",
    );
  } else {
    assert.equal(action.title, title);
    if (checkIndicatorTarget) assert.equal(action.linked_indicator_id, state.indicatorId);
  }
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
        ...(checkRequiredCards ? { requiredJobCards: requiredCards } : {}),
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
      .select("id,version,template_version_id")
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
  if (checkRequiredCards && jobs[0].template_version_id !== requiredCards[0].templateVersionId) {
    const missing = await rpc("get_work_order_submission_context", scope);
    assert(missing.gaps.includes("required_job_card_missing"));
    const rejected = await client.rpc("save_work_order_submission", {
      ...scope,
      p_expected_version: 0,
      p_basis_hash: missing.basis_hash,
      p_note: "TEST · Missing required card",
      p_request_id: await req("rejected-requirement"),
    });
    assert.equal(rejected.error?.code, "22023");
    jobs = await rpc("save_field_job_version", {
      p_organization_id: task.organizationId,
      p_project_id: task.projectId,
      p_action_id: task.actionId,
      p_template_version_id: requiredCards[0].templateVersionId,
      p_expected_version: jobs[0].version,
      p_values: { note: "TEST · Krævet registrering", count: 0, checked: false },
      p_status: "recorded",
      p_correction_reason: "TEST · Brug valgt jobkortversion",
      p_request_id: await req("required-observation"),
    });
    evidence = [
      await attach(
        evidence[0].version,
        "attached",
        "TEST · Tilknyt valgt jobkortversion",
        await req("required-evidence"),
      ),
    ];
    state.missingRequiredCardRejected = true;
    await save();
  }
  const preflight = await rpc("get_work_order_submission_context", scope);
  assert.deepEqual(preflight.gaps, []);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const browserContext = await browser.newContext({
    storageState: "tmp/samling-hosted/operator-storage.private.json",
    viewport: { width: 1280, height: 1000 },
  });
  page = await browserContext.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/app/projects/${task.projectId}?tab=handlinger&task=${task.actionId}`);
  await Promise.race([
    page.getByRole("heading", { name: "Arbejdsopgaver", exact: true }).waitFor(),
    page.getByPlaceholder("dig@firma.dk").waitFor(),
  ]);
  if (await page.getByPlaceholder("dig@firma.dk").isVisible()) {
    await page.getByPlaceholder("dig@firma.dk").fill(credentials.email);
    await page.getByPlaceholder("••••••••", { exact: true }).fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => u.pathname != "/login");
    await page.goto(`${base}/app/projects/${task.projectId}?tab=handlinger&task=${task.actionId}`);
  }
  await page.getByRole("button", { name: "Aflevering", exact: true }).click();
  const panel = page.getByRole("region", { name: "Opgavens afleveringsgrundlag", exact: true });
  await panel.getByLabel("Bemærkning til afleveringen").waitFor();
  let rows = await rpc("list_work_order_submissions", {
    ...scope,
    p_before_version: null,
    p_page_size: 5,
  });
  if (!rows.length) {
    const note = `TEST · submission-lost-${state.run}`;
    await panel.getByLabel("Bemærkning til afleveringen").fill(note);
    let dropped = false;
    const identities = [];
    await page.route(base + "/**", async (route) => {
      const request = route.request(),
        body = request.postData() ?? "";
      if (request.method() === "POST" && body.includes(`submission-lost-${state.run}`)) {
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
    await panel.getByRole("button", { name: "Gem afleveringsversion", exact: true }).click();
    await panel.getByRole("alert").waitFor();
    assert(dropped);
    rows = await rpc("list_work_order_submissions", {
      ...scope,
      p_before_version: null,
      p_page_size: 5,
    });
    assert.equal(rows.length, 1);
    assert.equal(await panel.getByLabel("Bemærkning til afleveringen").inputValue(), note);
    await panel.getByRole("button", { name: "Prøv samme gemning igen", exact: true }).click();
    await panel.getByText(/Afleveringsversion 1 er gemt/).waitFor();
    assert.equal(identities.length, 2);
    assert.deepEqual(identities[0], identities[1]);
    state.lostReplyRetryVerified = true;
    await save();
  }
  rows = await rpc("list_work_order_submissions", {
    ...scope,
    p_before_version: null,
    p_page_size: 5,
  });
  const frozen = JSON.stringify(rows.at(-1));
  assert.equal(rows.at(-1).snapshot.evidence[0].observation_snapshot.values.count, 0);
  assert.equal(rows.at(-1).snapshot.evidence[0].observation_snapshot.values.checked, false);
  assert.equal(rows.at(-1).snapshot.plan.plan.plannedStart, null);
  if (checkIndicatorTarget) {
    assert.deepEqual(rows.at(-1).snapshot.indicatorTarget, {
      indicatorId: state.indicatorId,
      label: indicatorLabel,
      value: 0,
      direction: "at_most",
      unit: "stk.",
    });
  }
  if (rows.length === 1) {
    if (checkIndicatorTarget) {
      ok(
        await client
          .from("indicators")
          .update({ target_value: 5 })
          .eq("project_id", task.projectId)
          .eq("id", state.indicatorId)
          .eq("label", indicatorLabel)
          .select("id")
          .single(),
        "Change the test indicator target",
      );
    } else if (
      (await rpc("get_work_order_submission_context", scope)).basis_hash === rows[0].basis_hash
    ) {
      evidence = [
        await attach(
          evidence[0].version,
          "attached",
          "TEST · Præcisering efter første aflevering",
          await req("correction"),
        ),
      ];
    }
    await panel.getByRole("button", { name: "Hent aktuelt grundlag", exact: true }).click();
    await panel.getByText(/Grundlaget er ændret siden/).waitFor();
    await panel
      .getByLabel("Bemærkning til afleveringen")
      .fill("TEST · Ny version efter præcisering");
    await panel.getByRole("button", { name: "Gem afleveringsversion", exact: true }).click();
    await panel.getByText(/Afleveringsversion 2 er gemt/).waitFor();
  }
  rows = await rpc("list_work_order_submissions", {
    ...scope,
    p_before_version: null,
    p_page_size: 5,
  });
  assert.equal(JSON.stringify(rows.at(-1)), frozen);
  state.historyPreserved = true;
  if (checkRequiredCards) {
    assert.equal(rows[0].snapshot.ruleSet, "freyra.submission-requirements/v1");
    assert.deepEqual(rows[0].snapshot.plan.plan.requiredJobCards, requiredCards);
    assert.equal(
      rows[0].snapshot.evidence[0].observation_snapshot.templateVersionId,
      requiredCards[0].templateVersionId,
    );
    const templates = ok(
      await client
        .from("field_job_template_versions")
        .select("version")
        .eq("template_id", state.requiredTemplateId)
        .order("version", { ascending: false })
        .limit(1),
      "Required template history",
    );
    const before = await rpc("get_work_order_submission_context", scope);
    if (templates[0].version === 1)
      await rpc("save_field_job_template_version", {
        p_organization_id: task.organizationId,
        p_project_id: task.projectId,
        p_template_id: state.requiredTemplateId,
        p_expected_version: 1,
        p_definition: {
          ...requiredCards[0].definition,
          title: "TEST · Ny skabelon, gammelt krav bevaret",
        },
        p_request_id: await req("new-required-template"),
      });
    const after = await rpc("get_work_order_submission_context", scope);
    assert.equal(after.basis_hash, before.basis_hash);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.reload();
      await page.getByRole("button", { name: "Aflevering", exact: true }).click();
      const current = page.getByRole("region", {
        name: "Opgavens afleveringsgrundlag",
        exact: true,
      });
      const details = current.locator("article details").first();
      await details.locator("summary").first().click();
      await current
        .getByText("Jobkort der kræves ved aflevering", { exact: true })
        .first()
        .waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({ path: dir + "/requirements-" + width + ".png", fullPage: true });
    }
    state.requiredJobCardsVerified = [1280, 390];
    await save();
  }

  const article = panel.locator("article").first();
  await article.getByText("Se det fastholdte grundlag", { exact: true }).click();
  if (checkIndicatorTarget) {
    assert.equal(rows[0].snapshot.indicatorTarget.value, 5);
    const oldest = panel.locator("article").last();
    await oldest.getByText("Se det fastholdte grundlag", { exact: true }).click();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await article.getByText("Højst 5 stk.", { exact: true }).waitFor();
      await oldest.getByText("Højst 0 stk.", { exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 1280, height: 844 });
    state.indicatorTargetsVerified = [1280, 390];
    await save();
  }
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    article.getByRole("button", { name: "Åbn fastholdt originalfoto", exact: true }).click(),
  ]);
  await popup.waitForURL(
    (u) => u.origin === url && u.pathname.startsWith("/storage/v1/object/sign/"),
  );
  const original = await browserContext.request.get(popup.url());
  assert.equal(original.status(), 200);
  assert.equal(
    createHash("sha256")
      .update(await original.body())
      .digest("hex"),
    source.originalSha256,
  );
  await popup.close();
  state.originalDownloadVerified = true;
  if (!state.withdrawalVerified) {
    evidence = [
      await attach(
        evidence[0].version,
        "withdrawn",
        "TEST · Afvis original efter tilbagetrækning",
        await req("withdrawal"),
      ),
    ];
    await panel.getByRole("button", { name: "Hent aktuelt grundlag", exact: true }).click();
    await panel.getByText(/Tilknyt mindst én gemt registrering/).waitFor();
    await article.getByRole("button", { name: "Åbn fastholdt originalfoto", exact: true }).click();
    await panel.getByRole("alert").waitFor();
    state.withdrawalVerified = true;
    evidence = [
      await attach(
        evidence[0].version,
        "attached",
        "TEST · Genetabler prøvegrundlag med bevaret historik",
        await req("restore"),
      ),
    ];
    await panel.getByRole("button", { name: "Hent aktuelt grundlag", exact: true }).click();
    await panel
      .getByLabel("Bemærkning til afleveringen")
      .fill("TEST · Aktuelt prøvegrundlag efter adgangskontrol");
    await panel.getByRole("button", { name: "Gem afleveringsversion", exact: true }).click();
    await panel.getByText(/Afleveringsversion 3 er gemt/).waitFor();
  }
  await panel.getByRole("button", { name: "Gem afleveringsversion", exact: true }).waitFor();
  await panel.getByRole("button", { name: "Hent aktuelt grundlag", exact: true }).click();
  await panel.getByText(/Grundlaget er ændret siden/).waitFor({ state: "hidden" });
  await panel
    .getByRole("heading", { name: "Afleveringsgrundlag", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + "/desktop.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel
    .getByRole("heading", { name: "Afleveringsgrundlag", exact: true })
    .scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: dir + "/mobile-390.png", fullPage: false });
  state.mobileWidthVerified = 390;
  await save();
  assert(source.external.email.endsWith("@example.test"));
  const external = ok(
    await reader.auth.signInWithPassword({
      email: source.external.email,
      password: source.external.password,
    }),
    "Synthetic external login",
  );
  assert.equal(external.user.id, source.external.userId);
  assert.equal(external.user.app_metadata.qa_tag, "freyra_staging_evidence");
  externalGrantActive = true;
  let grants = await rpc("get_work_order_access_history", {
    ...scope,
    p_user_id: source.external.userId,
    p_before_version: null,
    p_page_size: 1,
  });
  if (!grants[0]?.active)
    grants = await rpc("save_work_order_access", {
      ...scope,
      p_user_id: source.external.userId,
      p_expected_version: grants[0]?.version ?? 0,
      p_active: true,
      p_can_execute: true,
      p_can_review: false,
      p_reason: "TEST · Afgrænset læseprøve af afleveringen",
      p_request_id: randomUUID(),
    });
  externalGrantActive = true;
  const readContext = ok(
    await reader.rpc("get_work_order_submission_context", scope),
    "External packet context",
  );
  assert.equal(readContext.can_prepare, false);
  assert.equal(readContext.basis_hash, null);
  const packets = ok(
    await reader.rpc("list_work_order_submissions", {
      ...scope,
      p_before_version: null,
      p_page_size: 5,
    }),
    "External assigned packets",
  );
  assert(packets.length >= 2);
  const denied = await reader.rpc("save_work_order_submission", {
    ...scope,
    p_expected_version: packets[0].version,
    p_basis_hash: packets[0].basis_hash,
    p_note: "TEST · Must be denied",
    p_request_id: randomUUID(),
  });
  assert.equal(denied.error?.code, "42501");
  const externalBrowserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const externalPage = await externalBrowserContext.newPage();
  externalPage.setDefaultTimeout(30000);
  await externalPage.goto(base + "/login?next=%2Fopgaver");
  await externalPage.getByPlaceholder("dig@firma.dk", { exact: true }).fill(source.external.email);
  await externalPage.getByPlaceholder("••••••••", { exact: true }).fill(source.external.password);
  await externalPage.locator('button[type="submit"]').click();
  await externalPage.waitForURL((u) => u.pathname != "/login");
  await externalPage.goto(base + "/opgaver");
  const externalTask = externalPage
    .getByRole("article")
    .filter({ has: externalPage.getByRole("heading", { name: title, exact: true }) });
  await externalTask.getByRole("button", { name: "Åbn opgave", exact: true }).click();
  await externalTask.getByText("Se afleveringsversioner", { exact: true }).click();
  const externalPanel = externalTask.getByRole("region", {
    name: "Opgavens afleveringsgrundlag",
    exact: true,
  });
  await externalPanel.getByRole("heading", { name: "Afleveringsversion 3", exact: true }).waitFor();
  assert.equal(await externalPanel.locator("textarea").count(), 0);
  assert.equal(
    await externalPanel
      .getByRole("button", { name: "Gem afleveringsversion", exact: true })
      .count(),
    0,
  );
  assert(await externalPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await externalPanel
    .getByRole("heading", { name: "Afleveringsgrundlag", exact: true })
    .scrollIntoViewIfNeeded();
  await externalPage.screenshot({ path: dir + "/external-mobile-390.png", fullPage: false });
  state.externalBrowserReadOnlyVerified = true;
  await rpc("save_work_order_access", {
    ...scope,
    p_user_id: source.external.userId,
    p_expected_version: grants[0].version,
    p_active: false,
    p_can_execute: false,
    p_can_review: false,
    p_reason: "TEST · Luk ekstern læseprøve",
    p_request_id: randomUUID(),
  });
  externalGrantActive = false;
  await externalPanel.getByRole("button", { name: "Hent aktuelt grundlag", exact: true }).click();
  await externalPanel.getByRole("alert").first().waitFor();
  assert.equal(await externalPanel.getByRole("article").count(), 0);
  state.externalBrowserRevocationVerified = true;
  await externalBrowserContext.close();
  const revoked = await reader.rpc("get_work_order_submission_context", scope);
  assert.equal(revoked.error?.code, "42501");
  state.externalScopedReadAndRevocationVerified = true;
  state.sourceRevision = revision;
  state.projectId = task.projectId;
  state.originalSha256 = source.originalSha256;
  state.latestVersion = (
    await rpc("list_work_order_submissions", { ...scope, p_before_version: null, p_page_size: 1 })
  )[0].version;
  await save();
  console.log(
    JSON.stringify({
      result: "PASS",
      ...Object.fromEntries(Object.entries(state).filter(([k]) => k !== "requests")),
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
  if (externalGrantActive) {
    const grants = await client.rpc("get_work_order_access_history", {
      ...scope,
      p_user_id: source.external.userId,
      p_before_version: null,
      p_page_size: 1,
    });
    if (grants.error) {
      console.error("Check cleanup of the test-only grant");
      process.exitCode = 1;
    } else if (grants.data?.[0]?.active) {
      const cleanup = await client.rpc("save_work_order_access", {
        ...scope,
        p_user_id: source.external.userId,
        p_expected_version: grants.data[0].version,
        p_active: false,
        p_can_execute: false,
        p_can_review: false,
        p_reason: "TEST · Luk efter afbrudt prøve",
        p_request_id: randomUUID(),
      });
      if (cleanup.error) {
        console.error("Check cleanup of the test-only grant");
        process.exitCode = 1;
      }
    }
  }
  await browser?.close();
  await client.auth.signOut({ scope: "local" });
  await reader.auth.signOut({ scope: "local" });
}
