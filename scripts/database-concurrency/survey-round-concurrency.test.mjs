/** Inert, real multi-connection LOCAL test. Root must copy explicitly to .mjs.
 * Run only after the SQL draft and LOCAL rollback fixtures have been reviewed.
 * root prepares the public synthetic fixture graph and keeps it committed for
 * this disposable database; drop/reset that LOCAL database after the run.
 * No hosted URL, private env file, service token or customer data is accepted.
 *
 * node <reviewed-copy.mjs> --disposable-local --database <loopback-postgres-url>
 *   --fixture <local-json-file> [--psql <absolute-psql-binary>]
 * Fixture: {projectId,actorId,baselineId,baselineSha256,planId,planSha256,
 *           manifestText}. Use the canonical draft manifest from the SQL fixture.
 * Membership row is snapshot/read from this LOCAL fixture and restored exactly.
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
for (const name of ["projectId", "actorId", "baselineId", "planId"])
  assert(uuid.test(fixture[name]));
for (const name of ["baselineSha256", "planSha256"]) assert(/^[0-9a-f]{64}$/.test(fixture[name]));
assert(Buffer.byteLength(fixture.manifestText, "utf8") <= 65_536);
const manifest = JSON.parse(fixture.manifestText);
assert.equal(manifest.schema, "gofreyra.survey-round/v1");
assert.equal(manifest.status, "draft");
for (const name of ["projectId", "baselineId", "baselineSha256", "planId", "planSha256"])
  assert.equal(manifest[name], fixture[name]);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const literalProject = quote(fixture.projectId);
const literalActor = quote(fixture.actorId);
const save = (requestId) =>
  `select public.persist_survey_round(${literalProject}::uuid,${literalActor}::uuid,${quote(requestId)}::uuid,${quote(fixture.baselineId)}::uuid,${quote(fixture.baselineSha256)},${quote(fixture.planId)}::uuid,${quote(fixture.planSha256)},${quote(fixture.manifestText)})::text;`;
const memberPredicate = `project_id=${literalProject}::uuid and user_id=${literalActor}::uuid`;

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
async function expectDenied(sql) {
  // Capture SQLSTATE inside the database; no inference from timing or stderr.
  const [result] = await query(
    `do $test$ begin ${sql} raise exception 'Expected access denial'; exception when insufficient_privilege then perform set_config('gofreyra.test_denied','42501',false); end $test$; select json_build_object('denied',current_setting('gofreyra.test_denied',true));`,
  );
  assert.equal(result?.denied, "42501");
}
async function restoreMember(snapshot) {
  await query(
    `insert into public.project_members select * from jsonb_populate_record(null::public.project_members,${quote(JSON.stringify(snapshot))}::jsonb); select json_build_object('restored',(select to_jsonb(member)=${quote(JSON.stringify(snapshot))}::jsonb from public.project_members member where ${memberPredicate}));`,
  ).then(([row]) =>
    assert.equal(
      row.restored,
      true,
      "LOCAL synthetic membership must be restored byte-for-byte as JSONB",
    ),
  );
}
async function restoreOrganizationMembership(snapshot) {
  const predicate = `organization_id=${quote(snapshot.organization_id)}::uuid and user_id=${literalActor}::uuid`;
  await query(
    `insert into public.organization_memberships select * from jsonb_populate_record(null::public.organization_memberships,${quote(JSON.stringify(snapshot))}::jsonb); select json_build_object('restored',(select to_jsonb(member)=${quote(JSON.stringify(snapshot))}::jsonb from public.organization_memberships member where ${predicate}));`,
  ).then(([row]) =>
    assert.equal(
      row.restored,
      true,
      "LOCAL synthetic organization membership must be restored exactly",
    ),
  );
}

let restoreRequired = false;
let memberSnapshot;
let organizationRestoreRequired = false;
let organizationSnapshot;
try {
  [memberSnapshot] = await query(
    `select to_jsonb(member)::text from public.project_members member where ${memberPredicate};`,
  );
  assert(
    memberSnapshot && ["admin", "project_manager", "editor"].includes(memberSnapshot.role),
    "An actual LOCAL editor fixture is required",
  );
  [organizationSnapshot] = await query(
    `select to_jsonb(member)::text from public.organization_memberships member where organization_id=(select organization_id from public.projects where id=${literalProject}::uuid) and user_id=${literalActor}::uuid;`,
  );
  assert(
    organizationSnapshot && !["owner", "admin"].includes(organizationSnapshot.role),
    "This adversarial fixture uses project editor access, not organization-wide administration",
  );
  // Snapshot unrelated immutable graph rather than assuming it starts empty.
  const graphSql = `select jsonb_build_object('baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),'promotions',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row));`;
  const [beforeGraph] = await query(graphSql);
  const [before] = await query(
    `select json_build_object('count',count(*)) from public.survey_round_versions where project_id=${literalProject}::uuid;`,
  );

  const sameRequest = randomUUID();
  const first = await startTransaction(
    `set local role service_role; ${save(sameRequest)}`,
    "FIRST_READY",
  );
  await first.marker("FIRST_READY");
  const retry = await startTransaction(
    `set local role service_role; ${save(sameRequest)}`,
    "RETRY_READY",
  );
  await waitForActualLock(retry);
  await commit(first);
  await retry.marker("RETRY_READY");
  await commit(retry);
  const firstReceipt = first.jsonLines().find((row) => row.manifest_sha256);
  const retryReceipt = retry.jsonLines().find((row) => row.manifest_sha256);
  assert.deepEqual(
    retryReceipt,
    firstReceipt,
    "Concurrent identical retry returns the exact immutable row",
  );

  const differentA = await startTransaction(
    `set local role service_role; ${save(randomUUID())}`,
    "DIFFERENT_A_READY",
  );
  await differentA.marker("DIFFERENT_A_READY");
  const differentB = await startTransaction(
    `set local role service_role; ${save(randomUUID())}`,
    "DIFFERENT_B_READY",
  );
  await waitForActualLock(differentB);
  await commit(differentA);
  await differentB.marker("DIFFERENT_B_READY");
  await commit(differentB);
  const a = differentA.jsonLines().find((row) => row.manifest_sha256);
  const b = differentB.jsonLines().find((row) => row.manifest_sha256);
  assert.equal(
    b.version_no,
    a.version_no + 1,
    "Concurrent different requests allocate consecutive project versions",
  );
  assert.notEqual(a.round_id, b.round_id, "Different requests create separate logical rounds");

  const writerWinnerRequest = randomUUID();
  const writerWinner = await startTransaction(
    `set local role service_role; ${save(writerWinnerRequest)}`,
    "WRITER_READY",
  );
  await writerWinner.marker("WRITER_READY");
  const revokeWaiter = await startTransaction(
    `delete from public.project_members where ${memberPredicate};`,
    "REVOKED",
  );
  await waitForActualLock(revokeWaiter);
  await commit(writerWinner);
  await revokeWaiter.marker("REVOKED");
  restoreRequired = true;
  await commit(revokeWaiter);
  await expectDenied(
    `perform set_config('role','service_role',true); perform public.persist_survey_round(${literalProject}::uuid,${literalActor}::uuid,${quote(writerWinnerRequest)}::uuid,${quote(fixture.baselineId)}::uuid,${quote(fixture.baselineSha256)},${quote(fixture.planId)}::uuid,${quote(fixture.planSha256)},${quote(fixture.manifestText)});`,
  );
  await restoreMember(memberSnapshot);
  restoreRequired = false;

  const revokeWinner = await startTransaction(
    `delete from public.project_members where ${memberPredicate};`,
    "REVOKE_HELD",
  );
  await revokeWinner.marker("REVOKE_HELD");
  const deniedWriter = await startTransaction(
    `set local role service_role; do $test$ begin perform public.persist_survey_round(${literalProject}::uuid,${literalActor}::uuid,${quote(randomUUID())}::uuid,${quote(fixture.baselineId)}::uuid,${quote(fixture.baselineSha256)},${quote(fixture.planId)}::uuid,${quote(fixture.planSha256)},${quote(fixture.manifestText)}); raise exception 'Expected access denial'; exception when insufficient_privilege then perform set_config('gofreyra.test_denied','42501',true); end $test$; select json_build_object('denied',current_setting('gofreyra.test_denied',true));`,
    "DENIED_READY",
  );
  await waitForActualLock(deniedWriter);
  restoreRequired = true;
  await commit(revokeWinner);
  await deniedWriter.marker("DENIED_READY");
  await commit(deniedWriter);
  assert.equal(
    deniedWriter.jsonLines().find((row) => row.denied)?.denied,
    "42501",
    "Revocation committed first prevents the later insert",
  );
  await restoreMember(memberSnapshot);
  restoreRequired = false;

  // The organization row is missing when the writer reads that lock point.
  // Hold the existing project-member row so the writer waits at its next lock.
  // Insert a new org grant while it waits: the missing captured role must not
  // be replaced by a later, unlocked EXISTS result.
  const organizationPredicate = `organization_id=${quote(organizationSnapshot.organization_id)}::uuid and user_id=${literalActor}::uuid`;
  await query(`delete from public.organization_memberships where ${organizationPredicate};`);
  organizationRestoreRequired = true;
  const memberHolder = await startTransaction(
    `select to_jsonb(member)::text from public.project_members member where ${memberPredicate} for update;`,
    "MEMBER_HELD",
  );
  await memberHolder.marker("MEMBER_HELD");
  const newGrantWriter = await startTransaction(
    `set local role service_role; do $test$ begin perform public.persist_survey_round(${literalProject}::uuid,${literalActor}::uuid,${quote(randomUUID())}::uuid,${quote(fixture.baselineId)}::uuid,${quote(fixture.baselineSha256)},${quote(fixture.planId)}::uuid,${quote(fixture.planSha256)},${quote(fixture.manifestText)}); raise exception 'Expected access denial'; exception when insufficient_privilege then perform set_config('gofreyra.test_denied','42501',true); end $test$; select json_build_object('denied',current_setting('gofreyra.test_denied',true));`,
    "NEW_GRANT_DENIED",
  );
  await waitForActualLock(newGrantWriter);
  await restoreOrganizationMembership(organizationSnapshot);
  organizationRestoreRequired = false;
  await commit(memberHolder);
  await newGrantWriter.marker("NEW_GRANT_DENIED");
  await commit(newGrantWriter);
  assert.equal(
    newGrantWriter.jsonLines().find((row) => row.denied)?.denied,
    "42501",
    "A later unlocked grant cannot authorize a transaction that captured no organization role",
  );

  const [after] = await query(
    `select json_build_object('count',count(*)) from public.survey_round_versions where project_id=${literalProject}::uuid;`,
  );
  assert.equal(
    Number(after.count),
    Number(before.count) + 4,
    "Only the four authorized logical rounds were committed",
  );
  const [afterGraph] = await query(graphSql);
  assert.deepEqual(afterGraph, beforeGraph, "Immutable baseline/plan/canonical graph is unchanged");
  console.log(
    JSON.stringify({
      localOnly: true,
      tests: 5,
      result: "PASS",
      exactMembershipRestored: true,
      graphPreserved: true,
      rowsAdded: 4,
    }),
  );
} finally {
  // Failure is not permission to leave a local fixture membership revoked.
  for (const value of sessions) if (value.exit === undefined) value.process.kill();
  if (restoreRequired && memberSnapshot) await restoreMember(memberSnapshot);
  if (organizationRestoreRequired && organizationSnapshot)
    await restoreOrganizationMembership(organizationSnapshot);
}
