import { z } from "zod";
import { WorkOrderPlanSchema } from "./work-order-plan";
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const version = z.number().int().min(0).max(2147483646);
export const WorkOrderProjectScopeSchema = z
  .object({ organizationId: uuid, projectId: uuid })
  .strict();
const actorScope = WorkOrderProjectScopeSchema.extend({ expectedActorId: uuid });
const taskScope = actorScope.extend({ actionId: uuid });
export const WorkOrderMemberIdsSchema = z
  .array(uuid)
  .max(200)
  .superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Vælg hver person én gang." });
  })
  .transform((ids) => [...ids].sort());
export const WorkOrderMembershipSchema = z.object({
  schema: z.literal("freyra.work-order-membership/v1"),
  userId: uuid,
  organizationRole: z.string(),
  projectRole: z.string().nullable(),
  assessedAt: z.string().datetime({ offset: true }),
});
const identity = {
  id: uuid,
  organization_id: uuid,
  project_id: uuid,
  version: z.number().int().positive(),
  request_id: uuid,
  created_by: uuid,
  created_at: z.string().datetime({ offset: true }),
};
const matchedMembers = (ids: string[], members: Array<{ userId: string }>) =>
  ids.length === members.length &&
  new Set(members.map((m) => m.userId)).size === ids.length &&
  members.every((m) => ids.includes(m.userId));
export const WorkOrderGroupSchema = z
  .object({
    ...identity,
    group_id: uuid,
    name: z.string().trim().min(1).max(160),
    active: z.boolean(),
    member_ids: WorkOrderMemberIdsSchema,
    member_assessments: z.array(WorkOrderMembershipSchema).max(200),
    correction_reason: z.string().trim().max(2000),
  })
  .superRefine((row, ctx) => {
    if (row.active && !row.member_ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["member_ids"],
        message: "En aktiv gruppe skal have medlemmer.",
      });
    if (!matchedMembers(row.member_ids, row.member_assessments))
      ctx.addIssue({
        code: "custom",
        path: ["member_assessments"],
        message: "Gruppens medlemsgrundlag stemmer ikke.",
      });
  });
export type WorkOrderGroup = z.infer<typeof WorkOrderGroupSchema>;
export const SaveWorkOrderGroupSchema = actorScope
  .extend({
    groupId: uuid,
    expectedVersion: version,
    name: z.string().trim().min(1).max(160),
    active: z.boolean(),
    memberIds: WorkOrderMemberIdsSchema,
    correctionReason: z.string().trim().max(2000),
    requestId: uuid,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.active && !input.memberIds.length)
      ctx.addIssue({ code: "custom", path: ["memberIds"], message: "Vælg mindst én udfører." });
    if (input.expectedVersion > 0 && !input.correctionReason)
      ctx.addIssue({
        code: "custom",
        path: ["correctionReason"],
        message: "Begrund ændringen af gruppen.",
      });
  });
export const WorkOrderGroupListSchema = actorScope
  .extend({ afterGroupId: uuid.nullable(), pageSize: z.number().int().min(1).max(50) })
  .strict();
export const WorkOrderGroupHistorySchema = actorScope
  .extend({
    groupId: uuid,
    beforeVersion: z.number().int().positive().nullable(),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();
export const WorkOrderPeopleSchema = actorScope
  .extend({ afterUserId: uuid.nullable(), pageSize: z.number().int().min(1).max(50) })
  .strict();
export const WorkOrderPersonSchema = z.object({
  organization_id: uuid,
  project_id: uuid,
  user_id: uuid,
  project_role: z
    .enum(["admin", "project_manager", "editor", "field", "viewer", "external"])
    .nullable(),
  organization_role: z.string(),
  can_execute: z.boolean(),
  display_name: z.string().nullable(),
  email: z.string().nullable(),
});
export type WorkOrderPerson = z.infer<typeof WorkOrderPersonSchema>;
export const WorkOrderAssignmentModeSchema = z.enum(["person", "group", "pool", "unassigned"]);
export type WorkOrderAssignmentMode = z.infer<typeof WorkOrderAssignmentModeSchema>;
export const WorkOrderAssignmentSchema = z
  .object({
    ...identity,
    action_id: uuid,
    change_kind: z.enum(["configured", "claimed"]),
    mode: WorkOrderAssignmentModeSchema,
    plan_version_id: uuid,
    source_group_version_id: uuid.nullable(),
    source_group_id: uuid.nullable(),
    candidate_user_ids: WorkOrderMemberIdsSchema,
    candidate_memberships: z.array(WorkOrderMembershipSchema).max(200),
    claimed_by: uuid.nullable(),
    claimed_at: z.string().datetime({ offset: true }).nullable(),
    claim_member_snapshot: WorkOrderMembershipSchema.extend({
      groupVersionId: uuid.nullable(),
    }).nullable(),
    reason: z.string().trim().min(1).max(2000),
  })
  .superRefine((row, ctx) => {
    if ((row.source_group_version_id === null) !== (row.source_group_id === null))
      ctx.addIssue({
        code: "custom",
        path: ["source_group_version_id"],
        message: "Gruppereferencerne stemmer ikke.",
      });
    if (!matchedMembers(row.candidate_user_ids, row.candidate_memberships))
      ctx.addIssue({
        code: "custom",
        path: ["candidate_memberships"],
        message: "Tildelingens medlemsgrundlag stemmer ikke.",
      });
    if (row.mode === "unassigned" && (row.candidate_user_ids.length || row.source_group_id))
      ctx.addIssue({
        code: "custom",
        path: ["candidate_user_ids"],
        message: "En fjernet tildeling har ingen udførere.",
      });
    if (row.mode === "person" && (row.candidate_user_ids.length !== 1 || row.source_group_id))
      ctx.addIssue({
        code: "custom",
        path: ["candidate_user_ids"],
        message: "Persontildeling kræver én person.",
      });
    if (
      (row.mode === "group" || row.mode === "pool") &&
      (!row.candidate_user_ids.length || (row.mode === "group" && !row.source_group_id))
    )
      ctx.addIssue({
        code: "custom",
        path: ["candidate_user_ids"],
        message: "Gruppen eller puljen mangler udførere.",
      });
    if (row.change_kind === "claimed") {
      if (
        row.mode !== "pool" ||
        !row.claimed_by ||
        !row.claimed_at ||
        !row.claim_member_snapshot ||
        row.claimed_by !== row.created_by ||
        row.claim_member_snapshot.userId !== row.claimed_by ||
        !row.candidate_user_ids.includes(row.claimed_by)
      )
        ctx.addIssue({
          code: "custom",
          path: ["claimed_by"],
          message: "Puljens overtagelse stemmer ikke.",
        });
    } else if (
      row.claimed_by !== null ||
      row.claimed_at !== null ||
      row.claim_member_snapshot !== null
    )
      ctx.addIssue({
        code: "custom",
        path: ["claimed_by"],
        message: "Tildeling kan ikke udgive sig for en overtagelse.",
      });
  });
export type WorkOrderAssignment = z.infer<typeof WorkOrderAssignmentSchema>;
export const ConfigureWorkOrderAssignmentSchema = taskScope
  .extend({
    expectedVersion: version,
    planVersionId: uuid,
    mode: WorkOrderAssignmentModeSchema,
    candidateUserIds: WorkOrderMemberIdsSchema,
    sourceGroupVersionId: uuid.nullable(),
    reason: z.string().trim().min(1).max(2000),
    requestId: uuid,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.mode === "unassigned" &&
      (input.candidateUserIds.length || input.sourceGroupVersionId)
    )
      ctx.addIssue({
        code: "custom",
        path: ["candidateUserIds"],
        message: "Fjern udførere og gruppe, når tildelingen ophæves.",
      });
    if (
      input.mode === "person" &&
      (input.candidateUserIds.length !== 1 || input.sourceGroupVersionId)
    )
      ctx.addIssue({ code: "custom", path: ["candidateUserIds"], message: "Vælg én person." });
    if (
      (input.mode === "group" || input.mode === "pool") &&
      (!input.candidateUserIds.length || (input.mode === "group" && !input.sourceGroupVersionId))
    )
      ctx.addIssue({
        code: "custom",
        path: ["candidateUserIds"],
        message: "Vælg gruppen eller puljens udførere.",
      });
  });
export const ClaimWorkOrderPoolSchema = taskScope
  .extend({ expectedVersion: version.refine((v) => v > 0), planVersionId: uuid, requestId: uuid })
  .strict();
export const WorkOrderAssignmentHistorySchema = taskScope
  .extend({
    beforeVersion: z.number().int().positive().nullable(),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();
export const MyWorkOrdersInputSchema = z
  .object({
    expectedActorId: uuid,
    afterActionId: uuid.nullable(),
    pageSize: z.number().int().min(1).max(20),
  })
  .strict();
export const MyWorkOrderSchema = z
  .object({
    user_id: uuid,
    action_id: uuid,
    organization_id: uuid,
    project_id: uuid,
    plan_version_id: uuid,
    plan_version: z.number().int().positive(),
    plan: WorkOrderPlanSchema,
    assignment_id: uuid.nullable(),
    assignment_version: z.number().int().min(0),
    assignment_mode: WorkOrderAssignmentModeSchema.nullable(),
    claimed_by: uuid.nullable(),
    can_claim: z.boolean(),
    can_execute: z.boolean(),
    can_review: z.boolean(),
  })
  .superRefine((row, ctx) => {
    if (
      (row.assignment_id === null) !== (row.assignment_version === 0) ||
      (row.assignment_id === null) !== (row.assignment_mode === null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["assignment_id"],
        message: "Tildelingens identitet stemmer ikke.",
      });
    if (
      row.can_claim &&
      (row.assignment_mode !== "pool" ||
        row.claimed_by !== null ||
        row.assignment_id === null ||
        row.can_execute)
    )
      ctx.addIssue({
        code: "custom",
        path: ["can_claim"],
        message: "Puljens aktuelle rettigheder stemmer ikke.",
      });
  });
export type MyWorkOrder = z.infer<typeof MyWorkOrderSchema>;
export const assignmentModeLabels: Record<WorkOrderAssignmentMode, string> = {
  person: "Person",
  group: "Arbejdsgruppe",
  pool: "Opgavepulje",
  unassigned: "Ingen tildeling",
};
