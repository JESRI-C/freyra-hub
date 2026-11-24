import {
  CaseCustomerContextSchema,
  CustomerCommandReceiptSchema,
  CustomerCommandSchema,
  CustomerDetailSchema,
  CustomerListSchema,
  CustomerQuerySchema,
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
      : operation === "customer"
        ? CustomerDetailSchema
        : CaseCustomerContextSchema;
  const result = schema.safeParse(data);
  if (!result.success || result.data.organizationId !== organizationId)
    throw new WorkOrderRequestError("unavailable");
  if (
    operation === "customer" &&
    (!("customer" in result.data) || result.data.customer.id !== input.customerId)
  )
    throw new WorkOrderRequestError("unavailable");
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
