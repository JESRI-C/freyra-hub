import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseWorkOrderInput } from "./work-order-access";
import { LoadWorkOrderExecutionSchema, SaveWorkOrderExecutionSchema } from "./work-order-execution";
import {
  loadWorkOrderExecutionContext,
  saveWorkOrderExecution,
} from "@/services/work-order-execution-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
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
