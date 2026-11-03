import { z } from "zod";
import { WorkOrderEstimatedHoursSchema } from "@/lib/work-order-plan";
import { CalendarDate } from "@/lib/action-execution";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { assertProjectScope, type ProjectScope } from "./project-workspace-service";
import {
  FieldJobTemplateDefinitionSchema,
  FieldJobTemplateVersionSchema,
  FieldJobVersionSchema,
  validateFieldJobValues,
  type FieldJobTemplateDefinition,
  type FieldJobValues,
} from "@/lib/field-job-cards";

const uuid = z.string().uuid();
async function client(scope: ProjectScope) {
  uuid.parse(scope.organizationId);
  uuid.parse(scope.projectId);
  await assertProjectScope(scope);
  if (!supabase) throw new Error("Database er ikke konfigureret.");
  return supabase as unknown as SupabaseClient;
}
function failure(error: { code?: string; message?: string }): never {
  if (error.code === "PT410")
    throw new Error("Opgaven er aflyst. Du kan stadig se tidligere feltregistreringer.");
  if (error.code === "PT409" || error.code === "40001" || error.code === "23505")
    throw new Error("Jobkortet er ændret af en anden. Genindlæs før du gemmer en ny version.");
  if (error.code === "42P01" || error.code === "PGRST202" || error.code === "PGRST205")
    throw new Error("Jobkort er endnu ikke installeret i dette miljø.");
  throw new Error("Jobkort kunne ikke læses eller gemmes. Kontrollér adgang og input.");
}
function scopeRow<T extends { project_id: string; organization_id: string }>(
  scope: ProjectScope,
  row: T,
): T {
  if (row.project_id !== scope.projectId || row.organization_id !== scope.organizationId)
    throw new Error("Jobkortet tilhører en anden sag.");
  return row;
}
// PostgreSQL can store legacy action IDs without RFC version and variant bits.
const storedActionId = z.guid();
const fieldJobAction = z.object({
  id: storedActionId,
  title: z.string(),
  status: z.string().nullable(),
});

export async function listFieldJobActions(scope: ProjectScope, signal?: AbortSignal) {
  const db = await client(scope);
  const actions: z.infer<typeof fieldJobAction>[] = [];
  const pageSize = 200;
  let afterId: string | undefined;
  for (;;) {
    signal?.throwIfAborted();
    let query = db
      .from("actions")
      .select("id,title,status,action_type")
      .eq("project_id", scope.projectId)
      .order("id")
      .limit(pageSize);
    if (afterId) query = query.gt("id", afterId);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) failure(error);
    for (const row of data ?? []) {
      if (row.action_type !== "workflow_followup") actions.push(fieldJobAction.parse(row));
    }
    if (!data || data.length < pageSize) return actions;
    afterId = storedActionId.parse(data[data.length - 1].id);
  }
}
const scheduleRow = z.object({
  work_order_prerequisite_versions: z
    .array(
      z.object({
        prerequisite_action_id: uuid.nullable(),
        prerequisite_action_ids: z.array(uuid).max(12).nullable(),
      }),
    )
    .max(1),
  action_id: uuid,
  work_order_lifecycle_versions: z.array(z.object({ status: z.string() })).max(1),
  work_order_plan_versions: z
    .array(
      z.object({
        id: uuid,
        planned_start: CalendarDate.nullable(),
        planned_end: CalendarDate.nullable(),
        responsible_id: uuid.nullable(),
        estimated_hours: WorkOrderEstimatedHoursSchema.nullable(),
      }),
    )
    .max(1),
});

export async function listFieldJobSchedule(scope: ProjectScope) {
  const db = await client(scope);
  const dates: Record<
    string,
    {
      planVersionId: string;
      cancelled: boolean;
      waitingForActionIds: string[];
      start: string | null;
      end: string | null;
      responsibleId: string | null;
      estimatedHours: number | null;
    }
  > = {};
  const prerequisites = new Map<string, string[]>();
  const completed = new Set<string>();
  const pageSize = 200;
  let afterId: string | undefined;
  for (;;) {
    let query = db
      .from("work_orders")
      .select(
        "action_id,work_order_plan_versions(id,planned_start,planned_end,responsible_id,estimated_hours:plan->estimatedHours),work_order_lifecycle_versions(status),work_order_prerequisite_versions(prerequisite_action_id,prerequisite_action_ids)",
      )
      .eq("organization_id", scope.organizationId)
      .eq("project_id", scope.projectId)
      .order("action_id")
      .order("version", { referencedTable: "work_order_plan_versions", ascending: false })
      .limit(1, { referencedTable: "work_order_plan_versions" })
      .order("version", { referencedTable: "work_order_lifecycle_versions", ascending: false })
      .limit(1, { referencedTable: "work_order_lifecycle_versions" })
      .order("version", { referencedTable: "work_order_prerequisite_versions", ascending: false })
      .limit(1, { referencedTable: "work_order_prerequisite_versions" })
      .limit(pageSize);
    if (afterId) query = query.gt("action_id", afterId);
    const { data, error } = await query;
    if (error) throw new Error("Planoversigten kunne ikke hentes. Prøv igen.");
    const rows = z.array(scheduleRow).parse(data);
    for (const row of rows) {
      const status = row.work_order_lifecycle_versions[0]?.status;
      if (status === "performed" || status === "submitted" || status === "approved") {
        completed.add(row.action_id);
      }
      const dependency = row.work_order_prerequisite_versions[0];
      const prerequisite =
        dependency?.prerequisite_action_ids ??
        (dependency?.prerequisite_action_id ? [dependency.prerequisite_action_id] : []);
      if (prerequisite.length && (!status || ["draft", "planned", "assigned"].includes(status))) {
        prerequisites.set(row.action_id, prerequisite);
      }
      const plan = row.work_order_plan_versions[0];
      if (plan)
        dates[row.action_id] = {
          planVersionId: plan.id,
          cancelled: status === "cancelled",
          waitingForActionIds: [],
          start: plan.planned_start,
          end: plan.planned_end,
          responsibleId: plan.responsible_id,
          estimatedHours: plan.estimated_hours,
        };
    }
    if (rows.length < pageSize) break;
    afterId = rows[rows.length - 1].action_id;
  }
  for (const [actionId, prerequisiteIds] of prerequisites) {
    const plan = dates[actionId];
    if (plan) plan.waitingForActionIds = prerequisiteIds.filter((id) => !completed.has(id));
  }
  return dates;
}
export async function listFieldJobTemplates(scope: ProjectScope) {
  const db = await client(scope);
  const { data, error } = await db
    .from("field_job_template_versions")
    .select("*")
    .eq("project_id", scope.projectId)
    .eq("organization_id", scope.organizationId)
    .order("version", { ascending: false })
    .limit(1001);
  if (error) failure(error);
  if ((data ?? []).length > 1000)
    throw new Error("Skabelonhistorikken kræver et afgrænset udvalg. Ingen versioner er skjult.");
  return (data ?? []).map((r) => scopeRow(scope, FieldJobTemplateVersionSchema.parse(r)));
}
export async function listFieldJobVersions(scope: ProjectScope, actionId: string) {
  const db = await client(scope);
  uuid.parse(actionId);
  const { data, error } = await db
    .from("field_job_versions")
    .select("*")
    .eq("project_id", scope.projectId)
    .eq("organization_id", scope.organizationId)
    .eq("action_id", actionId)
    .order("version", { ascending: false })
    .limit(100);
  if (error) failure(error);
  return (data ?? []).map((r) => {
    const row = scopeRow(scope, FieldJobVersionSchema.parse(r));
    if (row.action_id !== actionId) throw new Error("Forkert jobkortreference.");
    return row;
  });
}
export async function saveFieldJobTemplate(
  scope: ProjectScope,
  input: {
    templateId: string;
    definition: FieldJobTemplateDefinition;
    expectedVersion: number;
    requestId: string;
  },
) {
  const definition = FieldJobTemplateDefinitionSchema.parse(input.definition);
  uuid.parse(input.templateId);
  uuid.parse(input.requestId);
  z.number().int().nonnegative().parse(input.expectedVersion);
  const db = await client(scope);
  const { data, error } = await db.rpc("save_field_job_template_version", {
    p_organization_id: scope.organizationId,
    p_project_id: scope.projectId,
    p_template_id: input.templateId,
    p_expected_version: input.expectedVersion,
    p_definition: definition,
    p_request_id: input.requestId,
  });
  if (error) failure(error);
  if (!Array.isArray(data) || data.length !== 1)
    throw new Error("Skabelonens modtagelse kunne ikke verificeres.");
  const row = scopeRow(scope, FieldJobTemplateVersionSchema.parse(data[0]));
  if (row.template_id !== input.templateId || row.request_id !== input.requestId)
    throw new Error("Skabelonkvitteringen matcher ikke anmodningen.");
  return row;
}
export async function saveFieldJobVersion(
  scope: ProjectScope,
  input: {
    actionId: string;
    templateVersionId: string;
    values: FieldJobValues;
    status: "draft" | "recorded" | "needs_review";
    correctionReason: string;
    expectedVersion: number;
    requestId: string;
  },
) {
  uuid.parse(input.actionId);
  uuid.parse(input.templateVersionId);
  uuid.parse(input.requestId);
  z.number().int().nonnegative().parse(input.expectedVersion);
  const status = z.enum(["draft", "recorded", "needs_review"]).parse(input.status);
  const reason = z.string().trim().max(2000).parse(input.correctionReason);
  if (input.expectedVersion > 0 && !reason) throw new Error("Angiv årsagen til rettelsen.");
  const db = await client(scope);
  const template = await db
    .from("field_job_template_versions")
    .select("*")
    .eq("id", input.templateVersionId)
    .eq("project_id", scope.projectId)
    .eq("organization_id", scope.organizationId)
    .single();
  if (template.error) failure(template.error);
  const definition = scopeRow(scope, FieldJobTemplateVersionSchema.parse(template.data)).definition;
  const values = validateFieldJobValues(definition, input.values);
  const { data, error } = await db.rpc("save_field_job_version", {
    p_organization_id: scope.organizationId,
    p_project_id: scope.projectId,
    p_action_id: input.actionId,
    p_template_version_id: input.templateVersionId,
    p_expected_version: input.expectedVersion,
    p_values: values,
    p_status: status,
    p_correction_reason: reason,
    p_request_id: input.requestId,
  });
  if (error) failure(error);
  if (!Array.isArray(data) || data.length !== 1)
    throw new Error("Jobkortets modtagelse kunne ikke verificeres.");
  const row = scopeRow(scope, FieldJobVersionSchema.parse(data[0]));
  if (
    row.action_id !== input.actionId ||
    row.template_version_id !== input.templateVersionId ||
    row.request_id !== input.requestId
  )
    throw new Error("Jobkortkvitteringen matcher ikke anmodningen.");
  validateFieldJobValues(definition, row.values);
  return row;
}
