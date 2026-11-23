/** Five REAL multi-connection scenarios, only on root's disposable LOCAL stack.
 * No DB execution during authoring. No image bytes are stored or uploaded.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertDisposableLocalConnection,
  localPsqlChildEnvironment,
} from "./local-database-guard.mjs";
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
  fixture = JSON.parse(await readFile(option("--fixture"), "utf8"));
assert.equal(fixture.schema, "gofreyra.disposable-round-media-fixture/v1");
assert.equal(fixture.syntheticOnly, true);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
for (const key of [
  "projectId",
  "actorId",
  "organizationId",
  "uploadId",
  "objectId",
  "promotionRequestId",
])
  assert(uuid.test(fixture[key]), "Reviewed synthetic UUID required");
for (const key of ["uploadId", "objectId", "promotionRequestId"])
  assert(
    uuid.test(fixture.changedOriginal[key]),
    "Separate synthetic changed-object UUID required",
  );
assert.notEqual(
  fixture.originalSha256,
  fixture.changedOriginal.originalSha256,
  "Separate original must not deduplicate to protected fixture",
);
assert.equal(fixture.originalBytesUploadedOrStored, false);
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const canonical = (v) =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? "[" + v.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(v)
          .sort()
          .map((key) => JSON.stringify(key) + ":" + canonical(v[key]))
          .join(",") +
        "}";
const sha = (v) => createHash("sha256").update(v).digest("hex");
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
  protectedObjectSnapshot,
  changedObjectBefore,
  changedObjectCommitted = false,
  changedObjectMutationAttempted = false;
const cases = [];
try {
  [memberSnapshot] = await query(
    `select to_jsonb(row)::text from public.project_members row where ${memberPredicate};`,
  );
  [orgSnapshot] = await query(
    `select to_jsonb(row)::text from public.organization_memberships row where ${orgPredicate};`,
  );
  assert.equal(memberSnapshot?.role, "editor");
  assert.equal(orgSnapshot?.role, "viewer");
  const rounds = await query(
    `select to_jsonb(row)::text from public.survey_round_versions row where project_id=${project}::uuid order by version_no;`,
  );
  assert.equal(rounds.length, 4, "Four actual previous Round versions required");
  for (const [index, round] of rounds.entries()) {
    assert.equal(round.version_no, index + 1);
    assert.equal(round.status, "draft");
    assert.equal(canonical(round.manifest), fixture.roundCanonicalText);
    assert.equal(round.manifest_sha256, fixture.roundSha256);
  }
  // Bind the author-generated full validator template to ACTUAL local Storage pins.
  const prepareOriginal = async (original) => {
    const [read] = await query(
      `select jsonb_build_object('upload',to_jsonb(upload),'object',jsonb_build_object('id',object.id,'version',to_jsonb(object)->>'version','updated_at',object.updated_at,'owner_id',object.owner_id,'size',(object.metadata->>'size')::bigint,'mimetype',object.metadata->>'mimetype')) from public.uploads upload join storage.objects object on object.id=${quote(original.objectId)}::uuid where upload.id=${quote(original.uploadId)}::uuid and upload.project_id=${project}::uuid;`,
    );
    assert(read?.upload && read?.object);
    assert.equal(read.upload.uploaded_by, fixture.actorId);
    assert.equal(read.upload.file_size, original.sizeBytes);
    assert.equal(read.object.owner_id, fixture.actorId);
    assert.equal(read.object.size, original.sizeBytes);
    assert.equal(read.object.mimetype, "image/jpeg");
    const validation = structuredClone(original.validationTemplate);
    validation.original.object = read.object;
    validation.original.receivedAt = read.upload.received_at;
    assert.equal(validation.original.sha256, original.originalSha256);
    assert.equal(validation.uploadId, original.uploadId);
    assert.equal(validation.projectId, fixture.projectId);
    assert.equal(validation.pixelDecoded, false);
    const validationSha = sha(canonical(validation));
    await query(
      `begin; set local role service_role; select public.persist_drone_original_validation(${project}::uuid,${quote(original.uploadId)}::uuid,${actor}::uuid,${quote(read.object.id)}::uuid,${read.object.version === null ? "null" : quote(read.object.version)},${quote(read.object.updated_at)}::timestamptz,${quote(canonical(validation))}::jsonb,${quote(validationSha)})::text; commit;`,
    );
    const [promotion] = await query(
      `begin; set local role service_role; select public.persist_drone_original_promotion(${project}::uuid,${quote(original.uploadId)}::uuid,${actor}::uuid,${quote(original.promotionRequestId)}::uuid,${quote(original.originalSha256)},${quote(validationSha)},${quote(read.object.id)}::uuid,${read.object.version === null ? "null" : quote(read.object.version)},${quote(read.object.updated_at)}::timestamptz)::text; commit;`,
    );
    assert.equal(promotion.media.original_sha256, original.originalSha256);
    assert.equal(promotion.media.original_validation_sha256, validationSha);
    assert.equal(promotion.media.is_report_ready, false);
    return { ...original, mediaId: promotion.media.id, object: read.object, validationSha };
  };
  const original = await prepareOriginal(fixture),
    changedOriginal = await prepareOriginal(fixture.changedOriginal);
  assert.notEqual(original.mediaId, changedOriginal.mediaId);
  const [start] = await query(
    `select json_build_object('bindings',(select count(*) from public.survey_round_media_versions),'uploads',(select count(*) from public.uploads),'media',(select count(*) from public.project_media),'objects',(select count(*) from storage.objects),'origins',(select count(*) from public.project_media_upload_origins),'promotions',(select count(*) from public.project_media_promotion_requests));`,
  );
  assert.deepEqual(start, {
    bindings: 0,
    uploads: 2,
    media: 2,
    objects: 2,
    origins: 2,
    promotions: 2,
  });
  [protectedObjectSnapshot] = await query(
    `select to_jsonb(row)::text from storage.objects row where id=${quote(original.objectId)}::uuid;`,
  );
  [changedObjectBefore] = await query(
    `select to_jsonb(row)::text from storage.objects row where id=${quote(changedOriginal.objectId)}::uuid;`,
  );
  const protectedGraphSql = `select jsonb_build_object('baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),'rounds',(select jsonb_agg(to_jsonb(row) order by id) from public.survey_round_versions row),'uploads',(select jsonb_agg(to_jsonb(row) order by id) from public.uploads row),'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),'promotions',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row));`;
  const [protectedGraphBefore] = await query(protectedGraphSql);
  const manifestFor = (round, source) => {
    const m = structuredClone(source.mediaManifestTemplate);
    m.roundVersionId = round.id;
    m.roundSha256 = round.manifest_sha256;
    m.mediaId = source.mediaId;
    m.originalValidationSha256 = source.validationSha;
    m.storage.objectId = source.object.id;
    m.storage.objectVersion = source.object.version;
    m.storage.objectUpdatedAt = source.object.updated_at;
    assert.equal(m.projectId, fixture.projectId);
    assert.equal(m.originalSha256, source.originalSha256);
    assert(Object.values(m.acceptance).every((v) => v === false));
    return canonical(m);
  };
  const call = (round, source, request) =>
    `public.persist_survey_round_media(${project}::uuid,${actor}::uuid,${quote(request)}::uuid,${quote(round.id)}::uuid,${quote(round.manifest_sha256)},${quote(source.mediaId)}::uuid,${quote(manifestFor(round, source))})`;
  const outcome = (expression) =>
    `set local role service_role; do $test$ declare detail text; begin perform ${expression}; perform set_config('gofreyra.media_outcome','unexpected_success',true); exception when check_violation or insufficient_privilege then get stacked diagnostics detail=message_text; perform set_config('gofreyra.media_outcome',SQLSTATE,true); perform set_config('gofreyra.media_error',detail,true); end $test$; select json_build_object('outcome',current_setting('gofreyra.media_outcome',true),'error',current_setting('gofreyra.media_error',true));`;
  // 1: actual concurrent retry returns the complete same immutable receipt.
  const sameRequest = randomUUID(),
    first = await transaction(
      `set local role service_role; select ${call(rounds[0], original, sameRequest)}::text;`,
      "FIRST_READY",
    );
  await first.marker("FIRST_READY");
  const retry = await transaction(
    `set local role service_role; select ${call(rounds[0], original, sameRequest)}::text;`,
    "RETRY_READY",
  );
  const retryLock = await actualLock(retry, first);
  await commit(first);
  await retry.marker("RETRY_READY");
  await commit(retry);
  const firstRow = first.jsonLines().find((r) => r.manifest_sha256),
    retryRow = retry.jsonLines().find((r) => r.manifest_sha256);
  assert.deepEqual(retryRow, firstRow);
  assert.equal(firstRow.manifest_sha256, sha(manifestFor(rounds[0], original)));
  cases.push({
    name: "same_caller_request_retry",
    lock: retryLock,
    bindingId: firstRow.id,
    manifestSha256: firstRow.manifest_sha256,
    oneImmutableWinner: true,
  });
  // 2: distinct requests for the same pair have one deterministic 23514 loser.
  const winningRequest = randomUUID(),
    winner = await transaction(
      `set local role service_role; select ${call(rounds[1], original, winningRequest)}::text;`,
      "WINNER_READY",
    );
  await winner.marker("WINNER_READY");
  const loser = await transaction(outcome(call(rounds[1], original, randomUUID())), "LOSER_READY");
  const uniqueLock = await actualLock(loser, winner);
  await commit(winner);
  await loser.marker("LOSER_READY");
  await commit(loser);
  const loserResult = loser.jsonLines().find((r) => r.outcome),
    winnerRow = winner.jsonLines().find((r) => r.manifest_sha256);
  assert.equal(loserResult?.outcome, "23514");
  assert.equal(
    loserResult.error,
    "Original is already assigned to this saved round; revisions are not supported",
  );
  assert.equal(winnerRow.request_id, winningRequest);
  cases.push({
    name: "different_requests_unique_pair",
    lock: uniqueLock,
    bindingId: winnerRow.id,
    manifestSha256: winnerRow.manifest_sha256,
    loserSqlState: loserResult.outcome,
    deterministicConflict: true,
  });
  // 3: a revoke that commits before the current membership lock denies writing.
  const revoker = await transaction(
    `delete from public.project_members where ${memberPredicate};`,
    "REVOKE_HELD",
  );
  await revoker.marker("REVOKE_HELD");
  const revokedWriter = await transaction(
    outcome(call(rounds[2], original, randomUUID())),
    "REVOKED_WRITER_READY",
  );
  const revokeLock = await actualLock(revokedWriter, revoker);
  memberRestore = true;
  await commit(revoker);
  await revokedWriter.marker("REVOKED_WRITER_READY");
  await commit(revokedWriter);
  assert.equal(revokedWriter.jsonLines().find((r) => r.outcome)?.outcome, "42501");
  await restore("project_members", memberPredicate, memberSnapshot);
  memberRestore = false;
  cases.push({ name: "earlier_role_revocation", lock: revokeLock, sqlState: "42501" });
  // 4: a later org grant cannot replace the absent role captured before waiting.
  orgRestore = true;
  await query(`delete from public.organization_memberships where ${orgPredicate};`);
  const memberHolder = await transaction(
    `select to_jsonb(row)::text from public.project_members row where ${memberPredicate} for update;`,
    "MEMBER_HELD",
  );
  await memberHolder.marker("MEMBER_HELD");
  const lateGrantWriter = await transaction(
    outcome(call(rounds[2], original, randomUUID())),
    "LATE_GRANT_READY",
  );
  const grantLock = await actualLock(lateGrantWriter, memberHolder);
  await restore("organization_memberships", orgPredicate, orgSnapshot);
  orgRestore = false;
  await commit(memberHolder);
  await lateGrantWriter.marker("LATE_GRANT_READY");
  await commit(lateGrantWriter);
  assert.equal(lateGrantWriter.jsonLines().find((r) => r.outcome)?.outcome, "42501");
  cases.push({
    name: "late_grant_after_missing_captured_role",
    lock: grantLock,
    sqlState: "42501",
  });
  // 5: a DIFFERENT metadata-only original is deliberately changed and COMMITTED.
  // Vendor timestamp triggers stay enabled. Its old timestamp is not fabricated back.
  const versionColumnPresent = Object.hasOwn(changedObjectBefore, "version");
  const versionChange = versionColumnPresent
    ? `,version=(jsonb_populate_record(null::storage.objects,${quote(JSON.stringify({ version: randomUUID() }))}::jsonb)).version`
    : "";
  const storageMutator = await transaction(
    `update storage.objects set metadata=jsonb_set(metadata,'{size}',to_jsonb(${changedOriginal.sizeBytes + 1}::bigint))${versionChange} where id=${quote(changedOriginal.objectId)}::uuid; select to_jsonb(row)::text from storage.objects row where id=${quote(changedOriginal.objectId)}::uuid;`,
    "STORAGE_CHANGED_HELD",
  );
  await storageMutator.marker("STORAGE_CHANGED_HELD");
  changedObjectMutationAttempted = true;
  const storageWriter = await transaction(
    outcome(call(rounds[3], changedOriginal, randomUUID())),
    "STORAGE_WRITER_READY",
  );
  const storageLock = await actualLock(storageWriter, storageMutator);
  await commit(storageMutator);
  changedObjectCommitted = true;
  await storageWriter.marker("STORAGE_WRITER_READY");
  await commit(storageWriter);
  assert.equal(storageWriter.jsonLines().find((r) => r.outcome)?.outcome, "23514");
  const [changedAfter] = await query(
    `select to_jsonb(row)::text from storage.objects row where id=${quote(changedOriginal.objectId)}::uuid;`,
  );
  assert.notDeepEqual(changedAfter, changedObjectBefore);
  assert.equal(Number(changedAfter.metadata.size), changedOriginal.sizeBytes + 1);
  if (versionColumnPresent) assert.notEqual(changedAfter.version, changedObjectBefore.version);
  cases.push({
    name: "committed_active_storage_metadata_change",
    lock: storageLock,
    sqlState: "23514",
    objectId: changedOriginal.objectId,
    versionColumnPresent,
    beforeSha256: sha(canonical(changedObjectBefore)),
    afterSha256: sha(canonical(changedAfter)),
    beforeVersion: changedObjectBefore.version ?? null,
    afterVersion: changedAfter.version ?? null,
    beforeUpdatedAt: changedObjectBefore.updated_at,
    afterUpdatedAt: changedAfter.updated_at,
    deliberatelyNotRestored: true,
    reason: "Separate disposable metadata fixture; vendor updated_at trigger remains enabled",
  });
  const [after] = await query(
    `select jsonb_build_object('rows',jsonb_agg(to_jsonb(row) order by version_no),'count',count(*),'changedOriginalBindings',count(*) filter(where media_id=${quote(changedOriginal.mediaId)}::uuid)) from public.survey_round_media_versions row;`,
  );
  assert.equal(Number(after.count), 2);
  assert.equal(Number(after.changedOriginalBindings), 0);
  assert.deepEqual(
    after.rows.map((row) => row.version_no),
    [1, 2],
  );
  assert.equal(after.rows[0].id, firstRow.id);
  assert.equal(after.rows[1].id, winnerRow.id);
  const [protectedGraphAfter] = await query(protectedGraphSql);
  assert.deepEqual(protectedGraphAfter, protectedGraphBefore);
  const [protectedObjectAfter] = await query(
    `select to_jsonb(row)::text from storage.objects row where id=${quote(original.objectId)}::uuid;`,
  );
  assert.deepEqual(protectedObjectAfter, protectedObjectSnapshot);
  await restore("project_members", memberPredicate, memberSnapshot);
  await restore("organization_memberships", orgPredicate, orgSnapshot);
  console.log(
    JSON.stringify({
      localOnly: true,
      tests: cases.length,
      result: "PASS",
      actualLockWaitsVerified: cases.every((c) => c.lock.verified),
      exactMembershipRestored: true,
      protectedOriginalStoragePreserved: true,
      immutableInputGraphPreserved: true,
      changedStorageMetadataFixtureDeliberatelyNotRestored: true,
      rowsAdded: 2,
      metadataOnlyOriginalFixtures: 2,
      originalBytesUploadedOrStored: false,
      pixelDecoded: false,
      professionalMunicipalOrReportAcceptance: false,
      bindingGraphSha256: sha(canonical(after.rows)),
      cases,
    }),
  );
} finally {
  // Kill only our children, await backend release, and restore ONLY memberships.
  // The separately committed changed-object fixture remains changed by design.
  const open = [...sessions].filter((s) => s.exit === undefined);
  for (const s of open) s.process.kill();
  const start = Date.now();
  while (open.some((s) => s.exit === undefined) && Date.now() - start < 10000) await delay(20);
  assert(
    open.every((s) => s.exit !== undefined),
    "Owned LOCAL sessions must release locks before restoration",
  );
  if (memberRestore && memberSnapshot)
    await restore("project_members", memberPredicate, memberSnapshot);
  if (orgRestore && orgSnapshot)
    await restore("organization_memberships", orgPredicate, orgSnapshot);
  if (protectedObjectSnapshot) {
    const [current] = await query(
      `select to_jsonb(row)::text from storage.objects row where id=${quote(fixture.objectId)}::uuid;`,
    );
    assert.deepEqual(
      current,
      protectedObjectSnapshot,
      "Protected original Storage row remains exact on every exit",
    );
  }
  if (changedObjectMutationAttempted)
    console.log(
      JSON.stringify({
        separateChangedStorageMetadataFixtureMutationAttempted: true,
        commitConfirmed: changedObjectCommitted,
        objectId: fixture.changedOriginal.objectId,
        exactRestoreClaimed: false,
      }),
    );
}
