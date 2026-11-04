import { createActorBoundSupabaseClient, supabase } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFieldJobAccess } from "@/lib/field-job-access.functions";
import { getProjectWorkOrderAccess } from "@/lib/work-order-access.functions";
import { WorkOrderPlanVersionSchema } from "@/lib/work-order-plan";
import {
  FieldPhotoUploadPayload,
  FieldPhotoWorkOrderSchema,
  type FieldPhotoWorkOrder,
} from "@/lib/field-photo-upload";
import {
  FieldJobTemplateVersionSchema,
  FieldJobVersionSchema,
  validateFieldJobValues,
} from "@/lib/field-job-cards";
import {
  OfflineItemSchema,
  OfflineJobDraftSchema,
  FieldWorkPackSchema,
  sameOfflineValue,
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
  const access = await getFieldJobAccess({ data: { projectId } }).catch(async () => {
    // Server-function error serialization need not preserve the typed denial.
    // Confirm missing current project access under this actor's RLS; never infer
    // revocation from a transport failure or grant access through this fallback.
    const result = await createActorBoundSupabaseClient(actorId)
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    throw new OfflineSyncError(result.error === null && result.data === null ? "blocked" : "retry");
  });
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
  const [actions, templates, versions, plans] = await Promise.all([
    read("actions"),
    read("field_job_template_versions"),
    read("field_job_versions"),
    read("work_order_plan_versions"),
  ]);
  const templateRows = templates.map((t) => FieldJobTemplateVersionSchema.parse(t));
  const jobRows = versions.map((v) => FieldJobVersionSchema.parse(v));
  const planRows = plans.map((p) => WorkOrderPlanVersionSchema.parse(p));
  const jobs = actions
    .filter((a) => a.action_type !== "workflow_followup")
    .map((action) => {
      const rows = jobRows
        .filter((v) => v.action_id === action.id)
        .sort((a, b) => b.version - a.version);
      const latest = rows[0] ?? null;
      const template = latest
        ? (templateRows.find((t) => t.id === latest.template_version_id) ?? null)
        : null;
      if (latest && !template)
        throw new Error("Jobkortets præcise skabelon mangler. Pakken gemmes ikke delvist.");
      const plan = planRows
        .filter((p) => p.action_id === action.id)
        .sort((a, b) => b.version - a.version)[0];
      if (
        plan &&
        (plan.project_id !== projectId || plan.organization_id !== project.data.organization_id)
      )
        throw new Error("Planen tilhører en anden sag. Pakken blev ikke opdateret.");
      const required = plan?.plan.requiredJobCards ?? [];
      const cards = required.map((card) => {
        const found = templateRows.find(
          (t) =>
            t.id === card.templateVersionId &&
            t.template_id === card.templateId &&
            t.version === card.version &&
            sameOfflineValue(t.definition, card.definition),
        );
        if (!found)
          throw new Error(
            "Et påkrævet jobkort mangler sin præcise version. Opgavepakken blev ikke opdateret.",
          );
        return found;
      });
      const selected = new Set([...(template ? [template.id] : []), ...cards.map((t) => t.id)]);
      const registrations = rows.filter(
        (v, index) =>
          selected.has(v.template_version_id) &&
          !rows
            .slice(0, index)
            .some((prior) => prior.template_version_id === v.template_version_id),
      );
      return {
        actionId: String(action.id),
        title: String(action.title),
        latest,
        template,
        registrations,
        photoCaptureAllowed: false,
        ...(plan ? { plan: { id: plan.id, version: plan.version, plan: plan.plan } } : {}),
        ...(cards.length && plan
          ? {
              requirements: {
                planVersionId: plan.id,
                planVersion: plan.version,
                cards,
                canRecord: false,
              },
            }
          : {}),
      };
    });
  // Bound concurrency; the same task capability API is used by the online editor.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        if (!job.plan && !job.requirements) continue;
        const access = await getProjectWorkOrderAccess({
          data: { actionId: job.actionId, projectId, organizationId: project.data.organization_id },
        });
        if (
          access.user_id !== actorId ||
          access.action_id !== job.actionId ||
          access.project_id !== projectId ||
          access.organization_id !== project.data.organization_id
        )
          throw new Error("Opgavens adgang kunne ikke kontrolleres. Pakken blev ikke opdateret.");
        if (job.requirements) job.requirements.canRecord = access.can_execute;
        const capture = await db.rpc("get_work_order_photo_capture_access", {
          p_action_id: job.actionId,
          p_organization_id: project.data.organization_id,
          p_project_id: projectId,
        });
        const c = capture.data;
        if (
          capture.error ||
          !c ||
          c.actionId !== job.actionId ||
          c.organizationId !== project.data.organization_id ||
          c.projectId !== projectId ||
          c.actorId !== actorId ||
          typeof c.canCapture !== "boolean"
        )
          throw new Error(
            "Fotoets opgaveadgang kunne ikke kontrolleres. Pakken blev ikke opdateret.",
          );
        job.photoCaptureAllowed = !!job.plan && access.can_execute && c.canCapture;
      }
    }),
  );
  return FieldWorkPackSchema.parse({
    actorId,
    projectId,
    organizationId: project.data.organization_id,
    projectName: project.data.name,
    savedAt: Date.now(),
    jobs,
  });
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
  workOrder?: FieldPhotoWorkOrder,
): Promise<OfflinePhotoItem> {
  // Freeze the selected task before any asynchronous metadata/hash operation.
  const context = workOrder ? FieldPhotoWorkOrderSchema.parse(workOrder) : undefined;
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
    ...(context ? { workOrder: context } : {}),
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
  if (!job) throw new Error("Opgaven findes ikke i opgavepakken.");
  const input = raw as {
    values?: unknown;
    status?: unknown;
    correctionReason?: unknown;
    templateVersionId?: string;
    supersedesId?: string;
  };
  const template = [
    ...(job.template ? [job.template] : []),
    ...(job.requirements?.cards ?? []),
  ].find((t) => t.id === (input.templateVersionId ?? job.template?.id));
  if (!template) throw new Error("Jobkortet skal først have en skabelon i dashboardet.");
  const isRequired = job.requirements?.cards.some((card) => card.id === template.id) === true;
  if (isRequired && !job.requirements?.canRecord)
    throw new Error(
      "Du har ikke gemt udførelsesadgang til dette jobkort. Opdatér opgavepakken med net.",
    );
  const serverVersion = job.latest?.version ?? 0;
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
    serverVersion > parent.payload.expectedVersion + 1
  )
    throw new Error(
      "Serveren har en nyere version end den usendte registrering. Gennemgå køen før en ny registrering.",
    );
  const baseVersion =
    parent?.kind === "job"
      ? Math.max(serverVersion, parent.payload.expectedVersion + 1)
      : serverVersion;
  if (
    parent?.kind === "job" &&
    parent.state !== "complete" &&
    parent.payload.requiredPlanVersionId &&
    parent.payload.requiredPlanVersionId !== job.requirements?.planVersionId
  )
    throw new Error(
      "En usendt registrering bygger på en ældre plan. Synkronisér og gennemgå den bevarede kø, før du opretter en ny registrering.",
    );
  const payload = OfflineJobDraftSchema.parse({
    organizationId: pack.organizationId,
    actionId,
    templateVersionId: template.id,
    ...(isRequired ? { requiredPlanVersionId: job.requirements!.planVersionId } : {}),
    expectedVersion: baseVersion,
    values: validateFieldJobValues(template.definition, input.values),
    status: input.status,
    correctionReason: input.correctionReason,
  });
  return OfflineItemSchema.parse({
    ...initialQueueItem(pack.actorId, pack.projectId, Date.now()),
    kind: "job",
    ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
    payload,
    template,
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
        .rpc(
          item.payload.requiredPlanVersionId
            ? "save_field_job_version_for_plan"
            : "save_field_job_version",
          {
            p_organization_id: item.payload.organizationId,
            p_project_id: item.projectId,
            p_action_id: item.payload.actionId,
            p_template_version_id: item.payload.templateVersionId,
            p_expected_version: item.payload.expectedVersion,
            p_values: item.payload.values,
            p_status: item.payload.status,
            p_correction_reason: item.payload.correctionReason,
            p_request_id: item.id,
            ...(item.payload.requiredPlanVersionId
              ? { p_required_plan_version_id: item.payload.requiredPlanVersionId }
              : {}),
          },
        )
        .abortSignal(signal);
      if (result.error?.code === "PT410") throw new OfflineSyncError("cancelled");
      if (result.error)
        throw new OfflineSyncError(
          result.error.code === "PT409" ||
            result.error.code === "40001" ||
            result.error.code === "23505"
            ? "conflict"
            : ["42501", "22023", "23503"].includes(result.error.code)
              ? "blocked"
              : "retry",
        );
      if (!Array.isArray(result.data) || result.data.length !== 1)
        throw new OfflineSyncError("blocked");
      return result.data[0];
    },
  };
}
