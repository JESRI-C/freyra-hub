import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { fixture, client, getUser, sessions, pool, check, ok, finish } from "./common.mjs";

await sessions();
await pool(fixture.users, 8, async (user) => {
  const foreign = fixture.tenants.find(
    (tenant) => tenant.number !== user.tenant && tenant.original,
  );
  await check("foreign-original-download-denied", user, async () => {
    assert(foreign, "A real foreign Storage original is required for the test");
    const response = await client(user)
      .storage.from("project-media")
      .download(foreign.original.path);
    assert(response.error && !response.data, "Foreign original bytes must not be returned");
    const status = Number(response.error.statusCode ?? response.error.status);
    assert([400, 401, 403, 404].includes(status), `Unexpected Storage status ${status}`);
    return { denied: true, status };
  });
  if (user.role === "viewer") {
    await check("reader-cannot-replay-field-write", user, async () => {
      const tenant = fixture.tenants.find((item) => item.number === user.tenant);
      assert(tenant.initialExecutionArgs);
      const response = await client(user).rpc(
        "save_work_order_execution",
        tenant.initialExecutionArgs,
      );
      assert.equal(response.error?.code, "42501");
      return { oldRequestIdentityIsNotAuthority: true };
    });
  }
});

for (const tenant of fixture.tenants) {
  const owner = getUser(tenant.number, "owner"),
    external = getUser(tenant.number, "external");
  const scope = {
    p_action_id: tenant.actionId,
    p_organization_id: tenant.organizationId,
    p_project_id: tenant.projectId,
  };
  await check("original-preserved-after-review", owner, async () => {
    assert(tenant.approved, "Independent approval must exist first");
    const file = ok(
      await client(owner).storage.from("project-media").download(tenant.original.path),
      "Read exact original",
    );
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await file.arrayBuffer()))
        .digest("hex"),
      fixture.originalSha256,
    );
    return { originalHash: true };
  });
  await check("external-scoped-read-and-revoke", external, async () => {
    const allowed = ok(
      await client(external).rpc("get_work_order_review_context", scope),
      "Scoped external read",
    );
    assert.equal(allowed.state.status, "approved");
    assert.equal(allowed.can_review, false);
    const visibleProject = ok(
      await client(external).from("projects").select("id").eq("id", tenant.projectId),
      "External project isolation",
    );
    assert.equal(visibleProject.length, 0);
    for (const who of [
      getUser(tenant.number, "field"),
      getUser(tenant.number, "reviewer"),
      external,
    ]) {
      const history = ok(
        await client(owner).rpc("get_work_order_access_history", {
          ...scope,
          p_user_id: who.id,
          p_before_version: null,
          p_page_size: 1,
        }),
        "Read scoped grant history",
      );
      if (history[0]?.active)
        ok(
          await client(owner).rpc("save_work_order_access", {
            ...scope,
            p_user_id: who.id,
            p_expected_version: history[0].version,
            p_active: false,
            p_can_execute: false,
            p_can_review: false,
            p_reason: "TEST · Adgang lukket efter 50-brugerprøven; historik bevares",
            p_request_id: randomUUID(),
          }),
          "Close scoped grant",
        );
    }
    const revoked = await client(external).rpc("get_work_order_review_context", scope);
    assert.equal(revoked.error?.code, "42501");
    const tasks = ok(
      await client(external).rpc("list_my_work_orders", {
        p_after_action_id: null,
        p_page_size: 20,
      }),
      "Read after grant revocation",
    );
    assert.equal(tasks.length, 0);
    return { exactTaskAllowedBefore: true, broaderProjectDenied: true, sameTokenDeniedAfter: true };
  });
}

const first = fixture.tenants[0],
  owner = getUser(1, "owner"),
  field = getUser(1, "field");
await check("demotion-invalidates-assigned-execution-retry", field, async () => {
  assert(first.initialExecutionArgs);
  const role = ok(
    await client(owner)
      .from("project_members")
      .update({ role: "viewer" })
      .eq("project_id", first.projectId)
      .eq("user_id", field.id)
      .select("role")
      .single(),
    "Demote only the synthetic field user",
  );
  assert.equal(role.role, "viewer");
  const denied = await client(field).rpc("save_work_order_execution", first.initialExecutionArgs);
  assert.equal(denied.error?.code, "42501");
  const rows = ok(
    await client(owner)
      .from("work_order_execution_bindings")
      .select("version")
      .eq("action_id", first.actionId),
    "Read preserved execution history",
  );
  assert.equal(rows.length, 2);
  return { sameTokenDeniedAfter: true, earlierExecutionRevisions: 2 };
});
await finish("final-boundaries");
