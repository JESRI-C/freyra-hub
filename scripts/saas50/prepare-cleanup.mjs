// Deactivate only the run's synthetic accounts. Preserve membership rows and all history.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { directory, fixture } from "./common.mjs";

assert(/^[a-f0-9]{8}$/.test(fixture.run));
assert.equal(fixture.qaTag, `freyra_saas50_${fixture.run}`);
const partialProvisioning = process.argv.includes("--partial-provisioning");
assert.equal(new Set(fixture.users.map((user) => user.id)).size, 50);
assert.equal(new Set(fixture.users.map((user) => user.email)).size, 50);
const emailPattern = new RegExp(`^qa50-${fixture.run}-(0[1-9]|[1-4][0-9]|50)@example\\.test$`);
assert(fixture.users.every((user) => emailPattern.test(user.email)));
const users = fixture.users.map((user) => `'${user.id}'::uuid`).join(",");
const projects = fixture.tenants.map((tenant) => `'${tenant.projectId}'::uuid`).join(",");
const organizations = fixture.tenants.map((tenant) => `'${tenant.organizationId}'::uuid`).join(",");
const accounts = fixture.users.map((user) => `('${user.id}'::uuid,'${user.email}')`).join(",");
const tag = `raw_app_meta_data->>'qa_tag'='${fixture.qaTag}' AND email LIKE 'qa50-${fixture.run}-%@example.test'`;
const sql = `-- ONLY xdvqdzdpyceojbdknofi. Scoped, additive history retained.
BEGIN;
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM auth.users u
   FULL JOIN (VALUES ${accounts}) AS expected(id,email) ON u.id=expected.id
   WHERE u.id IS NOT NULL
     AND (expected.id IS NOT NULL OR u.raw_app_meta_data->>'qa_tag'='${fixture.qaTag}')
     AND (expected.id IS NULL OR u.email IS DISTINCT FROM expected.email
       OR u.raw_app_meta_data->>'qa_tag' IS DISTINCT FROM '${fixture.qaTag}')
 ) THEN RAISE EXCEPTION 'Unexpected account identity; stop cleanup'; END IF;
 IF NOT ${partialProvisioning} AND (SELECT count(*) FROM auth.users WHERE id IN (${users}) AND ${tag})<>50
 THEN RAISE EXCEPTION 'Expected exactly fifty matching synthetic accounts'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_members WHERE user_id IN (${users}) AND project_id NOT IN (${projects}))
 THEN RAISE EXCEPTION 'Unexpected project membership; stop cleanup'; END IF;
 IF EXISTS(SELECT 1 FROM public.organization_memberships WHERE user_id IN (${users}) AND organization_id NOT IN (${organizations}))
 THEN RAISE EXCEPTION 'Unexpected organization membership; stop cleanup'; END IF;
END $$;
UPDATE auth.users SET banned_until='2099-01-01T00:00:00Z', updated_at=now()
 WHERE id IN (${users}) AND ${tag};
UPDATE auth.refresh_tokens SET revoked=true WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id IN (${users})) AND NOT revoked;
UPDATE auth.sessions SET not_after=now() WHERE user_id IN (${users}) AND (not_after IS NULL OR not_after>now());
UPDATE public.project_members SET role='external' WHERE user_id IN (${users}) AND project_id IN (${projects});
UPDATE public.organization_memberships SET role='viewer' WHERE user_id IN (${users}) AND organization_id IN (${organizations});
SELECT jsonb_build_object(
 'accounts_present',(SELECT count(*) FROM auth.users WHERE id IN (${users}) AND ${tag}),
 'banned_accounts',(SELECT count(*) FROM auth.users WHERE id IN (${users}) AND ${tag} AND banned_until>now()),
 'active_sessions',(SELECT count(*) FROM auth.sessions WHERE user_id IN (${users}) AND (not_after IS NULL OR not_after>now())),
 'unrevoked_refresh_tokens',(SELECT count(*) FROM auth.refresh_tokens WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id IN (${users})) AND NOT revoked),
 'project_memberships_with_access',(SELECT count(*) FROM public.project_members WHERE user_id IN (${users}) AND role<>'external'),
 'organization_memberships_with_write',(SELECT count(*) FROM public.organization_memberships WHERE user_id IN (${users}) AND role<>'viewer'),
 'preserved_projects',(SELECT count(*) FROM public.projects WHERE id IN (${projects})),
 'preserved_verified_originals',(SELECT count(*) FROM public.field_photo_receipts WHERE project_id IN (${projects}) AND status='verified'),
 'preserved_submission_versions',(SELECT count(*) FROM public.work_order_submission_versions WHERE project_id IN (${projects}))
) AS cleanup;
COMMIT;
`;
const output = partialProvisioning ? "cleanup-partial.private.sql" : "cleanup.private.sql";
await fs.writeFile(`${directory}/${output}`, sql, { mode: 0o600 });
console.log(
  JSON.stringify({
    run: fixture.run,
    scopedAccounts: 50,
    partialProvisioning,
    keepsOriginalsAndHistory: true,
  }),
);
