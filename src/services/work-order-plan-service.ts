import {
  SaveWorkOrderPlanSchema,
  WorkOrderPlanHistorySchema,
  WorkOrderPlanVersionSchema,
  type WorkOrderPlanVersion,
} from "@/lib/work-order-plan";
import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import {
  checkActor,
  checkScope,
  request,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";
export async function saveWorkOrderPlan(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(SaveWorkOrderPlanSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const result = WorkOrderPlanVersionSchema.safeParse(
    await request(client, "save_work_order_plan", {
      p_action_id: input.actionId,
      p_project_id: input.projectId,
      p_organization_id: input.organizationId,
      p_expected_version: input.expectedVersion,
      p_plan: input.plan,
      p_correction_reason: input.correctionReason,
      p_request_id: input.requestId,
    }),
  );
  if (!result.success) throw new WorkOrderRequestError("unavailable");
  const row = result.data;
  checkScope(row, input);
  if (
    row.created_by !== actorId ||
    row.version !== input.expectedVersion + 1 ||
    row.request_id !== input.requestId ||
    row.correction_reason !== input.correctionReason ||
    JSON.stringify(row.plan) !== JSON.stringify(input.plan)
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function getWorkOrderPlanHistory(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
): Promise<{ items: WorkOrderPlanVersion[]; nextBeforeVersion: number | null }> {
  const input = parseWorkOrderInput(WorkOrderPlanHistorySchema, raw);
  checkActor(actorId);
  const { data, error } = await client.rpc("get_work_order_plan_history", {
    p_action_id: input.actionId,
    p_organization_id: input.organizationId,
    p_project_id: input.projectId,
    p_before_version: input.beforeVersion,
    p_page_size: input.pageSize,
  });
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length > input.pageSize + 1)
    throw new WorkOrderRequestError("unavailable");
  const rows: WorkOrderPlanVersion[] = [];
  let previous = input.beforeVersion ?? Infinity;
  for (const rawRow of data) {
    const parsed = WorkOrderPlanVersionSchema.safeParse(rawRow);
    if (!parsed.success) throw new WorkOrderRequestError("unavailable");
    const row = parsed.data;
    checkScope(row, input);
    if (row.version >= previous) throw new WorkOrderRequestError("unavailable");
    previous = row.version;
    rows.push(row);
  }
  const items = rows.slice(0, input.pageSize);
  return { items, nextBeforeVersion: rows.length > input.pageSize ? items.at(-1)!.version : null };
}
