import {
  SubmissionContextSchema,
  SubmissionPageSchema,
  SubmissionVersionSchema,
  SaveSubmissionSchema,
} from "@/lib/work-order-submission";
import {
  WorkOrderScopeSchema,
  WorkOrderRequestError,
  parseWorkOrderInput,
} from "@/lib/work-order-access";
import {
  checkActor,
  checkScope,
  request,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";

export async function getWorkOrderSubmissionContext(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const i = parseWorkOrderInput(WorkOrderScopeSchema, raw);
  checkActor(actorId);
  const { data, error } = await client.rpc("get_work_order_submission_context", {
    p_action_id: i.actionId,
    p_organization_id: i.organizationId,
    p_project_id: i.projectId,
  });
  if (error) workOrderRpcFailure(error);
  const result = SubmissionContextSchema.safeParse(data);
  if (!result.success) throw new WorkOrderRequestError("unavailable");
  checkScope(result.data, i);
  if (result.data.user_id !== actorId) throw new WorkOrderRequestError("access");
  return result.data;
}
export async function saveWorkOrderSubmission(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const i = parseWorkOrderInput(SaveSubmissionSchema, raw);
  checkActor(actorId, i.expectedActorId);
  const result = SubmissionVersionSchema.safeParse(
    await request(client, "save_work_order_submission", {
      p_action_id: i.actionId,
      p_organization_id: i.organizationId,
      p_project_id: i.projectId,
      p_expected_version: i.expectedVersion,
      p_basis_hash: i.basisHash,
      p_note: i.note,
      p_request_id: i.requestId,
    }),
  );
  if (!result.success) throw new WorkOrderRequestError("unavailable");
  const row = result.data;
  checkScope(row, i);
  if (
    row.created_by !== actorId ||
    row.version !== i.expectedVersion + 1 ||
    row.request_id !== i.requestId ||
    row.basis_hash !== i.basisHash ||
    row.note !== i.note
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function listWorkOrderSubmissions(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const i = parseWorkOrderInput(SubmissionPageSchema, raw);
  checkActor(actorId);
  const { data, error } = await client.rpc("list_work_order_submissions", {
    p_action_id: i.actionId,
    p_organization_id: i.organizationId,
    p_project_id: i.projectId,
    p_before_version: i.beforeVersion,
    p_page_size: i.pageSize,
  });
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length > i.pageSize + 1)
    throw new WorkOrderRequestError("unavailable");
  let previous = i.beforeVersion ?? 2147483648;
  const rows = data.map((value) => {
    const row = SubmissionVersionSchema.safeParse(value);
    if (!row.success || row.data.version >= previous)
      throw new WorkOrderRequestError("unavailable");
    checkScope(row.data, i);
    previous = row.data.version;
    return row.data;
  });
  return {
    items: rows.slice(0, i.pageSize),
    nextBeforeVersion: rows.length > i.pageSize ? rows[i.pageSize - 1].version : null,
  };
}
