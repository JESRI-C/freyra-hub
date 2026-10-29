import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import {
  GetWorkOrderLifecycleSchema,
  MutateWorkOrderLifecycleSchema,
  WorkOrderLifecycleSchema,
  WorkOrderLifecycleContextSchema,
  SaveWorkOrderNoteSchema,
  WorkOrderNoteSchema,
  WorkOrderNoteHistorySchema,
  GetWorkOrderLogSchema,
  WorkOrderLogPageSchema,
  workOrderInstantKey,
  type LifecycleRequest,
} from "@/lib/work-order-lifecycle";
import {
  checkActor,
  checkScope,
  request,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";
const scopeArgs = (v: { actionId: string; organizationId: string; projectId: string }) => ({
  p_action_id: v.actionId,
  p_organization_id: v.organizationId,
  p_project_id: v.projectId,
});
function sameRequest(a: LifecycleRequest, b: LifecycleRequest) {
  for (const key of Object.keys(b) as Array<keyof LifecycleRequest>) {
    if (key === "startedAt" && a[key] !== null && b[key] !== null) {
      if (workOrderInstantKey(a[key]) !== workOrderInstantKey(b[key])) return false;
    } else if (a[key] !== b[key]) return false;
  }
  return true;
}
export async function getWorkOrderLifecycleContext(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(GetWorkOrderLifecycleSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = WorkOrderLifecycleContextSchema.safeParse(
    await request(client, "get_work_order_lifecycle_context", scopeArgs(input)),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const row = parsed.data;
  checkScope(row, input);
  checkActor(actorId, row.user_id);
  if (row.state) checkScope(row.state, input);
  const changed =
    !!row.state &&
    (row.state.plan_version_id !== row.basis.planVersionId ||
      row.state.assignment_version_id !== row.basis.assignmentVersionId ||
      row.state.execution_revision_id !== row.basis.executionRevisionId);
  if (
    changed !== row.context_changed ||
    (row.can_start && !row.can_perform) ||
    (row.can_manage && !row.can_note)
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function mutateWorkOrderLifecycle(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(MutateWorkOrderLifecycleSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = WorkOrderLifecycleSchema.safeParse(
    await request(client, "mutate_work_order_lifecycle", {
      ...scopeArgs(input),
      p_expected_version: input.expectedVersion,
      p_values: input.values,
      p_request_id: input.requestId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const row = parsed.data;
  checkScope(row, input);
  if (
    row.version !== input.expectedVersion + 1 ||
    row.created_by !== actorId ||
    row.request_id !== input.requestId ||
    !sameRequest(row.request_values, input.values)
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function saveWorkOrderNote(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(SaveWorkOrderNoteSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = WorkOrderNoteSchema.safeParse(
    await request(client, "save_work_order_note", {
      ...scopeArgs(input),
      p_note_id: input.noteId,
      p_expected_version: input.expectedVersion,
      p_kind: input.kind,
      p_body: input.body,
      p_correction_reason: input.correctionReason,
      p_plan_version_id: input.planVersionId,
      p_assignment_version_id: input.assignmentVersionId,
      p_execution_revision_id: input.executionRevisionId,
      p_lifecycle_version_id: input.lifecycleVersionId,
      p_request_id: input.requestId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const row = parsed.data;
  checkScope(row, input);
  if (
    row.note_id !== input.noteId ||
    row.version !== input.expectedVersion + 1 ||
    row.created_by !== actorId ||
    row.request_id !== input.requestId ||
    row.kind !== input.kind ||
    row.body !== input.body ||
    row.correction_reason !== input.correctionReason ||
    row.plan_version_id !== input.planVersionId ||
    row.assignment_version_id !== input.assignmentVersionId ||
    row.execution_revision_id !== input.executionRevisionId ||
    row.lifecycle_version_id !== input.lifecycleVersionId
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function getWorkOrderNoteHistory(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(WorkOrderNoteHistorySchema, raw);
  checkActor(actorId, input.expectedActorId);
  const { data, error } = await client.rpc("get_work_order_note_history", {
    ...scopeArgs(input),
    p_note_id: input.noteId,
    p_before_version: input.beforeVersion,
    p_page_size: input.pageSize,
  });
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length > input.pageSize + 1)
    throw new WorkOrderRequestError("unavailable");
  let before = input.beforeVersion ?? Infinity;
  const rows = data.map((raw) => {
    const p = WorkOrderNoteSchema.safeParse(raw);
    if (!p.success) throw new WorkOrderRequestError("unavailable");
    const row = p.data;
    checkScope(row, input);
    if (row.note_id !== input.noteId || row.version >= before)
      throw new WorkOrderRequestError("unavailable");
    before = row.version;
    return row;
  });
  const items = rows.slice(0, input.pageSize);
  return { items, nextBeforeVersion: rows.length > input.pageSize ? items.at(-1)!.version : null };
}
export async function getWorkOrderLog(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(GetWorkOrderLogSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const rawRow = await request(client, "get_work_order_log", {
    ...scopeArgs(input),
    p_as_of: input.cursor?.asOf ?? null,
    p_before_at: input.cursor?.beforeAt ?? null,
    p_before_key: input.cursor?.beforeKey ?? null,
    p_page_size: input.pageSize,
  });
  const parsed = WorkOrderLogPageSchema.safeParse(
    rawRow && typeof rawRow === "object" && "log" in rawRow ? rawRow.log : null,
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const row = parsed.data;
  checkScope(row, input);
  checkActor(actorId, row.user_id);
  const asOf = workOrderInstantKey(row.as_of);
  if (input.cursor && asOf !== workOrderInstantKey(input.cursor.asOf))
    throw new WorkOrderRequestError("unavailable");
  if (row.items.length > input.pageSize) throw new WorkOrderRequestError("unavailable");
  let before = input.cursor
    ? { time: workOrderInstantKey(input.cursor.beforeAt), key: input.cursor.beforeKey }
    : null;
  for (const item of row.items) {
    const time = workOrderInstantKey(item.created_at);
    if (
      time > asOf ||
      (before && (time > before.time || (time === before.time && item.key >= before.key)))
    )
      throw new WorkOrderRequestError("unavailable");
    before = { time, key: item.key };
  }
  if (row.next) {
    const last = row.items.at(-1);
    if (
      row.items.length !== input.pageSize ||
      !last ||
      row.next.beforeKey !== last.key ||
      workOrderInstantKey(row.next.beforeAt) !== workOrderInstantKey(last.created_at) ||
      workOrderInstantKey(row.next.asOf) !== asOf
    )
      throw new WorkOrderRequestError("unavailable");
  }
  return row;
}
