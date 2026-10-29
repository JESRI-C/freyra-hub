/** Real PostgreSQL connections on an explicitly disposable LOCAL stack only. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
