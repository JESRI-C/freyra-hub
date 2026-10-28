import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { WorkspaceEntrySchema, type WorkspaceEntry, latestEntries } from "@/lib/project-workspace";
import { latestExecutions, executionRevisions } from "@/lib/action-execution";
import {
  PhotoComparisonSchema,
  assessPhotoComparison,
  type PhotoComparison,
} from "@/lib/photo-comparison";
import {
  assertProjectScope,
  saveWorkspaceEntry,
  type ProjectScope,
} from "./project-workspace-service";
import { listActionExecutions } from "./action-execution-service";
import { getProjectMedia } from "./project-media-service";
export const comparisonSource = (id: string) => "photo-comparison:" + id;
export function comparisonRevisions(entries: WorkspaceEntry[]) {
  return entries
    .filter((e) => e.kind === "decision_note" && e.payload.source?.startsWith("photo-comparison:"))
    .map((entry) => {
      const comparison = PhotoComparisonSchema.parse(JSON.parse(entry.payload.decision));
      if (
        entry.payload.source !== comparisonSource(comparison.comparisonId) ||
        entry.entry_id !== comparison.comparisonId
      )
        throw new Error("Sammenligningens identitet er ugyldig.");
      return { entry, comparison };
    });
}
export async function listPhotoComparisons(scope: ProjectScope) {
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
      .like("payload->>source", "photo-comparison:%")
      .order("created_at")
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    entries.push(...(data ?? []).map((row) => WorkspaceEntrySchema.parse(row)));
    if (!data || data.length < 500) break;
  }
  comparisonRevisions(entries);
  return entries;
}
export async function inspectPhotoComparison(scope: ProjectScope, input: PhotoComparison) {
  const comparison = PhotoComparisonSchema.parse(input);
  await assertProjectScope(scope);
  const history = await listActionExecutions(scope);
  const exact = executionRevisions(history).find(
    (e) => e.entry.id === comparison.executionRevisionId,
  );
  if (!exact) throw new Error("Udførelsesversionen findes ikke på sagen.");
  const latest = latestExecutions(history).find(
    (e) => e.execution.actionId === exact.execution.actionId,
  );
  if (!latest) throw new Error("Aktuel udførelsesversion kunne ikke findes.");
  const [before, after] = await Promise.all([
    getProjectMedia(scope.projectId, comparison.beforeId),
    getProjectMedia(scope.projectId, comparison.afterId),
  ]);
  if (!before.data || !after.data) throw new Error("En original er ikke tilgængelig på sagen.");
  if (before.data.projectId !== scope.projectId || after.data.projectId !== scope.projectId)
    throw new Error("Originalerne tilhører en anden sag.");
  return {
    assessment: assessPhotoComparison(comparison, exact, latest, before.data, after.data),
    execution: exact,
    before: before.data,
    after: after.data,
  };
}
export async function savePhotoComparison(
  scope: ProjectScope,
  input: PhotoComparison,
  previous?: WorkspaceEntry,
) {
  const comparison = PhotoComparisonSchema.parse(input);
  const source = comparisonSource(comparison.comparisonId);
  if (
    previous &&
    (previous.payload.source !== source ||
      previous.project_id !== scope.projectId ||
      previous.organization_id !== scope.organizationId ||
      previous.kind !== "decision_note")
  )
    throw new Error("Den tidligere sammenligning tilhører en anden sag.");
  if (previous && !comparison.correctionReason) throw new Error("Angiv årsagen til rettelsen.");
  const inspected = await inspectPhotoComparison(scope, comparison);
  // Insufficient pairs may be saved as descriptive drafts with explicit gaps.
  const entry = await saveWorkspaceEntry(scope, {
    kind: "decision_note",
    title: "Før/efter · beskrivende sammenligning",
    entryId: comparison.comparisonId,
    previous,
    payload: {
      source,
      basis: comparison.samePlaceEvidence || "Samme sted er ikke dokumenteret.",
      decision: JSON.stringify(comparison),
      alternatives: "",
      owner: "",
      uncertainty:
        inspected.assessment.gaps.join(" ") ||
        "Beskrivende sammenligning; ingen kvantitativ effektberegning.",
    },
  });
  return { entry, ...inspected };
}
export const latestPhotoComparisons = (entries: WorkspaceEntry[]) =>
  comparisonRevisions(latestEntries(entries));
