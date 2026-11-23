import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { Upload } from "tus-js-client";
import { createClientRpc } from "@tanstack/start-client-core/client-rpc";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { launch, openSession, taskUrl } from "./browser-session.mjs";
import {
  directory,
  fixture,
  env,
  client,
  getUser,
  sessions,
  check,
  ok,
  pool,
  saveFixture,
  finish,
} from "./common.mjs";

const savedSessions = await sessions();
const builtFunctions = await fs.readdir(".output/server/_ssr");
const modulePath = builtFunctions.find((name) =>
  /^field-photo-verification\.functions-.*\.mjs$/.test(name),
);
assert(modulePath, "Build the exact tested candidate first");
const builtSource = await fs.readFile(path.join(".output/server/_ssr", modulePath), "utf8");
const functionId = builtSource.match(/id: "([a-f0-9]+)",\s+name: "verifyFieldPhoto"/)?.[1];
assert(functionId);
process.env.TSS_SERVER_FN_BASE = fixture.app + "/_serverFn/";
const verifyTransport = createClientRpc(functionId);

// Real, deterministic 8x4 PNG pixels. No customer's photograph or external generator.
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(8, 0);
ihdr.writeUInt32BE(4, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const rows = Buffer.alloc(4 * 33);
for (let y = 0; y < 4; y++)
  for (let x = 0; x < 8; x++) {
    const at = y * 33 + 1 + x * 4;
    rows[at] = x * 30;
    rows[at + 1] = y * 60;
    rows[at + 2] = 120;
    rows[at + 3] = 255;
  }
const original = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(rows)),
  chunk("IEND", Buffer.alloc(0)),
]);
const originalHash = createHash("sha256").update(original).digest("hex");
await fs.writeFile(`${directory}/original.png`, original);
fixture.originalSha256 = originalHash;
await saveFixture();

async function rpc(user, name, args) {
  return ok(await client(user).rpc(name, args), name);
}
async function request(tenant, key) {
  tenant.requests ??= {};
  tenant.requests[key] ??= randomUUID();
  await saveFixture();
  return tenant.requests[key];
}
async function step(tenant, name, user, work) {
  tenant.steps ??= {};
  if (tenant.steps[name]) return;
  const result = await check(name, user, work);
  if (result.result !== "PASS") throw new Error(`Stopped tenant ${tenant.number} at ${name}`);
  tenant.steps[name] = true;
  await saveFixture();
}

await pool(fixture.tenants, 2, async (tenant) => {
  const owner = getUser(tenant.number, "owner"),
    manager = getUser(tenant.number, "manager");
  const field = getUser(tenant.number, "field"),
    reviewer = getUser(tenant.number, "reviewer");
  const external = getUser(tenant.number, "external");
  const scope = {
    p_action_id: tenant.actionId,
    p_project_id: tenant.projectId,
    p_organization_id: tenant.organizationId,
  };
  const planData = {
    schema: "freyra.work-order-plan/v1",
    title: `TEST SaaS50 ${fixture.run} opgave ${tenant.number}`,
    description: "TEST · Syntetisk problem og mål, ingen påstået naturforbedring.",
    instructions:
      "TEST · Planlæg, tildel, registrér, vedlæg original og få en anden bruger til at gennemgå.",
    profile: "nature",
    responsibleId: field.id,
    siteId: null,
    watercourseVersionId: null,
    locationNote: "TEST · Syntetisk prøveområde",
    plannedStart: null,
    plannedEnd: null,
    priority: null,
    plannedMethod: "TEST · Kontrolleret automatiseret forløb",
    watercourse: null,
  };
  try {
    await step(tenant, "create-task-and-plan", manager, async () => {
      const existing = ok(
        await client(owner).from("actions").select("id").eq("id", tenant.actionId),
        "Read fixture task",
      );
      if (!existing.length)
        ok(
          await client(owner).from("actions").insert({
            id: tenant.actionId,
            project_id: tenant.projectId,
            title: planData.title,
            description: planData.description,
            status: "Åben",
          }),
          "Create task",
        );
      await rpc(manager, "initialize_work_order", {
        ...scope,
        p_expected_version: 0,
        p_request_id: await request(tenant, "initialize"),
      });
      tenant.plan = (
        await rpc(manager, "save_work_order_plan", {
          ...scope,
          p_expected_version: 0,
          p_plan: planData,
          p_correction_reason: "",
          p_request_id: await request(tenant, "plan"),
        })
      )[0];
      assert.equal(tenant.plan.version, 1);
      return { sharedActionIdentity: true, responsibleIsFieldUser: true };
    });
    await step(tenant, "assignment-to-different-user", manager, async () => {
      tenant.assignment = (
        await rpc(manager, "configure_work_order_assignment", {
          ...scope,
          p_expected_version: 0,
          p_plan_version_id: tenant.plan.id,
          p_mode: "person",
          p_candidate_user_ids: [field.id],
          p_source_group_version_id: null,
          p_reason: "TEST · Tildeling til en anden autentificeret bruger",
          p_request_id: await request(tenant, "assignment"),
        })
      )[0];
      assert.equal(tenant.assignment.version, 1);
      return { differentPlannerAndExecutor: manager.id !== field.id };
    });
    await step(tenant, "job-card-draft-and-recording", field, async () => {
      tenant.template = (
        await rpc(manager, "save_field_job_template_version", {
          p_organization_id: tenant.organizationId,
          p_project_id: tenant.projectId,
          p_template_id: tenant.templateId,
          p_expected_version: 0,
          p_definition: {
            schema: "freyra.field-job-template/v1",
            title: "TEST · Registrering",
            domain: "nature",
            fields: [
              { key: "note", label: "TEST · Observation", type: "textarea", required: true },
              { key: "count", label: "TEST · Antal", type: "number", required: false },
              { key: "checked", label: "TEST · Kontrolleret", type: "boolean", required: false },
            ],
          },
          p_request_id: await request(tenant, "template"),
        })
      )[0];
      const jobArgs = { ...scope, p_template_version_id: tenant.template.id };
      tenant.draft = (
        await rpc(manager, "save_field_job_version", {
          ...jobArgs,
          p_expected_version: 0,
          p_values: { note: "", count: 0, checked: false },
          p_status: "draft",
          p_correction_reason: "",
          p_request_id: await request(tenant, "job-draft"),
        })
      )[0];
      tenant.job = (
        await rpc(field, "save_field_job_version", {
          ...jobArgs,
          p_expected_version: tenant.draft.version,
          p_values: {
            note: "TEST · Gemte observationer til 50-brugerprøven.",
            count: 0,
            checked: false,
          },
          p_status: "recorded",
          p_correction_reason: "TEST · Fra kladde til registreret",
          p_request_id: await request(tenant, "job-recorded"),
        })
      )[0];
      assert.equal(tenant.job.values.count, 0);
      assert.equal(tenant.job.values.checked, false);
      assert.notEqual(tenant.job.id, tenant.draft.id);
      return { draftPreserved: true, zeroAndFalsePreserved: true };
    });
    await step(tenant, "tus-original-server-hash-and-retry", field, async () => {
      const payload = {
        title: "TEST · Syntetisk original",
        description: "TEST · Genererede pixel, ingen virkelig naturregistrering.",
        category: "field_photo",
        tags: ["TEST", "saas50"],
        originalName: "synthetic-original.png",
        sha256: originalHash,
        sizeBytes: original.length,
        mimeType: "image/png",
        capturedAt: null,
        capture: {
          schema: "freyra.field-photo/v1",
          originalPosition: null,
          initialPosition: { lat: 56.1, lng: 10.2 },
          correctionReason: "TEST · Syntetisk manuel placering, ikke kamera-GPS",
        },
      };
      const uploadArgs = { p_project_id: tenant.projectId, p_upload_id: tenant.uploadId };
      const begun = (
        await rpc(field, "begin_field_photo_upload", { ...uploadArgs, p_payload: payload })
      )[0];
      const finalize = await client(field).rpc("finalize_field_photo_upload", uploadArgs);
      if (finalize.error?.code === "P0002") {
        await new Promise((resolve, reject) => {
          const tus = new Upload(original, {
            endpoint: fixture.url + "/storage/v1/upload/resumable",
            uploadSize: original.length,
            headers: {
              authorization: `Bearer ${savedSessions[field.id].access_token}`,
              apikey: env.SUPABASE_PUBLISHABLE_KEY,
              "x-upsert": "false",
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            retryDelays: [0, 1000, 3000],
            metadata: {
              bucketName: "project-media",
              objectName: begun.storage_path,
              contentType: "image/png",
              cacheControl: "3600",
            },
            onSuccess: resolve,
            onError: reject,
          });
          tus.start();
        });
      } else ok(finalize, "Existing original check");
      const received = (await rpc(field, "finalize_field_photo_upload", uploadArgs))[0];
      const retry = (await rpc(field, "finalize_field_photo_upload", uploadArgs))[0];
      assert.equal(received.object_id, retry.object_id);
      const result = await runWithStartContext(
        {
          request: new Request(fixture.app + "/_serverFn/" + functionId),
          startOptions: {},
          contextAfterGlobalMiddlewares: {},
          executedRequestMiddlewares: new Set(),
          handlerType: "serverFn",
          getRouter: () => {
            throw new Error("Transport test does not load a local router");
          },
        },
        () =>
          verifyTransport({
            method: "POST",
            data: {
              projectId: tenant.projectId,
              uploadId: tenant.uploadId,
              expectedActorId: field.id,
            },
            headers: { authorization: `Bearer ${savedSessions[field.id].access_token}` },
          }),
      );
      if (result?.error) throw result.error;
      const receipt = ok(
        await client(field)
          .from("field_photo_receipts")
          .select("status,sha256,size_bytes")
          .eq("upload_id", tenant.uploadId)
          .single(),
        "Real server receipt",
      );
      assert.equal(receipt.status, "verified");
      assert.equal(receipt.sha256, originalHash);
      const downloaded = ok(
        await client(field).storage.from("project-media").download(begun.storage_path),
        "Download original bytes",
      );
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(await downloaded.arrayBuffer()))
          .digest("hex"),
        originalHash,
      );
      tenant.original = {
        sha256: originalHash,
        bytes: original.length,
        objectId: received.object_id,
        path: begun.storage_path,
      };
      return {
        actualTus: true,
        serverReceipt: true,
        downloadHash: true,
        retryDoesNotDuplicate: true,
        manualPositionExplicit: true,
      };
    });
    await step(tenant, "execution-and-bound-evidence", field, async () => {
      const initialArgs = {
        ...scope,
        p_plan_version_id: tenant.plan.id,
        p_expected_plan_version: tenant.plan.version,
        p_expected_version: 0,
        p_performed_by_id: field.id,
        p_deviation_reason: "",
        p_expected_assignment_version_id: tenant.assignment.id,
        p_expected_assignment_version: tenant.assignment.version,
        p_execution: {
          schema: "freyra.action-execution/v1",
          actionId: tenant.actionId,
          surveyRoundId: null,
          dataBasis: "synthetic",
          workType: "other",
          stage: "performed",
          actualDate: "2026-11-03",
          actualEndDate: null,
          method: "TEST · Automatisk prøve",
          reach: "TEST · Prøveområde",
          performedBy: field.name,
          sourceReference: "TEST · SaaS50",
          evidenceIds: [],
          deviation: "",
          correctionReason: "",
          coverage: "limited",
          coverageDescription: "TEST · Ingen påstået faglig naturvirkning.",
        },
        p_request_id: await request(tenant, "execution"),
      };
      tenant.initialExecutionArgs = initialArgs;
      await saveFixture();
      tenant.execution = (await rpc(field, "save_work_order_execution", initialArgs))[0];
      assert.equal(tenant.execution.performed_by_id, field.id);
      if (tenant.number === 1 && !tenant.browserExecutionProof) {
        const browser = await launch();
        try {
          const { page, context } = await openSession(
            browser,
            field,
            savedSessions[field.id],
            tenant,
            390,
          );
          await page.goto(taskUrl(tenant, "execution"));
          await page
            .getByRole("button", { name: "Åbn udførelsesregistrering", exact: true })
            .click();
          await page.getByText(/Du gemmer din egen udførelse på den valgte opgave/).waitFor();
          await page
            .getByLabel("Årsag til rettelse (kræves ved ny version)", { exact: true })
            .fill("TEST · Feltmedarbejder gemmer en ny version fra telefonvisningen.");
          await page.getByRole("button", { name: "Gem udførelsesversion", exact: true }).click();
          await page.getByText(/Udførelsesregistrering gemt som version 2/).waitFor();
          await context.close();
          tenant.browserExecutionProof = true;
          await saveFixture();
        } finally {
          await browser.close();
        }
      }
      if (tenant.number === 2 && !tenant.executionRace) {
        const raceArgs = await Promise.all(
          [field, manager].map(async (actor) => ({
            ...initialArgs,
            p_expected_version: 1,
            p_execution: {
              ...initialArgs.p_execution,
              method: `TEST · Rettelse fra ${actor.role}`,
              correctionReason: "TEST · To forskellige brugere ændrer samme version samtidig",
            },
            p_request_id: await request(tenant, `execution-race-${actor.role}`),
          })),
        );
        const race = await Promise.all(
          [field, manager].map((actor, index) =>
            client(actor).rpc("save_work_order_execution", raceArgs[index]),
          ),
        );
        const winners = race.filter((result) => !result.error);
        assert.equal(winners.length, 1);
        assert.equal(race.find((result) => result.error)?.error.code, "PT409");
        assert.equal(winners[0].data[0].version, 2);
        tenant.executionRace = { distinctWriters: 2, committedVersions: 1, staleConflict: "PT409" };
        await saveFixture();
      }
      if (tenant.browserExecutionProof || tenant.executionRace) {
        tenant.execution = ok(
          await client(field)
            .from("work_order_execution_bindings")
            .select("*")
            .eq("action_id", tenant.actionId)
            .order("version", { ascending: false })
            .limit(1)
            .single(),
          "Latest exact execution revision",
        );
        assert.equal(tenant.execution.version, 2);
      }
      tenant.evidence = (
        await rpc(field, "save_work_order_evidence", {
          ...scope,
          p_evidence_id: tenant.evidenceId,
          p_expected_version: 0,
          p_observation_version_id: tenant.job.id,
          p_upload_id: tenant.uploadId,
          p_execution_revision_id: tenant.execution.workspace_entry_id,
          p_state: "attached",
          p_reason: "TEST · Samme opgave, registrering, udførelse og originale fil",
          p_request_id: await request(tenant, "evidence"),
        })
      )[0];
      return {
        sharedActionIdentity: true,
        originalBoundToRecordedVersion: true,
        actualMobileWrite: !!tenant.browserExecutionProof,
        race: tenant.executionRace ?? null,
      };
    });
    await step(tenant, "lifecycle-and-frozen-submission", field, async () => {
      for (const status of ["draft", "planned", "assigned", "started", "performed"]) {
        const context = (await rpc(field, "get_work_order_lifecycle_context", scope))[0];
        if (
          context.state &&
          ["draft", "planned", "assigned", "started", "performed"].indexOf(context.state.status) >=
            ["draft", "planned", "assigned", "started", "performed"].indexOf(status)
        )
          continue;
        await rpc(
          status === "started" || status === "performed" ? field : manager,
          "mutate_work_order_lifecycle",
          {
            ...scope,
            p_expected_version: context.state?.version ?? 0,
            p_values: {
              operation: "transition",
              targetStatus: status,
              planVersionId: tenant.plan.id,
              assignmentVersionId: tenant.assignment.id,
              executionRevisionId: tenant.execution.workspace_entry_id,
              ...(status === "started"
                ? { startedAt: fixture.createdAt, startedSource: "TEST · Syntetisk tidspunkt" }
                : {}),
            },
            p_request_id: await request(tenant, "state-" + status),
          },
        );
      }
      const context = await rpc(field, "get_work_order_submission_context", scope);
      assert.deepEqual(context.gaps, []);
      tenant.submission = (
        await rpc(field, "save_work_order_submission", {
          ...scope,
          p_expected_version: 0,
          p_basis_hash: context.basis_hash,
          p_note: "TEST · Dokumentationspakke til uafhængig gennemgang",
          p_request_id: await request(tenant, "submission"),
        })
      )[0];
      tenant.firstSubmissionHash = createHash("sha256")
        .update(JSON.stringify(tenant.submission))
        .digest("hex");
      return { frozenVersion: tenant.submission.version, completeCurrentBasis: true };
    });
    await step(tenant, "independent-review-and-idempotency", reviewer, async () => {
      for (const target of [field, reviewer, external]) {
        await rpc(owner, "save_work_order_access", {
          ...scope,
          p_user_id: target.id,
          p_expected_version: 0,
          p_active: true,
          p_can_execute: false,
          p_can_review: target.id !== external.id,
          p_reason: "TEST · Afgrænset adgang, ingen besked",
          p_request_id: await request(tenant, "access-" + target.role),
        });
      }
      const context = await rpc(field, "get_work_order_review_context", scope);
      const values = (operation, targetStatus) => ({
        operation,
        targetStatus,
        submissionVersionId: tenant.submission.id,
        planVersionId: tenant.plan.id,
        assignmentVersionId: tenant.assignment.id,
        executionRevisionId: tenant.execution.workspace_entry_id,
        ...(operation === "review" ? { reviewScope: "execution_and_documentation" } : {}),
        reason: "TEST · Udførelse og dokumentation kontrolleret; ingen naturvirkning vurderet.",
      });
      if (context.state.status === "performed")
        await rpc(field, "mutate_work_order_lifecycle", {
          ...scope,
          p_expected_version: context.state.version,
          p_values: values("submit", "submitted"),
          p_request_id: await request(tenant, "submit"),
        });
      const self = await rpc(field, "get_work_order_review_context", scope);
      assert.equal(self.self_review, true);
      assert.equal(self.can_review, false);
      const denied = await client(field).rpc("mutate_work_order_lifecycle", {
        ...scope,
        p_expected_version: self.state.version,
        p_values: values("review", "approved"),
        p_request_id: randomUUID(),
      });
      assert.equal(denied.error?.code, "42501");
      let independent = await rpc(reviewer, "get_work_order_review_context", scope);
      assert.equal(independent.self_review, false);
      assert.equal(independent.can_review, true);
      if (tenant.number === 3 && !tenant.returnedAndResubmitted) {
        await rpc(field, "save_work_order_evidence", {
          ...scope,
          p_evidence_id: tenant.evidenceId,
          p_expected_version: tenant.evidence.version,
          p_observation_version_id: tenant.job.id,
          p_upload_id: tenant.uploadId,
          p_execution_revision_id: tenant.execution.workspace_entry_id,
          p_state: "attached",
          p_reason: "TEST · Præcisering efter første aflevering",
          p_request_id: await request(tenant, "evidence-correction"),
        });
        const stale = await client(reviewer).rpc("mutate_work_order_lifecycle", {
          ...scope,
          p_expected_version: independent.state.version,
          p_values: values("review", "approved"),
          p_request_id: await request(tenant, "stale-approval"),
        });
        assert.equal(stale.error?.code, "PT409");
        await rpc(reviewer, "mutate_work_order_lifecycle", {
          ...scope,
          p_expected_version: independent.state.version,
          p_values: values("review", "returned"),
          p_request_id: await request(tenant, "return"),
        });
        let current = await rpc(field, "get_work_order_review_context", scope);
        assert.equal(current.state.status, "returned");
        await rpc(field, "mutate_work_order_lifecycle", {
          ...scope,
          p_expected_version: current.state.version,
          p_values: values("reopen", "reopened"),
          p_request_id: await request(tenant, "reopen"),
        });
        current = await rpc(field, "get_work_order_review_context", scope);
        assert.equal(current.state.status, "reopened");
        await rpc(field, "mutate_work_order_lifecycle", {
          ...scope,
          p_expected_version: current.state.version,
          p_values: {
            operation: "transition",
            targetStatus: "performed",
            planVersionId: tenant.plan.id,
            assignmentVersionId: tenant.assignment.id,
            executionRevisionId: tenant.execution.workspace_entry_id,
          },
          p_request_id: await request(tenant, "performed-again"),
        });
        const basis = await rpc(field, "get_work_order_submission_context", scope);
        assert.deepEqual(basis.gaps, []);
        tenant.submission = (
          await rpc(field, "save_work_order_submission", {
            ...scope,
            p_expected_version: 1,
            p_basis_hash: basis.basis_hash,
            p_note: "TEST · Rettet grundlag efter returnering",
            p_request_id: await request(tenant, "submission-2"),
          })
        )[0];
        current = await rpc(field, "get_work_order_review_context", scope);
        await rpc(field, "mutate_work_order_lifecycle", {
          ...scope,
          p_expected_version: current.state.version,
          p_values: values("submit", "submitted"),
          p_request_id: await request(tenant, "submit-2"),
        });
        tenant.returnedAndResubmitted = true;
        await saveFixture();
        independent = await rpc(reviewer, "get_work_order_review_context", scope);
      }
      const args = {
        ...scope,
        p_expected_version: independent.state.version,
        p_values: values("review", "approved"),
        p_request_id: await request(tenant, "approve"),
      };
      const approval = await rpc(reviewer, "mutate_work_order_lifecycle", args);
      const retry = await rpc(reviewer, "mutate_work_order_lifecycle", args);
      assert.deepEqual(approval, retry);
      const final = await rpc(reviewer, "get_work_order_review_context", scope);
      assert.equal(final.state.status, "approved");
      tenant.approved = true;
      const packets = await rpc(field, "list_work_order_submissions", {
        ...scope,
        p_before_version: null,
        p_page_size: 5,
      });
      assert.equal(
        createHash("sha256")
          .update(JSON.stringify(packets.find((packet) => packet.version === 1)))
          .digest("hex"),
        tenant.firstSubmissionHash,
      );
      return {
        selfReviewDenied: true,
        independentReviewer: true,
        retrySingleVersion: true,
        historyPreserved: true,
        returnedAndResubmitted: !!tenant.returnedAndResubmitted,
      };
    });
  } catch (error) {
    tenant.blockedAt = error.message;
    await saveFixture();
  }
});
await finish("workflows");
