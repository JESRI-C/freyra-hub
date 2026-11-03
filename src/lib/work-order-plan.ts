import { z } from "zod";
import { CalendarDate } from "./action-execution";
import { WorkOrderScopeSchema } from "./work-order-access";
const uuid = z.string().uuid();
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable();
const metres = z.number().finite().min(0).max(1_000_000_000).nullable();
export const WorkOrderWatercourseSchema = z
  .object({
    name: optionalText(200),
    externalId: optionalText(200),
    regulationReference: optionalText(1000),
    regulationVersion: optionalText(200),
    stationFromM: metres,
    stationToM: metres,
    stationDirection: z.enum(["upstream", "downstream", "unknown"]),
    lengthM: metres,
    bottomWidthM: metres,
    measurementSource: optionalText(2000),
    term: optionalText(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.stationFromM !== null &&
      value.stationToM !== null &&
      value.stationToM < value.stationFromM &&
      value.stationDirection === "unknown"
    )
      ctx.addIssue({
        code: "custom",
        path: ["stationDirection"],
        message: "Angiv retningen for omvendt stationering.",
      });
    if (
      [value.stationFromM, value.stationToM, value.lengthM, value.bottomWidthM].some(
        (v) => v !== null,
      ) &&
      !value.measurementSource
    )
      ctx.addIssue({
        code: "custom",
        path: ["measurementSource"],
        message: "Angiv kilden til stationer og mål, også ved målt nul.",
      });
  });
export type WorkOrderWatercourse = z.infer<typeof WorkOrderWatercourseSchema>;
export function emptyWorkOrderWatercourse(): WorkOrderWatercourse {
  return {
    name: null,
    externalId: null,
    regulationReference: null,
    regulationVersion: null,
    stationFromM: null,
    stationToM: null,
    stationDirection: "unknown",
    lengthM: null,
    bottomWidthM: null,
    measurementSource: null,
    term: null,
  };
}
const workOrderHours = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 });
export function formatWorkOrderHours(hours: number) {
  return workOrderHours.format(hours) + (hours === 1 ? " time" : " timer");
}

/** Distribute an estimate evenly across its inclusive calendar dates, independent of DST. */
export function workOrderHoursInPeriod(
  plan: { start: string | null; end: string | null; estimatedHours?: number | null },
  from: string,
  through: string,
): number | null {
  if (!plan.start || plan.estimatedHours == null) return null;
  const end = plan.end ?? plan.start;
  const overlapStart = from > plan.start ? from : plan.start;
  const overlapEnd = through < end ? through : end;
  if (overlapEnd < overlapStart) return 0;
  const days = (start: string, finish: string) =>
    (Date.parse(finish) - Date.parse(start)) / 86_400_000 + 1;
  return (plan.estimatedHours * days(overlapStart, overlapEnd)) / days(plan.start, end);
}

export const WorkOrderEstimatedHoursSchema = z
  .number()
  .min(0)
  .max(10000)
  .refine(
    (hours) => Number(hours.toFixed(2)) === hours,
    "Timeestimatet kan have op til to decimaler.",
  );

export const WorkOrderPlanSchema = z
  .object({
    schema: z.literal("freyra.work-order-plan/v1"),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000),
    instructions: z.string().trim().max(4000),
    profile: z.enum(["general", "watercourse", "nature", "construction", "grazing"]).nullable(),
    responsibleId: uuid.nullable(),
    siteId: uuid.nullable(),
    visitStops: z
      .array(
        z
          .object({
            siteId: uuid,
            name: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    watercourseVersionId: uuid.nullable(),
    locationNote: z.string().trim().max(2000),
    plannedStart: CalendarDate.nullable(),
    plannedEnd: CalendarDate.nullable(),
    estimatedHours: WorkOrderEstimatedHoursSchema.nullable().optional(),
    priority: z.enum(["high", "medium", "low"]).nullable(),
    plannedMethod: optionalText(2000),
    watercourse: WorkOrderWatercourseSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const siteIds = (value.visitStops ?? []).map((stop) => stop.siteId.toLowerCase());
    if (
      new Set(siteIds).size !== siteIds.length ||
      siteIds.includes(value.siteId?.toLowerCase() ?? "")
    )
      ctx.addIssue({
        code: "custom",
        path: ["visitStops"],
        message: "Vælg kun hver lokalitet én gang.",
      });
    if (value.plannedEnd && (!value.plannedStart || value.plannedEnd < value.plannedStart))
      ctx.addIssue({
        code: "custom",
        path: ["plannedEnd"],
        message: "Slutdato kræver en startdato og må ikke ligge før den.",
      });
    if ((value.profile === "watercourse") !== (value.watercourse !== null))
      ctx.addIssue({
        code: "custom",
        path: ["watercourse"],
        message: "Vandløbsfelter skal følge den valgte profil.",
      });
    if (value.watercourseVersionId && value.profile !== "watercourse")
      ctx.addIssue({
        code: "custom",
        path: ["watercourseVersionId"],
        message: "Vandløbsgrundlag kræver vandløbsprofil.",
      });
  });
export type WorkOrderPlan = z.infer<typeof WorkOrderPlanSchema>;
export function emptyWorkOrderPlan(title: string): WorkOrderPlan {
  return {
    schema: "freyra.work-order-plan/v1",
    title,
    description: "",
    instructions: "",
    profile: null,
    responsibleId: null,
    siteId: null,
    watercourseVersionId: null,
    locationNote: "",
    plannedStart: null,
    plannedEnd: null,
    priority: null,
    plannedMethod: null,
    watercourse: null,
  };
}
export const SaveWorkOrderPlanSchema = WorkOrderScopeSchema.extend({
  expectedActorId: uuid,
  expectedVersion: z.number().int().min(0).max(2147483646),
  requestId: uuid,
  plan: WorkOrderPlanSchema,
  correctionReason: z.string().trim().max(2000),
  sourcePlanVersionId: uuid.optional(),
})
  .strict()
  .superRefine((input, ctx) => {
    if (input.expectedVersion > 0 && input.sourcePlanVersionId)
      ctx.addIssue({
        code: "custom",
        path: ["sourcePlanVersionId"],
        message: "Kildeplanen vælges ved den første planversion.",
      });
    if (input.expectedVersion > 0 && !input.correctionReason)
      ctx.addIssue({
        code: "custom",
        path: ["correctionReason"],
        message: "Angiv årsagen til planændringen.",
      });
  });
export type SaveWorkOrderPlan = z.infer<typeof SaveWorkOrderPlanSchema>;
export const WorkOrderPlanVersionSchema = z.object({
  id: uuid,
  action_id: uuid,
  organization_id: uuid,
  project_id: uuid,
  version: z.number().int().positive(),
  plan: WorkOrderPlanSchema,
  correction_reason: z.string().trim().max(2000),
  source_plan_version_id: uuid.nullish(),
  source_action_id: uuid.nullish(),
  source_plan_version: z.number().int().positive().nullish(),
  request_id: uuid,
  created_by: uuid,
  created_at: z.string().datetime({ offset: true }),
});
export type WorkOrderPlanVersion = z.infer<typeof WorkOrderPlanVersionSchema>;
export const WorkOrderPlanHistorySchema = WorkOrderScopeSchema.extend({
  beforeVersion: z.number().int().positive().nullable(),
  pageSize: z.number().int().min(1).max(50),
}).strict();
export function parseWorkOrderMetres(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(value))
    throw new Error(
      "Angiv meter som tal med decimal-komma eller punktum, uden tusindtalsseparator.",
    );
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed > 1_000_000_000)
    throw new Error("Meterangivelsen er uden for det tilladte interval.");
  return parsed;
}
/** Plan completeness is a named gap list, never a completion or effect score. */
export function workOrderPlanGaps(plan: WorkOrderPlan): string[] {
  return [
    ...(!plan.profile ? ["Metodeprofil er ikke valgt."] : []),
    ...(!plan.responsibleId ? ["Ansvarlig er ikke valgt."] : []),
    ...(!plan.plannedStart ? ["Planlagt start er uafklaret."] : []),
    ...(!plan.plannedMethod ? ["Planlagt metode er uafklaret."] : []),
    ...(!plan.instructions ? ["Arbejdsinstruktion mangler."] : []),
    ...(!plan.siteId && !plan.visitStops?.length && !plan.watercourseVersionId && !plan.locationNote
      ? ["Sted eller delstrækning er uafklaret."]
      : []),
  ];
}
