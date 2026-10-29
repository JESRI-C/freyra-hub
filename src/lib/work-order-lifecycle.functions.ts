import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseWorkOrderInput } from "./work-order-access";
import {
  GetWorkOrderLifecycleSchema,
  MutateWorkOrderLifecycleSchema,
  SaveWorkOrderNoteSchema,
  WorkOrderNoteHistorySchema,
  GetWorkOrderLogSchema,
} from "./work-order-lifecycle";
import {
  getWorkOrderLifecycleContext,
  mutateWorkOrderLifecycle,
  saveWorkOrderNote,
  getWorkOrderNoteHistory,
  getWorkOrderLog,
} from "@/services/work-order-lifecycle-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
export const getProjectWorkOrderLifecycleContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(GetWorkOrderLifecycleSchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderLifecycleContext(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const mutateProjectWorkOrderLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(MutateWorkOrderLifecycleSchema, raw))
  .handler(({ data, context }) =>
    mutateWorkOrderLifecycle(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const saveProjectWorkOrderNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SaveWorkOrderNoteSchema, raw))
  .handler(({ data, context }) =>
    saveWorkOrderNote(context.supabase as unknown as WorkOrderRequestClient, context.userId, data),
  );
export const getProjectWorkOrderNoteHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderNoteHistorySchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderNoteHistory(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const getProjectWorkOrderLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(GetWorkOrderLogSchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderLog(context.supabase as unknown as WorkOrderRequestClient, context.userId, data),
  );
