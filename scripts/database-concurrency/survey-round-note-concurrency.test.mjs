/** Seven authored REAL multi-connection schedules. Execute only on root's
 * physically disposable LOCAL stack after the reviewed prior eighteen cases.
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
import {
  quote,
  canonical,
  sha,
  validateNoteFixture,
  bindNoteManifest,
  verifySavedNote,
} from "./survey-round-note-guards.mjs";
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

let memberSnapshot,
  orgSnapshot,
  memberRestore = false,
  orgRestore = false,
  objectASnapshot,
  objectBSnapshot,
  objectCBefore,
  objectCCommitted = false,
  objectCMutationAttempted = false;
const cases = [];
async function restoreMember() {
  const [current] = await query(
    `select to_jsonb(row)::text from public.project_members row where ${memberPredicate};`,
  );
  if (current && canonical(current) !== canonical(memberSnapshot)) {
    assert.equal(current.role, "viewer", "Only the exact owned downgrade may be restored");
    const omitRole = (row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => !["role", "updated_at"].includes(key)),
      );
    assert.deepEqual(
      omitRole(current),
      omitRole(memberSnapshot),
      "Unrelated membership fields cannot be overwritten",
    );
    await query(`delete from public.project_members where ${memberPredicate};`);
  }
  await restore("project_members", memberPredicate, memberSnapshot);
  memberRestore = false;
}
const outcome = (expression) =>
  `set local role service_role; do $test$ declare detail text; begin perform ${expression}; perform set_config('gofreyra.note_outcome','unexpected_success',true); exception when check_violation or insufficient_privilege then get stacked diagnostics detail=message_text; perform set_config('gofreyra.note_outcome',SQLSTATE,true); perform set_config('gofreyra.note_error',detail,true); end $test$; select json_build_object('outcome',current_setting('gofreyra.note_outcome',true),'error',current_setting('gofreyra.note_error',true));`;
const objectRow = (id) =>
  `select to_jsonb(row)::text from storage.objects row where id=${quote(id)}::uuid;`;
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
  assert.equal(identity?.actorId, fixture.actorId);
  assert.equal(identity?.aud, "authenticated");
  assert.equal(identity?.role, "authenticated");
  [objectASnapshot] = await query(objectRow(fixture.originalA.objectId));
  [objectBSnapshot] = await query(objectRow(fixture.originalB.objectId));
  assert(objectASnapshot && objectBSnapshot);
  assert.equal(
    Number(objectBSnapshot.metadata.size),
    fixture.originalB.sizeBytes + 1,
    "Prior B committed size change must already exist",
  );
  const rounds = await query(
    `select to_jsonb(row)::text from public.survey_round_versions row where project_id=${project}::uuid order by version_no;`,
  );
  assert.equal(rounds.length, 4);
  for (const [i, r] of rounds.entries()) {
    assert.equal(r.version_no, i + 1);
    assert.equal(r.status, "draft");
    assert.equal(canonical(r.manifest), fixture.roundCanonicalText);
    assert.equal(r.manifest_sha256, fixture.roundSha256);
  }
  const priorBindings = await query(
    `select to_jsonb(row)::text from public.survey_round_media_versions row where project_id=${project}::uuid order by version_no;`,
  );
  assert.equal(priorBindings.length, 2);
  for (const [i, b] of priorBindings.entries()) {
    assert.equal(b.version_no, i + 1);
    assert.equal(b.round_version_id, rounds[i].id);
    assert.equal(b.original_sha256, fixture.originalA.originalSha256);
    assert.equal(b.manifest_sha256, sha(canonical(b.manifest)));
    assert.equal(b.round_sha256, fixture.roundSha256);
    assert.equal(b.baseline_id, fixture.baselineId);
    assert.equal(b.baseline_sha256, fixture.baselineSha256);
    assert.equal(b.plan_id, fixture.planId);
    assert.equal(b.plan_sha256, fixture.planSha256);
  }
  const priorGraphSql = `select jsonb_build_object('baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),'plans',(select jsonb_agg(to_jsonb(r) order by id) from public.verification_plan_versions r),'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r),'assignments',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_media_versions r where request_id<>${quote(fixture.originalC.bindingRequestId)}::uuid),'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r where id<>${quote(fixture.originalC.uploadId)}::uuid),'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r where source_upload_id<>${quote(fixture.originalC.uploadId)}::uuid),'origins',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_upload_origins r where upload_id<>${quote(fixture.originalC.uploadId)}::uuid),'promotions',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_promotion_requests r where upload_id<>${quote(fixture.originalC.uploadId)}::uuid));`;
  const [priorGraphBefore] = await query(priorGraphSql);
  const [read] = await query(
    `select jsonb_build_object('upload',to_jsonb(u),'object',jsonb_build_object('id',o.id,'version',to_jsonb(o)->>'version','updated_at',o.updated_at,'owner_id',o.owner_id,'size',(o.metadata->>'size')::bigint,'mimetype',o.metadata->>'mimetype')) from public.uploads u join storage.objects o on o.id=${quote(fixture.originalC.objectId)}::uuid where u.id=${quote(fixture.originalC.uploadId)}::uuid and u.project_id=${project}::uuid;`,
  );
  assert.equal(read.upload.uploaded_by, fixture.actorId);
  assert.equal(read.object.owner_id, fixture.actorId);
  assert.equal(read.object.size, fixture.originalC.sizeBytes);
  assert.equal(read.upload.file_size, fixture.originalC.sizeBytes);
  const validation = structuredClone(fixture.originalC.validationTemplate);
  validation.original.object = read.object;
  validation.original.receivedAt = read.upload.received_at;
  assert.equal(validation.original.sha256, fixture.originalC.originalSha256);
  assert.equal(validation.pixelDecoded, false);
  const validationSha = sha(canonical(validation));
  await query(
    `begin; set local role service_role; select public.persist_drone_original_validation(${project}::uuid,${quote(fixture.originalC.uploadId)}::uuid,${actor}::uuid,${quote(read.object.id)}::uuid,${read.object.version === null ? "null" : quote(read.object.version)},${quote(read.object.updated_at)}::timestamptz,${quote(canonical(validation))}::jsonb,${quote(validationSha)})::text; commit;`,
  );
  const [promotion] = await query(
    `begin; set local role service_role; select public.persist_drone_original_promotion(${project}::uuid,${quote(fixture.originalC.uploadId)}::uuid,${actor}::uuid,${quote(fixture.originalC.promotionRequestId)}::uuid,${quote(fixture.originalC.originalSha256)},${quote(validationSha)},${quote(read.object.id)}::uuid,${read.object.version === null ? "null" : quote(read.object.version)},${quote(read.object.updated_at)}::timestamptz)::text; commit;`,
  );
  assert.equal(promotion.media.original_sha256, fixture.originalC.originalSha256);
  assert.equal(promotion.media.original_validation_sha256, validationSha);
  assert.equal(promotion.media.is_report_ready, false);
  const mediaManifest = structuredClone(fixture.originalC.mediaManifestTemplate);
  Object.assign(mediaManifest, {
    roundVersionId: rounds[3].id,
    roundSha256: rounds[3].manifest_sha256,
    mediaId: promotion.media.id,
    originalValidationSha256: validationSha,
  });
  Object.assign(mediaManifest.storage, {
    objectId: read.object.id,
    objectVersion: read.object.version,
    objectUpdatedAt: read.object.updated_at,
  });
  const [bindingC] = await query(
    `begin; set local role service_role; select public.persist_survey_round_media(${project}::uuid,${actor}::uuid,${quote(fixture.originalC.bindingRequestId)}::uuid,${quote(rounds[3].id)}::uuid,${quote(rounds[3].manifest_sha256)},${quote(promotion.media.id)}::uuid,${quote(canonical(mediaManifest))})::text; commit;`,
  );
  assert.equal(bindingC.manifest_sha256, sha(canonical(mediaManifest)));
  assert.deepEqual(bindingC.manifest, mediaManifest);
  assert.equal(bindingC.created_by, fixture.actorId);
  assert.equal(bindingC.version_no, 3);
  const [priorGraphAfterPrepare] = await query(priorGraphSql);
  assert.deepEqual(
    priorGraphAfterPrepare,
    priorGraphBefore,
    "Adding C must not change prior eighteen-case input rows",
  );
  [objectCBefore] = await query(objectRow(fixture.originalC.objectId));
  const graphSql = `select jsonb_build_object('baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),'plans',(select jsonb_agg(to_jsonb(r) order by id) from public.verification_plan_versions r),'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r),'assignments',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_media_versions r),'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r),'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r),'origins',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_upload_origins r),'promotions',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_promotion_requests r));`;
  const [graphBefore] = await query(graphSql);
  const [start] = await query(
    `select json_build_object('notes',(select count(*) from public.survey_round_note_versions),'uploads',(select count(*) from public.uploads),'objects',(select count(*) from storage.objects),'media',(select count(*) from public.project_media),'assignments',(select count(*) from public.survey_round_media_versions));`,
  );
  assert.deepEqual(start, { notes: 0, uploads: 3, objects: 3, media: 3, assignments: 3 });
  const request = (binding = priorBindings[0], logicalNoteId = randomUUID()) => ({
    projectId: fixture.projectId,
    actorId: fixture.actorId,
    requestId: randomUUID(),
    logicalNoteId,
    manifest: bindNoteManifest(fixture.noteManifestTemplate, binding, logicalNoteId),
  });
  const call = (r) =>
    `public.persist_survey_round_note(${project}::uuid,${actor}::uuid,${quote(r.requestId)}::uuid,${quote(r.logicalNoteId)}::uuid,${quote(r.manifest.mediaBindingId)}::uuid,${quote(r.manifest.mediaBindingSha256)},${quote(canonical(r.manifest))})`;
  const saved = (s, r) =>
    verifySavedNote(
      s.jsonLines().find((row) => row.manifest_sha256),
      r,
    );
  // 1. Exact retry waits on the first writer's project lock and returns its row.
  const same = request(),
    first = await transaction(
      `set local role service_role; select ${call(same)}::text;`,
      "NOTE_FIRST_READY",
    );
  await first.marker("NOTE_FIRST_READY");
  const retry = await transaction(
      `set local role service_role; select ${call(same)}::text;`,
      "NOTE_RETRY_READY",
    ),
    retryLock = await actualLock(retry, first);
  await commit(first);
  await retry.marker("NOTE_RETRY_READY");
  await commit(retry);
  const firstRow = saved(first, same);
  assert.deepEqual(saved(retry, same), firstRow);
  cases.push({
    name: "same_caller_request_retry",
    lock: retryLock,
    actorId: firstRow.created_by,
    requestId: same.requestId,
    logicalNoteId: same.logicalNoteId,
    noteId: firstRow.id,
    manifestSha256: firstRow.manifest_sha256,
    oneImmutableWinner: true,
  });
  // 2. Independent logical notes on the same actual assignment/question coexist.
  const independentA = request(),
    independentB = request(),
    indA = await transaction(
      `set local role service_role; select ${call(independentA)}::text;`,
      "NOTE_INDEPENDENT_A_READY",
    );
  await indA.marker("NOTE_INDEPENDENT_A_READY");
  const indB = await transaction(
      `set local role service_role; select ${call(independentB)}::text;`,
      "NOTE_INDEPENDENT_B_READY",
    ),
    indLock = await actualLock(indB, indA);
  await commit(indA);
  await indB.marker("NOTE_INDEPENDENT_B_READY");
  await commit(indB);
  const indARow = saved(indA, independentA),
    indBRow = saved(indB, independentB);
  assert.notEqual(indARow.id, indBRow.id);
  assert.equal(indBRow.version_no, indARow.version_no + 1);
  assert.equal(indARow.question_id, indBRow.question_id);
  assert.equal(indARow.media_binding_id, indBRow.media_binding_id);
  cases.push({
    name: "independent_notes_same_question",
    lock: indLock,
    actorId: fixture.actorId,
    noteIds: [indARow.id, indBRow.id],
    logicalNoteIds: [independentA.logicalNoteId, independentB.logicalNoteId],
    requestIds: [independentA.requestId, independentB.requestId],
    projectVersions: [indARow.version_no, indBRow.version_no],
  });
  // 3. Different requests collide on one stable logical ID; never revise it.
  const logicalWinner = request(),
    logicalLoser = { ...logicalWinner, requestId: randomUUID() },
    winner = await transaction(
      `set local role service_role; select ${call(logicalWinner)}::text;`,
      "NOTE_LOGICAL_WINNER_READY",
    );
  await winner.marker("NOTE_LOGICAL_WINNER_READY");
  const loser = await transaction(outcome(call(logicalLoser)), "NOTE_LOGICAL_LOSER_READY"),
    logicalLock = await actualLock(loser, winner);
  await commit(winner);
  await loser.marker("NOTE_LOGICAL_LOSER_READY");
  await commit(loser);
  const logicalRow = saved(winner, logicalWinner),
    logicalOutcome = loser.jsonLines().find((row) => row.outcome);
  assert.equal(logicalOutcome?.outcome, "23514");
  assert.equal(
    logicalOutcome.error,
    "Logical note already exists; corrections are a separate record type",
  );
  cases.push({
    name: "different_requests_same_logical_note",
    lock: logicalLock,
    actorId: logicalRow.created_by,
    noteId: logicalRow.id,
    logicalNoteId: logicalWinner.logicalNoteId,
    winnerRequestId: logicalWinner.requestId,
    loserRequestId: logicalLoser.requestId,
    loserSqlState: "23514",
  });
  // 4. An earlier committed revoke denies an otherwise exact saved request retry.
  const revoker = await transaction(
    `delete from public.project_members where ${memberPredicate};`,
    "NOTE_REVOKE_HELD",
  );
  await revoker.marker("NOTE_REVOKE_HELD");
  const revoked = await transaction(outcome(call(same)), "NOTE_REVOKED_READY"),
    revokeLock = await actualLock(revoked, revoker);
  memberRestore = true;
  await commit(revoker);
  await revoked.marker("NOTE_REVOKED_READY");
  await commit(revoked);
  assert.equal(revoked.jsonLines().find((row) => row.outcome)?.outcome, "42501");
  await restoreMember();
  cases.push({
    name: "earlier_revoke_denies_exact_retry",
    lock: revokeLock,
    actorId: fixture.actorId,
    requestId: same.requestId,
    noteId: firstRow.id,
    sqlState: "42501",
  });
  // 5. The writer holds captured editor membership while waiting on Storage A.
  // The competing downgrade must itself wait on that exact writer, then commit.
  const storageHolder = await transaction(
    `select to_jsonb(row)::text from storage.objects row where id=${quote(fixture.originalA.objectId)}::uuid for update;`,
    "NOTE_STORAGE_A_HELD",
  );
  await storageHolder.marker("NOTE_STORAGE_A_HELD");
  const capturedRequest = request(),
    captured = await transaction(
      `set local role service_role; select ${call(capturedRequest)}::text;`,
      "NOTE_CAPTURED_READY",
    ),
    capturedStorageLock = await actualLock(captured, storageHolder);
  const downgrade = await transaction(
      `update public.project_members set role='viewer' where ${memberPredicate};`,
      "NOTE_DOWNGRADE_READY",
    ),
    downgradeLock = await actualLock(downgrade, captured);
  memberRestore = true;
  await commit(storageHolder);
  await captured.marker("NOTE_CAPTURED_READY");
  const capturedRow = saved(captured, capturedRequest);
  await actualLock(downgrade, captured);
  await commit(captured);
  await downgrade.marker("NOTE_DOWNGRADE_READY");
  await commit(downgrade);
  const [postDowngrade] = await query(`begin; ${outcome(call(capturedRequest))} commit;`);
  assert.equal(postDowngrade.outcome, "42501");
  await restoreMember();
  cases.push({
    name: "captured_role_completes_before_waiting_downgrade",
    lock: capturedStorageLock,
    downgradeLock,
    actorId: capturedRow.created_by,
    noteId: capturedRow.id,
    requestId: capturedRequest.requestId,
    subsequentRetrySqlState: "42501",
  });
  // 6. A role granted after its absence was captured cannot authorize this call.
  orgRestore = true;
  await query(`delete from public.organization_memberships where ${orgPredicate};`);
  const memberHolder = await transaction(
    `select to_jsonb(row)::text from public.project_members row where ${memberPredicate} for update;`,
    "NOTE_MEMBER_HELD",
  );
  await memberHolder.marker("NOTE_MEMBER_HELD");
  const lateRequest = request(),
    late = await transaction(outcome(call(lateRequest)), "NOTE_LATE_GRANT_READY"),
    grantLock = await actualLock(late, memberHolder);
  await restore("organization_memberships", orgPredicate, orgSnapshot);
  orgRestore = false;
  await commit(memberHolder);
  await late.marker("NOTE_LATE_GRANT_READY");
  await commit(late);
  assert.equal(late.jsonLines().find((row) => row.outcome)?.outcome, "42501");
  cases.push({
    name: "late_grant_after_missing_captured_role",
    lock: grantLock,
    actorId: fixture.actorId,
    requestId: lateRequest.requestId,
    sqlState: "42501",
  });
  // 7. C has a valid saved assignment and positive note before its object changes.
  const controlRequest = request(bindingC);
  const [controlRow] = await query(
    `begin; set local role service_role; select ${call(controlRequest)}::text; commit;`,
  );
  verifySavedNote(controlRow, controlRequest);
  const versionColumnPresent = Object.hasOwn(objectCBefore, "version"),
    versionChange = versionColumnPresent
      ? `,version=(jsonb_populate_record(null::storage.objects,${quote(JSON.stringify({ version: randomUUID() }))}::jsonb)).version`
      : "";
  const mutator = await transaction(
    `update storage.objects set metadata=jsonb_set(metadata,'{size}',to_jsonb(${fixture.originalC.sizeBytes + 1}::bigint))${versionChange} where id=${quote(fixture.originalC.objectId)}::uuid;`,
    "NOTE_STORAGE_C_CHANGED_HELD",
  );
  await mutator.marker("NOTE_STORAGE_C_CHANGED_HELD");
  objectCMutationAttempted = true;
  const changedRetry = await transaction(
      outcome(call(controlRequest)),
      "NOTE_STORAGE_C_RETRY_READY",
    ),
    storageLock = await actualLock(changedRetry, mutator);
  await commit(mutator);
  objectCCommitted = true;
  await changedRetry.marker("NOTE_STORAGE_C_RETRY_READY");
  await commit(changedRetry);
  assert.equal(changedRetry.jsonLines().find((row) => row.outcome)?.outcome, "23514");
  const [objectCAfter] = await query(objectRow(fixture.originalC.objectId));
  assert.notDeepEqual(objectCAfter, objectCBefore);
  assert.equal(Number(objectCAfter.metadata.size), fixture.originalC.sizeBytes + 1);
  if (versionColumnPresent) assert.notEqual(objectCAfter.version, objectCBefore.version);
  cases.push({
    name: "committed_c_version_change_denies_exact_saved_retry",
    lock: storageLock,
    actorId: controlRow.created_by,
    noteId: controlRow.id,
    requestId: controlRequest.requestId,
    bindingId: bindingC.id,
    bindingSha256: bindingC.manifest_sha256,
    sqlState: "23514",
    objectId: fixture.originalC.objectId,
    versionColumnPresent,
    beforeSha256: sha(canonical(objectCBefore)),
    afterSha256: sha(canonical(objectCAfter)),
    beforeVersion: objectCBefore.version ?? null,
    afterVersion: objectCAfter.version ?? null,
    beforeUpdatedAt: objectCBefore.updated_at,
    afterUpdatedAt: objectCAfter.updated_at,
    deliberatelyNotRestored: true,
  });
  const rows = await query(
    `select to_jsonb(row)::text from public.survey_round_note_versions row where project_id=${project}::uuid order by version_no;`,
  );
  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map((r) => r.version_no),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(rows[0], firstRow);
  assert.deepEqual(rows[5], controlRow);
  for (const r of rows) {
    assert.equal(r.created_by, fixture.actorId);
    assert.equal(r.status, "draft_unreviewed");
    assert.equal(r.note_version_no, 1);
    assert.equal(r.manifest_sha256, sha(canonical(r.manifest)));
  }
  const [graphAfter] = await query(graphSql);
  assert.deepEqual(graphAfter, graphBefore);
  const [priorGraphAfter] = await query(priorGraphSql);
  assert.deepEqual(priorGraphAfter, priorGraphBefore);
  const [objectAAfter] = await query(objectRow(fixture.originalA.objectId)),
    [objectBAfter] = await query(objectRow(fixture.originalB.objectId));
  assert.deepEqual(objectAAfter, objectASnapshot);
  assert.deepEqual(objectBAfter, objectBSnapshot);
  await restoreMember();
  await restore("organization_memberships", orgPredicate, orgSnapshot);
  console.log(
    JSON.stringify({
      result: "PASS",
      localOnly: true,
      tests: cases.length,
      rowsAdded: 6,
      actualLockWaitsVerified:
        cases.every((c) => c.lock.verified) && cases[4].downgradeLock.verified,
      actorId: fixture.actorId,
      actorIdentityScope:
        "Exact synthetic auth.users identity and SQL p_actor_id/returned created_by; no JWT or browser authentication proof",
      exactMembershipRestored: true,
      protectedOriginalAStoragePreserved: true,
      priorChangedOriginalBPreservedAsFound: true,
      priorChangedOriginalBSha256: sha(canonical(objectBSnapshot)),
      immutablePriorInputGraphPreserved: true,
      allNoteInputGraphPreserved: true,
      additionalMetadataOnlyOriginals: 1,
      totalMetadataOnlyOriginalFixtures: 3,
      originalBytesUploadedOrStored: false,
      changedStorageCMetadataDeliberatelyNotRestored: true,
      professionalMunicipalOrReportAcceptance: false,
      noteGraphSha256: sha(canonical(rows)),
      cases,
    }),
  );
} finally {
  const open = [...sessions].filter((s) => s.exit === undefined);
  for (const s of open) s.process.kill();
  const start = Date.now();
  while (open.some((s) => s.exit === undefined) && Date.now() - start < 10000) await delay(20);
  assert(
    open.every((s) => s.exit !== undefined),
    "Owned LOCAL sessions must release locks before exact restoration",
  );
  if (memberRestore && memberSnapshot) await restoreMember();
  if (orgRestore && orgSnapshot)
    await restore("organization_memberships", orgPredicate, orgSnapshot);
  if (objectASnapshot) {
    const [row] = await query(objectRow(fixture.originalA.objectId));
    assert.deepEqual(row, objectASnapshot, "A must remain exact on every exit");
  }
  if (objectBSnapshot) {
    const [row] = await query(objectRow(fixture.originalB.objectId));
    assert.deepEqual(row, objectBSnapshot, "Prior B must remain exact as found on every exit");
  }
  if (objectCMutationAttempted)
    console.log(
      JSON.stringify({
        separateOriginalCStorageMutationAttempted: true,
        commitConfirmed: objectCCommitted,
        objectId: fixture.originalC.objectId,
        exactRestoreClaimed: false,
        priorBRestorationClaimed: false,
      }),
    );
}
