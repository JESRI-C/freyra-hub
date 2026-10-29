import { z, type ZodType } from "zod";
const uuid = z.string().uuid();
const scope = { actionId: uuid, organizationId: uuid, projectId: uuid };
export const WorkOrderScopeSchema = z.object(scope).strict();
export type WorkOrderScope = z.infer<typeof WorkOrderScopeSchema>;
export const InitializeWorkOrderSchema = z
  .object({
    ...scope,
    expectedActorId: uuid,
    expectedVersion: z.literal(0),
    requestId: uuid,
  })
  .strict();
export type InitializeWorkOrder = z.infer<typeof InitializeWorkOrderSchema>;
export const SaveWorkOrderAccessSchema = z
  .object({
    ...scope,
    expectedActorId: uuid,
    userId: uuid,
    expectedVersion: z.number().int().min(0).max(2147483646),
    active: z.boolean(),
    canExecute: z.boolean(),
    canReview: z.boolean(),
    reason: z.string().trim().min(1, "Angiv en begrundelse.").max(2000),
    requestId: uuid,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.active && (value.canExecute || value.canReview))
      ctx.addIssue({
        code: "custom",
        path: ["active"],
        message: "Tilbagekaldt adgang kan ikke have aktive rettigheder.",
      });
  });
export type SaveWorkOrderAccess = z.infer<typeof SaveWorkOrderAccessSchema>;
const identity = { action_id: uuid, organization_id: uuid, project_id: uuid };
export const WorkOrderIdentitySchema = z.object({
  ...identity,
  request_id: uuid,
  created_by: uuid,
  created_at: z.string().datetime({ offset: true }),
});
export type WorkOrderIdentity = z.infer<typeof WorkOrderIdentitySchema>;
export const WorkOrderAccessVersionSchema = z.object({
  ...identity,
  id: uuid,
  user_id: uuid,
  version: z.number().int().positive(),
  active: z.boolean(),
  can_execute: z.boolean(),
  can_review: z.boolean(),
  reason: z.string().trim().min(1).max(2000),
  request_id: uuid,
  created_by: uuid,
  created_at: z.string().datetime({ offset: true }),
});
export type WorkOrderAccessVersion = z.infer<typeof WorkOrderAccessVersionSchema>;
export const WorkOrderAccessHistorySchema = WorkOrderScopeSchema.extend({
  userId: uuid,
  beforeVersion: z.number().int().positive().nullable(),
  pageSize: z.number().int().min(1).max(50),
}).strict();
export const WorkOrderAccessSubjectsSchema = WorkOrderScopeSchema.extend({
  afterUserId: uuid.nullable(),
  pageSize: z.number().int().min(1).max(50),
}).strict();
export const WorkOrderCapabilitiesSchema = z.object({
  ...identity,
  user_id: uuid,
  can_plan: z.boolean(),
  can_manage_access: z.boolean(),
  can_execute: z.boolean(),
  can_review: z.boolean(),
});
export type WorkOrderCapabilities = z.infer<typeof WorkOrderCapabilitiesSchema>;
export class WorkOrderRequestError extends Error {
  readonly statusCode: number;
  constructor(readonly code: "access" | "conflict" | "validation" | "unavailable") {
    super(
      {
        access: "Arbejdsopgaven er ikke tilgængelig.",
        conflict: "Opgaven er ændret. Genindlæs før du gemmer.",
        validation: "Kontrollér opgavens felter, modtager og begrundelse.",
        unavailable: "Arbejdsopgaven kunne ikke kontrolleres. Prøv igen; dit udkast bevares.",
      }[code],
    );
    this.name = "WorkOrderRequestError";
    this.statusCode = { access: 403, conflict: 409, validation: 422, unavailable: 503 }[code];
  }
}
export function parseWorkOrderInput<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new WorkOrderRequestError("validation");
  return result.data;
}
