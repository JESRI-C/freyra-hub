import { createActorBoundSupabaseClient, supabase } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFieldJobAccess } from "@/lib/field-job-access.functions";
import { FieldPhotoUploadPayload } from "@/lib/field-photo-upload";
import {
  FieldJobTemplateVersionSchema,
  FieldJobVersionSchema,
  validateFieldJobValues,
} from "@/lib/field-job-cards";
import {
  OfflineItemSchema,
  OfflineJobDraftSchema,
  type FieldWorkPack,
  type OfflineItem,
  type OfflinePhotoItem,
} from "@/lib/field-offline";
import { sha256, readOriginalMetadata } from "./monitoring/drone-ingest";
import { uploadFieldPhoto } from "./field-photo-upload-service";
import { OfflineSyncError, type FieldOfflineSyncDependencies } from "./field-offline-sync";

export async function requireOfflineOnlineActor(expected?: string) {
  if (!supabase) throw new OfflineSyncError("blocked");
  const result = await supabase.auth.getUser();
  if (result.error || !result.data.user)
    throw new OfflineSyncError(
      result.error?.status === 401 || result.error?.status === 403 ? "blocked" : "retry",
    );
  if (expected && result.data.user.id !== expected) throw new OfflineSyncError("blocked");
  return result.data.user.id;
}
export async function requireOfflineProjectAccess(actorId: string, projectId: string) {
  await requireOfflineOnlineActor(actorId);
  const access = await getFieldJobAccess({ data: { projectId } });
  if (access.userId !== actorId || access.projectId !== projectId || !access.canContribute)
    throw new OfflineSyncError("blocked");
}
export async function downloadFieldWorkPack(
  actorId: string,
  projectId: string,
): Promise<FieldWorkPack> {
  await requireOfflineProjectAccess(actorId, projectId);
  const db: SupabaseClient = createActorBoundSupabaseClient(actorId);
  const project = await db
    .from("projects")
    .select("id,name,organization_id")
    .eq("id", projectId)
    .single();
  if (project.error || !project.data?.organization_id || project.data.id !== projectId)
    throw new Error("Sagen kunne ikke gemmes på telefonen.");
  const read = async (table: string) => {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await db
        .from(table)
        .select("*")
        .eq("project_id", projectId)
        .order("id")
        .range(offset, offset + 499);
      if (result.error) throw new Error("Opgavepakken kunne ikke hentes fuldstændigt.");
      rows.push(...result.data);
      if (result.data.length < 500) return rows;
    }
  };
  const [actions, templates, versions] = await Promise.all([
    read("actions"),
    read("field_job_template_versions"),
    read("field_job_versions"),
  ]);
  const templateRows = templates.map((t) => FieldJobTemplateVersionSchema.parse(t));
  const jobRows = versions.map((v) => FieldJobVersionSchema.parse(v));
  return {
    actorId,
    projectId,
    organizationId: project.data.organization_id,
    projectName: project.data.name,
    savedAt: Date.now(),
    jobs: actions
      .filter((a) => a.action_type !== "workflow_followup")
      .map((action) => {
        const latest =
          jobRows
            .filter((v) => v.action_id === action.id)
            .sort((a, b) => b.version - a.version)[0] ?? null;
        const template = latest
          ? (templateRows.find((t) => t.id === latest.template_version_id) ?? null)
          : null;
        if (latest && !template)
          throw new Error("Jobkortets præcise skabelon mangler. Pakken gemmes ikke delvist.");
        return { actionId: String(action.id), title: String(action.title), latest, template };
      }),
  };
}
function initialQueueItem(actorId: string, projectId: string, now: number) {
  return {
    id: crypto.randomUUID(),
    actorId,
    projectId,
    createdAt: now,
    updatedAt: now,
    state: "queued" as const,
    attempts: 0,
    nextAttemptAt: 0,
    leaseId: null,
    leaseUntil: 0,
    lastError: null,
    dependsOn: null,
    receipt: null,
  };
}
export async function prepareOfflinePhoto(
  actorId: string,
  projectId: string,
  file: File,
  title: string,
  description: string,
): Promise<OfflinePhotoItem> {
  const metadata = await readOriginalMetadata(file);
  const original =
    metadata.latitude !== null && metadata.longitude !== null
      ? { lat: metadata.latitude, lng: metadata.longitude }
      : null;
  const payload = FieldPhotoUploadPayload.parse({
    title,
    description: description || null,
    category: "field_photo",
    tags: [],
    originalName: file.name,
    sha256: await sha256(file),
    sizeBytes: file.size,
    mimeType: file.type,
    capturedAt: metadata.capturedAt,
    capture: {
      schema: "freyra.field-photo/v1",
      originalPosition: original,
      initialPosition: original,
      correctionReason: "",
    },
  });
  return OfflineItemSchema.parse({
    ...initialQueueItem(actorId, projectId, Date.now()),
    kind: "photo",
    payload,
    fileLastModified: file.lastModified,
    originalBytes: file.size,
  }) as OfflinePhotoItem;
}
export function prepareOfflineJob(
  pack: FieldWorkPack,
  actionId: string,
  raw: unknown,
  previous: OfflineItem[],
) {
  const job = pack.jobs.find((j) => j.actionId === actionId);
  if (!job?.template || !job.latest)
    throw new Error("Jobkortet skal først have en skabelon i dashboardet.");
  // A new local revision depends on the preceding unsent revision for this exact task.
  const parent = previous
    .filter(
      (i) =>
        i.kind === "job" &&
        i.actorId === pack.actorId &&
        i.projectId === pack.projectId &&
        i.payload.actionId === actionId &&
        !["conflict", "blocked"].includes(i.state),
    )
    .sort(
      (a, b) =>
        (b.kind === "job" ? b.payload.expectedVersion : 0) -
          (a.kind === "job" ? a.payload.expectedVersion : 0) ||
        b.createdAt - a.createdAt ||
        b.id.localeCompare(a.id),
    )[0];
  if (
    parent?.kind === "job" &&
    parent.state !== "complete" &&
    job.latest.version > parent.payload.expectedVersion + 1
  )
    throw new Error(
      "Serveren har en nyere version end den usendte registrering. Gennemgå køen før en ny registrering.",
    );
  const baseVersion =
    parent?.kind === "job"
      ? Math.max(job.latest.version, parent.payload.expectedVersion + 1)
      : job.latest.version;
  const values = raw as { values?: unknown; status?: unknown; correctionReason?: unknown };
  const payload = OfflineJobDraftSchema.parse({
    organizationId: pack.organizationId,
    actionId,
    templateVersionId: job.template.id,
    expectedVersion: baseVersion,
    values: validateFieldJobValues(job.template.definition, values.values),
    status: values.status,
    correctionReason: values.correctionReason,
  });
  return OfflineItemSchema.parse({
    ...initialQueueItem(pack.actorId, pack.projectId, Date.now()),
    kind: "job",
    payload,
    template: job.template,
    originalBytes: 0,
    dependsOn: parent && parent.state !== "complete" ? parent.id : null,
  });
}
export function offlineSyncDependencies(
  isCurrent: () => boolean,
  progress: (id: string, percent: number) => void,
): FieldOfflineSyncDependencies {
  return {
    isCurrent,
    online: () => navigator.onLine && document.visibilityState !== "hidden",
    progress,
    authorize: requireOfflineProjectAccess,
    sendPhoto: (item, file, signal, onProgress) =>
      uploadFieldPhoto({
        projectId: item.projectId,
        uploadId: item.id,
        file,
        payload: item.payload,
        expectedActorId: item.actorId,
        signal,
        onProgress,
      }),
    sendJob: async (item, signal) => {
      if (signal.aborted || !isCurrent()) throw new OfflineSyncError("retry");
      const db: SupabaseClient = createActorBoundSupabaseClient(item.actorId);
      const result = await db
        .rpc("save_field_job_version", {
          p_organization_id: item.payload.organizationId,
          p_project_id: item.projectId,
          p_action_id: item.payload.actionId,
          p_template_version_id: item.payload.templateVersionId,
          p_expected_version: item.payload.expectedVersion,
          p_values: item.payload.values,
          p_status: item.payload.status,
          p_correction_reason: item.payload.correctionReason,
          p_request_id: item.id,
        })
        .abortSignal(signal);
      if (result.error)
        throw new OfflineSyncError(
          result.error.code === "40001" || result.error.code === "23505"
            ? "conflict"
            : result.error.code === "42501"
              ? "blocked"
              : "retry",
        );
      if (!Array.isArray(result.data) || result.data.length !== 1)
        throw new OfflineSyncError("blocked");
      return result.data[0];
    },
  };
}
