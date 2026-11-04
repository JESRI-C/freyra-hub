import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createObservationDraft,
  getObservationDraft,
  listObservationSources,
} from "@/services/work-order-observation-drafts-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
import { parseWorkOrderInput } from "./work-order-access";
import {
  CreateWorkOrderObservationDraftInputSchema,
  GetWorkOrderObservationDraftInputSchema,
  ListWorkOrderObservationSourcesInputSchema,
} from "./work-order-observation-drafts";

export const listWorkOrderObservationSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    parseWorkOrderInput(ListWorkOrderObservationSourcesInputSchema, raw),
  )
  .handler(({ data, context }) =>
    listObservationSources(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );

export const createWorkOrderObservationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    parseWorkOrderInput(CreateWorkOrderObservationDraftInputSchema, raw),
  )
  .handler(({ data, context }) =>
    createObservationDraft(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );

export const getWorkOrderObservationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    parseWorkOrderInput(GetWorkOrderObservationDraftInputSchema, raw),
  )
  .handler(({ data, context }) =>
    getObservationDraft(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
