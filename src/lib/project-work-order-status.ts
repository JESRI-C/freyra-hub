import { z } from "zod";
import { WorkOrderActionIdSchema } from "./work-order-access";
import { WorkOrderStatusSchema } from "./work-order-lifecycle";

const uuid = z.string().uuid();
const version = z.number().int().positive();

/** The latest visible recorded state, without claiming its execution basis is current. */
export const ProjectWorkOrderStatusSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("missing"),
      initialized: z.boolean(),
      status: z.null(),
      version: z.null(),
      blocked: z.literal(false),
    })
    .strict(),
  z
    .object({
      state: z.literal("recorded"),
      initialized: z.literal(true),
      status: WorkOrderStatusSchema,
      version,
      blocked: z.boolean(),
    })
    .strict(),
  z
    .object({
      state: z.literal("unrecognized"),
      initialized: z.literal(true),
      status: z.null(),
      version,
      blocked: z.boolean(),
    })
    .strict(),
]);
export type ProjectWorkOrderStatus = z.infer<typeof ProjectWorkOrderStatusSchema>;

const scopedAction = {
  action_id: WorkOrderActionIdSchema,
  organization_id: uuid,
  project_id: uuid,
};
export const ProjectWorkOrderActionProjectionSchema = z.object({
  id: WorkOrderActionIdSchema,
  project_id: uuid,
  title: z.string(),
  status: z.string().nullable(),
  action_type: z.string().nullable(),
  linked_indicator_id: uuid.nullish(),
  work_orders: z
    .array(
      z.object({
        ...scopedAction,
        life: z
          .array(
            z.object({
              ...scopedAction,
              id: uuid,
              version,
              status: z.string(),
              blocked: z.boolean(),
            }),
          )
          .max(1),
      }),
    )
    .max(1),
});

export function parseProjectWorkOrderAction(
  raw: unknown,
  scope: { organizationId: string; projectId: string },
) {
  const row = ProjectWorkOrderActionProjectionSchema.parse(raw);
  const order = row.work_orders[0];
  const life = order?.life[0];
  if (
    row.project_id !== scope.projectId ||
    [order, life].some(
      (nested) =>
        nested &&
        (nested.action_id !== row.id ||
          nested.organization_id !== scope.organizationId ||
          nested.project_id !== scope.projectId),
    )
  )
    throw new Error("Arbejdsopgavens status tilhører en anden sag eller opgave.");

  let workOrderStatus: ProjectWorkOrderStatus;
  if (!life) {
    workOrderStatus = {
      state: "missing",
      initialized: !!order,
      status: null,
      version: null,
      blocked: false,
    };
  } else {
    const known = WorkOrderStatusSchema.safeParse(life.status);
    workOrderStatus = known.success
      ? {
          state: "recorded",
          initialized: true,
          status: known.data,
          version: life.version,
          blocked: life.blocked,
        }
      : {
          state: "unrecognized",
          initialized: true,
          status: null,
          version: life.version,
          blocked: life.blocked,
        };
  }
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    ...(row.linked_indicator_id !== undefined
      ? { linked_indicator_id: row.linked_indicator_id }
      : {}),
    workOrderStatus,
  };
}
export type ProjectWorkOrderAction = ReturnType<typeof parseProjectWorkOrderAction>;
