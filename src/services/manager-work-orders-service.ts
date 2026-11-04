import {
  ManagerWorkOrderInputSchema,
  ManagerWorkOrderReceiptSchema,
  type ManagerWorkOrderPage,
} from "@/lib/manager-work-orders";
import { parseWorkOrderInput, WorkOrderRequestError } from "@/lib/work-order-access";
import { checkActor, request, type WorkOrderRequestClient } from "./work-order-access-service";

/** The database authorizes every project with can_manage_project; no service key is used. */
export async function listManagedWorkOrders(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
): Promise<ManagerWorkOrderPage> {
  const input = parseWorkOrderInput(ManagerWorkOrderInputSchema, raw);
  checkActor(actorId, input.expectedActorId);
  const parsed = ManagerWorkOrderReceiptSchema.safeParse(
    await request(client, "list_manager_work_orders", {
      p_organization_id: input.organizationId,
      p_project_id: input.filters.projectId,
      p_status: input.filters.status,
      p_assignment: input.filters.assignment,
      p_assignee_id: input.filters.assigneeId,
      p_search: input.filters.search,
      p_due_from: input.filters.dueFrom,
      p_due_through: input.filters.dueThrough,
      p_after_action_id: input.cursor,
      p_page_size: input.pageSize,
    }),
  );
  if (!parsed.success) throw new WorkOrderRequestError("unavailable");
  const page = parsed.data;
  if (page.organization_id !== input.organizationId || page.user_id !== actorId)
    throw new WorkOrderRequestError("access");
  const projectIds = new Set(page.projects.map((project) => project.id));
  if (
    projectIds.size !== page.projects.length ||
    new Set(page.assignees.map((person) => person.id)).size !== page.assignees.length ||
    page.items.length > input.pageSize + 1
  )
    throw new WorkOrderRequestError("unavailable");
  let last = input.cursor;
  for (const row of page.items) {
    if (
      row.organization_id !== input.organizationId ||
      !projectIds.has(row.project_id) ||
      (input.filters.projectId !== null && row.project_id !== input.filters.projectId)
    )
      throw new WorkOrderRequestError("access");
    if (last !== null && row.action_id <= last) throw new WorkOrderRequestError("unavailable");
    last = row.action_id;
  }
  const items = page.items.slice(0, input.pageSize);
  return {
    items,
    projects: page.projects,
    assignees: page.assignees,
    nextCursor: page.items.length > input.pageSize ? items.at(-1)!.action_id : null,
  };
}
