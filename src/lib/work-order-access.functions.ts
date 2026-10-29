import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  InitializeWorkOrderSchema,
  SaveWorkOrderAccessSchema,
  WorkOrderScopeSchema,
  parseWorkOrderInput,
} from "./work-order-access";
import {
  initializeWorkOrder,
  saveWorkOrderAccess,
  getWorkOrderAccess,
  type WorkOrderRequestClient,
} from "@/services/work-order-access-service";

export const initializeProjectWorkOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(InitializeWorkOrderSchema, raw))
  .handler(({ data, context }) =>
    initializeWorkOrder(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const saveProjectWorkOrderAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SaveWorkOrderAccessSchema, raw))
  .handler(({ data, context }) =>
    saveWorkOrderAccess(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const getProjectWorkOrderAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderScopeSchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderAccess(context.supabase as unknown as WorkOrderRequestClient, context.userId, data),
  );
