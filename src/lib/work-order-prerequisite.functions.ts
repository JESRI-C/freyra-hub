import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseWorkOrderInput } from "@/lib/work-order-access";
import {
  checkActor,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "@/services/work-order-access-service";

const uuid = z.string().uuid();
const identity = z.object({ actionId: uuid, expectedActorId: uuid });
const prerequisite = z.object({
  version: z.number().int().nonnegative(),
  ready: z.boolean(),
  prerequisites: z.array(z.object({ actionId: uuid, ready: z.boolean() })).max(12),
});

export const getWorkOrderPrerequisite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(identity, raw))
  .handler(async ({ data, context }) => {
    checkActor(context.userId, data.expectedActorId);
    const client = context.supabase as unknown as WorkOrderRequestClient;
    const result = await client.rpc("get_work_order_prerequisite", { p_action_id: data.actionId });
    if (result.error) workOrderRpcFailure(result.error);
    return prerequisite.parse(result.data);
  });

export const saveWorkOrderPrerequisites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    parseWorkOrderInput(
      identity.extend({
        organizationId: uuid,
        projectId: uuid,
        expectedVersion: z.number().int().nonnegative(),
        prerequisiteActionIds: z.array(uuid).max(12),
        requestId: uuid,
      }),
      raw,
    ),
  )
  .handler(async ({ data, context }) => {
    checkActor(context.userId, data.expectedActorId);
    const client = context.supabase as unknown as WorkOrderRequestClient;
    const result = await client.rpc("save_work_order_prerequisites", {
      p_action_id: data.actionId,
      p_organization_id: data.organizationId,
      p_project_id: data.projectId,
      p_expected_version: data.expectedVersion,
      p_prerequisite_action_ids: data.prerequisiteActionIds,
      p_request_id: data.requestId,
    });
    if (result.error) workOrderRpcFailure(result.error);
    return z.number().int().positive().parse(result.data);
  });
