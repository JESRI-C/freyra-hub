import {
  CaseCustomerContextSchema,
  CustomerCaseListSchema,
  CustomerCommandReceiptSchema,
  CustomerCommandSchema,
  CustomerDetailSchema,
  CustomerListSchema,
  CustomerQuerySchema,
  CustomerSummarySchema,
  CustomerContactsPageSchema,
  CustomerContactResultSchema,
  CustomerMembersPageSchema,
  CustomerHistoryPageSchema,
} from "@/lib/work-customers";
import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import {
  checkActor,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";

/** The caller and its database client both come from verified request authentication. */
export async function queryWorkCustomers(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(CustomerQuerySchema, raw);
  checkActor(actorId, input.expectedActorId);
  const { organizationId, expectedActorId, operation, ...payload } = input;
  const { data, error } = await client.rpc("query_work_customers", {
    p_organization_id: organizationId,
    p_expected_actor_id: expectedActorId,
    p_operation: operation,
    p_payload: payload,
  });
  if (error) workOrderRpcFailure(error);
  const schema =
    operation === "list"
      ? CustomerListSchema
      : operation === "cases"
        ? CustomerCaseListSchema
        : operation === "customer"
          ? CustomerDetailSchema
          : operation === "summary"
            ? CustomerSummarySchema
            : operation === "contacts"
              ? CustomerContactsPageSchema
              : operation === "contact"
                ? CustomerContactResultSchema
                : operation === "members"
                  ? CustomerMembersPageSchema
                  : operation === "history"
                    ? CustomerHistoryPageSchema
                    : CaseCustomerContextSchema;
  const result = schema.safeParse(data);
  if (!result.success || result.data.organizationId !== organizationId)
    throw new WorkOrderRequestError("unavailable");
  if (
    "customerId" in input &&
    operation !== "customer" &&
    operation !== "summary" &&
    (!("customerId" in result.data) || result.data.customerId !== input.customerId)
  )
    throw new WorkOrderRequestError("unavailable");
  if (
    (operation === "customer" || operation === "summary") &&
    (!("customer" in result.data) || result.data.customer.id !== input.customerId)
  )
    throw new WorkOrderRequestError("unavailable");
  if (
    operation === "contact" &&
    (!("contact" in result.data) || result.data.contact.id !== input.contactId)
  )
    throw new WorkOrderRequestError("unavailable");
  if (operation === "contacts") {
    const page = CustomerContactsPageSchema.parse(result.data);
    if (
      (page.hasMore && page.rows.length !== 50) ||
      new Set(page.rows.map((row) => row.id)).size !== page.rows.length ||
      (!input.includeArchived && page.rows.some((row) => row.data.archived))
    )
      throw new WorkOrderRequestError("unavailable");
  }
  if (operation === "members") {
    const page = CustomerMembersPageSchema.parse(result.data);
    if (
      (page.hasMore && page.rows.length !== 50) ||
      new Set(page.rows.map((row) => row.userId)).size !== page.rows.length ||
      (input.onlyEnabled && page.rows.some((row) => !row.enabled)) ||
      (!input.includeFormer && page.rows.some((row) => !row.activeMember))
    )
      throw new WorkOrderRequestError("unavailable");
  }
  if (operation === "history") {
    const page = CustomerHistoryPageSchema.parse(result.data);
    if (page.hasMore && page.rows.length !== 20) throw new WorkOrderRequestError("unavailable");
    let previous = input.beforeVersion ?? 2147483647;
    for (const row of page.rows) {
      if (row.version >= previous) throw new WorkOrderRequestError("unavailable");
      previous = row.version;
    }
  }
  if (
    (operation === "case" || operation === "job") &&
    (!("projectId" in result.data) || result.data.projectId !== input.projectId)
  )
    throw new WorkOrderRequestError("unavailable");
  if (
    operation === "job" &&
    (!("actionId" in result.data) || result.data.actionId !== input.actionId)
  )
    throw new WorkOrderRequestError("unavailable");
  return result.data;
}

export async function commandWorkCustomers(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(CustomerCommandSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const { organizationId, expectedActorId, requestId, operation, ...payload } = input;
  const { data, error } = await client.rpc("command_work_customers", {
    p_organization_id: organizationId,
    p_expected_actor_id: expectedActorId,
    p_request_id: requestId,
    p_operation: operation,
    p_payload: payload,
  });
  if (error) workOrderRpcFailure(error);
  const result = CustomerCommandReceiptSchema.safeParse(data);
  if (
    !result.success ||
    result.data.organizationId !== organizationId ||
    result.data.requestId !== requestId ||
    result.data.actorId !== actorId ||
    result.data.operation !== operation
  )
    throw new WorkOrderRequestError("unavailable");
  const expectedId =
    operation === "save_customer"
      ? input.customerId
      : operation === "save_contact"
        ? input.contactId
        : operation === "bind_case" || operation === "save_reference"
          ? input.projectId
          : null;
  if (expectedId && result.data.id !== expectedId) throw new WorkOrderRequestError("unavailable");
  return result.data;
}
