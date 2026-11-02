import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseWorkOrderInput } from "./work-order-access";
import {
  LoadWorkOrderExecutionSchema,
  ReadWorkOrderExecutionBindingSchema,
  SaveWorkOrderExecutionSchema,
} from "./work-order-execution";
import {
  loadWorkOrderExecutionContext,
  saveWorkOrderExecution,
  readWorkOrderExecutionBinding,
} from "@/services/work-order-execution-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
export const readProjectWorkOrderExecutionBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(ReadWorkOrderExecutionBindingSchema, raw))
  .handler(({ data, context }) =>
    readWorkOrderExecutionBinding(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const loadProjectWorkOrderExecutionContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(LoadWorkOrderExecutionSchema, raw))
  .handler(({ data, context }) =>
    loadWorkOrderExecutionContext(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const saveProjectWorkOrderExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SaveWorkOrderExecutionSchema, raw))
  .handler(({ data, context }) =>
    saveWorkOrderExecution(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
