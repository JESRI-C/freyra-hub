import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import {
  ActionExecutionSchema,
  executionSource,
  executionRevisions,
  type ActionExecution,
} from "@/lib/action-execution";
import { WorkspaceEntrySchema, type WorkspaceEntry } from "@/lib/project-workspace";
import {
  assertProjectScope,
  saveWorkspaceEntry,
  type ProjectScope,
} from "./project-workspace-service";

/** Reuse existing actions and immutable decision notes; no second action or visit table. */
export async function listActionExecutions(scope: ProjectScope) {
  await assertProjectScope(scope);
  if (!supabase) throw new Error("Database er ikke konfigureret.");
  const entries: WorkspaceEntry[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await (supabase as unknown as SupabaseClient)
      .from("project_workspace_entries")
      .select("*")
      .eq("project_id", scope.projectId)
      .eq("organization_id", scope.organizationId)
      .eq("kind", "decision_note")
      .like("payload->>source", "action-execution:%")
      .order("created_at")
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    entries.push(...(data ?? []).map((row) => WorkspaceEntrySchema.parse(row)));
    if (!data || data.length < 500) break;
  }
  executionRevisions(entries); // A corrupt note is an explicit error, never a successful execution.
  return entries;
}
export async function saveActionExecution(
  scope: ProjectScope,
  input: ActionExecution,
  previous?: WorkspaceEntry,
) {
  const execution = ActionExecutionSchema.parse(input);
  const source = executionSource(execution.actionId);
  if (previous) {
    if (
      previous.kind !== "decision_note" ||
      previous.payload.source !== source ||
      previous.project_id !== scope.projectId ||
      previous.organization_id !== scope.organizationId
    )
      throw new Error("Den tidligere udførelse tilhører en anden handling eller sag.");
    if (!execution.correctionReason) throw new Error("Angiv årsagen til rettelsen.");
  }
  await assertProjectScope(scope);
  if (!supabase) throw new Error("Database er ikke konfigureret.");
  const db = supabase as unknown as SupabaseClient;
  const action = await db
    .from("actions")
    .select("id,action_type")
    .eq("id", execution.actionId)
    .eq("project_id", scope.projectId)
    .single();
  if (action.error || !action.data || action.data.action_type === "workflow_followup")
    throw new Error("Handlingen er ikke tilgængelig på sagen.");
  if (execution.surveyRoundId) {
    const round = await db
      .from("survey_round_versions")
      .select("id")
      .eq("id", execution.surveyRoundId)
      .eq("project_id", scope.projectId)
      .single();
    if (round.error || !round.data) throw new Error("Besøget er ikke tilgængeligt på sagen.");
  }
  if (execution.evidenceIds.length) {
    const evidence = await db
      .from("evidence_files")
      .select("id")
      .eq("project_id", scope.projectId)
      .in("id", execution.evidenceIds);
    if (evidence.error || evidence.data?.length !== execution.evidenceIds.length)
      throw new Error("Et bilag er ikke tilgængeligt på sagen.");
  }
  return saveWorkspaceEntry(scope, {
    kind: "decision_note",
    title:
      execution.workType === "weed_cutting"
        ? "Grødeskæring · " + (execution.stage === "performed" ? "udførelse" : "plan")
        : "Indsats · udførelsesregistrering",
    previous,
    entryId: execution.actionId,
    payload: {
      basis: execution.sourceReference || "Planlagt arbejde; faktisk udførelse ikke dokumenteret.",
      source,
      decision: JSON.stringify(execution),
      alternatives: "",
      uncertainty: execution.coverageDescription,
      owner: execution.performedBy ?? "",
    },
  });
}
