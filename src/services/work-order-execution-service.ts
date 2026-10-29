import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import {
  LoadWorkOrderExecutionSchema,
  SaveWorkOrderExecutionSchema,
  WorkOrderExecutionBindingSchema,
} from "@/lib/work-order-execution";
import { getWorkOrderPlanHistory } from "./work-order-plan-service";
import {
  checkActor,
  checkScope,
  request,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";
export async function loadWorkOrderExecutionContext(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(LoadWorkOrderExecutionSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const history = await getWorkOrderPlanHistory(client, actorId, {
    actionId: input.actionId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    beforeVersion: null,
    pageSize: 1,
  });
  const plan = history.items[0] ?? null;
  if (!plan || !input.previousRevisionId) return { plan, binding: null };
  const { data, error } = await client.rpc("get_work_order_execution_binding", {
    p_action_id: input.actionId,
    p_organization_id: input.organizationId,
    p_project_id: input.projectId,
    p_workspace_entry_id: input.previousRevisionId,
  });
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length > 1) throw new WorkOrderRequestError("unavailable");
  if (!data.length) return { plan, binding: null };
  const parsed = WorkOrderExecutionBindingSchema.safeParse(data[0]);
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const binding = parsed.data;
  checkScope(binding, input);
  if (binding.workspace_entry_id !== input.previousRevisionId)
    throw new WorkOrderRequestError("unavailable");
  return { plan, binding };
}
export async function saveWorkOrderExecution(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(SaveWorkOrderExecutionSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = WorkOrderExecutionBindingSchema.safeParse(
    await request(client, "save_work_order_execution", {
      p_action_id: input.actionId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_plan_version_id: input.planVersionId,
      p_expected_plan_version: input.expectedPlanVersion,
      p_expected_version: input.expectedVersion,
      p_execution: input.execution,
      p_performed_by_id: input.performedById,
      p_deviation_reason: input.deviationReason,
      p_request_id: input.requestId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const row = parsed.data;
  checkScope(row, input);
  if (
    row.created_by !== actorId ||
    row.request_id !== input.requestId ||
    row.version !== input.expectedVersion + 1 ||
    row.plan_version_id !== input.planVersionId ||
    row.plan_version !== input.expectedPlanVersion ||
    row.performed_by_id !== input.performedById ||
    row.deviation_reason !== input.deviationReason ||
    row.actual_start !== input.execution.actualDate ||
    row.actual_end !== input.execution.actualEndDate ||
    row.actual_method !== (input.execution.method?.trim() || null) ||
    row.coverage !== input.execution.coverage
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
