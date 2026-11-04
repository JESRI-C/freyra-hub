import { z } from "zod";
import { CalendarDate } from "./action-execution";
import { WorkOrderActionIdSchema } from "./work-order-access";
import { WorkOrderStatusSchema } from "./work-order-lifecycle";

const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const actionId = WorkOrderActionIdSchema.transform((value) => value.toLowerCase());
export const MANAGER_SELECTION_CHANGED_MESSAGE =
  "Opgaveudvalget er ændret. Genindlæs listen, før du fortsætter.";

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
    selectionToken: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.cursor !== null && input.selectionToken === null)
      ctx.addIssue({
        code: "custom",
        path: ["selectionToken"],
        message: "Næste side kræver det samme opgaveudvalg.",
      });
  });
export type ManagerWorkOrderInput = z.infer<typeof ManagerWorkOrderInputSchema>;

const position = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
export const ManagerWorkOrderMapLocationSchema = z
  .object({
    id: z.string().min(1).max(100),
    source: z.enum(["plan_site", "plan_visit_stop", "action_site", "plan_watercourse"]),
    source_id: uuid,
    source_version_id: uuid.nullable(),
    name: z.string(),
    archived: z.boolean(),
    coordinate_source: z.enum(["site_point", "site_stored_centroid", "pinned_centerline"]),
    sequence: z.number().int().min(0).max(20).nullable(),
    geometry: z.discriminatedUnion("type", [
      z.object({ type: z.literal("Point"), coordinates: position }).strict(),
      z.object({ type: z.literal("LineString"), coordinates: z.array(position).min(2) }).strict(),
    ]),
  })
  .strict()
  .superRefine((location, ctx) => {
    const geometry = location.geometry;
    if (
      geometry.type === "LineString" &&
      !geometry.coordinates.some(
        (point) =>
          point[0] !== geometry.coordinates[0][0] || point[1] !== geometry.coordinates[0][1],
      )
    )
      ctx.addIssue({ code: "custom", message: "En centerlinje skal have positiv længde." });
    if (
      location.source === "plan_watercourse"
        ? location.geometry.type !== "LineString" ||
          location.coordinate_source !== "pinned_centerline" ||
          location.source_version_id !== location.source_id ||
          location.sequence !== null
        : location.geometry.type !== "Point" ||
          location.coordinate_source === "pinned_centerline" ||
          location.source_version_id !== null ||
          location.sequence === null
    )
      ctx.addIssue({ code: "custom", message: "Kortstedets geometri og kilde stemmer ikke." });
    if (
      location.source === "plan_visit_stop"
        ? !location.sequence
        : location.source !== "plan_watercourse" && location.sequence !== 0
    )
      ctx.addIssue({ code: "custom", message: "Kortstedets besøgsrækkefølge stemmer ikke." });
  });
export type ManagerWorkOrderMapLocation = z.infer<typeof ManagerWorkOrderMapLocationSchema>;

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
    map_locations: z.array(z.unknown()).max(22),
    map_unavailable_reason: z.enum(["no_location", "coordinates_missing_or_invalid"]).nullable(),
    map_unavailable_locations: z.number().int().nonnegative(),
  })
  .strict()
  .transform((row) => {
    const valid: ManagerWorkOrderMapLocation[] = [];
    let invalid = 0;
    for (const raw of row.map_locations) {
      const location = ManagerWorkOrderMapLocationSchema.safeParse(raw);
      if (
        location.success &&
        !valid.some((item) => item.id === location.data.id) &&
        (location.data.source === "action_site"
          ? row.plan_version_id === null
          : row.plan_version_id !== null) &&
        (!["action_site", "plan_site"].includes(location.data.source) ||
          row.site_id === location.data.source_id)
      )
        valid.push(location.data);
      else invalid++;
    }
    return {
      ...row,
      map_locations: valid,
      map_unavailable_locations: row.map_unavailable_locations + invalid,
      map_unavailable_reason: valid.length
        ? null
        : invalid
          ? ("coordinates_missing_or_invalid" as const)
          : row.map_unavailable_reason,
    };
  })
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
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const ManagerWorkOrderTotalsSchema = z
  .object({
    matchingJobs: count,
    mappedJobs: count,
    unmappedJobs: count,
    positions: count,
  })
  .strict();
export const ManagerWorkOrderLaneTotalsSchema = z
  .object({
    open: count,
    started: count,
    performed: count,
    submitted: count,
    approved: count,
    waiting: count,
    correction: count,
    cancelled: count,
    untracked: count,
  })
  .strict();
export const ManagerWorkOrderStatusTotalSchema = z
  .object({
    status: z.union([WorkOrderStatusSchema, z.literal("untracked")]),
    count,
  })
  .strict();
/** The RPC returns a sentinel row; only the service converts it to a public cursor. */
export const ManagerWorkOrderReceiptSchema = z
  .object({
    organization_id: uuid,
    user_id: uuid,
    items: z.array(ManagerWorkOrderSchema).max(51),
    projects: z.array(ManagerWorkOrderOptionSchema),
    assignees: z.array(ManagerWorkOrderOptionSchema),
    totals: ManagerWorkOrderTotalsSchema,
    statusTotals: z.array(ManagerWorkOrderStatusTotalSchema).max(11),
    waitingJobs: count,
    laneTotals: ManagerWorkOrderLaneTotalsSchema,
    selectionToken: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type ManagerWorkOrderPage = {
  items: ManagerWorkOrder[];
  projects: z.infer<typeof ManagerWorkOrderOptionSchema>[];
  assignees: z.infer<typeof ManagerWorkOrderOptionSchema>[];
  nextCursor: string | null;
  totals: z.infer<typeof ManagerWorkOrderTotalsSchema>;
  statusTotals: z.infer<typeof ManagerWorkOrderStatusTotalSchema>[];
  waitingJobs: number;
  laneTotals: z.infer<typeof ManagerWorkOrderLaneTotalsSchema>;
  selectionToken: string;
};
