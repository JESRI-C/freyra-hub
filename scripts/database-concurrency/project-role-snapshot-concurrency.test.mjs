/** Inert real LOCAL concurrency regression. Root copies both .mjs.txt files
 * only after review, then runs against a physically disposable LOCAL database.
 * root seeds the separate committed fixture file, never the rollback pgTAP graph.
 * localhost/tunnel is not proof of a physical local backend; use numeric loopback,
 * no query overrides, clean child environment and the explicit disposable flag.
 * node <reviewed-copy.mjs> --disposable-local --database <numeric-loopback-url>
 *   --fixture <public-local-fixture-json> [--psql <absolute-local-psql>]
 * Fixture JSON contains only {projectId,actorId,organizationId} from the .sql.txt
 * LOCAL fixture. No protected files, Auth credentials, tokens or Storage bytes.
 * Tests intentionally use invalid resources: 23514 means the preserved data gate
 * was reached, 42501 means authorization denied. Positive data proofs remain in
 * the existing full baseline/plan/original/promotion suites.
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
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : undefined;
};
const connection = assertDisposableLocalConnection(option("--database"), {
  disposableLocal: args.includes("--disposable-local"),
  usesTunnel: args.includes("--tunnel"),
});
const childEnvironment = localPsqlChildEnvironment(process.env);
const fixture = JSON.parse(await readFile(option("--fixture"), "utf8"));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
for (const name of ["projectId", "actorId", "organizationId"]) assert(uuid.test(fixture[name]));
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const project = quote(fixture.projectId),
  actor = quote(fixture.actorId),
  organization = quote(fixture.organizationId);
const orgPredicate = "organization_id=" + organization + "::uuid and user_id=" + actor + "::uuid";
const memberPredicate = "project_id=" + project + "::uuid and user_id=" + actor + "::uuid";
const functions = [
  "public.persist_project_baseline",
  "public.persist_verification_plan",
  "private.lock_drone_original_upload",
  "public.prepare_project_media_original_read",
];
function fixedCall(name) {
  const unused = quote(randomUUID());
  if (name === "public.persist_project_baseline")
    return (
      name + "(" + project + "::uuid," + actor + "::uuid," + unused + "::uuid,null,repeat('a',64))"
    );
  if (name === "public.persist_verification_plan")
    return (
      name +
      "(" +
      project +
      "::uuid," +
      actor +
      "::uuid," +
      unused +
      "::uuid," +
      unused +
      "::uuid,repeat('a',64),'{}')"
    );
  return name + "(" + project + "::uuid," + unused + "::uuid," + actor + "::uuid)";
}
function outcomeSql(name) {
  return (
    "set local role service_role; do $test$ begin perform " +
    fixedCall(name) +
    "; perform set_config('gofreyra.role_test_outcome','unexpected_success',true); exception when check_violation then perform set_config('gofreyra.role_test_outcome','23514',true); when insufficient_privilege then perform set_config('gofreyra.role_test_outcome','42501',true); end $test$; select json_build_object('outcome',current_setting('gofreyra.role_test_outcome',true));"
  );
}
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
    this.process.stdout.on("data", (data) => {
      this.output += data.toString();
    });
    this.process.stderr.on("data", (data) => {
      this.errors += data.toString();
    });
    this.process.on("close", (code) => {
      this.exit = code;
    });
    this.process.on("error", () => {
      this.exit = 127;
    });
  }
  write(sql) {
    this.process.stdin.write(`${sql}\n`);
  }
  async marker(label, timeout = 10_000) {
    const started = Date.now();
    while (!this.output.split(/\r?\n/).includes(label)) {
      assert(Date.now() - started < timeout, `LOCAL database test timed out before ${label}`);
      assert(this.exit === undefined, `LOCAL session ended before ${label}; exit=${this.exit}`);
      await delay(20);
    }
  }
  jsonLines() {
    const lines = this.output.split(/\r?\n/);
    lines.pop(); // The last chunk may be an unfinished JSON line.
    return lines.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  }
  async close() {
    this.process.stdin.end();
    const started = Date.now();
    while (this.exit === undefined && Date.now() - started < 10_000) await delay(20);
    assert.equal(this.exit, 0, "LOCAL psql session must complete successfully");
  }
}
const sessions = new Set();
function session() {
  const value = new Session();
  sessions.add(value);
  return value;
}
async function query(sql) {
  const value = session();
  value.write(`${sql}\nselect 'DONE';`);
  await value.marker("DONE");
  await value.close();
  return value.jsonLines();
}
async function startTransaction(sql, label) {
  const value = session();
  value.write(
    `begin; set local statement_timeout='10s'; select json_build_object('pid',pg_backend_pid()); ${sql}\nselect '${label}';`,
  );
  return value;
}
async function waitForActualLock(value) {
  const started = Date.now();
  let pid;
  while (!pid) {
    pid = value.jsonLines().find((row) => row.pid)?.pid;
    assert(Date.now() - started < 5_000, "Blocked session must advertise its backend PID");
    if (!pid) await delay(20);
  }
  while (Date.now() - started < 5_000) {
    const [row] = await query(
      `select json_build_object('locked',wait_event_type='Lock') from pg_stat_activity where pid=${Number(pid)};`,
    );
    if (row?.locked) return;
    assert(value.exit === undefined, "Competing transaction ended unexpectedly");
    await delay(20);
  }
  assert.fail("The competing transaction must actually wait on a database lock");
}
async function commit(value) {
  value.write("commit; select 'COMMITTED';");
  await value.marker("COMMITTED");
  await value.close();
}

let organizationSnapshot;
let restoreRequired = false;
async function restoreOrganization() {
  const [receipt] = await query(
    "insert into public.organization_memberships select * from jsonb_populate_record(null::public.organization_memberships," +
      quote(JSON.stringify(organizationSnapshot)) +
      "::jsonb); select json_build_object('restored',(select to_jsonb(member)=" +
      quote(JSON.stringify(organizationSnapshot)) +
      "::jsonb from public.organization_memberships member where " +
      orgPredicate +
      "));",
  );
  assert.equal(receipt.restored, true, "Exact LOCAL organization membership restore");
  restoreRequired = false;
}
try {
  [organizationSnapshot] = await query(
    "select to_jsonb(member)::text from public.organization_memberships member where " +
      orgPredicate +
      ";",
  );
  const [member] = await query(
    "select to_jsonb(member)::text from public.project_members member where " +
      memberPredicate +
      ";",
  );
  assert.equal(organizationSnapshot?.role, "viewer");
  assert.equal(member?.role, "editor");
  const graphSql =
    "select jsonb_build_object('baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),'uploads',(select jsonb_agg(to_jsonb(row) order by id) from public.uploads row),'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),'promotions',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row),'storage',(select jsonb_agg(to_jsonb(row) order by id) from storage.objects row));";
  const [before] = await query(graphSql);
  for (const name of functions) {
    const control = await startTransaction(outcomeSql(name), "CONTROL_READY");
    await control.marker("CONTROL_READY");
    await commit(control);
    assert.equal(
      control.jsonLines().find((row) => row.outcome)?.outcome,
      "23514",
      "Existing editor reaches unchanged invalid-resource control gate: " + name,
    );
    await query("delete from public.organization_memberships where " + orgPredicate + ";");
    restoreRequired = true;
    const holder = await startTransaction(
      "select to_jsonb(member)::text from public.project_members member where " +
        memberPredicate +
        " for update;",
      "MEMBER_HELD",
    );
    await holder.marker("MEMBER_HELD");
    const writer = await startTransaction(outcomeSql(name), "WRITER_READY");
    await waitForActualLock(writer);
    await restoreOrganization();
    await commit(holder);
    await writer.marker("WRITER_READY");
    await commit(writer);
    assert.equal(
      writer.jsonLines().find((row) => row.outcome)?.outcome,
      "42501",
      "Late unlocked org grant cannot authorize the original waiting call: " + name,
    );
    const revoker = await startTransaction(
      "delete from public.organization_memberships where " + orgPredicate + ";",
      "REVOKE_HELD",
    );
    await revoker.marker("REVOKE_HELD");
    const denied = await startTransaction(outcomeSql(name), "DENIED_READY");
    await waitForActualLock(denied);
    restoreRequired = true;
    await commit(revoker);
    await denied.marker("DENIED_READY");
    await commit(denied);
    assert.equal(
      denied.jsonLines().find((row) => row.outcome)?.outcome,
      "42501",
      "Committed earlier revoke denies waiting call: " + name,
    );
    await restoreOrganization();
  }
  const [after] = await query(graphSql);
  assert.deepEqual(after, before, "Immutable input/original/Storage/canonical graph unchanged");
  console.log(
    JSON.stringify({
      tests: 8,
      functions: 4,
      result: "PASS",
      localOnly: true,
      actualLockWaitsVerified: true,
      exactMembershipRestored: true,
      graphPreserved: true,
      positiveFullDataAcceptance: false,
    }),
  );
} finally {
  for (const value of sessions) if (value.exit === undefined) value.process.kill();
  if (restoreRequired && organizationSnapshot) await restoreOrganization();
}
