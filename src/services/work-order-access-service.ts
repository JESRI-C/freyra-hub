import {
  InitializeWorkOrderSchema,
  SaveWorkOrderAccessSchema,
  WorkOrderScopeSchema,
  WorkOrderIdentitySchema,
  WorkOrderAccessVersionSchema,
  WorkOrderCapabilitiesSchema,
  WorkOrderAccessHistorySchema,
  WorkOrderAccessSubjectsSchema,
  WorkOrderRequestError,
  parseWorkOrderInput,
  type WorkOrderScope,
  type WorkOrderAccessVersion,
} from "@/lib/work-order-access";
import { z } from "zod";

/** Authenticated request client only; actorId comes from the existing auth middleware. */
export interface WorkOrderRequestClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
export function checkScope(
  row: { action_id: string; organization_id: string; project_id: string },
  scope: WorkOrderScope,
) {
  if (
    row.action_id !== scope.actionId ||
    row.organization_id !== scope.organizationId ||
    row.project_id !== scope.projectId
  )
    throw new WorkOrderRequestError("access");
}
export function checkActor(actorId: string, expected?: string) {
  if (
    !z.string().uuid().safeParse(actorId).success ||
    (expected !== undefined && expected !== actorId)
  )
    throw new WorkOrderRequestError("access");
}
export async function request(
  client: WorkOrderRequestClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(name, args);
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length !== 1) throw new WorkOrderRequestError("unavailable");
  return data[0];
}
export function workOrderRpcFailure(error: { code?: string }): never {
  const code = error.code;
  throw new WorkOrderRequestError(
    code === "42501"
      ? "access"
      : code === "40001" || code === "23505"
        ? "conflict"
        : code === "22023" || code === "23514" || code === "23503" || code === "23502"
          ? "validation"
          : "unavailable",
  );
}
export async function initializeWorkOrder(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(InitializeWorkOrderSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const result = WorkOrderIdentitySchema.safeParse(
    await request(client, "initialize_work_order", {
      p_action_id: input.actionId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_request_id: input.requestId,
    }),
  );
  if (!result.success) throw new WorkOrderRequestError("unavailable");
  checkScope(result.data, input);
  if (result.data.request_id !== input.requestId || result.data.created_by !== actorId)
    throw new WorkOrderRequestError("unavailable");
  return result.data;
}
export async function saveWorkOrderAccess(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(SaveWorkOrderAccessSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const result = WorkOrderAccessVersionSchema.safeParse(
    await request(client, "save_work_order_access", {
      p_action_id: input.actionId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_user_id: input.userId,
      p_expected_version: input.expectedVersion,
      p_active: input.active,
      p_can_execute: input.canExecute,
      p_can_review: input.canReview,
      p_reason: input.reason,
      p_request_id: input.requestId,
    }),
  );
  if (!result.success) throw new WorkOrderRequestError("unavailable");
  const row = result.data;
  checkScope(row, input);
  if (
    row.user_id !== input.userId ||
    row.created_by !== actorId ||
    row.request_id !== input.requestId ||
    row.version !== input.expectedVersion + 1 ||
    row.active !== input.active ||
    row.can_execute !== input.canExecute ||
    row.can_review !== input.canReview ||
    row.reason !== input.reason
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function getWorkOrderAccess(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(WorkOrderScopeSchema, raw);
  checkActor(actorId);
  const result = WorkOrderCapabilitiesSchema.safeParse(
    await request(client, "get_work_order_access", {
      p_action_id: input.actionId,
      p_project_id: input.projectId,
    }),
  );
  if (!result.success) throw new WorkOrderRequestError("unavailable");
  checkScope(result.data, input);
  if (result.data.user_id !== actorId) throw new WorkOrderRequestError("access");
  return result.data;
}
export async function getWorkOrderAccessHistory(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(WorkOrderAccessHistorySchema, raw);
  checkActor(actorId);
  const { data, error } = await client.rpc("get_work_order_access_history", {
    p_action_id: input.actionId,
    p_organization_id: input.organizationId,
    p_project_id: input.projectId,
    p_user_id: input.userId,
    p_before_version: input.beforeVersion,
    p_page_size: input.pageSize,
  });
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length > input.pageSize + 1)
    throw new WorkOrderRequestError("unavailable");
  let previous = input.beforeVersion ?? Infinity;
  const rows: WorkOrderAccessVersion[] = [];
  for (const value of data) {
    const parsed = WorkOrderAccessVersionSchema.safeParse(value);
    if (!parsed.success) throw new WorkOrderRequestError("unavailable");
    const row = parsed.data;
    checkScope(row, input);
    if (row.user_id !== input.userId || row.version >= previous)
      throw new WorkOrderRequestError("unavailable");
    previous = row.version;
    rows.push(row);
  }
  const items = rows.slice(0, input.pageSize);
  return { items, nextBeforeVersion: rows.length > input.pageSize ? items.at(-1)!.version : null };
}
export async function getWorkOrderAccessSubjects(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(WorkOrderAccessSubjectsSchema, raw);
  checkActor(actorId);
  const { data, error } = await client.rpc("get_work_order_access_subjects", {
    p_action_id: input.actionId,
    p_organization_id: input.organizationId,
    p_project_id: input.projectId,
    p_after_user_id: input.afterUserId,
    p_page_size: input.pageSize,
  });
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length > input.pageSize + 1)
    throw new WorkOrderRequestError("unavailable");
  let previous = input.afterUserId;
  const rows: string[] = [];
  for (const value of data) {
    const parsed = z.object({ user_id: z.string().uuid() }).safeParse(value);
    if (
      !parsed.success ||
      (previous && parsed.data.user_id.toLowerCase() <= previous.toLowerCase())
    )
      throw new WorkOrderRequestError("unavailable");
    previous = parsed.data.user_id;
    rows.push(previous);
  }
  const items = rows.slice(0, input.pageSize);
  return { items, nextAfterUserId: rows.length > input.pageSize ? items.at(-1)! : null };
}
