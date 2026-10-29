import { z } from "zod";
import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import {
  WorkOrderGroupSchema,
  SaveWorkOrderGroupSchema,
  WorkOrderGroupListSchema,
  WorkOrderGroupHistorySchema,
  WorkOrderPeopleSchema,
  WorkOrderPersonSchema,
  WorkOrderAssignmentSchema,
  ConfigureWorkOrderAssignmentSchema,
  ClaimWorkOrderPoolSchema,
  WorkOrderAssignmentHistorySchema,
  MyWorkOrdersInputSchema,
  MyWorkOrderSchema,
} from "@/lib/work-order-assignments";
import {
  checkActor,
  checkScope,
  request,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";
function projectScope(
  row: { organization_id: string; project_id: string },
  input: { organizationId: string; projectId: string },
) {
  if (row.organization_id !== input.organizationId || row.project_id !== input.projectId)
    throw new WorkOrderRequestError("access");
}
async function rows<T>(
  client: WorkOrderRequestClient,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
  pageSize: number,
) {
  const { data, error } = await client.rpc(name, args);
  if (error) workOrderRpcFailure(error);
  if (!Array.isArray(data) || data.length > pageSize + 1)
    throw new WorkOrderRequestError("unavailable");
  return data.map((raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new WorkOrderRequestError("unavailable");
    return parsed.data;
  });
}
function descending<T extends { version: number }>(
  data: T[],
  before: number | null,
  pageSize: number,
) {
  let last = before ?? Infinity;
  for (const row of data) {
    if (row.version >= last) throw new WorkOrderRequestError("unavailable");
    last = row.version;
  }
  const items = data.slice(0, pageSize);
  return { items, nextBeforeVersion: data.length > pageSize ? items.at(-1)!.version : null };
}
function ascending<T>(data: T[], after: string | null, pageSize: number, id: (row: T) => string) {
  let last = after;
  for (const row of data) {
    const value = id(row);
    if (last && value <= last) throw new WorkOrderRequestError("unavailable");
    last = value;
  }
  const items = data.slice(0, pageSize);
  return { items, next: data.length > pageSize ? id(items.at(-1)!) : null };
}
export async function saveWorkOrderGroup(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(SaveWorkOrderGroupSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = WorkOrderGroupSchema.safeParse(
    await request(client, "save_work_order_group", {
      p_group_id: input.groupId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_name: input.name,
      p_active: input.active,
      p_member_ids: input.memberIds,
      p_correction_reason: input.correctionReason,
      p_request_id: input.requestId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const row = parsed.data;
  projectScope(row, input);
  if (
    row.group_id !== input.groupId ||
    row.created_by !== actorId ||
    row.version !== input.expectedVersion + 1 ||
    row.request_id !== input.requestId ||
    row.name !== input.name ||
    row.active !== input.active ||
    row.correction_reason !== input.correctionReason ||
    JSON.stringify(row.member_ids) !== JSON.stringify(input.memberIds)
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function listWorkOrderGroups(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(WorkOrderGroupListSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const data = await rows(
    client,
    "list_work_order_groups",
    {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_after_group_id: input.afterGroupId,
      p_page_size: input.pageSize,
    },
    WorkOrderGroupSchema,
    input.pageSize,
  );
  data.forEach((row) => projectScope(row, input));
  const page = ascending(data, input.afterGroupId, input.pageSize, (row) => row.group_id);
  return { items: page.items, nextAfterGroupId: page.next };
}
export async function getWorkOrderGroupHistory(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(WorkOrderGroupHistorySchema, raw);
  checkActor(actorId, input.expectedActorId);
  const data = await rows(
    client,
    "get_work_order_group_history",
    {
      p_group_id: input.groupId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_before_version: input.beforeVersion,
      p_page_size: input.pageSize,
    },
    WorkOrderGroupSchema,
    input.pageSize,
  );
  data.forEach((row) => {
    projectScope(row, input);
    if (row.group_id !== input.groupId) throw new WorkOrderRequestError("access");
  });
  return descending(data, input.beforeVersion, input.pageSize);
}
export async function listWorkOrderPeople(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(WorkOrderPeopleSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const data = await rows(
    client,
    "list_work_order_people",
    {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_after_user_id: input.afterUserId,
      p_page_size: input.pageSize,
    },
    WorkOrderPersonSchema,
    input.pageSize,
  );
  data.forEach((row) => projectScope(row, input));
  const page = ascending(data, input.afterUserId, input.pageSize, (row) => row.user_id);
  return { items: page.items, nextAfterUserId: page.next };
}
export async function configureWorkOrderAssignment(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(ConfigureWorkOrderAssignmentSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = WorkOrderAssignmentSchema.safeParse(
    await request(client, "configure_work_order_assignment", {
      p_action_id: input.actionId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_plan_version_id: input.planVersionId,
      p_mode: input.mode,
      p_candidate_user_ids: input.candidateUserIds,
      p_source_group_version_id: input.sourceGroupVersionId,
      p_reason: input.reason,
      p_request_id: input.requestId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const row = parsed.data;
  checkScope(row, input);
  if (
    row.change_kind !== "configured" ||
    row.created_by !== actorId ||
    row.request_id !== input.requestId ||
    row.version !== input.expectedVersion + 1 ||
    row.plan_version_id !== input.planVersionId ||
    row.mode !== input.mode ||
    row.source_group_version_id !== input.sourceGroupVersionId ||
    row.reason !== input.reason ||
    JSON.stringify(row.candidate_user_ids) !== JSON.stringify(input.candidateUserIds)
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function claimWorkOrderPool(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(ClaimWorkOrderPoolSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = WorkOrderAssignmentSchema.safeParse(
    await request(client, "claim_work_order_pool", {
      p_action_id: input.actionId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_plan_version_id: input.planVersionId,
      p_request_id: input.requestId,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const row = parsed.data;
  checkScope(row, input);
  if (
    row.change_kind !== "claimed" ||
    row.claimed_by !== actorId ||
    row.created_by !== actorId ||
    row.request_id !== input.requestId ||
    row.version !== input.expectedVersion + 1 ||
    row.plan_version_id !== input.planVersionId
  )
    throw new WorkOrderRequestError("unavailable");
  return row;
}
export async function getWorkOrderAssignmentHistory(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(WorkOrderAssignmentHistorySchema, raw);
  checkActor(actorId, input.expectedActorId);
  const data = await rows(
    client,
    "get_work_order_assignment_history",
    {
      p_action_id: input.actionId,
      p_organization_id: input.organizationId,
      p_project_id: input.projectId,
      p_before_version: input.beforeVersion,
      p_page_size: input.pageSize,
    },
    WorkOrderAssignmentSchema,
    input.pageSize,
  );
  data.forEach((row) => checkScope(row, input));
  return descending(data, input.beforeVersion, input.pageSize);
}
export async function listMyWorkOrders(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const input = parseWorkOrderInput(MyWorkOrdersInputSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const data = await rows(
    client,
    "list_my_work_orders",
    { p_after_action_id: input.afterActionId, p_page_size: input.pageSize },
    MyWorkOrderSchema,
    input.pageSize,
  );
  data.forEach((row) => {
    if (row.user_id !== actorId) throw new WorkOrderRequestError("access");
  });
  const page = ascending(data, input.afterActionId, input.pageSize, (row) => row.action_id);
  return { items: page.items, nextAfterActionId: page.next };
}
