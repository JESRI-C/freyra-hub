import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EvidencePageSchema,
  EvidenceSourcesSchema,
  SaveEvidenceSchema,
  EvidenceOriginalInputSchema,
} from "./work-order-evidence";
import { parseWorkOrderInput } from "./work-order-access";
import {
  saveWorkOrderEvidence,
  listWorkOrderEvidence,
  listWorkOrderEvidenceSources,
  listWorkOrderEvidenceExecutions,
} from "@/services/work-order-evidence-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
export const listProjectWorkOrderEvidenceExecutions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(EvidencePageSchema, raw))
  .handler(({ data, context }) =>
    listWorkOrderEvidenceExecutions(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const saveProjectWorkOrderEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(SaveEvidenceSchema, raw))
  .handler(({ data, context }) =>
    saveWorkOrderEvidence(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const listProjectWorkOrderEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(EvidencePageSchema, raw))
  .handler(({ data, context }) =>
    listWorkOrderEvidence(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const listProjectWorkOrderEvidenceSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(EvidenceSourcesSchema, raw))
  .handler(({ data, context }) =>
    listWorkOrderEvidenceSources(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
export const getProjectWorkOrderEvidenceOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(EvidenceOriginalInputSchema, raw))
  .handler(async ({ data, context }) => {
    const { signWorkOrderEvidenceOriginal } =
      await import("@/services/work-order-evidence-original.server");
    return signWorkOrderEvidenceOriginal(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    );
  });
