// Staging-only synthetic identities. Outputs hashes to private SQL; passwords stay private.
import fs from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

assert(process.argv.includes("--staging"), "Explicit --staging required");
const require = createRequire(import.meta.url);
const bcrypt = require("../../tmp/saas50-tools/node_modules/bcryptjs");
const directory = "tmp/saas50";
await fs.mkdir(directory, { recursive: true });
let fixture;
try {
  fixture = JSON.parse(await fs.readFile(`${directory}/fixture.private.json`, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const run = randomUUID().slice(0, 8);
  const roles = ["owner", "manager", "field", "reviewer", "viewer", "external"];
  fixture = {
    schema: "freyra.saas50-fixture/v1",
    run,
    qaTag: `freyra_saas50_${run}`,
    url: "https://xdvqdzdpyceojbdknofi.supabase.co",
    app: "https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev",
    sourceRevision: process.env.FREYRA_TEST_REVISION ?? "ce2ff55c1c28aa3d2cc3919a0785c33fff511304",
    createdAt: new Date().toISOString(),
    users: [],
    tenants: Array.from({ length: 8 }, (_, index) => ({
      number: index + 1,
      organizationId: randomUUID(),
      projectId: randomUUID(),
      actionId: randomUUID(),
      uploadId: randomUUID(),
      evidenceId: randomUUID(),
      templateId: randomUUID(),
      name: `TEST SaaS50 ${run} organisation ${index + 1}`,
    })),
  };
  for (let index = 0; index < 50; index++) {
    const password = randomBytes(32).toString("base64url");
    fixture.users.push({
      number: index + 1,
      id: randomUUID(),
      identityId: randomUUID(),
      tenant: index < 48 ? Math.floor(index / 6) + 1 : null,
      role: index < 48 ? roles[index % 6] : "unassigned",
      email: `qa50-${run}-${String(index + 1).padStart(2, "0")}@example.test`,
      name: `TEST 50 ${run} U${String(index + 1).padStart(2, "0")}`,
      password,
      passwordHash: bcrypt.hashSync(password, 10),
    });
  }
  await fs.writeFile(`${directory}/fixture.private.json`, JSON.stringify(fixture, null, 2), {
    mode: 0o600,
  });
}
assert.equal(fixture.users.length, 50);
assert(
  !fixture.credentialsRetired,
  "Archive the completed tmp/saas50 run before preparing a new fixture",
);
assert(/^[a-f0-9]{40}$/.test(fixture.sourceRevision));
assert.equal(new Set(fixture.users.map((user) => user.id)).size, 50);
assert.equal(new Set(fixture.users.map((user) => user.password)).size, 50);
assert.equal(fixture.url, "https://xdvqdzdpyceojbdknofi.supabase.co");
assert(fixture.users.every((user) => user.email.endsWith("@example.test")));
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
function provision(users) {
  const records = users.map((user) => ({
    id: user.id,
    identity_id: user.identityId,
    email: user.email,
    password_hash: user.passwordHash,
    name: user.name,
    qa_role: user.role,
  }));
  return `-- ONLY xdvqdzdpyceojbdknofi; synthetic ${fixture.qaTag}; no SMTP or invitations.
BEGIN;
WITH fixture AS (SELECT * FROM jsonb_to_recordset(${quote(JSON.stringify(records))}::jsonb)
 AS x(id uuid,identity_id uuid,email text,password_hash text,name text,qa_role text))
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 confirmation_token,recovery_token,email_change_token_new,email_change,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,password_hash,now(),
 '','','','',jsonb_build_object('provider','email','providers',jsonb_build_array('email'),
 'qa_tag',${quote(fixture.qaTag)},'qa_role',qa_role),jsonb_build_object('full_name',name),now(),now()
FROM fixture ON CONFLICT(id) DO NOTHING;
WITH fixture AS (SELECT * FROM jsonb_to_recordset(${quote(JSON.stringify(records.map(({ id, identity_id, email }) => ({ id, identity_id, email }))))}::jsonb)
 AS x(id uuid,identity_id uuid,email text))
INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
SELECT identity_id,id,id::text,'email',jsonb_build_object('sub',id::text,'email',email,'email_verified',true,'phone_verified',false),now(),now()
FROM fixture ON CONFLICT(id) DO NOTHING;
SELECT count(*) AS synthetic_users FROM auth.users WHERE raw_app_meta_data->>'qa_tag'=${quote(fixture.qaTag)};
COMMIT;
`;
}
await fs.writeFile(`${directory}/provision-one.private.sql`, provision(fixture.users.slice(0, 1)), {
  mode: 0o600,
});
await fs.writeFile(`${directory}/provision-all.private.sql`, provision(fixture.users), {
  mode: 0o600,
});
console.log(JSON.stringify({ run: fixture.run, users: 50, tenants: 8, passwordsPrinted: false }));
