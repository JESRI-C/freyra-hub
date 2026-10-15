/** Four authored REAL multi-connection schedules. Execute only on root's
 * physically disposable LOCAL stack after the reviewed prior twenty-five cases.
 * Metadata-only originals; no physical image bytes are written or uploaded.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertDisposableLocalConnection,
  localPsqlChildEnvironment,
} from "./local-database-guard.mjs";
import { quote, canonical, sha, validateNoteFixture } from "./survey-round-note-guards.mjs";
const args = process.argv.slice(2),
  option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
  };
const connection = assertDisposableLocalConnection(option("--database"), {
  disposableLocal: args.includes("--disposable-local"),
  usesTunnel: args.includes("--tunnel"),
});
const childEnvironment = localPsqlChildEnvironment(process.env),
  fixture = validateNoteFixture(JSON.parse(await readFile(option("--fixture"), "utf8")));
const project = quote(fixture.projectId),
  actor = quote(fixture.actorId),
  organization = quote(fixture.organizationId);
const memberPredicate = `project_id=${project}::uuid and user_id=${actor}::uuid`,
  orgPredicate = `organization_id=${organization}::uuid and user_id=${actor}::uuid`;

class Session {
  constructor() {
    this.output = "";
    this.errors = "";
    this.exit = undefined;
    this.process = spawn(
      option("--psql") ?? "psql",
      [
        "--no-psqlrc",
        "--set",
        "ON_ERROR_STOP=1",
        "--tuples-only",
        "--no-align",
        "--quiet",
        "--dbname",
        connection.href,
      ],
      { shell: false, stdio: ["pipe", "pipe", "pipe"], env: childEnvironment },
    );
    this.process.stdout.on("data", (data) => (this.output += data.toString()));
    this.process.stderr.on("data", (data) => (this.errors += data.toString()));
    this.process.on("close", (code) => (this.exit = code));
    this.process.on("error", () => (this.exit = 127));
    this.process.stdin.on("error", () => (this.stdinError = true));
  }
  write(sql) {
    this.process.stdin.write(sql + "\n");
  }
  jsonLines() {
    const lines = this.output.split(/\r?\n/);
    lines.pop();
    return lines.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  }
  async marker(label, timeout = 15000) {
    const start = Date.now();
    while (!this.output.split(/\r?\n/).includes(label)) {
      assert(Date.now() - start < timeout, `LOCAL session timeout before ${label}`);
      assert(this.exit === undefined, `LOCAL session ended before ${label}; exit=${this.exit}`);
      assert(!this.stdinError, "LOCAL stdin failed");
      await delay(20);
    }
  }
  async close() {
    this.process.stdin.end();
    const start = Date.now();
    while (this.exit === undefined && Date.now() - start < 10000) await delay(20);
    assert.equal(this.exit, 0, "LOCAL psql session must finish successfully");
  }
}
const sessions = new Set(),
  session = () => {
    const s = new Session();
    sessions.add(s);
    return s;
  };
async function query(sql) {
  const s = session();
  s.write(`set statement_timeout='15s'; ${sql}\nselect 'DONE';`);
  await s.marker("DONE");
  await s.close();
  return s.jsonLines();
}
async function transaction(sql, label) {
  const s = session();
  s.write(
    `begin; set local statement_timeout='15s'; select json_build_object('pid',pg_backend_pid()); ${sql}\nselect '${label}';`,
  );
  return s;
}
async function pid(s) {
  const start = Date.now();
  while (!s.jsonLines().find((r) => r.pid)) {
    assert(Date.now() - start < 5000, "LOCAL backend PID required");
    assert(s.exit === undefined, "LOCAL backend ended early");
    await delay(20);
  }
  return Number(s.jsonLines().find((r) => r.pid).pid);
}
async function actualLock(waiter, holder) {
  const waiterPid = await pid(waiter),
    holderPid = await pid(holder),
    start = Date.now();
  while (Date.now() - start < 5000) {
    const [row] = await query(
      `select json_build_object('actualLock',wait_event_type='Lock' and ${holderPid}=any(pg_blocking_pids(pid))) from pg_stat_activity where pid=${waiterPid};`,
    );
    if (row?.actualLock === true) return { waiterPid, holderPid, verified: true };
    assert(waiter.exit === undefined, "Writer ended before expected real lock wait");
    await delay(20);
  }
  assert.fail("Writer must actually wait on the designated transaction's lock");
}
async function commit(s) {
  s.write("commit; select 'COMMITTED';");
  await s.marker("COMMITTED");
  await s.close();
}
async function restore(table, predicate, snapshot) {
  const [present] = await query(
    `select jsonb_build_object('row',(select to_jsonb(row) from public.${table} row where ${predicate}));`,
  );
  if (present.row === null)
    await query(
      `insert into public.${table} select * from jsonb_populate_record(null::public.${table},${quote(JSON.stringify(snapshot))}::jsonb);`,
    );
  const [after] = await query(
    `select jsonb_build_object('exact',(select to_jsonb(row)=${quote(JSON.stringify(snapshot))}::jsonb from public.${table} row where ${predicate}));`,
  );
  assert.equal(after.exact, true, `Synthetic ${table} must be restored exactly`);
}

// The existing twenty-five cases supply the canonical immutable graph. This
// fixture projects those saved rows for the SQL persistence boundary only. It
// deliberately does not claim the production compiler/PDF, pixels or delivery.
const publicUrl = (value) => {
  if (value === null) return null;
  const url = new URL(value);
  assert.equal(url.protocol, "https:");
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  url.search = "";
  url.hash = "";
  return url.toString();
};
function manifestFromSaved(context) {
  const { baseline, plan, round, bindings, notes } = context,
    base = baseline.manifest,
    reference = base.reference;
  for (const [row, expectedId, expectedHash] of [
    [baseline, fixture.baselineId, fixture.baselineSha256],
    [plan, fixture.planId, fixture.planSha256],
    [round, round.id, fixture.roundSha256],
  ]) {
    assert.equal(row.project_id, fixture.projectId);
    assert.equal(row.id, expectedId);
    assert.equal(row.manifest_sha256, expectedHash);
    assert.equal(sha(canonical(row.manifest)), expectedHash);
  }
  assert.equal(plan.baseline_id, baseline.id);
  assert.equal(round.baseline_id, baseline.id);
  assert.equal(round.plan_id, plan.id);
  assert.equal(bindings.length, 1);
  assert.equal(notes.length, 5);
  for (const binding of bindings) {
    assert.equal(binding.project_id, fixture.projectId);
    assert.equal(binding.round_version_id, round.id);
    assert.equal(binding.baseline_id, baseline.id);
    assert.equal(binding.plan_id, plan.id);
    assert.equal(binding.manifest_sha256, sha(canonical(binding.manifest)));
    assert.equal(binding.original_sha256, fixture.originalA.originalSha256);
  }
  for (const note of notes) {
    assert.equal(note.project_id, fixture.projectId);
    assert.equal(note.round_version_id, round.id);
    assert.equal(note.media_binding_id, bindings[0].id);
    assert.equal(note.manifest_sha256, sha(canonical(note.manifest)));
    assert(plan.manifest.questions.some((q) => q.id === note.question_id));
  }
  return {
    schema: "gofreyra.municipal-report/v1",
    generatorVersion: "municipal-evidence-report/v1",
    projectId: fixture.projectId,
    // Two distinct instants in the Copenhagen DST fold test only this field.
    generatedAt: "2026-10-25T02:30:00+02:00",
    recipient: "Haderslev Kommune",
    status: "draft_unreviewed",
    reportEligible: false,
    professionallyReviewed: false,
    municipalScopeApproved: false,
    projectName: base.project.name,
    purpose: "Synthetic concurrent SQL persistence and exact source-pin checks only.",
    executiveSummary: ["No compiler, image, PDF, field or municipal acceptance is claimed."],
    pins: {
      baseline: { id: baseline.id, sha256: baseline.manifest_sha256 },
      plan: { id: plan.id, sha256: plan.manifest_sha256 },
      round: { id: round.id, sha256: round.manifest_sha256 },
      mediaBindings: bindings.map((binding) => ({
        id: binding.id,
        sha256: binding.manifest_sha256,
        mediaId: binding.media_id,
        originalSha256: binding.original_sha256,
        originalValidationSha256: binding.original_validation_sha256,
      })),
      notes: notes.map((note) => ({ id: note.id, sha256: note.manifest_sha256 })),
      inspections: [],
      answers: [],
    },
    scope: {
      referenceId: reference.id,
      referenceName: reference.name,
      referenceNameStatus: reference.nameStatus,
      municipalities: reference.municipalities,
      sourceModifiedAt: reference.modifiedAt,
      savedAt: reference.savedAt,
      referenceSourceUrl: publicUrl(reference.sourceUrl),
      period: base.period,
      roundKind: round.manifest.kind,
      roundTitle: round.manifest.title,
      recordingWindow: {
        dateFrom: round.manifest.recordingWindow.dateFrom,
        dateTo: round.manifest.recordingWindow.dateTo,
        timeZone: "Europe/Copenhagen",
      },
      actualCoverage: "not_verified",
      spatialInterpretation: "saved_reference_and_aoi_not_approved_municipal_reach",
    },
    sources: base.sources.map((source) => ({
      id: source.id,
      provider: source.provider,
      dataset: source.dataset,
      datasetVersion: source.datasetVersion,
      sourceUrl: publicUrl(source.sourceUrl),
      sourceModifiedAt: source.sourceModifiedAt,
      fetchedAt: source.fetchedAt,
      requestedFrom: source.query.requestedFrom,
      requestedTo: source.query.requestedTo,
      observedFrom: source.coverage.observedFrom,
      observedTo: source.coverage.observedTo,
      mode: source.mode,
      status: source.status,
      evidenceKind: source.quality.evidenceKind,
      spatialCoverage: source.coverage.spatial,
      temporalCoverage: source.coverage.temporal,
      paginationComplete: source.coverage.paginationComplete,
      returnedCount: source.coverage.returnedCount,
      payloadSha256: source.payloadSha256,
      facts: [],
      limitations: source.quality.warnings,
    })),
    photos: bindings.map((binding) => ({
      bindingId: binding.id,
      bindingSha256: binding.manifest_sha256,
      mediaId: binding.media_id,
      originalSha256: binding.original_sha256,
      originalValidationSha256: binding.original_validation_sha256,
      capturedAtUtc: binding.manifest.sourceMetadata.capture.capturedAtUtc,
      localTimestamp: binding.manifest.sourceMetadata.capture.localTimestamp,
      timezoneKnown: binding.manifest.sourceMetadata.capture.timezoneKnown,
      cameraPosition: binding.manifest.sourceMetadata.cameraPosition,
      captureWithinPlannedWindow: "not_verified",
      manualNotes: notes.map((note) => ({
        id: note.id,
        sha256: note.manifest_sha256,
        createdAt: new Date(note.created_at).toISOString(),
        questionId: note.question_id,
        question: plan.manifest.questions.find((q) => q.id === note.question_id).question,
        qualitativeAnswer: note.manifest.manual.qualitativeAnswer,
        statement: note.manifest.manual.manualStatement,
        uncertainty: note.manifest.manual.uncertainty,
        proposedFollowup: note.manifest.manual.proposedFollowup,
        proposedPriority: note.manifest.manual.proposedPriority,
      })),
      inspections: [],
    })),
    prioritizedFollowup: [],
    deliveryGaps: [
      {
        code: "synthetic-sql-boundary",
        title: "Synthetic SQL concurrency fixture",
        detail: "No saved image inspection or user-answer versions exist in this fixture.",
        evidenceRefs: [],
      },
    ],
    limitations: ["SQL persistence/locking only; not the production report compiler or PDF."],
  };
}

let memberSnapshot,
  orgSnapshot,
  memberRestore = false,
  orgRestore = false,
  inputGraphBefore;
const cases = [];
const graphSql = `select jsonb_build_object(
  'baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),
  'plans',(select jsonb_agg(to_jsonb(r) order by id) from public.verification_plan_versions r),
  'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r),
  'bindings',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_media_versions r),
  'notes',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_note_versions r),
  'inspections',(select jsonb_agg(to_jsonb(r) order by id) from public.drone_image_inspections r),
  'answers',(select jsonb_agg(to_jsonb(r) order by id) from public.drone_image_inspection_answer_versions r),
  'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r),
  'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r),
  'origins',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_upload_origins r),
  'promotions',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_promotion_requests r),
  'storage',(select jsonb_agg(to_jsonb(r) order by id) from storage.objects r));`;
const outcome = (expression) =>
  `set local role service_role; do $test$ begin perform ${expression}; perform set_config('gofreyra.report_outcome','unexpected_success',true); exception when insufficient_privilege then perform set_config('gofreyra.report_outcome',SQLSTATE,true); end $test$; select json_build_object('outcome',current_setting('gofreyra.report_outcome',true));`;
try {
  [memberSnapshot] = await query(
    `select to_jsonb(row)::text from public.project_members row where ${memberPredicate};`,
  );
  [orgSnapshot] = await query(
    `select to_jsonb(row)::text from public.organization_memberships row where ${orgPredicate};`,
  );
  assert.equal(memberSnapshot?.role, "editor");
  assert.equal(orgSnapshot?.role, "viewer");
  const [identity] = await query(
    `select jsonb_build_object('actorId',id,'aud',aud,'role',role) from auth.users where id=${actor}::uuid;`,
  );
  assert.deepEqual(identity, {
    actorId: fixture.actorId,
    aud: "authenticated",
    role: "authenticated",
  });
  const [counts] = await query(`select jsonb_build_object(
    'rounds',(select count(*) from public.survey_round_versions),
    'bindings',(select count(*) from public.survey_round_media_versions),
    'notes',(select count(*) from public.survey_round_note_versions),
    'inspections',(select count(*) from public.drone_image_inspections),
    'answers',(select count(*) from public.drone_image_inspection_answer_versions),
    'reports',(select count(*) from public.municipal_report_versions));`);
  assert.deepEqual(counts, {
    rounds: 4,
    bindings: 3,
    notes: 6,
    inspections: 0,
    answers: 0,
    reports: 0,
  });
  [inputGraphBefore] = await query(graphSql);
  const [context] = await query(`select jsonb_build_object(
    'baseline',(select to_jsonb(r) from public.project_baseline_snapshots r where id=${quote(fixture.baselineId)}::uuid),
    'plan',(select to_jsonb(r) from public.verification_plan_versions r where id=${quote(fixture.planId)}::uuid),
    'round',to_jsonb(round),
    'bindings',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_media_versions r where round_version_id=round.id),
    'notes',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_note_versions r where round_version_id=round.id))
    from public.survey_round_versions round where project_id=${project}::uuid and version_no=1;`);
  const manifest = manifestFromSaved(context),
    request = (generatedAt = manifest.generatedAt) => ({
      requestId: randomUUID(),
      manifest: { ...manifest, generatedAt },
    }),
    call = (r) =>
      `public.persist_municipal_report(${project}::uuid,${actor}::uuid,${quote(r.requestId)}::uuid,${quote(canonical(r.manifest))})`,
    saved = (s, r) => {
      const row = s.jsonLines().find((value) => value.manifest_sha256);
      assert(row, "Actual saved report receipt required");
      assert.equal(row.project_id, fixture.projectId);
      assert.equal(row.created_by, fixture.actorId);
      assert.equal(row.request_id, r.requestId);
      assert.equal(row.manifest_text, canonical(r.manifest));
      assert.equal(row.manifest_sha256, sha(row.manifest_text));
      assert.deepEqual(row.manifest, r.manifest);
      assert.equal(Date.parse(row.generated_at), Date.parse(r.manifest.generatedAt));
      assert.equal(row.status, "draft_unreviewed");
      for (const flag of ["report_eligible", "professionally_reviewed", "municipal_scope_approved"])
        assert.equal(row[flag], false);
      return row;
    };
  // 1. One request with only generatedAt changed waits and returns the first row.
  const same = request(),
    later = { ...same, manifest: { ...same.manifest, generatedAt: "2026-10-25T02:30:00+01:00" } };
  assert.equal(
    Date.parse(later.manifest.generatedAt) - Date.parse(same.manifest.generatedAt),
    3600000,
  );
  const withoutGeneratedAt = ({ generatedAt: _ignored, ...content }) => content;
  assert.deepEqual(withoutGeneratedAt(later.manifest), withoutGeneratedAt(same.manifest));
  const first = await transaction(
    `set local role service_role; select ${call(same)}::text;`,
    "REPORT_FIRST_READY",
  );
  await first.marker("REPORT_FIRST_READY");
  const retry = await transaction(
      `set local role service_role; select ${call(later)}::text;`,
      "REPORT_RETRY_READY",
    ),
    retryLock = await actualLock(retry, first);
  await commit(first);
  await retry.marker("REPORT_RETRY_READY");
  await commit(retry);
  const firstRow = saved(first, same);
  assert.deepEqual(saved(retry, same), firstRow);
  const [dedup] = await query(
    `select jsonb_build_object('count',count(*)) from public.municipal_report_versions where project_id=${project}::uuid and created_by=${actor}::uuid and request_id=${quote(same.requestId)}::uuid;`,
  );
  assert.equal(dedup.count, 1);
  cases.push({
    name: "same_request_distinct_generation_instants_deduplicate",
    lock: retryLock,
    requestId: same.requestId,
    reportId: firstRow.id,
    manifestSha256: firstRow.manifest_sha256,
    ignoredField: "generatedAt_only",
    copenhagenDstFoldInstantsDifferMs: 3600000,
    oneImmutableWinner: true,
  });

  // 2. Different requests serialize into distinct consecutive project versions.
  const independentA = request(),
    independentB = request(),
    writerA = await transaction(
      `set local role service_role; select ${call(independentA)}::text;`,
      "REPORT_A_READY",
    );
  await writerA.marker("REPORT_A_READY");
  const writerB = await transaction(
      `set local role service_role; select ${call(independentB)}::text;`,
      "REPORT_B_READY",
    ),
    independentLock = await actualLock(writerB, writerA);
  await commit(writerA);
  await writerB.marker("REPORT_B_READY");
  await commit(writerB);
  const rowA = saved(writerA, independentA),
    rowB = saved(writerB, independentB);
  assert.notEqual(rowA.id, rowB.id);
  assert.notEqual(rowA.request_id, rowB.request_id);
  assert.equal(rowA.manifest_sha256, rowB.manifest_sha256);
  assert.equal(rowB.version_no, rowA.version_no + 1);
  cases.push({
    name: "different_requests_distinct_ordered_versions",
    lock: independentLock,
    requestIds: [rowA.request_id, rowB.request_id],
    reportIds: [rowA.id, rowB.id],
    projectVersions: [rowA.version_no, rowB.version_no],
  });

  // 3. Writer's captured editor role blocks its revoke until the report commits.
  const capturedRequest = request(),
    captured = await transaction(
      `set local role service_role; select ${call(capturedRequest)}::text;`,
      "REPORT_CAPTURED_READY",
    );
  await captured.marker("REPORT_CAPTURED_READY");
  const revoker = await transaction(
      `delete from public.project_members where ${memberPredicate};`,
      "REPORT_MEMBER_REVOKED",
    ),
    writerWinsLock = await actualLock(revoker, captured);
  memberRestore = true;
  await commit(captured);
  await revoker.marker("REPORT_MEMBER_REVOKED");
  await commit(revoker);
  const capturedRow = saved(captured, capturedRequest),
    [postRevoke] = await query(`begin; ${outcome(call(capturedRequest))} commit;`);
  assert.equal(postRevoke.outcome, "42501");
  await restore("project_members", memberPredicate, memberSnapshot);
  memberRestore = false;
  cases.push({
    name: "captured_project_role_commits_before_waiting_revoke",
    lock: writerWinsLock,
    reportId: capturedRow.id,
    requestId: capturedRequest.requestId,
    subsequentRetrySqlState: "42501",
  });

  // 4. Earlier org revoke blocks a new writer, then denies its otherwise valid pins.
  const orgRevoker = await transaction(
    `delete from public.organization_memberships where ${orgPredicate};`,
    "REPORT_ORG_REVOKE_HELD",
  );
  await orgRevoker.marker("REPORT_ORG_REVOKE_HELD");
  const deniedRequest = request(),
    denied = await transaction(outcome(call(deniedRequest)), "REPORT_ORG_DENIED"),
    revokeWinsLock = await actualLock(denied, orgRevoker);
  orgRestore = true;
  await commit(orgRevoker);
  await denied.marker("REPORT_ORG_DENIED");
  await commit(denied);
  assert.equal(denied.jsonLines().find((row) => row.outcome)?.outcome, "42501");
  const [notInserted] = await query(
    `select jsonb_build_object('count',count(*)) from public.municipal_report_versions where request_id=${quote(deniedRequest.requestId)}::uuid;`,
  );
  assert.equal(notInserted.count, 0);
  await restore("organization_memberships", orgPredicate, orgSnapshot);
  orgRestore = false;
  cases.push({
    name: "earlier_organization_revoke_denies_new_report",
    lock: revokeWinsLock,
    requestId: deniedRequest.requestId,
    sqlState: "42501",
    rowsAdded: 0,
  });

  const rows = await query(
    `select to_jsonb(row)::text from public.municipal_report_versions row where project_id=${project}::uuid order by version_no;`,
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.version_no),
    [1, 2, 3, 4],
  );
  assert.deepEqual(rows, [firstRow, rowA, rowB, capturedRow]);
  const [inputGraphAfter] = await query(graphSql);
  assert.deepEqual(inputGraphAfter, inputGraphBefore);
  await restore("project_members", memberPredicate, memberSnapshot);
  await restore("organization_memberships", orgPredicate, orgSnapshot);
  console.log(
    JSON.stringify({
      result: "PASS",
      localOnly: true,
      tests: cases.length,
      rowsAdded: 4,
      actualLockWaitsVerified: cases.every((c) => c.lock.verified),
      actorId: fixture.actorId,
      actorIdentityScope:
        "Exact synthetic auth.users identity and SQL actor/receipt; no JWT or browser-authentication proof",
      exactMembershipRestored: true,
      immutableInputGraphPreserved: true,
      priorChangedStorageBAndCPreservedAsFound: true,
      fixtureKind: "actual_saved_source_pins_with_synthetic_SQL_boundary_projection",
      productionReportCompilerExecuted: false,
      pdfGenerated: false,
      metadataOnlyOriginalFixtures: 3,
      originalBytesUploadedOrStored: false,
      professionalMunicipalOrReportAcceptance: false,
      reportGraphSha256: sha(canonical(rows)),
      inputGraphSha256: sha(canonical(inputGraphBefore)),
      cases,
    }),
  );
} finally {
  // Kill every owned transaction before restoring only our exact membership rows.
  // Workflow always() still stops the physical stack and preserves failure logs.
  const open = [...sessions].filter((s) => s.exit === undefined);
  for (const s of open) s.process.kill();
  const start = Date.now();
  while (open.some((s) => s.exit === undefined) && Date.now() - start < 10000) await delay(20);
  assert(
    open.every((s) => s.exit !== undefined),
    "Owned LOCAL sessions must release locks before exact restoration",
  );
  if (memberRestore && memberSnapshot)
    await restore("project_members", memberPredicate, memberSnapshot);
  if (orgRestore && orgSnapshot)
    await restore("organization_memberships", orgPredicate, orgSnapshot);
  if (inputGraphBefore) {
    const [after] = await query(graphSql);
    assert.deepEqual(
      after,
      inputGraphBefore,
      "Prior twenty-five-case inputs must remain exact on every exit",
    );
  }
}
