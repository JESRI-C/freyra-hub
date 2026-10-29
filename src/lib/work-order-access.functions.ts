import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  InitializeWorkOrderSchema,
  SaveWorkOrderAccessSchema,
  WorkOrderScopeSchema,
  WorkOrderAccessHistorySchema,
  WorkOrderAccessSubjectsSchema,
  parseWorkOrderInput,
} from "./work-order-access";
import {
  initializeWorkOrder,
  saveWorkOrderAccess,
  getWorkOrderAccess,
  getWorkOrderAccessHistory,
  getWorkOrderAccessSubjects,
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
export const getProjectWorkOrderAccessHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderAccessHistorySchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderAccessHistory(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const getProjectWorkOrderAccessSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderAccessSubjectsSchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderAccessSubjects(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
