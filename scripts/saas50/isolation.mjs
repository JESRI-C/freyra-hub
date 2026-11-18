import assert from "node:assert/strict";
import { fixture, client, pool, sessions, check, ok, finish } from "./common.mjs";

await sessions();
const projectIds = fixture.tenants.map((tenant) => tenant.projectId);
await pool(fixture.users, 10, async (user) => {
  await check("project-tenant-isolation", user, async () => {
    const visible = ok(
      await client(user).from("projects").select("id,organization_id").in("id", projectIds),
      "Read project scopes",
    );
    const expected =
      user.tenant && !["external", "unassigned"].includes(user.role)
        ? fixture.tenants.find((tenant) => tenant.number === user.tenant)
        : null;
    assert.deepEqual(
      visible.map((project) => project.id),
      expected ? [expected.projectId] : [],
    );
    if (expected) assert.equal(visible[0].organization_id, expected.organizationId);
    return { allowedProjects: visible.length, foreignProjects: 0 };
  });
  await check("foreign-project-write-denied", user, async () => {
    const foreign = fixture.tenants.find((tenant) => tenant.number !== user.tenant);
    const response = await client(user)
      .from("projects")
      .update({ description: "TEST · Forbidden cross-tenant mutation" })
      .eq("id", foreign.projectId)
      .select("id");
    assert(
      response.error?.code === "42501" || (!response.error && response.data.length === 0),
      "Cross-tenant write must be denied",
    );
    return { denied: true };
  });
  if (user.role === "viewer" || user.role === "external" || user.role === "unassigned") {
    await check("user-metadata-cannot-elevate-project-access", user, async () => {
      ok(
        await client(user).auth.updateUser({ data: { role: "admin", organization_role: "owner" } }),
        "Change own untrusted metadata",
      );
      const visible = ok(
        await client(user).from("projects").select("id").in("id", projectIds),
        "Read after metadata change",
      );
      assert.equal(visible.length, user.role === "viewer" ? 1 : 0);
      return { untrustedAdminClaimIgnored: true };
    });
  }
});

// Fifty genuinely distinct clients request concurrently, with three bounded waves.
for (let wave = 1; wave <= 3; wave++) {
  await pool(fixture.users, 50, async (user) => {
    await check(`concurrent-read-wave-${wave}`, user, async () => {
      const response = await client(user)
        .from("projects")
        .select("id,organization_id,name")
        .in("id", projectIds);
      const rows = ok(response, "Concurrent scoped read");
      const expected = user.tenant && user.role !== "external" ? 1 : 0;
      assert.equal(rows.length, expected);
      return { wave, rows: rows.length };
    });
  });
}
await finish("isolation");
