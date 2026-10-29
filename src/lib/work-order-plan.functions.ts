import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SaveWorkOrderPlanSchema, WorkOrderPlanHistorySchema } from "./work-order-plan";
import { parseWorkOrderInput } from "./work-order-access";
import { saveWorkOrderPlan, getWorkOrderPlanHistory } from "@/services/work-order-plan-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
export const saveProjectWorkOrderPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SaveWorkOrderPlanSchema, raw))
  .handler(({ data, context }) =>
    saveWorkOrderPlan(context.supabase as unknown as WorkOrderRequestClient, context.userId, data),
  );
export const getProjectWorkOrderPlanHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderPlanHistorySchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderPlanHistory(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
