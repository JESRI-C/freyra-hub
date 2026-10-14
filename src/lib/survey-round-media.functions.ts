import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "@/lib/project-nature-access.server";
import { executeGetSurveyRound, type SurveyRoundClient } from "@/lib/survey-round.functions";
import {
  executeGetCanonicalDroneMediaUrl,
  type CanonicalDroneMediaClient,
  type CanonicalDroneMediaUrl,
} from "@/lib/canonical-drone-media.functions";
import {
  canonicalDroneMediaReference,
  validateCanonicalDroneMediaRead,
  type CanonicalDroneMediaReference,
} from "@/services/monitoring/canonical-drone-media-reference";
import { parseStoredDroneOriginalValidation } from "@/services/monitoring/drone-original-validation.server";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";
import {
  buildSurveyRoundMediaManifestV1,
  GetSurveyRoundMediaInputSchema,
  ListSurveyRoundMediaInputSchema,
  SaveSurveyRoundMediaInputSchema,
  surveyRoundMediaCanonicalText,
  surveyRoundMediaVersionFromRow,
  type ListSurveyRoundMediaInput,
  type SaveSurveyRoundMediaInput,
  type SurveyRoundMediaManifest,
  type SurveyRoundMediaVersion,
} from "@/services/baseline/survey-round-media-persistence";

export const SaveSurveyRoundMediaEnvelopeSchema = SaveSurveyRoundMediaInputSchema.extend({
  expectedCallerUserId: SaveSurveyRoundMediaInputSchema.shape.projectId,
}).strict();
export type SaveSurveyRoundMediaEnvelope = z.infer<typeof SaveSurveyRoundMediaEnvelopeSchema>;
export const ListSurveyRoundMediaCandidatesInputSchema = z
  .object({
    projectId: SaveSurveyRoundMediaInputSchema.shape.projectId,
    beforeId: SaveSurveyRoundMediaInputSchema.shape.mediaId.optional(),
    limit: z.number().int().min(1).max(30).default(30),
  })
  .strict();
export interface SurveyRoundMediaCandidate {
  mediaId: string;
  fileName: string;
  originalSha256: string;
  originalValidationSha256: string;
  originalValidationStatus: "raw_original_validated" | "review_required";
  sizeBytes: number;
}
export interface SurveyRoundMediaDependencies {
  authorize(
    client: ProjectAuthorizationClient,
    actorId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  loadRound(
    client: SurveyRoundClient,
    actorId: string,
    projectId: string,
    roundId: string,
  ): Promise<SurveyRoundVersion | null>;
  loadOriginal(
    client: SurveyRoundClient,
    projectId: string,
    mediaId: string,
  ): Promise<{ media: CanonicalDroneMediaReference; validation: unknown }>;
  loadBinding(
    client: SurveyRoundClient,
    projectId: string,
    bindingId: string,
  ): Promise<unknown | null>;
  listBindings(
    client: SurveyRoundClient,
    input: z.infer<typeof ListSurveyRoundMediaInputSchema>,
  ): Promise<unknown[]>;
  listCandidates(
    client: SurveyRoundClient,
    input: z.infer<typeof ListSurveyRoundMediaCandidatesInputSchema>,
  ): Promise<unknown[]>;
  getWriter(): Promise<SurveyRoundClient>;
  prepare(
    writer: SurveyRoundClient,
    projectId: string,
    actorId: string,
    media: CanonicalDroneMediaReference,
  ): Promise<void>;
  persist(
    writer: SurveyRoundClient,
    input: SaveSurveyRoundMediaInput,
    actorId: string,
    manifest: SurveyRoundMediaManifest,
  ): Promise<unknown>;
  sign(
    client: CanonicalDroneMediaClient,
    actorId: string,
    projectId: string,
    mediaId: string,
  ): Promise<CanonicalDroneMediaUrl>;
}
async function readOne(client: SurveyRoundClient, table: string, projectId: string, id: string) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .eq("project_id", projectId)
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new Error("Billedtilknytningens gemte input kunne ikke læses med din aktuelle adgang.");
  return data;
}
/** Immutable provenance only: lifecycle status is neither required nor fabricated. */
function historicalOriginalUploadBinding(value: unknown, media: CanonicalDroneMediaReference) {
  const Uuid = SaveSurveyRoundMediaInputSchema.shape.projectId;
  const upload = z
    .object({
      id: Uuid,
      project_id: Uuid,
      uploaded_by: Uuid,
      file_name: z.string().min(1).max(180),
      original_file_name: z.string().min(1).max(255),
      file_size: z
        .number()
        .int()
        .positive()
        .max(32 * 1024 * 1024),
      mime_type: z.literal("image/jpeg"),
      upload_type: z.literal("drone_photo"),
      storage_path: z.string().min(1),
      intent_request_id: Uuid,
      received_at: z.string().datetime({ offset: true }),
    })
    .parse(value);
  if (
    upload.id !== media.source_upload_id ||
    upload.project_id !== media.project_id ||
    upload.storage_path !== media.file_path ||
    upload.file_size !== media.file_size_bytes ||
    upload.storage_path !== `${upload.uploaded_by}/intents/${upload.id}/${upload.file_name}` ||
    !/^[a-zA-Z0-9._-]+\.(jpg|jpeg)$/i.test(upload.file_name)
  )
    throw new Error("Originalens gemte uploadbinding matcher ikke den kanoniske provenance.");
  return upload;
}
const DEFAULTS: SurveyRoundMediaDependencies = {
  authorize: requireProjectNatureAccess,
  loadRound: (client, actorId, projectId, roundVersionId) =>
    executeGetSurveyRound({ projectId, roundVersionId }, actorId, client),
  loadOriginal: async (client, projectId, mediaId) => {
    const media = canonicalDroneMediaReference(
      await readOne(client, "project_media", projectId, mediaId),
      projectId,
      mediaId,
    );
    const value = await readOne(client, "uploads", projectId, media.source_upload_id);
    const upload = historicalOriginalUploadBinding(value, media);
    const raw = z
      .object({
        original_validation: z.unknown(),
        original_validation_sha256: z.string(),
      })
      .parse(value);
    if (raw.original_validation_sha256 !== media.original_validation_sha256)
      throw new Error("Originalens gemte serverkontrol er ændret.");
    const validation = await parseStoredDroneOriginalValidation(
      raw.original_validation,
      raw.original_validation_sha256,
      upload,
    );
    return { media, validation };
  },
  loadBinding: (client, projectId, bindingId) =>
    readOne(client, "survey_round_media_versions", projectId, bindingId),
  listBindings: async (client, input) => {
    let query = client
      .from("survey_round_media_versions")
      .select("*")
      .eq("project_id", input.projectId);
    if (input.roundVersionId) query = query.eq("round_version_id", input.roundVersionId);
    if (input.mediaId) query = query.eq("media_id", input.mediaId);
    if (input.beforeVersion) query = query.lt("version_no", input.beforeVersion);
    const { data, error } = await query
      .order("version_no", { ascending: false })
      .limit(input.limit + 1);
    if (error || !Array.isArray(data))
      throw new Error("De gemte billedtilknytninger kunne ikke læses.");
    return data;
  },
  listCandidates: async (client, input) => {
    let query = client
      .from("project_media")
      .select("*")
      .eq("project_id", input.projectId)
      .eq("original_role", "drone_original");
    if (input.beforeId) query = query.lt("id", input.beforeId);
    const { data, error } = await query.order("id", { ascending: false }).limit(input.limit + 1);
    if (error || !Array.isArray(data))
      throw new Error("De kanoniske originaler kunne ikke læses med din aktuelle adgang.");
    return data;
  },
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as SurveyRoundClient;
  },
  prepare: async (writer, projectId, actorId, media) => {
    const { data, error } = await writer.rpc("prepare_project_media_original_read", {
      p_project_id: projectId,
      p_media_id: media.id,
      p_actor_id: actorId,
    });
    if (error || !data)
      throw new Error("Originalens aktuelle filversion eller projektadgang kunne ikke bekræftes.");
    validateCanonicalDroneMediaRead(data, media);
  },
  persist: async (writer, input, actorId, manifest) => {
    const { data, error } = await writer.rpc("persist_survey_round_media", {
      p_project_id: input.projectId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_round_version_id: input.roundVersionId,
      p_round_sha256: input.roundSha256,
      p_media_id: input.mediaId,
      p_manifest_text: surveyRoundMediaCanonicalText(manifest),
    });
    if (error || !data)
      throw new Error(
        "Billedtilknytningen blev ikke gemt. Kontrollér filversion, adgang og eventuel tidligere tilknytning.",
      );
    return data;
  },
  sign: (client, actorId, projectId, mediaId) =>
    executeGetCanonicalDroneMediaUrl({ projectId, mediaId }, actorId, client),
};
export async function executeGetSurveyRoundMediaAccess(
  raw: { projectId: string },
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundMediaDependencies> = {},
) {
  const input = GetSurveyRoundMediaInputSchema.omit({ bindingId: true }).parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  const access = await deps.authorize(
    client as unknown as ProjectAuthorizationClient,
    actorId,
    input.projectId,
  );
  return {
    projectId: input.projectId,
    userId: actorId,
    canAssign: access.canPersist || access.role === "field",
  };
}
export async function executeListSurveyRoundMediaCandidates(
  raw: z.input<typeof ListSurveyRoundMediaCandidatesInputSchema>,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundMediaDependencies> = {},
) {
  const input = ListSurveyRoundMediaCandidatesInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  const rows = await deps.listCandidates(client, input);
  if (rows.length > input.limit + 1) throw new Error("Databasen returnerede for mange originaler.");
  const references = rows.map((row) => {
    const id = z.object({ id: SaveSurveyRoundMediaInputSchema.shape.mediaId }).parse(row).id;
    return canonicalDroneMediaReference(row, input.projectId, id);
  });
  if (
    new Set(references.map((row) => row.id)).size !== references.length ||
    references.some(
      (row, index) =>
        (input.beforeId && row.id >= input.beforeId) ||
        (index > 0 && references[index - 1].id <= row.id),
    )
  )
    throw new Error("Originalernes sag, filtre eller rækkefølge matcher ikke.");
  const items: SurveyRoundMediaCandidate[] = references.slice(0, input.limit).map((row) => ({
    mediaId: row.id,
    fileName: row.file_path.split("/").at(-1)!,
    originalSha256: row.original_sha256,
    originalValidationSha256: row.original_validation_sha256,
    originalValidationStatus: row.original_validation_status,
    sizeBytes: row.file_size_bytes,
  }));
  return {
    items,
    nextBeforeId: references.length > input.limit ? items.at(-1)!.mediaId : null,
  };
}
async function inputs(
  deps: SurveyRoundMediaDependencies,
  client: SurveyRoundClient,
  actorId: string,
  projectId: string,
  roundVersionId: string,
  mediaId: string,
) {
  const round = await deps.loadRound(client, actorId, projectId, roundVersionId);
  if (!round || round.id !== roundVersionId || round.projectId !== projectId)
    throw new Error("Vælg en gemt registreringsrunde i denne sag.");
  const original = await deps.loadOriginal(client, projectId, mediaId);
  canonicalDroneMediaReference(original.media, projectId, mediaId);
  return { round, ...original };
}
export async function executeSaveSurveyRoundMediaForCaller(
  raw: SaveSurveyRoundMediaEnvelope,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundMediaDependencies> = {},
): Promise<SurveyRoundMediaVersion> {
  const envelope = SaveSurveyRoundMediaEnvelopeSchema.parse(raw);
  if (envelope.expectedCallerUserId !== actorId)
    throw new Error("Login er ændret. Genåbn billedtilknytningen under den aktuelle bruger.");
  const { expectedCallerUserId: _hint, ...input } = envelope;
  const deps = { ...DEFAULTS, ...overrides };
  const access = await deps.authorize(
    client as unknown as ProjectAuthorizationClient,
    actorId,
    input.projectId,
  );
  if (!access.canPersist && access.role !== "field")
    throw new Error("Du har ikke rettighed til at tilknytte billeder til registreringsrunden.");
  const { round, media, validation } = await inputs(
    deps,
    client,
    actorId,
    input.projectId,
    input.roundVersionId,
    input.mediaId,
  );
  const manifest = await buildSurveyRoundMediaManifestV1(input, round, media, validation);
  const writer = await deps.getWriter();
  await deps.prepare(writer, input.projectId, actorId, media);
  // SQL repeats current role/object checks under locks, including every retry.
  const row = await deps.persist(writer, input, actorId, manifest);
  const result = await surveyRoundMediaVersionFromRow(row, round, media, validation);
  if (
    result.projectId !== input.projectId ||
    result.createdBy !== actorId ||
    result.requestId !== input.requestId ||
    surveyRoundMediaCanonicalText(result.manifest) !== surveyRoundMediaCanonicalText(manifest)
  )
    throw new Error("Databasen bekræftede ikke den ønskede billedtilknytning.");
  return result;
}
const BindingIdentity = z.object({
  id: SaveSurveyRoundMediaInputSchema.shape.mediaId,
  project_id: SaveSurveyRoundMediaInputSchema.shape.projectId,
  round_version_id: SaveSurveyRoundMediaInputSchema.shape.roundVersionId,
  media_id: SaveSurveyRoundMediaInputSchema.shape.mediaId,
  version_no: z.number().int().positive(),
});
async function replay(
  row: unknown,
  deps: SurveyRoundMediaDependencies,
  client: SurveyRoundClient,
  actorId: string,
  projectId: string,
) {
  const identity = BindingIdentity.parse(row);
  if (identity.project_id !== projectId)
    throw new Error("Billedtilknytningen matcher ikke denne sag.");
  const { round, media, validation } = await inputs(
    deps,
    client,
    actorId,
    projectId,
    identity.round_version_id,
    identity.media_id,
  );
  return surveyRoundMediaVersionFromRow(row, round, media, validation);
}
export async function executeGetSurveyRoundMedia(
  raw: z.infer<typeof GetSurveyRoundMediaInputSchema>,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundMediaDependencies> = {},
) {
  const input = GetSurveyRoundMediaInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  const row = await deps.loadBinding(client, input.projectId, input.bindingId);
  if (!row) return null;
  if (BindingIdentity.parse(row).id !== input.bindingId)
    throw new Error("Den gemte billedtilknytning matcher ikke den valgte version.");
  return replay(row, deps, client, actorId, input.projectId);
}
export async function executeListSurveyRoundMedia(
  raw: ListSurveyRoundMediaInput,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundMediaDependencies> = {},
) {
  const input = ListSurveyRoundMediaInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  const rows = await deps.listBindings(client, input);
  if (rows.length > input.limit + 1)
    throw new Error("Databasen returnerede for mange billedtilknytninger.");
  const ids = rows.map((row) => BindingIdentity.parse(row));
  if (
    new Set(ids.map((id) => id.id)).size !== ids.length ||
    ids.some(
      (id, index) =>
        id.project_id !== input.projectId ||
        (input.roundVersionId && id.round_version_id !== input.roundVersionId) ||
        (input.mediaId && id.media_id !== input.mediaId) ||
        (input.beforeVersion && id.version_no >= input.beforeVersion) ||
        (index > 0 && ids[index - 1].version_no <= id.version_no),
    )
  )
    throw new Error("Billedtilknytningernes sag, filtre eller rækkefølge matcher ikke.");
  const items: SurveyRoundMediaVersion[] = [];
  for (const row of rows.slice(0, input.limit))
    items.push(await replay(row, deps, client, actorId, input.projectId));
  return {
    items,
    nextBeforeVersion: rows.length > input.limit ? items.at(-1)!.version : null,
  };
}
/** Signing is separate from historical replay and always uses the existing caller-bound signer. */
export async function executeGetSurveyRoundMediaOriginalUrl(
  raw: z.infer<typeof GetSurveyRoundMediaInputSchema>,
  actorId: string,
  client: CanonicalDroneMediaClient & SurveyRoundClient,
  overrides: Partial<SurveyRoundMediaDependencies> = {},
) {
  const input = GetSurveyRoundMediaInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  const binding = await executeGetSurveyRoundMedia(input, actorId, client, deps);
  if (!binding) throw new Error("Billedtilknytningen blev ikke fundet med din aktuelle adgang.");
  const signed = await deps.sign(client, actorId, input.projectId, binding.mediaId);
  if (
    signed.projectId !== input.projectId ||
    signed.mediaId !== binding.mediaId ||
    signed.originalSha256 !== binding.manifest.originalSha256
  )
    throw new Error("Originalens aktuelle filversion matcher ikke billedtilknytningen.");
  return {
    ...signed,
    bindingId: binding.id,
    bindingSha256: binding.manifestSha256,
    currentStorageVersionChecked: true as const,
  };
}
export const saveSurveyRoundMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveSurveyRoundMediaEnvelopeSchema.parse(raw))
  .handler(({ data, context }) =>
    executeSaveSurveyRoundMediaForCaller(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const getSurveyRoundMediaAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    GetSurveyRoundMediaInputSchema.omit({ bindingId: true }).parse(raw),
  )
  .handler(({ data, context }) =>
    executeGetSurveyRoundMediaAccess(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const listSurveyRoundMediaCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListSurveyRoundMediaCandidatesInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeListSurveyRoundMediaCandidates(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const getSurveyRoundMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => GetSurveyRoundMediaInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeGetSurveyRoundMedia(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const listSurveyRoundMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListSurveyRoundMediaInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeListSurveyRoundMedia(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const getSurveyRoundMediaOriginalUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => GetSurveyRoundMediaInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeGetSurveyRoundMediaOriginalUrl(
      data,
      context.userId,
      context.supabase as unknown as CanonicalDroneMediaClient & SurveyRoundClient,
    ),
  );
