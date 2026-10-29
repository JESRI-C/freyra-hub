/** Synthetic uploads, multiple real PostgreSQL connections, disposable LOCAL only. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertDisposableLocalConnection,
  localPsqlChildEnvironment,
} from "./local-database-guard.mjs";
const args = process.argv.slice(2),
  option = (name) => args[args.indexOf(name) + 1];
const connection = assertDisposableLocalConnection(option("--database"), {
  disposableLocal: args.includes("--disposable-local"),
  usesTunnel: args.includes("--tunnel"),
});
const env = localPsqlChildEnvironment(process.env),
  sessions = new Set();
class Session {
  constructor() {
    this.output = "";
    this.errors = "";
    this.exit = undefined;
    this.process = spawn(
      "psql",
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
      { shell: false, stdio: ["pipe", "pipe", "pipe"], env },
    );
    this.process.stdout.on("data", (b) => (this.output += b.toString()));
    this.process.stderr.on("data", (b) => (this.errors += b.toString()));
    this.process.on("close", (code) => (this.exit = code));
    this.process.on("error", () => (this.exit = 127));
    this.process.stdin.on("error", () => (this.exit = 127));
    sessions.add(this);
  }
  write(sql) {
    this.process.stdin.write(sql + "\n");
  }
  rows() {
    return this.output
      .split(/\r?\n/)
      .filter((l) => l.startsWith("{") && l.endsWith("}"))
      .map((l) => JSON.parse(l));
  }
  async marker(label) {
    const deadline = Date.now() + 20000;
    while (!this.output.split(/\r?\n/).includes(label)) {
      assert(
        this.exit === undefined,
        `LOCAL session ended before ${label}: ${this.errors.slice(-1000)}`,
      );
      assert(Date.now() < deadline, `LOCAL timeout at ${label}`);
      await delay(20);
    }
  }
  async close() {
    this.process.stdin.end();
    const deadline = Date.now() + 10000;
    while (this.exit === undefined && Date.now() < deadline) await delay(20);
    assert.equal(this.exit, 0, `LOCAL psql failed: ${this.errors.slice(-1000)}`);
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
const actorId = randomUUID(),
  projectId = randomUUID(),
  uploadId = randomUUID(),
  orgId = randomUUID();
const actor = q(actorId),
  project = q(projectId),
  upload = q(uploadId),
  org = q(orgId);
const login = `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${actor},true);`;
const service = "SET LOCAL ROLE service_role;";
async function transaction(sql, role = login) {
  const s = new Session();
  s.write(
    `BEGIN; SET LOCAL statement_timeout='15s'; SELECT json_build_object('pid',pg_backend_pid()); ${role} ${sql}\nSELECT 'HELD';`,
  );
  return s;
}
async function commit(s) {
  s.write("COMMIT; SELECT 'COMMITTED';");
  await s.marker("COMMITTED");
  await s.close();
}
async function actualLock(waiter, holder) {
  const deadline = Date.now() + 5000;
  while (!waiter.rows().find((r) => r.pid)) {
    assert(Date.now() < deadline, "LOCAL waiter PID missing");
    await delay(20);
  }
  const waitingPid = waiter.rows().find((r) => r.pid).pid,
    holdingPid = holder.rows().find((r) => r.pid).pid;
  while (Date.now() < deadline) {
    const [r] = await query(
      `SELECT json_build_object('waiting',wait_event_type='Lock' AND ${holdingPid}=ANY(pg_blocking_pids(pid))) FROM pg_stat_activity WHERE pid=${Number(waitingPid)};`,
    );
    if (r?.waiting) return;
    assert(waiter.exit === undefined, "LOCAL waiter ended before lock");
    await delay(20);
  }
  assert.fail("Expected an actual PostgreSQL lock wait");
}
const capture = (sql) =>
  `DO $test$ BEGIN PERFORM ${sql}; PERFORM set_config('field_photo_test.result','saved',true); EXCEPTION WHEN OTHERS THEN PERFORM set_config('field_photo_test.result',SQLSTATE,true); END $test$; SELECT json_build_object('result',current_setting('field_photo_test.result'));`;
const payload = q(
  JSON.stringify({
    title: "Synthetic concurrent photo",
    description: null,
    category: "field_photo",
    tags: [],
    originalName: "synthetic.jpg",
    sha256: "a".repeat(64),
    sizeBytes: 8,
    mimeType: "image/jpeg",
    capturedAt: null,
    capture: {
      schema: "freyra.field-photo/v1",
      originalPosition: null,
      initialPosition: null,
      correctionReason: "",
    },
  }),
);
const begin = `public.begin_field_photo_upload(${project},${upload},${payload}::jsonb)`,
  finalize = `public.finalize_field_photo_upload(${project},${upload})`,
  prepare = `public.prepare_field_photo_verification(${project},${upload},${actor})`;
const scenarios = [];
try {
  await query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES('00000000-0000-0000-0000-000000000000',${actor},'authenticated','authenticated','field-photo-${randomUUID()}@example.test','',now(),'{"provider":"email"}','{}',now(),now());
  INSERT INTO public.organizations(id,name,type,country) VALUES(${org},'Synthetic photo concurrency','test','Denmark');
  INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(${org},${actor},'viewer');
  INSERT INTO public.projects(id,organization_id,name) VALUES(${project},${org},'Synthetic photo concurrency');
  INSERT INTO public.project_members(project_id,user_id,role) VALUES(${project},${actor},'field');
  INSERT INTO storage.buckets(id,name,public) VALUES('project-media','project-media',false) ON CONFLICT(id) DO NOTHING;`);
  for (const [name, call] of [
    ["simultaneous_intent_retry", begin],
    ["simultaneous_finalization_retry", finalize],
  ]) {
    if (call === finalize)
      await query(
        `INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES('project-media',${q(`${projectId}/field-uploads/${uploadId}/original`)},${actor},'{"size":8,"mimetype":"image/jpeg"}');`,
      );
    const winner = await transaction(`SELECT json_build_object('id',id) FROM ${call};`);
    await winner.marker("HELD");
    const retry = await transaction(`SELECT json_build_object('id',id) FROM ${call};`);
    await actualLock(retry, winner);
    await commit(winner);
    await retry.marker("HELD");
    assert.equal(retry.rows().find((r) => r.id)?.id, uploadId);
    await commit(retry);
    scenarios.push({ name, actualLockVerified: true });
  }
  const worker = await transaction(`SELECT json_build_object('prepared',${prepare});`, service);
  await worker.marker("HELD");
  const competitor = await transaction(capture(prepare), service);
  await actualLock(competitor, worker);
  await commit(worker);
  await competitor.marker("HELD");
  assert.equal(competitor.rows().find((r) => r.result)?.result, "55P03");
  await commit(competitor);
  scenarios.push({ name: "one_processing_lease", actualLockVerified: true });
  const lease = worker.rows().find((r) => r.prepared).prepared.leaseId;
  const revoker = await transaction(
    `DELETE FROM public.organization_memberships WHERE organization_id=${org} AND user_id=${actor};`,
    "",
  );
  await revoker.marker("HELD");
  const complete = `public.complete_field_photo_verification(${project},${upload},${actor},${q(lease)},${q("a".repeat(64))},8)`;
  const revokedWorker = await transaction(capture(complete), service);
  await actualLock(revokedWorker, revoker);
  await commit(revoker);
  await revokedWorker.marker("HELD");
  assert.equal(revokedWorker.rows().find((r) => r.result)?.result, "42501");
  await commit(revokedWorker);
  scenarios.push({ name: "membership_revocation_before_receipt", actualLockVerified: true });
  const [counts] = await query(
    `SELECT json_build_object('media',(SELECT count(*) FROM public.project_media WHERE id=${upload}),'jobs',(SELECT count(*) FROM public.field_photo_processing_jobs WHERE upload_id=${upload}),'receipts',(SELECT count(*) FROM public.field_photo_receipts WHERE upload_id=${upload}));`,
  );
  assert.deepEqual(counts, { media: 1, jobs: 1, receipts: 0 });
  process.stdout.write(
    JSON.stringify({
      schema: "freyra.field-photo-local-concurrency/v1",
      result: "PASS",
      syntheticOnly: true,
      scenarios,
      counts,
    }) + "\n",
  );
} finally {
  for (const s of sessions) if (s.exit === undefined) s.process.kill();
}
