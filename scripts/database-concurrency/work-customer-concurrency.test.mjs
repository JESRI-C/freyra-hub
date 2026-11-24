/** Real lock/retry checks on the explicitly disposable LOCAL database; fictional SQL fixtures only. */
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
  return i < 0 ? undefined : args[i + 1];
};
const connection = assertDisposableLocalConnection(option("--database"), {
  disposableLocal: args.includes("--disposable-local"),
  usesTunnel: args.includes("--tunnel"),
});
const environment = localPsqlChildEnvironment(process.env);
const sessions = new Set();
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
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
      {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: environment,
      },
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
    this.process.stdin.on("error", () => {
      this.stdinError = true;
    });
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
  async marker(name) {
    const start = Date.now();
    while (!this.output.split(/\r?\n/).includes(name)) {
      assert.equal(this.exit, undefined, `LOCAL session stopped: ${this.errors.slice(-1400)}`);
      assert(!this.stdinError, "LOCAL session input failed");
      assert(Date.now() - start < 20000, `LOCAL session timeout: ${name}`);
      await delay(20);
    }
  }
  async close() {
    this.process.stdin.end();
    const start = Date.now();
    while (this.exit === undefined && Date.now() - start < 10000) await delay(20);
    assert.equal(this.exit, 0, `LOCAL session must finish: ${this.errors.slice(-1400)}`);
    sessions.delete(this);
  }
}
async function query(sql) {
  const s = new Session();
  s.write(`SET statement_timeout='15s'; ${sql}\nSELECT 'DONE';`);
  await s.marker("DONE");
  await s.close();
  return s.rows();
}
async function begin(actor) {
  const s = new Session();
  s.write(
    `SET statement_timeout='15s'; BEGIN; ${actor ? `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${quote(actor)},true);` : ""} SELECT json_build_object('pid',pg_backend_pid()); SELECT 'READY';`,
  );
  await s.marker("READY");
  s.pid = s.rows()[0].pid;
  return s;
}
async function blocked(waiter, holder) {
  const start = Date.now();
  while (true) {
    assert.equal(waiter.exit, undefined, "the waiter must remain live");
    const [row] = await query(
      `SELECT json_build_object('blocked',${holder.pid}=ANY(pg_blocking_pids(${waiter.pid})));`,
    );
    if (row.blocked) return;
    assert(Date.now() - start < 10000, "expected real PostgreSQL blocking was not observed");
    await delay(30);
  }
}
async function finish(s, sql = "COMMIT") {
  s.write(`${sql}; SELECT 'FINISHED';`);
  await s.marker("FINISHED");
  await s.close();
}
const organization = randomUUID(),
  owner = randomUUID(),
  planner = randomUUID();
const command = (actor, operation, payload, request = randomUUID()) =>
  `public.command_work_customers(${quote(organization)}::uuid,${quote(actor)}::uuid,${quote(request)}::uuid,${quote(operation)},${quote(JSON.stringify(payload))}::jsonb)`;
const asActor = (actor, sql) =>
  `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${quote(actor)},true); ${sql} COMMIT;`;
const fields = (name) => ({
  name,
  registrationNumber: "",
  address: "",
  postalCode: "",
  city: "",
  country: "Danmark",
  archived: false,
});
function deniedCall(actor, operation, payload) {
  return `DO $check$ BEGIN PERFORM ${command(actor, operation, payload)}; RAISE EXCEPTION 'Unexpected customer command success'; EXCEPTION WHEN insufficient_privilege THEN PERFORM set_config('gofreyra.customer_test_outcome','42501',true); END $check$; SELECT json_build_object('outcome',current_setting('gofreyra.customer_test_outcome'));`;
}

try {
  await query(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES ${[owner, planner].map((id) => `('00000000-0000-0000-0000-000000000000',${quote(id)},'authenticated','authenticated',${quote(`customer-concurrency-${id}@example.test`)},'',now(),'{"provider":"email"}','{}',now(),now())`).join(",")};
    INSERT INTO public.organizations(id,name) VALUES(${quote(organization)},'Fictional customer concurrency organization');
    INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(${quote(organization)},${quote(owner)},'owner'),(${quote(organization)},${quote(planner)},'viewer');`);
  // Distinct requests contend on the real organization number allocator.
  const first = await begin(owner),
    second = await begin(owner);
  first.write(
    `SELECT ${command(owner, "save_customer", { customerId: null, expectedVersion: 0, data: fields("Fictional customer A") })}; SELECT 'SAVED';`,
  );
  await first.marker("SAVED");
  second.write(
    `SELECT ${command(owner, "save_customer", { customerId: null, expectedVersion: 0, data: fields("Fictional customer B") })}; SELECT 'SAVED';`,
  );
  await blocked(second, first);
  await finish(first);
  await second.marker("SAVED");
  await finish(second);
  const customer = first.rows().find((r) => r.operation === "save_customer");
  assert.deepEqual(
    [customer.number, second.rows().find((r) => r.operation === "save_customer").number].sort(),
    ["K-000001", "K-000002"],
  );

  // The same request in two simultaneous transactions produces exactly one case/receipt.
  const request = randomUUID();
  const payload = {
    customerId: customer.id,
    contactId: null,
    title: "Fictional concurrent case",
    description: "",
    location: "",
    customerReference: "CONCURRENT",
  };
  const a = await begin(owner),
    b = await begin(owner);
  a.write(`SELECT ${command(owner, "create_case", payload, request)}; SELECT 'SAVED';`);
  await a.marker("SAVED");
  b.write(`SELECT ${command(owner, "create_case", payload, request)}; SELECT 'SAVED';`);
  await blocked(b, a);
  await finish(a);
  await b.marker("SAVED");
  await finish(b);
  assert.deepEqual(
    a.rows().find((r) => r.operation === "create_case"),
    b.rows().find((r) => r.operation === "create_case"),
  );

  await query(
    asActor(
      owner,
      `SELECT ${command(owner, "grant_planner", { customerId: customer.id, userId: planner, expectedVersion: 0, enabled: true })};`,
    ),
  );
  // A committed planner revocation must win over a command waiting for its customer lock.
  const revoke = await begin(owner),
    denied = await begin(planner);
  revoke.write(
    `SELECT ${command(owner, "grant_planner", { customerId: customer.id, userId: planner, expectedVersion: 1, enabled: false })}; SELECT 'REVOKED';`,
  );
  await revoke.marker("REVOKED");
  denied.write(`${deniedCall(planner, "create_case", payload)} SELECT 'DENIED';`);
  await blocked(denied, revoke);
  await finish(revoke);
  await denied.marker("DENIED");
  await finish(denied);
  assert.equal(denied.rows().find((r) => r.outcome)?.outcome, "42501");

  await query(
    asActor(
      owner,
      `SELECT ${command(owner, "grant_planner", { customerId: customer.id, userId: planner, expectedVersion: 2, enabled: true })};`,
    ),
  );
  // A membership deletion is observed after the command waits at its initial authority lock.
  const remove = await begin(),
    removed = await begin(planner);
  remove.write(
    `DELETE FROM public.organization_memberships WHERE organization_id=${quote(organization)} AND user_id=${quote(planner)}; SELECT 'REMOVED';`,
  );
  await remove.marker("REMOVED");
  removed.write(`${deniedCall(planner, "create_case", payload)} SELECT 'DENIED';`);
  await blocked(removed, remove);
  await finish(remove);
  await removed.marker("DENIED");
  await finish(removed);
  assert.equal(removed.rows().find((r) => r.outcome)?.outcome, "42501");
  await query(
    `INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(${quote(organization)},${quote(planner)},'viewer');`,
  );

  // Conversely, an in-flight authorized command holds membership through its transaction.
  const executing = await begin(planner),
    removal = await begin();
  executing.write(`SELECT ${command(planner, "create_case", payload)}; SELECT 'SAVED';`);
  await executing.marker("SAVED");
  removal.write(
    `DELETE FROM public.organization_memberships WHERE organization_id=${quote(organization)} AND user_id=${quote(planner)}; SELECT 'REMOVED';`,
  );
  await blocked(removal, executing);
  await finish(executing, "ROLLBACK");
  await removal.marker("REMOVED");
  await finish(removal);
  const [state] = await query(
    `SELECT json_build_object('cases',(SELECT count(*) FROM private.work_customer_cases WHERE organization_id=${quote(organization)}));`,
  );
  assert.equal(Number(state.cases), 1, "revoked or rolled-back attempts created no extra case");
  const [last] = await query(asActor(owner, `SELECT ${command(owner, "create_case", payload)};`));
  assert.equal(last.number, "S-000002", "rolled-back allocation did not consume a case number");
  console.log(
    JSON.stringify({
      result: "PASS",
      scenarios: 5,
      numberAllocation: true,
      identicalConcurrentReceipt: true,
      plannerRevocation: true,
      membershipRevocation: true,
      inFlightAuthorityLock: true,
      rollbackPreservesNumber: true,
    }),
  );
} finally {
  for (const s of sessions) {
    s.process.stdin.end();
    if (s.exit === undefined) s.process.kill();
  }
}
