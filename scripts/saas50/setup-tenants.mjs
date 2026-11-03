import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {
  directory,
  fixture,
  client,
  getUser,
  sessions,
  check,
  ok,
  saveFixture,
  finish,
} from "./common.mjs";

await sessions();
for (const tenant of fixture.tenants) {
  const owner = getUser(tenant.number, "owner"),
    sdk = client(owner);
  await check("owner-creates-and-reopens-project", owner, async () => {
    // Reuse the personal organisation created by the existing signup trigger.
    const organizations = ok(
      await sdk
        .from("organizations")
        .select("id,name")
        .eq("name", owner.name + " – organisation"),
      "Signup organisation",
    );
    assert.equal(organizations.length, 1);
    tenant.organizationId = organizations[0].id;
    tenant.name = organizations[0].name;
    tenant.projectName = `TEST SaaS50 ${fixture.run} projekt ${tenant.number}`;
    const existing = ok(
      await sdk.from("projects").select("id,name").eq("id", tenant.projectId),
      "Read test project",
    );
    if (!existing.length) {
      // Match insertProjectWithoutRepresentation: RLS confirmation is a separate request.
      ok(
        await sdk.from("projects").insert({
          id: tenant.projectId,
          organization_id: tenant.organizationId,
          name: tenant.projectName,
          slug: `test-saas50-${fixture.run}-${tenant.number}`,
          project_type: "nature_restoration",
          status: "planning",
          description:
            "TEST · Syntetisk 50-brugerprøve. Ingen faktisk naturindsats eller natureffekt.",
        }),
        "Create test project",
      );
    }
    const saved = ok(
      await sdk
        .from("projects")
        .select("id,organization_id,name")
        .eq("id", tenant.projectId)
        .single(),
      "Reopen committed project",
    );
    assert.equal(saved.organization_id, tenant.organizationId);
    assert.equal(saved.name, tenant.projectName);
    await saveFixture();
    return { committedRead: true, correctOrganization: true };
  });
}
assert(
  fixture.tenants.every((tenant) => tenant.name.includes(fixture.run)),
  "No unverified tenant fixture",
);
const quote = (text) => `'${text.replaceAll("'", "''")}'`;
const orgRows = [],
  projectRows = [];
for (const tenant of fixture.tenants) {
  for (const role of ["manager", "field", "reviewer", "viewer"]) {
    const user = getUser(tenant.number, role);
    orgRows.push(`('${tenant.organizationId}','${user.id}','viewer')`);
    const projectRole = {
      manager: "project_manager",
      field: "field",
      reviewer: "editor",
      viewer: "viewer",
    }[role];
    projectRows.push(`('${tenant.projectId}','${user.id}','${projectRole}')`);
  }
}
const sql = `-- Staging-only role fixture for ${fixture.qaTag}; not a test of invitations/onboarding.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'qa_tag'=${quote(fixture.qaTag)})<>50
 THEN RAISE EXCEPTION 'Expected exactly fifty synthetic users'; END IF;
END $$;
INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES ${orgRows.join(",\n")}
ON CONFLICT(user_id,organization_id) DO NOTHING;
INSERT INTO public.project_members(project_id,user_id,role) VALUES ${projectRows.join(",\n")}
ON CONFLICT(project_id,user_id) DO NOTHING;
SELECT count(*) AS project_members FROM public.project_members WHERE project_id IN (${fixture.tenants.map((t) => quote(t.projectId)).join(",")});
COMMIT;
`;
await fs.writeFile(`${directory}/provision-roles.private.sql`, sql, { mode: 0o600 });
await finish("setup-tenants");
