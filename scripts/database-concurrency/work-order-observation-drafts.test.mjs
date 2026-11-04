/** Real psql sessions against an explicitly disposable, migrated LOCAL stack. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertDisposableLocalConnection,
  localPsqlChildEnvironment,
} from "./local-database-guard.mjs";

const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index++) {
  const name = args[index];
  assert(
    ["--database", "--psql", "--disposable-local", "--tunnel"].includes(name),
    "Only explicit disposable LOCAL test options are accepted",
  );
  assert(!options.has(name), "Duplicate test options are refused");
  if (["--database", "--psql"].includes(name)) {
    const value = args[++index];
    assert(value && !value.startsWith("--"), "A connection or psql option value is required");
    options.set(name, value);
  } else options.set(name, true);
}
const connection = assertDisposableLocalConnection(options.get("--database"), {
  disposableLocal: options.has("--disposable-local"),
  usesTunnel: options.has("--tunnel"),
});
const environment = localPsqlChildEnvironment(process.env);
const sessions = new Set();
class Session {
  constructor() {
    this.output = "";
    this.exit = undefined;
    this.process = spawn(
      options.get("--psql") ?? "psql",
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
      { shell: false, stdio: ["pipe", "pipe", "pipe"], env: environment },
    );
    this.process.stdout.on("data", (data) => (this.output += data.toString()));
    // Do not forward libpq output or the connection URL into public evidence.
    this.process.stderr.on("data", () => {});
    this.process.on("close", (code) => (this.exit = code));
    this.process.on("error", () => (this.exit = 127));
    this.process.stdin.on("error", () => (this.stdinError = true));
    sessions.add(this);
  }
  write(sql) {
    this.process.stdin.write(sql + "\n");
  }
  rows() {
    return this.output
      .split(/\r?\n/)
      .filter((line) => line.startsWith("{") && line.endsWith("}"))
      .map((line) => JSON.parse(line));
  }
  async marker(label) {
    const started = Date.now();
    while (!this.output.split(/\r?\n/).includes(label)) {
      assert(Date.now() - started < 30000, `LOCAL session timeout at ${label}`);
      assert(this.exit === undefined, `LOCAL psql ended at ${label}; exit=${this.exit}`);
      assert(!this.stdinError, "LOCAL psql input failed");
      await delay(20);
    }
  }
  async close() {
    this.process.stdin.end();
    const started = Date.now();
    while (this.exit === undefined && Date.now() - started < 10000) await delay(20);
    assert.equal(this.exit, 0, "LOCAL psql must finish successfully");
  }
}
async function query(sql) {
  const session = new Session();
  session.write(`SET statement_timeout='20s'; ${sql}\nSELECT 'QUERY_DONE';`);
  await session.marker("QUERY_DONE");
  await session.close();
  return session.rows();
}
const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
const actor = randomUUID(),
  organization = randomUUID(),
  project = randomUUID();
const observations = Array.from({ length: 4 }, () => randomUUID());
const originalMedia = observations.map(() => randomUUID());
const actions = observations.map(() => randomUUID());
const requests = observations.map(() => randomUUID());
const title = "Synthetic observation concurrency draft";
const description = "LOCAL technical test; no actual field work or verified file bytes.";
const login = `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${q(actor)},true);`;

async function transaction(sql, label) {
  const session = new Session();
  session.write(`BEGIN; SET LOCAL statement_timeout='20s';
    SELECT json_build_object('pid',pg_backend_pid()); ${login} ${sql}
    SELECT ${q(label)};`);
  return session;
}
async function commit(session) {
  session.write("COMMIT; SELECT 'COMMITTED';");
  await session.marker("COMMITTED");
  await session.close();
}
async function pid(session) {
  const started = Date.now();
  while (!session.rows().some((row) => row.pid)) {
    assert(Date.now() - started < 5000 && session.exit === undefined, "LOCAL backend PID required");
    await delay(20);
  }
  return Number(session.rows().find((row) => row.pid).pid);
}
async function actualLock(waiter, holder) {
  const waiterPid = await pid(waiter),
    holderPid = await pid(holder),
    started = Date.now();
  while (Date.now() - started < 5000) {
    const [row] = await query(`SELECT json_build_object('blockedByHolder',
      wait_event_type='Lock' AND ${holderPid}=ANY(pg_blocking_pids(pid)))
      FROM pg_stat_activity WHERE pid=${waiterPid};`);
    if (row?.blockedByHolder) return;
    assert(waiter.exit === undefined, "LOCAL contender ended before its required lock wait");
    await delay(20);
  }
  assert.fail("The designated real PostgreSQL session must block this contender");
}
function capture(call, label) {
  return `DO $capture$ DECLARE receipt jsonb; BEGIN
    SELECT value INTO receipt FROM ${call} result(value);
    PERFORM set_config('p9_concurrency.result','saved',true);
    PERFORM set_config('p9_concurrency.receipt',coalesce(receipt::text,'null'),true);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('p9_concurrency.result',SQLSTATE,true);
      PERFORM set_config('p9_concurrency.receipt','null',true);
    END $capture$;
    SELECT json_build_object('capture',${q(label)},'result',current_setting('p9_concurrency.result'),
      'receipt',current_setting('p9_concurrency.receipt')::jsonb);`;
}
const createCall = (index, selection, action = actions[index], request = requests[index]) =>
  `public.create_work_order_observation_draft(${q(action)},${q(organization)},${q(project)},
    ${q(title)},${q(description)},${json(selection)},${q(request)})`;
const createSql = (index, selection) =>
  `SELECT json_build_object('receipt',value) FROM ${createCall(index, selection)} result(value);`;
const getCall = (index) =>
  `public.get_work_order_observation_draft(${q(actions[index])},${q(organization)},${q(project)})`;
async function source(index) {
  const [row] = await query(`BEGIN; ${login}
    SELECT json_build_object('source',private.read_work_order_observation_source(
      ${q(observations[index])},${q(organization)},${q(project)})); COMMIT;`);
  assert.equal(row?.source?.observation_id, observations[index], "Exact LOCAL source required");
  return row.source;
}
const selection = (source) => [
  { observationId: source.observation_id, sourceHash: source.source_hash },
];
const insertMedia = (index, id) => `INSERT INTO public.observation_media(
  id,observation_id,media_type,storage_path,uploaded_by)
  VALUES(${q(id)},${q(observations[index])},'photo','synthetic/local-reference-only.jpg',${q(actor)});`;
function receipt(session) {
  const row = session.rows().find((row) => row.receipt && !row.capture);
  assert(row?.receipt, "A committed-operation receipt is required");
  return row.receipt;
}
async function noPartialDraft(index) {
  const [row] = await query(`SELECT json_build_object(
    'actions',(SELECT count(*) FROM public.actions WHERE id=${q(actions[index])}),
    'orders',(SELECT count(*) FROM public.work_orders WHERE action_id=${q(actions[index])}),
    'origins',(SELECT count(*) FROM private.work_order_observation_drafts WHERE action_id=${q(actions[index])}),
    'lifecycle',(SELECT count(*) FROM public.work_order_lifecycle_versions WHERE action_id=${q(actions[index])}));`);
  assert.deepEqual(row, { actions: 0, orders: 0, origins: 0, lifecycle: 0 });
}

const scenarios = [];
let fixtureReady = false,
  evidence;
try {
  const [preflight] = await query(`SELECT json_build_object(
    'createRpc',to_regprocedure('public.create_work_order_observation_draft(uuid,uuid,uuid,text,text,jsonb,uuid)') IS NOT NULL,
    'sourceRpc',to_regprocedure('public.list_work_order_observation_sources(uuid,uuid,uuid,integer,text)') IS NOT NULL,
    'getRpc',to_regprocedure('public.get_work_order_observation_draft(uuid,uuid,uuid)') IS NOT NULL,
    'immediateSourceFk',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.observation_media'::regclass
      AND confrelid='public.field_observations'::regclass AND contype='f' AND NOT condeferrable),
    'storageObjects',(SELECT count(*) FROM storage.objects));`);
  assert(
    preflight?.createRpc && preflight.sourceRpc && preflight.getRpc,
    "Apply P9 migrations to this LOCAL stack first",
  );
  assert(preflight.immediateSourceFk, "The immediate source FK must acquire KEY SHARE");
  await query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,
      email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES('00000000-0000-0000-0000-000000000000',${q(actor)},'authenticated','authenticated',
      ${q(`observation-concurrency-${randomUUID()}@example.test`)},'',now(),'{"provider":"email"}','{}',now(),now());
    INSERT INTO public.organizations(id,name,type,country)
      VALUES(${q(organization)},'Synthetic LOCAL observation concurrency','test','Denmark');
    INSERT INTO public.organization_memberships(organization_id,user_id,role)
      VALUES(${q(organization)},${q(actor)},'viewer');
    INSERT INTO public.projects(id,organization_id,name)
      VALUES(${q(project)},${q(organization)},'Synthetic LOCAL observation concurrency');
    INSERT INTO public.project_members(project_id,user_id,role)
      VALUES(${q(project)},${q(actor)},'project_manager');
    INSERT INTO public.field_observations(id,project_id,observation_type,observed_at,observer_id,
      notes,visibility,status,metadata) VALUES ${observations
        .map(
          (id) =>
            `(${q(id)},${q(project)},'inspection','2026-11-04T10:00:00Z',${q(actor)},
          'Synthetic source; no field acceptance','hidden','draft','{"quality":"unknown"}')`,
        )
        .join(",")};
    ${originalMedia.map((id, index) => insertMedia(index, id)).join("\n")}`);
  fixtureReady = true;

  // Same request: contender must wait on the committed operation, not make a
  // second job or observe an uncommitted receipt.
  const originalSource = await source(0),
    firstSelection = selection(originalSource);
  const winner = await transaction(createSql(0, firstSelection), "REQUEST_HELD");
  await winner.marker("REQUEST_HELD");
  const contender = await transaction(createSql(0, firstSelection), "REQUEST_REPLAYED");
  await actualLock(contender, winner);
  await commit(winner);
  await contender.marker("REQUEST_REPLAYED");
  const originalReceipt = receipt(winner);
  assert.deepEqual(
    receipt(contender),
    originalReceipt,
    "Identical requests return the same origin",
  );
  assert.deepEqual(originalReceipt.sources, [originalSource]);
  await commit(contender);
  const [one] = await query(`SELECT json_build_object(
    'jobs',(SELECT count(*) FROM public.actions WHERE id=${q(actions[0])}),
    'origins',(SELECT count(*) FROM private.work_order_observation_drafts WHERE action_id=${q(actions[0])}),
    'states',(SELECT count(*) FROM public.work_order_lifecycle_versions WHERE action_id=${q(actions[0])}),
    'creationEvents',(SELECT count(*) FROM public.audit_events WHERE entity_id=${q(actions[0])} AND event_type='work_order.created'));`);
  assert.deepEqual(one, { jobs: 1, origins: 1, states: 1, creationEvents: 1 });
  scenarios.push({
    name: "simultaneous_same_request",
    actualLockVerified: true,
    sameReceipt: true,
    oneJobAndOriginAndDraftState: true,
  });

  // INSERT first: its immediate FK holds KEY SHARE on the observation. CREATE
  // must wait on FOR UPDATE, then reject the now-stale attachment membership.
  const beforeInsert = await source(1),
    firstInsertedMedia = randomUUID();
  const inserter = await transaction(insertMedia(1, firstInsertedMedia), "MEDIA_INSERT_HELD");
  await inserter.marker("MEDIA_INSERT_HELD");
  const staleCreator = await transaction(
    capture(createCall(1, selection(beforeInsert)), "insert-first"),
    "INSERT_FIRST_DONE",
  );
  await actualLock(staleCreator, inserter);
  await commit(inserter);
  await staleCreator.marker("INSERT_FIRST_DONE");
  assert.equal(staleCreator.rows().find((row) => row.capture === "insert-first")?.result, "PT409");
  await commit(staleCreator);
  await noPartialDraft(1);
  assert.notEqual((await source(1)).source_hash, beforeInsert.source_hash);
  scenarios.push({
    name: "media_fk_key_share_before_source_for_update",
    actualLockVerified: true,
    staleSqlstate: "PT409",
    noPartialDraft: true,
  });

  // CREATE first: its retained source FOR UPDATE must block a NEW media INSERT
  // through the FK until the immutable pre-insert source snapshot is committed.
  const beforeCreate = await source(2),
    laterMedia = randomUUID();
  const creator = await transaction(createSql(2, selection(beforeCreate)), "SOURCE_CREATE_HELD");
  await creator.marker("SOURCE_CREATE_HELD");
  const lateInserter = await transaction(insertMedia(2, laterMedia), "LATE_MEDIA_DONE");
  await actualLock(lateInserter, creator);
  await commit(creator);
  await lateInserter.marker("LATE_MEDIA_DONE");
  await commit(lateInserter);
  const createdBeforeMedia = receipt(creator),
    afterInsert = await source(2);
  assert.deepEqual(createdBeforeMedia.sources, [beforeCreate]);
  assert(!createdBeforeMedia.sources[0].media_refs.some((media) => media.id === laterMedia));
  assert(afterInsert.media_refs.some((media) => media.id === laterMedia));
  assert.notEqual(afterInsert.source_hash, beforeCreate.source_hash);
  const [stored] = await query(`BEGIN; ${login}
    SELECT json_build_object('origin',value->'origin') FROM ${getCall(2)} result(value); COMMIT;`);
  assert.deepEqual(stored.origin, createdBeforeMedia);
  scenarios.push({
    name: "source_for_update_before_new_media_fk_key_share",
    actualLockVerified: true,
    snapshotExcludesLaterReference: true,
    laterReferencePreserved: true,
  });

  // A separate committed metadata edit must also invalidate a preview; this is
  // distinct from the two-session attachment-membership INSERT case above.
  const beforeMetadata = await source(3);
  await query(`BEGIN; ${login} UPDATE public.observation_media
    SET exif_data='{"synthetic":"changed after preview"}'::jsonb WHERE id=${q(originalMedia[3])}; COMMIT;`);
  const staleMetadata = await query(`BEGIN; ${login}
    ${capture(createCall(3, selection(beforeMetadata)), "metadata-stale")} COMMIT;`);
  assert.equal(staleMetadata.find((row) => row.capture === "metadata-stale")?.result, "PT409");
  await noPartialDraft(3);
  scenarios.push({
    name: "committed_media_metadata_invalidates_preview",
    staleSqlstate: "PT409",
    noPartialDraft: true,
  });

  await query(
    `BEGIN; ${login} DELETE FROM public.field_observations WHERE id=${q(observations[0])}; COMMIT;`,
  );
  const [deleted] = await query(`SELECT json_build_object(
    'sources',(SELECT count(*) FROM public.field_observations WHERE id=${q(observations[0])}),
    'media',(SELECT count(*) FROM public.observation_media WHERE observation_id=${q(observations[0])}));`);
  assert.deepEqual(deleted, { sources: 0, media: 0 });
  const replay = await query(`BEGIN; ${login} ${createSql(0, firstSelection)} COMMIT;`);
  assert.deepEqual(replay.find((row) => row.receipt)?.receipt, originalReceipt);
  const [deletedOrigin] = await query(`BEGIN; ${login}
    SELECT json_build_object('origin',value->'origin') FROM ${getCall(0)} result(value); COMMIT;`);
  assert.deepEqual(deletedOrigin.origin, originalReceipt);
  scenarios.push({
    name: "committed_retry_after_source_and_media_delete",
    originalSnapshotAndReceiptPreserved: true,
  });

  await query(
    `UPDATE public.project_members SET role='field' WHERE project_id=${q(project)} AND user_id=${q(actor)};`,
  );
  const denied = await query(`BEGIN; ${login}
    SELECT json_build_object('canManage',private.can_manage_project(${q(project)}),
      'visibleOrigins',(SELECT count(*) FROM private.work_order_observation_drafts WHERE project_id=${q(project)}));
    ${capture(createCall(0, firstSelection), "revoked-replay")}
    ${capture(getCall(0), "revoked-get")} COMMIT;`);
  assert.deepEqual(
    denied.find((row) => "canManage" in row),
    { canManage: false, visibleOrigins: 0 },
  );
  for (const label of ["revoked-replay", "revoked-get"])
    assert.equal(denied.find((row) => row.capture === label)?.result, "42501");
  scenarios.push({
    name: "revoked_manager_cannot_replay_or_read_origin",
    deniedSqlstate: "42501",
    rlsHidesOrigins: true,
  });

  const [after] = await query(`SELECT json_build_object(
    'jobs',(SELECT count(*) FROM public.actions WHERE project_id=${q(project)}),
    'origins',(SELECT count(*) FROM private.work_order_observation_drafts WHERE project_id=${q(project)}),
    'draftStates',(SELECT count(*) FROM public.work_order_lifecycle_versions WHERE project_id=${q(project)} AND status='draft'),
    'plans',(SELECT count(*) FROM public.work_order_plan_versions WHERE project_id=${q(project)}),
    'assignments',(SELECT count(*) FROM public.work_order_assignment_versions WHERE project_id=${q(project)}),
    'evidence',(SELECT count(*) FROM public.work_order_evidence_versions WHERE project_id=${q(project)}),
    'storageObjects',(SELECT count(*) FROM storage.objects));`);
  assert.deepEqual(after, {
    jobs: 2,
    origins: 2,
    draftStates: 2,
    plans: 0,
    assignments: 0,
    evidence: 0,
    storageObjects: preflight.storageObjects,
  });
  evidence = {
    schema: "freyra.observation-draft-local-concurrency/v1",
    result: "PASS",
    localOnly: true,
    authApiUsed: false,
    httpUsed: false,
    originalBytesWritten: false,
    actualLockWaitsVerified: scenarios.filter((scenario) => scenario.actualLockVerified).length,
    originalReceiptSha256: createHash("sha256")
      .update(JSON.stringify(originalReceipt))
      .digest("hex"),
    scenarios,
    after,
    fixtureRowsRetainedInDisposableStack: true,
  };
} finally {
  // Immutable fixtures stay in this disposable stack until it is destroyed,
  // matching the existing field-job harness. Never disable production guards.
  const open = [...sessions].filter((session) => session.exit === undefined);
  for (const session of open) session.process.kill();
  const started = Date.now();
  while (open.some((session) => session.exit === undefined) && Date.now() - started < 10000)
    await delay(20);
  assert(
    open.every((session) => session.exit !== undefined),
    "Owned LOCAL sessions must release their locks",
  );
  if (fixtureReady) {
    const [restored] = await query(`UPDATE public.project_members SET role='project_manager'
      WHERE project_id=${q(project)} AND user_id=${q(actor)};
      SELECT json_build_object('roleRestored',EXISTS(SELECT 1 FROM public.project_members
        WHERE project_id=${q(project)} AND user_id=${q(actor)} AND role='project_manager'));`);
    assert.equal(restored?.roleRestored, true, "Own synthetic manager role must be restored");
  }
}
// Emit PASS only after all database assertions and owned-session cleanup ran.
process.stdout.write(JSON.stringify({ ...evidence, syntheticManagerRoleRestored: true }) + "\n");
