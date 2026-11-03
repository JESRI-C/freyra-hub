import { z } from "zod";
import { RecurrenceInterval } from "./work-order-recurrence";
import { CalendarDate } from "./action-execution";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SaveWorkOrderPlanSchema, WorkOrderPlanHistorySchema } from "./work-order-plan";
import { parseWorkOrderInput } from "./work-order-access";
import { saveWorkOrderPlan, getWorkOrderPlanHistory } from "@/services/work-order-plan-service";
import {
  checkActor,
  workOrderRpcFailure,
  type WorkOrderRequestClient,
} from "@/services/work-order-access-service";
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

const SeriesSchema = z
  .object({
    organizationId: z.string().uuid(),
    projectId: z.string().uuid(),
    sourcePlanVersionId: z.string().uuid(),
    expectedActorId: z.string().uuid(),
    firstDate: CalendarDate,
    interval: RecurrenceInterval,
    count: z.number().int().min(2).max(12),
    requestId: z.string().uuid(),
  })
  .strict();

export const createProjectWorkOrderSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SeriesSchema, raw))
  .handler(async ({ data, context }) => {
    checkActor(context.userId, data.expectedActorId);
    const client = context.supabase as unknown as WorkOrderRequestClient;
    const result = await client.rpc("create_work_order_series", {
      p_organization_id: data.organizationId,
      p_project_id: data.projectId,
      p_source_plan_version_id: data.sourcePlanVersionId,
      p_first_date: data.firstDate,
      p_interval: data.interval,
      p_count: data.count,
      p_request_id: data.requestId,
      p_expected_actor_id: data.expectedActorId,
    });
    if (result.error) workOrderRpcFailure(result.error);
    return z.array(z.string().uuid()).length(data.count).parse(result.data);
  });

const ShiftSeriesSchema = z
  .object({
    organizationId: z.string().uuid(),
    projectId: z.string().uuid(),
    seriesId: z.string().uuid(),
    expectedActorId: z.string().uuid(),
    expectedPlans: z.record(z.string().uuid(), z.string().uuid()),
    days: z
      .number()
      .int()
      .min(-3660)
      .max(3660)
      .refine((value) => value !== 0),
    reason: z.string().trim().min(1).max(1000),
    requestId: z.string().uuid(),
  })
  .strict();

export const shiftProjectWorkOrderSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(ShiftSeriesSchema, raw))
  .handler(async ({ data, context }) => {
    checkActor(context.userId, data.expectedActorId);
    const client = context.supabase as unknown as WorkOrderRequestClient;
    const result = await client.rpc("shift_work_order_series", {
      p_organization_id: data.organizationId,
      p_project_id: data.projectId,
      p_series_id: data.seriesId,
      p_expected_plans: data.expectedPlans,
      p_days: data.days,
      p_reason: data.reason,
      p_request_id: data.requestId,
      p_expected_actor_id: data.expectedActorId,
    });
    if (result.error) workOrderRpcFailure(result.error);
    return z.number().int().min(2).max(12).parse(result.data);
  });
