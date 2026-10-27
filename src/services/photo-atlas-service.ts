import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import {
  getEvidenceFilesByProject,
  getEvidenceDownloadUrl,
  uploadEvidenceFile,
} from "./evidence-service";
import {
  assertProjectScope,
  saveWorkspaceEntry,
  type ProjectScope,
} from "./project-workspace-service";
import { latestEntries, WorkspaceEntrySchema, type WorkspaceEntry } from "@/lib/project-workspace";
import {
  ATLAS_EVIDENCE_TYPE,
  BASELINE_EVIDENCE_TYPE,
  AtlasReviewSchema,
  parsePhotoAtlas,
  type AtlasReview,
} from "@/lib/photo-atlas";

export async function listPhotoAtlasSources(scope: ProjectScope) {
  await assertProjectScope(scope);
  const evidence = await getEvidenceFilesByProject(scope.projectId);
  return evidence.filter((item) =>
    [ATLAS_EVIDENCE_TYPE, BASELINE_EVIDENCE_TYPE].includes(item.evidence_type ?? ""),
  );
}
export async function loadPhotoAtlas(scope: ProjectScope, evidenceId: string) {
  await assertProjectScope(scope);
  const link = await getEvidenceDownloadUrl({ projectId: scope.projectId, evidenceId });
  if (link.error || !link.data) throw new Error(link.error ?? "Fotoatlasset kunne ikke åbnes.");
  const response = await fetch(link.data, {
    credentials: "omit",
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error("Fotoatlassets private fil kunne ikke hentes.");
  const blob = await response.blob();
  if (blob.size > 100 * 1024 * 1024) throw new Error("Fotoatlasset overstiger 100 MB.");
  const bytes = await blob.arrayBuffer();
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { ...parsePhotoAtlas(new TextDecoder().decode(bytes)), evidenceId, checksum };
}
export async function importPhotoAtlas(
  scope: ProjectScope,
  file: File,
  onProgress?: (percentage: number) => void,
) {
  await assertProjectScope(scope);
  if (file.size > 100 * 1024 * 1024) throw new Error("Fotoatlasset overstiger 100 MB.");
  if (!/\.(html?|json)$/i.test(file.name))
    throw new Error("Vælg det eksisterende HTML-fotoatlas eller baseline-JSON.");
  const atlas = parsePhotoAtlas(await file.text(), file.name);
  const evidence = await uploadEvidenceFile({
    projectId: scope.projectId,
    title: atlas.title,
    evidenceType: /\.json$/i.test(file.name) ? BASELINE_EVIDENCE_TYPE : ATLAS_EVIDENCE_TYPE,
    file,
    onProgress,
  });
  if (!evidence) throw new Error("Fotoatlasset blev ikke gemt. Kontroller adgang og forbindelse.");
  return evidence;
}
export async function listPhotoAtlasReviews(scope: ProjectScope, evidenceId: string) {
  await assertProjectScope(scope);
  if (!supabase) throw new Error("Database er ikke konfigureret.");
  const all: WorkspaceEntry[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await (supabase as unknown as SupabaseClient)
      .from("project_workspace_entries")
      .select("*")
      .eq("project_id", scope.projectId)
      .eq("organization_id", scope.organizationId)
      .eq("kind", "decision_note")
      .like("payload->>source", `photo-atlas:${evidenceId}:%`)
      .order("created_at", { ascending: false })
      .range(offset, offset + 499);
    if (result.error)
      throw new Error("Fotogennemgangen kunne ikke indlæses: " + result.error.message);
    all.push(...(result.data ?? []).map((row) => WorkspaceEntrySchema.parse(row)));
    if (!result.data || result.data.length < 500) break;
  }
  latestPhotoAtlasReviews(all, evidenceId);
  return all;
}
export function latestPhotoAtlasReviews(entries: WorkspaceEntry[], evidenceId: string) {
  const reviews = new Map<string, { review: AtlasReview; entry: WorkspaceEntry }>();
  for (const entry of latestEntries(entries)) {
    const prefix = `photo-atlas:${evidenceId}:`;
    if (!entry.payload.source.startsWith(prefix)) continue;
    const photoId = entry.payload.source.slice(prefix.length);
    try {
      const review = AtlasReviewSchema.parse(JSON.parse(entry.payload.decision));
      const existing = reviews.get(photoId);
      if (!existing || existing.entry.created_at < entry.created_at)
        reviews.set(photoId, { review, entry });
    } catch {
      throw new Error(
        "En gemt fotogennemgang har et ugyldigt format. Genindlæs revisionssporet; den bruges ikke som godkendelse.",
      );
    }
  }
  return reviews;
}
export async function savePhotoAtlasReview(
  scope: ProjectScope,
  evidenceId: string,
  photoId: string,
  input: AtlasReview,
  previous?: WorkspaceEntry,
) {
  const review = AtlasReviewSchema.parse(input);
  const source = `photo-atlas:${evidenceId}:${photoId}`;
  if (previous && previous.payload.source !== source)
    throw new Error("Den tidligere vurdering tilhører et andet foto.");
  const decision = JSON.stringify(review);
  if (decision.length > 10000)
    throw new Error("Fotogennemgangen er for lang. Vedhæft længere dokumentation som en kilde.");
  return saveWorkspaceEntry(scope, {
    kind: "decision_note",
    title: `Fotogennemgang ${photoId}`,
    previous,
    payload: {
      basis: review.observation || "Fotogennemgang afventer beskrivelse.",
      alternatives: review.species,
      decision,
      uncertainty: review.natureConcerns,
      owner: review.reviewer,
      source,
    },
  });
}
