import { describe, expect, it, vi } from "vitest";
import { commandWorkCustomers, queryWorkCustomers } from "../work-customers-service";
import { emptyCustomer } from "@/lib/work-customers";

const org = "fc560000-0000-4000-8000-000000000011";
const actor = "fc560000-0000-4000-8000-000000000001";
const other = "fc560000-0000-4000-8000-000000000002";
const customer = "fc560000-0000-4000-8000-000000000021";
const request = "fc560000-0000-4000-8000-000000000031";
const input = {
  organizationId: org,
  expectedActorId: actor,
  requestId: request,
  operation: "save_customer" as const,
  customerId: customer,
  expectedVersion: 2,
  data: { ...emptyCustomer, name: "Fiktiv kunde" },
};
const receipt = {
  organizationId: org,
  requestId: request,
  actorId: actor,
  operation: "save_customer",
  id: customer,
  version: 3,
  number: "K-000001",
};
const client = (data: unknown, error: { code: string } | null = null) => ({
  rpc: vi.fn().mockResolvedValue({ data, error }),
});

describe("customer requests through the authenticated client", () => {
  it("refuses a customer context returned for a different job", async () => {
    const db = client({
      organizationId: org,
      projectId: customer,
      actionId: other,
      canEdit: false,
      binding: null,
    });
    await expect(
      queryWorkCustomers(db, actor, {
        organizationId: org,
        expectedActorId: actor,
        operation: "job",
        projectId: customer,
        actionId: request,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("preserves the actor, exact request and expected revision on a retry", async () => {
    const db = client(receipt);
    expect(await commandWorkCustomers(db, actor, input)).toEqual(receipt);
    expect(await commandWorkCustomers(db, actor, input)).toEqual(receipt);
    expect(db.rpc).toHaveBeenNthCalledWith(1, "command_work_customers", {
      p_organization_id: org,
      p_expected_actor_id: actor,
      p_request_id: request,
      p_operation: "save_customer",
      p_payload: { customerId: customer, expectedVersion: 2, data: input.data },
    });
    expect(db.rpc.mock.calls[1]).toEqual(db.rpc.mock.calls[0]);
  });
  it("stops a session change before reaching the database", async () => {
    const db = client(receipt);
    await expect(commandWorkCustomers(db, other, input)).rejects.toMatchObject({ code: "access" });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { organizationId: other },
    { requestId: other },
    { actorId: other },
    { operation: "save_contact" },
    { id: other },
    { version: 0 },
  ])("refuses a mismatched receipt %#", async (patch) => {
    await expect(
      commandWorkCustomers(client({ ...receipt, ...patch }), actor, input),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("preserves a stale-revision conflict instead of treating it as a successful save", async () => {
    await expect(
      commandWorkCustomers(client(null, { code: "PT409" }), actor, input),
    ).rejects.toMatchObject({ code: "conflict" });
  });
  it("refuses unknown payload fields rather than sending them to the API", async () => {
    const db = client(receipt);
    await expect(
      commandWorkCustomers(db, actor, { ...input, serviceRole: true }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("refuses a different customer's detail response", async () => {
    const db = client({
      organizationId: org,
      canManage: true,
      customer: { id: other, number: "K-000001", version: 1, data: input.data },
      contacts: [],
      history: [],
      planners: [],
      availableUsers: [],
    });
    await expect(
      queryWorkCustomers(db, actor, {
        organizationId: org,
        expectedActorId: actor,
        operation: "customer",
        customerId: customer,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("keeps an empty authorized list distinct from a source error", async () => {
    const query = {
      organizationId: org,
      expectedActorId: actor,
      operation: "list",
      search: "",
      includeArchived: false,
      offset: 0,
    };
    const empty = { organizationId: org, canManage: false, rows: [], hasMore: false };
    expect(await queryWorkCustomers(client(empty), actor, query)).toEqual(empty);
    await expect(
      queryWorkCustomers(client(null, { code: "42501" }), actor, query),
    ).rejects.toMatchObject({ code: "access" });
  });
});
