import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  WorkOrderRequestError,
  WorkOrderScopeSchema,
  parseWorkOrderInput,
} from "./work-order-access";
import { SaveSubmissionSchema, SubmissionPageSchema } from "./work-order-submission";
import {
  getWorkOrderSubmissionContext,
  listWorkOrderSubmissions,
  saveWorkOrderSubmission,
} from "@/services/work-order-submission-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
import { getWorkOrderReviewContext } from "@/services/work-order-review-service";

export const getProjectWorkOrderReviewContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderScopeSchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderReviewContext(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );

const approvedSubmissionSchema = WorkOrderScopeSchema.extend({
  submissionId: z.string().uuid(),
  planVersionId: z.string().uuid(),
}).strict();

export const hasProjectWorkOrderSubmissionApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(approvedSubmissionSchema, raw))
  .handler(async ({ data, context }) => {
    // Use the caller's session so work-order read policies also apply to this lookup.
    const client = context.supabase as unknown as SupabaseClient;
    const { data: match, error } = await client
      .from("work_order_lifecycle_versions")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("project_id", data.projectId)
      .eq("action_id", data.actionId)
      .eq("submission_version_id", data.submissionId)
      .eq("plan_version_id", data.planVersionId)
      .eq("operation", "review")
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();
    if (error) throw new WorkOrderRequestError("unavailable");
    return match !== null;
  });

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
