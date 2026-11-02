import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WorkOrderScopeSchema, parseWorkOrderInput } from "./work-order-access";
import { SaveSubmissionSchema, SubmissionPageSchema } from "./work-order-submission";
import {
  getWorkOrderSubmissionContext,
  listWorkOrderSubmissions,
  saveWorkOrderSubmission,
} from "@/services/work-order-submission-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";

export const getProjectWorkOrderSubmissionContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderScopeSchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderSubmissionContext(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const saveProjectWorkOrderSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SaveSubmissionSchema, raw))
  .handler(({ data, context }) =>
    saveWorkOrderSubmission(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const listProjectWorkOrderSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SubmissionPageSchema, raw))
  .handler(({ data, context }) =>
    listWorkOrderSubmissions(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
