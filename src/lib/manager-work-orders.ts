import { z } from "zod";
import { CalendarDate } from "./action-execution";
import { WorkOrderActionIdSchema } from "./work-order-access";
import { WorkOrderStatusSchema } from "./work-order-lifecycle";

const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const actionId = WorkOrderActionIdSchema.transform((value) => value.toLowerCase());

export const ManagerWorkOrderFiltersSchema = z
  .object({
    projectId: uuid.nullable(),
    status: z.union([
      z.literal("all"),
      z.literal("untracked"),
      z.literal("waiting"),
      WorkOrderStatusSchema,
    ]),
    assignment: z.enum(["all", "unassigned", "person", "group", "pool"]),
    assigneeId: uuid.nullable(),
    search: z.string().trim().max(200),
    dueFrom: CalendarDate.nullable(),
    dueThrough: CalendarDate.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dueFrom && value.dueThrough && value.dueFrom > value.dueThrough)
      ctx.addIssue({
        code: "custom",
        path: ["dueThrough"],
        message: "Frist til må ikke ligge før frist fra.",
      });
  });
export type ManagerWorkOrderFilters = z.infer<typeof ManagerWorkOrderFiltersSchema>;

export function emptyManagerWorkOrderFilters(): ManagerWorkOrderFilters {
  return {
    projectId: null,
    status: "all",
    assignment: "all",
    assigneeId: null,
    search: "",
    dueFrom: null,
    dueThrough: null,
  };
}

export const ManagerWorkOrderInputSchema = z
  .object({
    organizationId: uuid,
    expectedActorId: uuid,
    filters: ManagerWorkOrderFiltersSchema,
    cursor: actionId.nullable(),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();
export type ManagerWorkOrderInput = z.infer<typeof ManagerWorkOrderInputSchema>;

export const ManagerWorkOrderSchema = z
  .object({
    action_id: actionId,
    organization_id: uuid,
    project_id: uuid,
    project_name: z.string(),
    title: z.string(),
    legacy_status: z.string().nullable(),
    task_status: WorkOrderStatusSchema.nullable(),
    blocked: z.boolean(),
    waiting_for_prerequisites: z.boolean(),
    initialized: z.boolean(),
    plan_version_id: uuid.nullable(),
    planned_start: CalendarDate.nullable(),
    planned_end: CalendarDate.nullable(),
    due_date: CalendarDate.nullable(),
    site_id: uuid.nullable(),
    site_name: z.string().nullable(),
    location_note: z.string().nullable(),
    plan_responsible_id: uuid.nullable(),
    plan_responsible_name: z.string().nullable(),
    assignment_id: uuid.nullable(),
    assignment_mode: z.enum(["person", "group", "pool", "unassigned"]),
    candidate_user_ids: z.array(uuid).max(200),
    candidate_names: z.array(z.string()).max(200),
    claimed_by: uuid.nullable(),
    claimed_by_name: z.string().nullable(),
    assignment_is_current: z.boolean(),
  })
  .strict()
  .superRefine((row, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      row.candidate_user_ids.length !== row.candidate_names.length ||
      new Set(row.candidate_user_ids).size !== row.candidate_user_ids.length
    )
      issue("Tildelingens personer og navne stemmer ikke.");
    if (!row.initialized && (row.plan_version_id || row.assignment_id || row.task_status))
      issue("En ikke-initialiseret opgave kan ikke have arbejdsordreversioner.");
    if (
      row.assignment_id === null &&
      (row.assignment_mode !== "unassigned" ||
        row.candidate_user_ids.length ||
        row.claimed_by ||
        row.assignment_is_current)
    )
      issue("En opgave uden tildelingsversion er ikke tildelt.");
    if (row.assignment_mode === "unassigned" && (row.candidate_user_ids.length || row.claimed_by))
      issue("En ophævet tildeling har ingen udførere.");
    if (row.assignment_mode === "person" && row.candidate_user_ids.length !== 1)
      issue("En persontildeling skal have én udfører.");
    if (
      (row.assignment_mode === "group" || row.assignment_mode === "pool") &&
      !row.candidate_user_ids.length
    )
      issue("Gruppen eller puljen skal have kandidater.");
    if (
      row.claimed_by &&
      (row.assignment_mode !== "pool" || !row.candidate_user_ids.includes(row.claimed_by))
    )
      issue("Kun en puljekandidat kan stå som overtager.");
    if (row.assignment_is_current && !row.plan_version_id)
      issue("En aktuel tildeling kræver en planversion.");
  });
export type ManagerWorkOrder = z.infer<typeof ManagerWorkOrderSchema>;

export const ManagerWorkOrderOptionSchema = z.object({ id: uuid, name: z.string() }).strict();
/** The RPC returns a sentinel row; only the service converts it to a public cursor. */
export const ManagerWorkOrderReceiptSchema = z
  .object({
    organization_id: uuid,
    user_id: uuid,
    items: z.array(ManagerWorkOrderSchema).max(51),
    projects: z.array(ManagerWorkOrderOptionSchema),
    assignees: z.array(ManagerWorkOrderOptionSchema),
  })
  .strict();
export type ManagerWorkOrderPage = {
  items: ManagerWorkOrder[];
  projects: z.infer<typeof ManagerWorkOrderOptionSchema>[];
  assignees: z.infer<typeof ManagerWorkOrderOptionSchema>[];
  nextCursor: string | null;
};
