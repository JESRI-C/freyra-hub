import { WorkOrderReviewContextSchema } from "@/lib/work-order-review";
import {
  WorkOrderScopeSchema,
  WorkOrderRequestError,
  parseWorkOrderInput,
} from "@/lib/work-order-access";
import {
  checkActor,
  checkScope,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "./work-order-access-service";
export async function getWorkOrderReviewContext(
  client: WorkOrderRequestClient,
  actorId: string,
  raw: unknown,
) {
  const i = parseWorkOrderInput(WorkOrderScopeSchema, raw);
  checkActor(actorId);
  const { data, error } = await client.rpc("get_work_order_review_context", {
    p_action_id: i.actionId,
    p_organization_id: i.organizationId,
    p_project_id: i.projectId,
  });
  if (error) workOrderRpcFailure(error);
  const result = WorkOrderReviewContextSchema.safeParse(data);
  if (!result.success) throw new WorkOrderRequestError("unavailable");
  const c = result.data;
  checkScope(c, i);
  checkActor(actorId, c.user_id);
  if (c.state) checkScope(c.state, i);
  for (const entry of c.recent_reviews) checkScope(entry.state, i);
  return c;
}
