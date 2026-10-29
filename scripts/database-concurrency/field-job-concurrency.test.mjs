/** Real PostgreSQL connections on an explicitly disposable LOCAL stack only. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertDisposableLocalConnection,
  localPsqlChildEnvironment,
} from "./local-database-guard.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const connection = assertDisposableLocalConnection(option("--database"), {
  disposableLocal: args.includes("--disposable-local"),
  usesTunnel: args.includes("--tunnel"),
});
const environment = localPsqlChildEnvironment(process.env);
const sessions = new Set();
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
      { shell: false, stdio: ["pipe", "pipe", "pipe"], env: environment },
    );
    this.process.stdout.on("data", (data) => (this.output += data.toString()));
    this.process.stderr.on("data", (data) => (this.errors += data.toString()));
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
      assert(Date.now() - started < 20000, `LOCAL session timeout at ${label}`);
      assert(this.exit === undefined, `LOCAL session ended at ${label}; exit=${this.exit}`);
      assert(!this.stdinError, "LOCAL session input failed");
      await delay(20);
    }
  }
  async close() {
    this.process.stdin.end();
    const started = Date.now();
    while (this.exit === undefined && Date.now() - started < 10000) await delay(20);
    assert.equal(this.exit, 0, "LOCAL psql session must finish successfully");
  }
}
async function query(sql) {
  const s = new Session();
  s.write(`SET statement_timeout='15s'; ${sql}\nSELECT 'DONE';`);
  await s.marker("DONE");
  await s.close();
  return s.rows();
}
const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const org = q(randomUUID()),
  project = q(randomUUID()),
  actor = q(randomUUID()),
  action = q(randomUUID()),
  template = q(randomUUID());
const definition = q(
  JSON.stringify({
    schema: "freyra.field-job-template/v1",
    title: "Synthetic concurrency template",
    domain: "general",
    fields: [{ key: "note", label: "Note", type: "text", required: true }],
  }),
);
const login = `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${actor},true);`;
async function transaction(sql, label) {
  const s = new Session();
  s.write(
    `BEGIN; SET LOCAL statement_timeout='15s'; SELECT json_build_object('pid',pg_backend_pid()); ${login} ${sql}\nSELECT '${label}';`,
  );
  return s;
}
async function commit(s) {
  s.write("COMMIT; SELECT 'COMMITTED';");
  await s.marker("COMMITTED");
  await s.close();
}
async function backendPid(s) {
  const started = Date.now();
  while (!s.rows().find((row) => row.pid)) {
    assert(Date.now() - started < 5000 && s.exit === undefined, "LOCAL backend PID is required");
    await delay(20);
  }
  return Number(s.rows().find((row) => row.pid).pid);
}
async function actualLock(waiter, holder) {
  const waiterPid = await backendPid(waiter),
    holderPid = await backendPid(holder),
    started = Date.now();
  while (Date.now() - started < 5000) {
    const [row] = await query(
      `SELECT json_build_object('waiting',wait_event_type='Lock' AND ${holderPid}=ANY(pg_blocking_pids(pid))) FROM pg_stat_activity WHERE pid=${waiterPid};`,
    );
    if (row?.waiting) return true;
    assert(waiter.exit === undefined, "Writer ended before the expected real lock wait");
    await delay(20);
  }
  assert.fail("Writer must wait on the designated transaction's real PostgreSQL lock");
}
const capture = (call) =>
  `DO $capture$ BEGIN PERFORM ${call}; PERFORM set_config('field_job_test.result','saved',true); EXCEPTION WHEN OTHERS THEN PERFORM set_config('field_job_test.result',SQLSTATE,true); END $capture$; SELECT json_build_object('result',current_setting('field_job_test.result'));`;
let templateVersion;
const saveJob = (expected, request, reason = "", values = "{}") =>
  `public.save_field_job_version(${org},${project},${action},${q(templateVersion)},${expected},${q(values)}::jsonb,'draft',${q(reason)},${q(request)})`;
const scenarios = [];
try {
  const initialized = await query(`
    INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      VALUES ('00000000-0000-0000-0000-000000000000',${actor},'authenticated','authenticated','field-job-concurrency-${randomUUID()}@example.test','',now(),'{"provider":"email"}','{}',now(),now());
    INSERT INTO public.organizations(id,name,type,country) VALUES (${org},'Synthetic field job concurrency','test','Denmark');
    INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES (${org},${actor},'viewer');
    INSERT INTO public.projects(id,organization_id,name) VALUES (${project},${org},'Synthetic field job concurrency');
    INSERT INTO public.project_members(project_id,user_id,role) VALUES (${project},${actor},'editor');
    INSERT INTO public.actions(id,project_id,title) VALUES (${action},${project},'Synthetic existing action');
    BEGIN; ${login}
    SELECT json_build_object('templateVersion',id) FROM public.save_field_job_template_version(${org},${project},${template},0,${definition}::jsonb,${q(randomUUID())});
    COMMIT;
  `);
  templateVersion = initialized.find((row) => row.templateVersion)?.templateVersion;
  assert.match(templateVersion, /^[0-9a-f-]{36}$/);

  const firstRequest = randomUUID();
  const winner = await transaction(
    `SELECT json_build_object('id',id) FROM ${saveJob(0, firstRequest)};`,
    "FIRST_HELD",
  );
  await winner.marker("FIRST_HELD");
  const stale = await transaction(capture(saveJob(0, randomUUID())), "STALE_DONE");
  await actualLock(stale, winner);
  await commit(winner);
  await stale.marker("STALE_DONE");
  assert.equal(stale.rows().find((row) => row.result)?.result, "40001");
  await commit(stale);
  scenarios.push({
    name: "competing_first_binding",
    actualLockVerified: true,
    staleSqlstate: "40001",
  });

  const retryRequest = randomUUID();
  const retryWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${saveJob(1, retryRequest, "Synthetic correction")};`,
    "RETRY_HELD",
  );
  await retryWinner.marker("RETRY_HELD");
  const retry = await transaction(
    `SELECT json_build_object('id',id) FROM ${saveJob(1, retryRequest, "Synthetic correction")};`,
    "RETRY_DONE",
  );
  await actualLock(retry, retryWinner);
  await commit(retryWinner);
  await retry.marker("RETRY_DONE");
  assert.equal(
    retry.rows().find((row) => row.id)?.id,
    retryWinner.rows().find((row) => row.id)?.id,
  );
  await commit(retry);
  scenarios.push({
    name: "simultaneous_identical_retry",
    actualLockVerified: true,
    oneRevision: true,
  });

  const templateCall = (request) =>
    `public.save_field_job_template_version(${org},${project},${template},1,${definition}::jsonb,${q(request)})`;
  const templateWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${templateCall(randomUUID())};`,
    "TEMPLATE_HELD",
  );
  await templateWinner.marker("TEMPLATE_HELD");
  const staleTemplate = await transaction(
    capture(templateCall(randomUUID())),
    "TEMPLATE_STALE_DONE",
  );
  await actualLock(staleTemplate, templateWinner);
  await commit(templateWinner);
  await staleTemplate.marker("TEMPLATE_STALE_DONE");
  assert.equal(staleTemplate.rows().find((row) => row.result)?.result, "40001");
  await commit(staleTemplate);
  scenarios.push({
    name: "competing_template_revision",
    actualLockVerified: true,
    staleSqlstate: "40001",
  });

  const [after] = await query(
    `SELECT json_build_object('jobs',(SELECT count(*) FROM public.field_job_versions WHERE action_id=${action}),'templates',(SELECT count(*) FROM public.field_job_template_versions WHERE template_id=${template}),'oldBindingPreserved',(SELECT bool_and(template_version_id=${q(templateVersion)}::uuid) FROM public.field_job_versions WHERE action_id=${action}));`,
  );
  assert.deepEqual(after, { jobs: 2, templates: 2, oldBindingPreserved: true });

  // D01 uses the same disposable sessions and lock witness; no parallel harness.
  await query(`UPDATE public.project_members SET role='project_manager' WHERE project_id=${project} AND user_id=${actor};
    BEGIN; ${login} SELECT action_id FROM public.initialize_work_order(${action},${org},${project},0,${q(randomUUID())}); COMMIT;`);
  const accessCall = (expected, request) =>
    `public.save_work_order_access(${action},${org},${project},${actor},${expected},true,true,false,'Synthetic concurrency assignment',${q(request)})`;
  const accessWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${accessCall(0, randomUUID())};`,
    "ACCESS_HELD",
  );
  await accessWinner.marker("ACCESS_HELD");
  const accessStale = await transaction(capture(accessCall(0, randomUUID())), "ACCESS_STALE");
  await actualLock(accessStale, accessWinner);
  await commit(accessWinner);
  await accessStale.marker("ACCESS_STALE");
  assert.equal(accessStale.rows().find((row) => row.result)?.result, "PT409");
  await commit(accessStale);
  scenarios.push({
    name: "competing_task_assignment",
    actualLockVerified: true,
    staleSqlstate: "PT409",
  });
  const accessRequest = randomUUID();
  const accessRetryWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${accessCall(1, accessRequest)};`,
    "ACCESS_RETRY_HELD",
  );
  await accessRetryWinner.marker("ACCESS_RETRY_HELD");
  const accessRetry = await transaction(
    `SELECT json_build_object('id',id) FROM ${accessCall(1, accessRequest)};`,
    "ACCESS_RETRY_DONE",
  );
  await actualLock(accessRetry, accessRetryWinner);
  await commit(accessRetryWinner);
  await accessRetry.marker("ACCESS_RETRY_DONE");
  assert.equal(
    accessRetry.rows().find((row) => row.id)?.id,
    accessRetryWinner.rows().find((row) => row.id)?.id,
  );
  await commit(accessRetry);
  const [accessAfter] = await query(
    `SELECT json_build_object('versions',(SELECT count(*) FROM public.work_order_access_versions WHERE action_id=${action}), 'events',(SELECT count(*) FROM public.audit_events WHERE entity_id=${action} AND event_type='work_order.access_changed'));`,
  );
  assert.deepEqual(accessAfter, { versions: 2, events: 2 });
  scenarios.push({
    name: "identical_task_assignment_retry",
    actualLockVerified: true,
    oneRevision: true,
    oneInternalEvent: true,
  });
  const planValue = {
    schema: "freyra.work-order-plan/v1",
    title: "Synthetic concurrency plan",
    description: "",
    instructions: "",
    profile: null,
    responsibleId: null,
    siteId: null,
    watercourseVersionId: null,
    locationNote: "",
    plannedStart: null,
    plannedEnd: null,
    priority: null,
    plannedMethod: null,
    watercourse: null,
  };
  const plan = q(JSON.stringify(planValue));
  const planCall = (expected, request, reason = "") =>
    `public.save_work_order_plan(${action},${org},${project},${expected},${plan}::jsonb,${q(reason)},${q(request)})`;
  const planWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${planCall(0, randomUUID())};`,
    "PLAN_HELD",
  );
  await planWinner.marker("PLAN_HELD");
  const planStale = await transaction(capture(planCall(0, randomUUID())), "PLAN_STALE");
  await actualLock(planStale, planWinner);
  await commit(planWinner);
  await planStale.marker("PLAN_STALE");
  assert.equal(planStale.rows().find((row) => row.result)?.result, "PT409");
  await commit(planStale);
  scenarios.push({
    name: "competing_work_order_plan",
    actualLockVerified: true,
    staleSqlstate: "PT409",
  });
  const planRequest = randomUUID();
  const planRetryWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${planCall(1, planRequest, "Synthetic plan correction")};`,
    "PLAN_RETRY_HELD",
  );
  await planRetryWinner.marker("PLAN_RETRY_HELD");
  const planRetry = await transaction(
    `SELECT json_build_object('id',id) FROM ${planCall(1, planRequest, "Synthetic plan correction")};`,
    "PLAN_RETRY_DONE",
  );
  await actualLock(planRetry, planRetryWinner);
  await commit(planRetryWinner);
  await planRetry.marker("PLAN_RETRY_DONE");
  assert.equal(
    planRetry.rows().find((row) => row.id)?.id,
    planRetryWinner.rows().find((row) => row.id)?.id,
  );
  await commit(planRetry);
  const [planAfter] = await query(
    `SELECT json_build_object('versions',(SELECT count(*) FROM public.work_order_plan_versions WHERE action_id=${action}), 'events',(SELECT count(*) FROM public.audit_events WHERE entity_id=${action} AND event_type='work_order.plan_saved'));`,
  );
  assert.deepEqual(planAfter, { versions: 2, events: 2 });
  scenarios.push({
    name: "identical_work_order_plan_retry",
    actualLockVerified: true,
    oneRevision: true,
    oneInternalEvent: true,
  });
  const execution = {
    schema: "freyra.action-execution/v1",
    actionId: action.slice(1, -1),
    surveyRoundId: null,
    dataBasis: "synthetic",
    workType: "weed_cutting",
    stage: "performed",
    actualDate: "2026-10-08",
    actualEndDate: null,
    method: "Synthetic actual method",
    reach: "Synthetic reach",
    performedBy: "Synthetic colleague",
    sourceReference: "Synthetic work log",
    evidenceIds: [],
    deviation: "",
    correctionReason: "",
    coverage: "limited",
    coverageDescription: "Synthetic partial reach",
  };
  const executionPlan = planRetryWinner.rows().find((row) => row.id)?.id;
  const executionCall = (expected, request) =>
    `public.save_work_order_execution(${action},${org},${project},${q(executionPlan)},2,${expected},${q(JSON.stringify({ ...execution, correctionReason: expected > 0 ? "Synthetic correction" : "" }))}::jsonb,${actor},'',${q(request)})`;
  const executionWinner = await transaction(
    `SELECT json_build_object('id',workspace_entry_id) FROM ${executionCall(0, randomUUID())};`,
    "EXECUTION_HELD",
  );
  await executionWinner.marker("EXECUTION_HELD");
  const executionStale = await transaction(
    capture(executionCall(0, randomUUID())),
    "EXECUTION_STALE",
  );
  await actualLock(executionStale, executionWinner);
  await commit(executionWinner);
  await executionStale.marker("EXECUTION_STALE");
  assert.equal(executionStale.rows().find((row) => row.result)?.result, "PT409");
  await commit(executionStale);
  scenarios.push({
    name: "competing_work_order_execution",
    actualLockVerified: true,
    staleSqlstate: "PT409",
  });
  const executionRequest = randomUUID();
  const executionRetryWinner = await transaction(
    `SELECT json_build_object('id',workspace_entry_id) FROM ${executionCall(1, executionRequest)};`,
    "EXECUTION_RETRY_HELD",
  );
  await executionRetryWinner.marker("EXECUTION_RETRY_HELD");
  const executionRetry = await transaction(
    `SELECT json_build_object('id',workspace_entry_id) FROM ${executionCall(1, executionRequest)};`,
    "EXECUTION_RETRY_DONE",
  );
  await actualLock(executionRetry, executionRetryWinner);
  await commit(executionRetryWinner);
  await executionRetry.marker("EXECUTION_RETRY_DONE");
  assert.equal(
    executionRetry.rows().find((row) => row.id)?.id,
    executionRetryWinner.rows().find((row) => row.id)?.id,
  );
  await commit(executionRetry);
  const [executionAfter] = await query(
    `SELECT json_build_object('bindings',(SELECT count(*) FROM public.work_order_execution_bindings WHERE action_id=${action}),'workspace',(SELECT count(*) FROM public.project_workspace_entries WHERE entry_id=${action}),'events',(SELECT count(*) FROM public.audit_events WHERE entity_id=${action} AND event_type='work_order.execution_saved'));`,
  );
  assert.deepEqual(executionAfter, { bindings: 2, workspace: 2, events: 2 });
  scenarios.push({
    name: "identical_work_order_execution_retry",
    actualLockVerified: true,
    oneRevision: true,
    oneInternalEvent: true,
  });
  // D02d: actual separate candidates compete for one pool owner.
  const poolActor = q(randomUUID()),
    poolAction = q(randomUUID()),
    poolGroup = q(randomUUID());
  const crewMembers = [actor.slice(1, -1), poolActor.slice(1, -1)].sort();
  const crewSql = `ARRAY[${crewMembers.map(q).join(",")}]::uuid[]`;
  const poolSetup = await query(`
    INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES('00000000-0000-0000-0000-000000000000',${poolActor},'authenticated','authenticated','pool-concurrency-${randomUUID()}@example.test','',now(),'{"provider":"email"}','{}',now(),now());
    INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(${org},${poolActor},'viewer');
    INSERT INTO public.project_members(project_id,user_id,role) VALUES(${project},${poolActor},'external');
    INSERT INTO public.actions(id,project_id,title) VALUES(${poolAction},${project},'Synthetic pool task');
    BEGIN;${login}
    SELECT json_build_object('planId',id) FROM public.save_work_order_plan(${poolAction},${org},${project},0,${plan}::jsonb,'',${q(randomUUID())});
    SELECT id FROM public.save_work_order_group(${poolGroup},${org},${project},0,'Synthetic pool crew',true,${crewSql},'',${q(randomUUID())});
    COMMIT;`);
  const poolPlan = poolSetup.find((row) => row.planId)?.planId;
  assert.match(poolPlan, /^[0-9a-f-]{36}$/);
  const groupCall = (request) =>
    `public.save_work_order_group(${poolGroup},${org},${project},1,'Synthetic pool crew revised',true,${crewSql},'Synthetic group correction',${q(request)})`;
  const groupWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${groupCall(randomUUID())};`,
    "GROUP_HELD",
  );
  await groupWinner.marker("GROUP_HELD");
  const groupStale = await transaction(capture(groupCall(randomUUID())), "GROUP_STALE");
  await actualLock(groupStale, groupWinner);
  await commit(groupWinner);
  await groupStale.marker("GROUP_STALE");
  assert.equal(groupStale.rows().find((row) => row.result)?.result, "PT409");
  await commit(groupStale);
  const poolGroupVersion = groupWinner.rows().find((row) => row.id)?.id;
  scenarios.push({
    name: "competing_group_revision",
    actualLockVerified: true,
    staleSqlstate: "PT409",
  });
  const poolConfigure = (expected, request) =>
    `public.configure_work_order_assignment(${poolAction},${org},${project},${expected},${q(poolPlan)},'pool',${crewSql},${q(poolGroupVersion)},'Synthetic pool setup',${q(request)})`;
  const configureWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${poolConfigure(0, randomUUID())};`,
    "POOL_CONFIG_HELD",
  );
  await configureWinner.marker("POOL_CONFIG_HELD");
  const configureStale = await transaction(
    capture(poolConfigure(0, randomUUID())),
    "POOL_CONFIG_STALE",
  );
  await actualLock(configureStale, configureWinner);
  await commit(configureWinner);
  await configureStale.marker("POOL_CONFIG_STALE");
  assert.equal(configureStale.rows().find((row) => row.result)?.result, "PT409");
  await commit(configureStale);
  scenarios.push({
    name: "competing_pool_configuration",
    actualLockVerified: true,
    staleSqlstate: "PT409",
  });
  const poolClaim = (expected, request) =>
    `public.claim_work_order_pool(${poolAction},${org},${project},${expected},${q(poolPlan)},${q(request)})`;
  const claimWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${poolClaim(1, randomUUID())};`,
    "POOL_CLAIM_HELD",
  );
  await claimWinner.marker("POOL_CLAIM_HELD");
  const claimLoser = await transaction(
    `SELECT set_config('request.jwt.claim.sub',${poolActor},true);${capture(poolClaim(1, randomUUID()))}`,
    "POOL_CLAIM_LOST",
  );
  await actualLock(claimLoser, claimWinner);
  await commit(claimWinner);
  await claimLoser.marker("POOL_CLAIM_LOST");
  assert.equal(claimLoser.rows().find((row) => row.result)?.result, "PT409");
  await commit(claimLoser);
  scenarios.push({
    name: "two_distinct_pool_claimants",
    actualLockVerified: true,
    oneOwner: true,
    loserSqlstate: "PT409",
  });
  await query(`BEGIN;${login}SELECT id FROM ${poolConfigure(2, randomUUID())};COMMIT;`);
  const poolRetryRequest = randomUUID();
  const poolRetryWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${poolClaim(3, poolRetryRequest)};`,
    "POOL_RETRY_HELD",
  );
  await poolRetryWinner.marker("POOL_RETRY_HELD");
  const poolRetry = await transaction(
    `SELECT json_build_object('id',id) FROM ${poolClaim(3, poolRetryRequest)};`,
    "POOL_RETRY_DONE",
  );
  await actualLock(poolRetry, poolRetryWinner);
  await commit(poolRetryWinner);
  await poolRetry.marker("POOL_RETRY_DONE");
  assert.equal(
    poolRetry.rows().find((row) => row.id)?.id,
    poolRetryWinner.rows().find((row) => row.id)?.id,
  );
  await commit(poolRetry);
  const [poolAfter] = await query(
    `SELECT json_build_object('versions',(SELECT count(*) FROM public.work_order_assignment_versions WHERE action_id=${poolAction}),'claimEvents',(SELECT count(*) FROM public.audit_events WHERE entity_id=${poolAction} AND event_type='work_order.pool_claimed'),'currentOwnerMatches',(SELECT claimed_by=${actor}::uuid FROM public.work_order_assignment_versions WHERE action_id=${poolAction} ORDER BY version DESC LIMIT 1));`,
  );
  assert.deepEqual(poolAfter, { versions: 4, claimEvents: 2, currentOwnerMatches: true });
  scenarios.push({
    name: "identical_pool_claim_retry",
    actualLockVerified: true,
    oneRevision: true,
    oneInternalEvent: true,
  });
  // D02e: operation status and manual corrections use the same proven lock witness.
  const [lifecycleBasis] = await query(
    `BEGIN;${login}SELECT private.work_order_lifecycle_basis(${action});COMMIT;`,
  );
  const lifecycleValues = {
    operation: "transition",
    targetStatus: "draft",
    planVersionId: lifecycleBasis.planVersionId,
    assignmentVersionId: lifecycleBasis.assignmentVersionId,
    executionRevisionId: lifecycleBasis.executionRevisionId,
  };
  const lifecycleCall = (version, request, confirm = false) =>
    `public.mutate_work_order_lifecycle(${action},${org},${project},${version},${q(JSON.stringify({ ...lifecycleValues, ...(confirm ? { operation: "confirm", reason: "Synthetic basis confirmation" } : {}) }))}::jsonb,${q(request)})`;
  const lifecycleWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${lifecycleCall(0, randomUUID())};`,
    "LIFECYCLE_HELD",
  );
  await lifecycleWinner.marker("LIFECYCLE_HELD");
  const lifecycleStale = await transaction(
    capture(lifecycleCall(0, randomUUID())),
    "LIFECYCLE_STALE",
  );
  await actualLock(lifecycleStale, lifecycleWinner);
  await commit(lifecycleWinner);
  await lifecycleStale.marker("LIFECYCLE_STALE");
  assert.equal(lifecycleStale.rows().find((row) => row.sqlstate)?.sqlstate, "PT409");
  await commit(lifecycleStale);
  scenarios.push({
    name: "competing_lifecycle_revision",
    actualLockVerified: true,
    staleSqlstate: "PT409",
  });
  const lifecycleRetryRequest = randomUUID();
  const lifecycleRetryWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${lifecycleCall(1, lifecycleRetryRequest, true)};`,
    "LIFECYCLE_RETRY_HELD",
  );
  await lifecycleRetryWinner.marker("LIFECYCLE_RETRY_HELD");
  const lifecycleRetry = await transaction(
    `SELECT json_build_object('id',id) FROM ${lifecycleCall(1, lifecycleRetryRequest, true)};`,
    "LIFECYCLE_RETRY_DONE",
  );
  await actualLock(lifecycleRetry, lifecycleRetryWinner);
  await commit(lifecycleRetryWinner);
  await lifecycleRetry.marker("LIFECYCLE_RETRY_DONE");
  assert.equal(
    lifecycleRetry.rows().find((row) => row.id)?.id,
    lifecycleRetryWinner.rows().find((row) => row.id)?.id,
  );
  await commit(lifecycleRetry);
  const [lifecycleCurrent] = await query(
    `SELECT json_build_object('id',id) FROM public.work_order_lifecycle_versions WHERE action_id=${action} ORDER BY version DESC LIMIT 1;`,
  );
  scenarios.push({
    name: "identical_lifecycle_retry",
    actualLockVerified: true,
    oneRevision: true,
    oneInternalEvent: true,
  });
  const noteId = randomUUID();
  const noteCall = (version, request, corrected = false) =>
    `public.save_work_order_note(${action},${org},${project},${q(noteId)},${version},'comment',${q(corrected ? "Synthetic corrected note" : "Synthetic initial note")},${q(corrected ? "Synthetic factual correction" : "")},${lifecycleBasis.planVersionId ? q(lifecycleBasis.planVersionId) : "NULL"},${lifecycleBasis.assignmentVersionId ? q(lifecycleBasis.assignmentVersionId) : "NULL"},${lifecycleBasis.executionRevisionId ? q(lifecycleBasis.executionRevisionId) : "NULL"},${q(lifecycleCurrent.id)},${q(request)})`;
  const noteWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${noteCall(0, randomUUID())};`,
    "NOTE_HELD",
  );
  await noteWinner.marker("NOTE_HELD");
  const noteStale = await transaction(capture(noteCall(0, randomUUID())), "NOTE_STALE");
  await actualLock(noteStale, noteWinner);
  await commit(noteWinner);
  await noteStale.marker("NOTE_STALE");
  assert.equal(noteStale.rows().find((row) => row.sqlstate)?.sqlstate, "PT409");
  await commit(noteStale);
  scenarios.push({
    name: "competing_manual_note_revision",
    actualLockVerified: true,
    staleSqlstate: "PT409",
  });
  const noteRetryRequest = randomUUID();
  const noteRetryWinner = await transaction(
    `SELECT json_build_object('id',id) FROM ${noteCall(1, noteRetryRequest, true)};`,
    "NOTE_RETRY_HELD",
  );
  await noteRetryWinner.marker("NOTE_RETRY_HELD");
  const noteRetry = await transaction(
    `SELECT json_build_object('id',id) FROM ${noteCall(1, noteRetryRequest, true)};`,
    "NOTE_RETRY_DONE",
  );
  await actualLock(noteRetry, noteRetryWinner);
  await commit(noteRetryWinner);
  await noteRetry.marker("NOTE_RETRY_DONE");
  assert.equal(
    noteRetry.rows().find((row) => row.id)?.id,
    noteRetryWinner.rows().find((row) => row.id)?.id,
  );
  await commit(noteRetry);
  const [logbookAfter] = await query(
    `SELECT json_build_object('statusVersions',(SELECT count(*) FROM public.work_order_lifecycle_versions WHERE action_id=${action}),'noteVersions',(SELECT count(*) FROM public.work_order_note_versions WHERE note_id=${q(noteId)}),'statusEvents',(SELECT count(*) FROM public.audit_events WHERE entity_id=${action} AND event_type='work_order.lifecycle_changed'),'noteEvents',(SELECT count(*) FROM public.audit_events WHERE entity_id=${action} AND event_type='work_order.note_saved'));`,
  );
  assert.deepEqual(logbookAfter, {
    statusVersions: 2,
    noteVersions: 2,
    statusEvents: 2,
    noteEvents: 2,
  });
  scenarios.push({
    name: "identical_manual_note_retry",
    actualLockVerified: true,
    oneRevision: true,
    oneInternalEvent: true,
  });
  // SQL-only assertions missed PostgREST's 500/retry handling of SQLSTATE 40001.
  // Verify the real disposable LOCAL HTTP boundary without Auth mail or hosted access.
  const status = spawnSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    env: environment,
    shell: false,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(status.status, 0, "Disposable Supabase status must be readable");
  let local;
  try {
    local = JSON.parse(status.stdout);
  } catch {
    throw Error("Disposable Supabase status was not valid JSON");
  }
  assert.equal(
    new URL(local.API_URL).origin,
    "http://127.0.0.1:54321",
    "HTTP checks must stay on the disposable local API",
  );
  assert.equal(typeof local.JWT_SECRET, "string", "Local JWT signing material must exist");
  assert.equal(typeof local.ANON_KEY, "string", "Local API key must exist");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      sub: actor.slice(1, -1),
      role: "authenticated",
      aud: "authenticated",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
  const jwt =
    unsigned + "." + createHmac("sha256", local.JWT_SECRET).update(unsigned).digest("base64url");
  const common = {
    p_action_id: action.slice(1, -1),
    p_organization_id: org.slice(1, -1),
    p_project_id: project.slice(1, -1),
  };
  const staleRequests = [
    [
      "save_work_order_plan",
      {
        ...common,
        p_expected_version: 0,
        p_plan: planValue,
        p_correction_reason: "",
        p_request_id: randomUUID(),
      },
    ],
    [
      "save_work_order_access",
      {
        ...common,
        p_user_id: actor.slice(1, -1),
        p_expected_version: 0,
        p_active: true,
        p_can_execute: true,
        p_can_review: false,
        p_reason: "Synthetic stale grant",
        p_request_id: randomUUID(),
      },
    ],
    [
      "save_work_order_execution",
      {
        ...common,
        p_plan_version_id: executionPlan,
        p_expected_plan_version: 2,
        p_expected_version: 0,
        p_execution: execution,
        p_performed_by_id: actor.slice(1, -1),
        p_deviation_reason: "",
        p_request_id: randomUUID(),
      },
    ],
    [
      "save_work_order_group",
      {
        p_group_id: poolGroup.slice(1, -1),
        p_organization_id: org.slice(1, -1),
        p_project_id: project.slice(1, -1),
        p_expected_version: 1,
        p_name: "Synthetic pool crew revised",
        p_active: true,
        p_member_ids: crewMembers,
        p_correction_reason: "Synthetic stale group",
        p_request_id: randomUUID(),
      },
    ],
    [
      "configure_work_order_assignment",
      {
        p_action_id: poolAction.slice(1, -1),
        p_organization_id: org.slice(1, -1),
        p_project_id: project.slice(1, -1),
        p_expected_version: 0,
        p_plan_version_id: poolPlan,
        p_mode: "pool",
        p_candidate_user_ids: crewMembers,
        p_source_group_version_id: poolGroupVersion,
        p_reason: "Synthetic stale assignment",
        p_request_id: randomUUID(),
      },
    ],
    [
      "claim_work_order_pool",
      {
        p_action_id: poolAction.slice(1, -1),
        p_organization_id: org.slice(1, -1),
        p_project_id: project.slice(1, -1),
        p_expected_version: 3,
        p_plan_version_id: poolPlan,
        p_request_id: randomUUID(),
      },
    ],
    [
      "mutate_work_order_lifecycle",
      { ...common, p_expected_version: 0, p_values: lifecycleValues, p_request_id: randomUUID() },
    ],
    [
      "save_work_order_note",
      {
        ...common,
        p_note_id: noteId,
        p_expected_version: 0,
        p_kind: "comment",
        p_body: "Synthetic stale note",
        p_correction_reason: "",
        p_plan_version_id: lifecycleBasis.planVersionId,
        p_assignment_version_id: lifecycleBasis.assignmentVersionId,
        p_execution_revision_id: lifecycleBasis.executionRevisionId,
        p_lifecycle_version_id: lifecycleCurrent.id,
        p_request_id: randomUUID(),
      },
    ],
  ];
  for (const [endpoint, payload] of staleRequests) {
    const response = await fetch(`http://127.0.0.1:54321/rest/v1/rpc/${endpoint}`, {
      method: "POST",
      headers: {
        apikey: local.ANON_KEY,
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(
      response.status,
      409,
      `${endpoint} must return a domain conflict, not HTTP 500 or a retry loop`,
    );
    const body = await response.json();
    assert.equal(body.code, "PT409");
  }
  scenarios.push({
    name: "local_http_stale_plan_access_execution_group_assignment_claim_lifecycle_note",
    requests: 8,
    httpStatus: 409,
    sqlstate: "PT409",
    noAuthEmails: true,
  });
  process.stdout.write(
    JSON.stringify({
      schema: "freyra.field-job-local-concurrency/v1",
      result: "PASS",
      syntheticOnly: true,
      scenarios,
      after,
    }) + "\n",
  );
} finally {
  for (const s of sessions) if (s.exit === undefined) s.process.kill();
}
