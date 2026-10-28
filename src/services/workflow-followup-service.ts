import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { WorkspaceEntrySchema, type WorkspaceEntry } from "@/lib/project-workspace";
import { latestExecutions } from "@/lib/action-execution";
import {
  WorkflowFollowupSchema,
  latestWorkflowFollowups,
  followupEntryId,
  executionFollowupCandidates,
  type FollowupCandidate,
  type WorkflowFollowup,
} from "@/lib/workflow-followup";
import { assertProjectScope, type ProjectScope } from "./project-workspace-service";
import { listActionExecutions } from "./action-execution-service";
import {
  listPhotoComparisons,
  latestPhotoComparisons,
  inspectPhotoComparison,
} from "./photo-comparison-service";
export async function listWorkflowFollowups(scope: ProjectScope) {
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
      .like("payload->>source", "workflow-followup:%")
      .order("created_at")
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    entries.push(...(data ?? []).map((row) => WorkspaceEntrySchema.parse(row)));
    if (!data || data.length < 500) break;
  }
  latestWorkflowFollowups(entries);
  return entries;
}
export async function saveWorkflowFollowup(
  scope: ProjectScope,
  input: WorkflowFollowup,
  previous?: WorkspaceEntry,
) {
  const followup = WorkflowFollowupSchema.parse(input);
  const entryId = await followupEntryId(scope.organizationId, scope.projectId, followup.eventKey);
  if (
    previous &&
    (previous.entry_id !== entryId ||
      previous.project_id !== scope.projectId ||
      previous.organization_id !== scope.organizationId ||
      previous.payload.source !== "workflow-followup:" + entryId)
  )
    throw new Error("Opgaven tilhører en anden hændelse eller sag.");
  await assertProjectScope(scope);
  if (!supabase) throw new Error("Database er ikke konfigureret.");
  const sources = await (supabase as unknown as SupabaseClient)
    .from("project_workspace_entries")
    .select("id")
    .eq("project_id", scope.projectId)
    .eq("organization_id", scope.organizationId)
    .in("id", followup.sourceIds);
  if (sources.error || sources.data?.length !== followup.sourceIds.length)
    throw new Error("Opgavens kildeversioner er ikke tilgængelige på sagen.");
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc(
    "save_workflow_followup_revision",
    {
      _entry_id: entryId,
      _organization_id: scope.organizationId,
      _project_id: scope.projectId,
      _expected_version: previous?.version ?? 0,
      _title: followup.title,
      _payload: {
        source: "workflow-followup:" + entryId,
        basis: followup.reason,
        decision: JSON.stringify(followup),
        uncertainty: "Intern dokumentationsopgave; ingen fysisk udførelse eller tilladelse.",
        owner: followup.assignee ?? "",
        alternatives: "",
      },
    },
  );
  if (error) throw new Error(error.message);
  return WorkspaceEntrySchema.parse(data);
}
/** Repeated events preserve assignment, dismissal and completion. Unique entry/version handles concurrency. */
export async function ensureWorkflowFollowups(
  scope: ProjectScope,
  candidates: FollowupCandidate[],
) {
  const current = latestWorkflowFollowups(await listWorkflowFollowups(scope));
  const known = new Map(current.map((r) => [r.followup.eventKey, r.entry]));
  for (const candidate of candidates) {
    if (known.has(candidate.eventKey)) continue;
    try {
      const saved = await saveWorkflowFollowup(scope, {
        schema: "freyra.workflow-followup/v1",
        ...candidate,
        status: "proposed",
        assignee: null,
        dueDate: null,
        notes: "",
        resolutionReason: "",
      });
      known.set(candidate.eventKey, saved);
    } catch (error) {
      const concurrent = latestWorkflowFollowups(await listWorkflowFollowups(scope)).find(
        (r) => r.followup.eventKey === candidate.eventKey,
      );
      if (!concurrent) throw error;
      known.set(candidate.eventKey, concurrent.entry);
    }
  }
  return [...known.values()];
}
export async function refreshWorkflowFollowups(scope: ProjectScope) {
  const [executionHistory, comparisonHistory] = await Promise.all([
    listActionExecutions(scope),
    listPhotoComparisons(scope),
  ]);
  const executions = latestExecutions(executionHistory),
    comparisons = latestPhotoComparisons(comparisonHistory);
  const candidates = executionFollowupCandidates(
    executions,
    new Set(comparisons.map((c) => c.comparison.executionRevisionId)),
  );
  for (const { entry, comparison } of comparisons) {
    const result = await inspectPhotoComparison(scope, comparison);
    if (result.assessment.gaps.length)
      candidates.push({
        eventKey:
          "comparison:" +
          entry.id +
          ":" +
          (executions.find((e) => e.execution.actionId === result.execution.execution.actionId)
            ?.entry.id ?? result.execution.entry.id),
        title: "Afklar fotopar og sammenlignelighed",
        reason: result.assessment.gaps.join(" "),
        sourceIds: [
          ...new Set([
            entry.id,
            result.execution.entry.id,
            ...(executions.find((e) => e.execution.actionId === result.execution.execution.actionId)
              ? [
                  executions.find(
                    (e) => e.execution.actionId === result.execution.execution.actionId,
                  )!.entry.id,
                ]
              : []),
          ]),
        ],
      });
  }
  return ensureWorkflowFollowups(scope, candidates);
}
