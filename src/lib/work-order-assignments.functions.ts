import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseWorkOrderInput } from "./work-order-access";
import {
  SaveWorkOrderGroupSchema,
  WorkOrderGroupListSchema,
  WorkOrderGroupHistorySchema,
  WorkOrderPeopleSchema,
  ConfigureWorkOrderAssignmentSchema,
  ClaimWorkOrderPoolSchema,
  WorkOrderAssignmentHistorySchema,
  MyWorkOrdersInputSchema,
} from "./work-order-assignments";
import {
  saveWorkOrderGroup,
  listWorkOrderGroups,
  getWorkOrderGroupHistory,
  listWorkOrderPeople,
  configureWorkOrderAssignment,
  claimWorkOrderPool,
  getWorkOrderAssignmentHistory,
  listMyWorkOrders,
} from "@/services/work-order-assignments-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
export const saveProjectWorkOrderGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SaveWorkOrderGroupSchema, raw))
  .handler(({ data, context }) =>
    saveWorkOrderGroup(context.supabase as unknown as WorkOrderRequestClient, context.userId, data),
  );
export const listProjectWorkOrderGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderGroupListSchema, raw))
  .handler(({ data, context }) =>
    listWorkOrderGroups(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const getProjectWorkOrderGroupHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderGroupHistorySchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderGroupHistory(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const listProjectWorkOrderPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderPeopleSchema, raw))
  .handler(({ data, context }) =>
    listWorkOrderPeople(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const configureProjectWorkOrderAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(ConfigureWorkOrderAssignmentSchema, raw))
  .handler(({ data, context }) =>
    configureWorkOrderAssignment(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const claimProjectWorkOrderPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(ClaimWorkOrderPoolSchema, raw))
  .handler(({ data, context }) =>
    claimWorkOrderPool(context.supabase as unknown as WorkOrderRequestClient, context.userId, data),
  );
export const getProjectWorkOrderAssignmentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(WorkOrderAssignmentHistorySchema, raw))
  .handler(({ data, context }) =>
    getWorkOrderAssignmentHistory(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const listCurrentUserWorkOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(MyWorkOrdersInputSchema, raw))
  .handler(({ data, context }) =>
    listMyWorkOrders(context.supabase as unknown as WorkOrderRequestClient, context.userId, data),
  );
