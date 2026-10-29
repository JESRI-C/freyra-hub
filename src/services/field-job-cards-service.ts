import { z } from "zod";
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
  if (error.code === "40001" || error.code === "23505")
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
export async function listFieldJobActions(scope: ProjectScope) {
  const db = await client(scope);
  const { data, error } = await db
    .from("actions")
    .select("id,title,status,action_type")
    .eq("project_id", scope.projectId)
    .order("id")
    .limit(501);
  if (error) failure(error);
  if ((data ?? []).length > 500)
    throw new Error("Projektet har over 500 opgaver. Jobkort kræver et afgrænset opgaveudvalg.");
  return (data ?? [])
    .filter((r) => r.action_type !== "workflow_followup")
    .map((r) => z.object({ id: uuid, title: z.string(), status: z.string().nullable() }).parse(r));
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
