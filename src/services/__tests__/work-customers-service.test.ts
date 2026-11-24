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
  const contact = {
    id: request,
    version: 1,
    data: {
      name: "Fictional contact",
      title: "",
      email: "contact@example.test",
      phone: "FAKE",
      archived: false,
    },
  };
  const member = {
    userId: other,
    name: "Fictional member",
    enabled: true,
    version: 1,
    activeMember: true,
    administrator: false,
  };
  function pageQuery(operation: string) {
    const base = { organizationId: org, expectedActorId: actor, operation, customerId: customer };
    return operation === "contacts"
      ? { ...base, search: "", includeArchived: false, offset: 50 }
      : operation === "members"
        ? { ...base, search: "", onlyEnabled: true, includeFormer: false, offset: 50 }
        : operation === "contact"
          ? { ...base, contactId: request }
          : operation === "history"
            ? { ...base, beforeVersion: 3 }
            : base;
  }
  function pageResponse(operation: string) {
    const base = { organizationId: org, customerId: customer };
    return operation === "summary"
      ? {
          organizationId: org,
          canManage: true,
          customer: { id: customer, number: "K-000001", version: 1, data: input.data },
        }
      : operation === "contact"
        ? { ...base, contact }
        : {
            ...base,
            rows:
              operation === "contacts"
                ? [contact]
                : operation === "members"
                  ? [member]
                  : [{ version: 2, changedAt: "2026-11-24T00:00:00Z", data: input.data }],
            hasMore: false,
          };
  }
  it.each(["summary", "contacts", "contact", "members", "history"])(
    "checks organization scope for %s",
    async (operation) => {
      await expect(
        queryWorkCustomers(
          client({ ...pageResponse(operation), organizationId: other }),
          actor,
          pageQuery(operation),
        ),
      ).rejects.toMatchObject({ code: "unavailable" });
    },
  );
  it.each(["contacts", "contact", "members", "history"])(
    "checks customer scope for %s",
    async (operation) => {
      await expect(
        queryWorkCustomers(
          client({ ...pageResponse(operation), customerId: other }),
          actor,
          pageQuery(operation),
        ),
      ).rejects.toMatchObject({ code: "unavailable" });
    },
  );
  it.each(["summary", "contacts", "contact", "members", "history"])(
    "uses the exact scoped payload for %s",
    async (operation) => {
      const db = client(pageResponse(operation));
      const raw = pageQuery(operation);
      await queryWorkCustomers(db, actor, raw);
      const { organizationId, expectedActorId, operation: op, ...payload } = raw;
      expect(db.rpc).toHaveBeenCalledWith("query_work_customers", {
        p_organization_id: organizationId,
        p_expected_actor_id: expectedActorId,
        p_operation: op,
        p_payload: payload,
      });
    },
  );
  it("checks the identity of a specifically selected contact", async () => {
    await expect(
      queryWorkCustomers(
        client({ organizationId: org, customerId: customer, contact: { ...contact, id: other } }),
        actor,
        pageQuery("contact"),
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects a summary returned for another customer", async () => {
    await expect(
      queryWorkCustomers(
        client({
          organizationId: org,
          canManage: true,
          customer: { id: other, number: "K-000001", version: 1, data: input.data },
        }),
        actor,
        pageQuery("summary"),
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it.each(["contacts", "members"])("rejects an unbounded %s response", async (operation) => {
    const rows = Array.from({ length: 51 }, () => (operation === "contacts" ? contact : member));
    await expect(
      queryWorkCustomers(
        client({ organizationId: org, customerId: customer, rows, hasMore: true }),
        actor,
        pageQuery(operation),
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects duplicate contacts and archived rows in an active list", async () => {
    for (const rows of [
      [contact, contact],
      [{ ...contact, data: { ...contact.data, archived: true } }],
    ])
      await expect(
        queryWorkCustomers(
          client({ organizationId: org, customerId: customer, rows, hasMore: false }),
          actor,
          pageQuery("contacts"),
        ),
      ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects former or disabled members when excluded by the query", async () => {
    for (const rows of [[{ ...member, activeMember: false }], [{ ...member, enabled: false }]])
      await expect(
        queryWorkCustomers(
          client({ organizationId: org, customerId: customer, rows, hasMore: false }),
          actor,
          pageQuery("members"),
        ),
      ).rejects.toMatchObject({ code: "unavailable" });
  });
  it.each([{ versions: [3] }, { versions: [2, 2] }, { versions: [1, 2] }])(
    "rejects invalid history cursor/order $versions",
    async ({ versions }) => {
      await expect(
        queryWorkCustomers(
          client({
            organizationId: org,
            customerId: customer,
            rows: versions.map((version) => ({
              version,
              changedAt: "2026-11-24T00:00:00Z",
              data: input.data,
            })),
            hasMore: false,
          }),
          actor,
          pageQuery("history"),
        ),
      ).rejects.toMatchObject({ code: "unavailable" });
    },
  );
  it("rejects an untrue next-page marker", async () => {
    await expect(
      queryWorkCustomers(
        client({ organizationId: org, customerId: customer, rows: [], hasMore: true }),
        actor,
        pageQuery("history"),
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("refuses a case list returned for a different customer", async () => {
    await expect(
      queryWorkCustomers(
        client({ organizationId: org, customerId: other, rows: [], hasMore: false }),
        actor,
        {
          organizationId: org,
          expectedActorId: actor,
          operation: "cases",
          customerId: customer,
          offset: 50,
        },
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("passes the exact customer and page to the scoped case list", async () => {
    const db = client({ organizationId: org, customerId: customer, rows: [], hasMore: false });
    await queryWorkCustomers(db, actor, {
      organizationId: org,
      expectedActorId: actor,
      operation: "cases",
      customerId: customer,
      offset: 50,
    });
    expect(db.rpc).toHaveBeenCalledWith("query_work_customers", {
      p_organization_id: org,
      p_expected_actor_id: actor,
      p_operation: "cases",
      p_payload: { customerId: customer, offset: 50 },
    });
  });
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
