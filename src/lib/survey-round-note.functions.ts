import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "@/lib/project-nature-access.server";
import { parseHistoricalSurveyRoundMediaOriginalRows } from "@/lib/survey-round-media.functions";
import { baselineSnapshotFromRow } from "@/services/baseline/public-baseline-service";
import { createVerifiedInputContext } from "@/services/baseline/verified-input-context";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";
import {
  verificationPlanSummaryFromRow,
  verificationPlanVersionFromRow,
} from "@/services/baseline/verification-plan-persistence";
import {
  surveyRoundSummaryFromRow,
  surveyRoundVersionFromRow,
  type SurveyRoundVersion,
} from "@/services/baseline/survey-round-persistence";
import { surveyRoundMediaVersionFromRow } from "@/services/baseline/survey-round-media-persistence";
import {
  canonicalDroneMediaReference,
  validateCanonicalDroneMediaRead,
} from "@/services/monitoring/canonical-drone-media-reference";
import type { SurveyRoundClient } from "@/lib/survey-round.functions";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import type { VerificationPlanVersion } from "@/services/baseline/verification-plan-persistence";
import {
  buildSurveyRoundNoteManifestV1,
  GetSurveyRoundNoteInputSchema,
  ListSurveyRoundNotesInputSchema,
  SaveSurveyRoundNoteInputSchema,
  surveyRoundNoteCanonicalText,
  surveyRoundNoteVersionFromRow,
  type ListSurveyRoundNotesInput,
  type SaveSurveyRoundNoteInput,
  type SurveyRoundNoteManifest,
  type SurveyRoundNoteVersion,
} from "@/services/baseline/survey-round-note-persistence";
export const SaveSurveyRoundNoteEnvelopeSchema = SaveSurveyRoundNoteInputSchema.extend({
  expectedCallerUserId: SaveSurveyRoundNoteInputSchema.shape.projectId,
}).strict();
export type SaveSurveyRoundNoteEnvelope = z.infer<typeof SaveSurveyRoundNoteEnvelopeSchema>;
export interface SurveyRoundNoteDependencies {
  authorize(
    client: ProjectAuthorizationClient,
    actorId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  loadBinding(
    client: SurveyRoundClient,
    actorId: string,
    projectId: string,
    bindingId: string,
  ): Promise<SurveyRoundMediaVersion | null>;
  loadPlan(
    client: SurveyRoundClient,
    actorId: string,
    projectId: string,
    planId: string,
  ): Promise<VerificationPlanVersion | null>;
  loadNote(client: SurveyRoundClient, projectId: string, id: string): Promise<unknown | null>;
  listNotes(
    client: SurveyRoundClient,
    input: z.output<typeof ListSurveyRoundNotesInputSchema>,
  ): Promise<unknown[]>;
  getWriter(): Promise<SurveyRoundClient>;
  prepare(
    writer: SurveyRoundClient,
    projectId: string,
    actorId: string,
    binding: SurveyRoundMediaVersion,
  ): Promise<void>;
  persist(
    writer: SurveyRoundClient,
    input: SaveSurveyRoundNoteInput,
    actorId: string,
    manifest: SurveyRoundNoteManifest,
  ): Promise<unknown>;
}
const Identity = z.object({
  id: SaveSurveyRoundNoteInputSchema.shape.projectId,
  project_id: SaveSurveyRoundNoteInputSchema.shape.projectId,
  media_binding_id: SaveSurveyRoundNoteInputSchema.shape.mediaBindingId,
  round_version_id: SaveSurveyRoundNoteInputSchema.shape.roundVersionId,
  version_no: z.number().int().positive(),
});

function frozenDetached<T>(value: T): T {
  const detached = structuredClone(value);
  const freeze = (node: unknown) => {
    if (node !== null && typeof node === "object") {
      for (const child of Object.values(node)) freeze(child);
      Object.freeze(node);
    }
  };
  freeze(detached);
  return detached;
}

/** Private to one already-authorized execution; no access decision or current Storage state is stored. */
function createAuthorizedNoteReader(
  client: SurveyRoundClient,
  actorId: string,
  projectId: string,
): Pick<SurveyRoundNoteDependencies, "loadBinding" | "loadPlan"> & {
  preloadBindings(ids: string[]): Promise<void>;
} {
  const context = createVerifiedInputContext();
  const rows = new Map<string, Promise<unknown | null>>();
  const baselines = new Map<string, Promise<PublicBaselineSnapshot>>();
  const plans = new Map<string, Promise<VerificationPlanVersion | null>>();
  const rounds = new Map<string, Promise<SurveyRoundVersion>>();
  const uploads = new Map<string, Promise<unknown>>();
  const mediaRows = new Map<string, Promise<ReturnType<typeof canonicalDroneMediaReference>>>();
  const missingMedia = new Set<string>();
  const missingUploads = new Set<string>();
  const originals = new Map<
    string,
    Promise<Awaited<ReturnType<typeof parseHistoricalSurveyRoundMediaOriginalRows>>>
  >();
  const bindings = new Map<string, Promise<SurveyRoundMediaVersion | null>>();
  function memo<T>(cache: Map<string, Promise<T>>, key: string, read: () => Promise<T>) {
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = read();
    cache.set(key, pending);
    return pending;
  }
  async function readOne(table: string, id: string, columns = "*") {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq("project_id", projectId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Notens gemte input kunne ikke læses med din aktuelle adgang.");
    if (!data) return null;
    if (table === "uploads") return historicalUpload(data);
    if (table === "project_media")
      return frozenDetached(canonicalDroneMediaReference(data, projectId, id));
    return frozenDetached(data);
  }
  const uploadColumns =
    "id,project_id,uploaded_by,file_name,original_file_name,file_size,mime_type,upload_type,storage_path,intent_request_id,received_at,original_validation,original_validation_sha256";
  const bindingIdentity = z.object({
    id: SaveSurveyRoundNoteInputSchema.shape.mediaBindingId,
    project_id: SaveSurveyRoundNoteInputSchema.shape.projectId,
    round_version_id: SaveSurveyRoundNoteInputSchema.shape.roundVersionId,
    media_id: SaveSurveyRoundNoteInputSchema.shape.mediaBindingId,
  });
  function historicalUpload(value: unknown) {
    // Project only saved provenance/validation. A lifecycle getter must never be evaluated.
    const selected = z
      .object({
        id: z.unknown(),
        project_id: z.unknown(),
        uploaded_by: z.unknown(),
        file_name: z.unknown(),
        original_file_name: z.unknown(),
        file_size: z.unknown(),
        mime_type: z.unknown(),
        upload_type: z.unknown(),
        storage_path: z.unknown(),
        intent_request_id: z.unknown(),
        received_at: z.unknown(),
        original_validation: z.unknown(),
        original_validation_sha256: z.unknown(),
      })
      .parse(value);
    return frozenDetached(selected);
  }
  async function batchRows(table: string, requestedIds: string[], columns = "*") {
    const ids = [...new Set(requestedIds)];
    if (ids.length === 0) return [];
    if (ids.length > 30) throw new Error("Notens inputside overskrider den tilladte størrelse.");
    const query = client.from(table).select(columns).eq("project_id", projectId) as unknown as {
      in(column: string, values: string[]): PromiseLike<{ data: unknown; error: unknown }>;
    };
    const { data, error } = await query.in("id", ids);
    if (error || !Array.isArray(data) || data.length > ids.length)
      throw new Error("Noternes gemte input kunne ikke læses med din aktuelle adgang.");
    const identity = z.object({
      id: SaveSurveyRoundNoteInputSchema.shape.mediaBindingId,
      project_id: SaveSurveyRoundNoteInputSchema.shape.projectId,
    });
    const identities = data.map((row) => identity.parse(row));
    if (
      new Set(identities.map((row) => row.id)).size !== identities.length ||
      identities.some((row) => row.project_id !== projectId || !ids.includes(row.id))
    )
      throw new Error("Noternes inputside matcher ikke de valgte versioner og sagen.");
    // Detach every batch result before returning across an await boundary. Preload
    // planning must use the same snapshots as replay, including the parallel
    // canonical-media/upload batches. Upload lifecycle is never copied or read.
    return Object.freeze(
      data.map((row) => {
        if (table === "uploads") return historicalUpload(row);
        if (table === "project_media") {
          const id = identity.parse(row).id;
          return frozenDetached(canonicalDroneMediaReference(row, projectId, id));
        }
        return frozenDetached(row);
      }),
    );
  }
  async function seedImmutable(table: string, ids: string[]) {
    const loaded = await batchRows(table, ids);
    const byId = new Map(loaded.map((row) => [(row as { id: string }).id, row]));
    for (const id of new Set(ids)) {
      const key = `${table}:${id}`;
      if (rows.has(key)) throw new Error("Notens inputside må kun indlæses én gang.");
      rows.set(key, Promise.resolve(byId.get(id) ?? null));
    }
    return loaded;
  }
  function immutableRow(table: string, id: string) {
    return memo(rows, `${table}:${id}`, () => readOne(table, id));
  }
  function baseline(id: string) {
    return memo(baselines, id, async () => {
      const row = await immutableRow("project_baseline_snapshots", id);
      if (!row) throw new Error("Notens gemte baseline blev ikke fundet.");
      const parsed = await baselineSnapshotFromRow(row, context);
      return context.verifyBaseline(parsed, projectId, id);
    });
  }
  function plan(id: string) {
    return memo(plans, id, async () => {
      const row = await immutableRow("verification_plan_versions", id);
      if (!row) return null;
      const summary = verificationPlanSummaryFromRow(row);
      if (summary.id !== id || summary.projectId !== projectId)
        throw new Error("Notens gemte plan matcher ikke denne sag eller version.");
      return verificationPlanVersionFromRow(row, await baseline(summary.baselineId), context);
    });
  }
  function round(id: string) {
    return memo(rounds, id, async () => {
      const row = await immutableRow("survey_round_versions", id);
      if (!row) throw new Error("Notens gemte registreringsrunde blev ikke fundet.");
      const summary = surveyRoundSummaryFromRow(row);
      if (summary.id !== id || summary.projectId !== projectId)
        throw new Error("Notens gemte registreringsrunde matcher ikke denne sag eller version.");
      const [snapshot, savedPlan] = await Promise.all([
        baseline(summary.baselineId),
        plan(summary.planId),
      ]);
      if (!savedPlan) throw new Error("Registreringsrundens gemte plan blev ikke fundet.");
      return frozenDetached(await surveyRoundVersionFromRow(row, snapshot, savedPlan, context));
    });
  }
  function upload(id: string) {
    if (missingUploads.has(id)) throw new Error("Notens gemte upload blev ikke fundet.");
    return memo(uploads, id, async () => {
      return historicalUpload(await readOne("uploads", id, uploadColumns));
    });
  }
  function media(id: string) {
    if (missingMedia.has(id)) throw new Error("Notens gemte original blev ikke fundet.");
    return memo(mediaRows, id, async () =>
      frozenDetached(
        canonicalDroneMediaReference(await readOne("project_media", id), projectId, id),
      ),
    );
  }
  function original(id: string) {
    return memo(originals, id, async () => {
      const savedMedia = await media(id);
      return frozenDetached(
        await parseHistoricalSurveyRoundMediaOriginalRows(
          savedMedia,
          await upload(savedMedia.source_upload_id),
          projectId,
          id,
        ),
      );
    });
  }
  function binding(id: string) {
    return memo(bindings, id, async () => {
      const row = await immutableRow("survey_round_media_versions", id);
      if (!row) return null;
      const identity = bindingIdentity.parse(row);
      if (identity.id !== id || identity.project_id !== projectId)
        throw new Error("Notens gemte billedtilknytning matcher ikke denne sag eller version.");
      const [savedRound, savedOriginal] = await Promise.all([
        round(identity.round_version_id),
        original(identity.media_id),
      ]);
      return frozenDetached(
        await surveyRoundMediaVersionFromRow(
          row,
          savedRound,
          savedOriginal.media,
          savedOriginal.validation,
        ),
      );
    });
  }
  function assertExecution(receivedClient: SurveyRoundClient, actor: string, project: string) {
    if (receivedClient !== client || actor !== actorId || project !== projectId)
      throw new Error("Notens læsekontekst tilhører en anden autoriseret request.");
  }
  return Object.freeze({
    preloadBindings: async (ids: string[]) => {
      if (ids.length === 0) return;
      const bindingRows = await seedImmutable("survey_round_media_versions", ids);
      const identities = bindingRows.map((row) => bindingIdentity.parse(row));
      const [roundRows, canonicalMediaRows] = await Promise.all([
        seedImmutable(
          "survey_round_versions",
          identities.map((row) => row.round_version_id),
        ),
        batchRows(
          "project_media",
          identities.map((row) => row.media_id),
        ),
      ]);
      const roundSummaries = roundRows.map(surveyRoundSummaryFromRow);
      const planRows = await seedImmutable(
        "verification_plan_versions",
        roundSummaries.map((row) => row.planId),
      );
      const planSummaries = planRows.map(verificationPlanSummaryFromRow);
      const canonicalMedia = canonicalMediaRows.map((row) => {
        const identity = z
          .object({ id: SaveSurveyRoundNoteInputSchema.shape.mediaBindingId })
          .parse(row);
        const parsed = frozenDetached(canonicalDroneMediaReference(row, projectId, identity.id));
        mediaRows.set(identity.id, Promise.resolve(parsed));
        return parsed;
      });
      const [uploadRows] = await Promise.all([
        batchRows(
          "uploads",
          canonicalMedia.map((row) => row.source_upload_id),
          uploadColumns,
        ),
        seedImmutable("project_baseline_snapshots", [
          ...new Set([
            ...roundSummaries.map((row) => row.baselineId),
            ...planSummaries.map((row) => row.baselineId),
          ]),
        ]),
      ]);
      for (const row of uploadRows) {
        const identity = z
          .object({ id: SaveSurveyRoundNoteInputSchema.shape.mediaBindingId })
          .parse(row);
        uploads.set(identity.id, Promise.resolve(historicalUpload(row)));
      }
      // Missing RLS rows stay absent for this request instead of triggering individual fallback reads.
      for (const id of new Set(identities.map((row) => row.media_id)))
        if (!mediaRows.has(id)) missingMedia.add(id);
      for (const id of new Set(canonicalMedia.map((row) => row.source_upload_id)))
        if (!uploads.has(id)) missingUploads.add(id);
    },
    loadBinding: async (receivedClient, actor, project, id) => {
      assertExecution(receivedClient, actor, project);
      return binding(id);
    },
    loadPlan: async (receivedClient, actor, project, id) => {
      assertExecution(receivedClient, actor, project);
      return plan(id);
    },
  });
}

function authorizedReadDependencies(
  deps: SurveyRoundNoteDependencies,
  overrides: Partial<SurveyRoundNoteDependencies>,
  client: SurveyRoundClient,
  actorId: string,
  projectId: string,
) {
  const reader = createAuthorizedNoteReader(client, actorId, projectId);
  return {
    ...deps,
    loadBinding: overrides.loadBinding ?? reader.loadBinding,
    loadPlan: overrides.loadPlan ?? reader.loadPlan,
    preloadBindings: overrides.loadBinding ? async (_ids: string[]) => {} : reader.preloadBindings,
  };
}
const DEFAULTS: SurveyRoundNoteDependencies = {
  authorize: requireProjectNatureAccess,
  loadBinding: async () => {
    throw new Error("Notens læser kræver aktuel autorisation.");
  },
  loadPlan: async () => {
    throw new Error("Notens læser kræver aktuel autorisation.");
  },
  loadNote: async (client, projectId, id) => {
    const { data, error } = await client
      .from("survey_round_note_versions")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Noten kunne ikke læses med din aktuelle adgang.");
    return data;
  },
  listNotes: async (client, input) => {
    let q = client.from("survey_round_note_versions").select("*").eq("project_id", input.projectId);
    if (input.roundVersionId) q = q.eq("round_version_id", input.roundVersionId);
    if (input.mediaBindingId) q = q.eq("media_binding_id", input.mediaBindingId);
    if (input.beforeVersion) q = q.lt("version_no", input.beforeVersion);
    const { data, error } = await q
      .order("version_no", { ascending: false })
      .limit(input.limit + 1);
    if (error || !Array.isArray(data)) throw new Error("Noterne kunne ikke læses.");
    return data;
  },
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as SurveyRoundClient;
  },
  prepare: async (writer, projectId, actorId, binding) => {
    const { data, error } = await writer.rpc("prepare_project_media_original_read", {
      p_project_id: projectId,
      p_media_id: binding.mediaId,
      p_actor_id: actorId,
    });
    if (error || !data) throw new Error("Originalens aktuelle adgang kunne ikke bekræftes.");
    const prepared = z.object({ media: z.unknown() }).parse(data);
    const media = canonicalDroneMediaReference(prepared.media, projectId, binding.mediaId);
    validateCanonicalDroneMediaRead(data, media);
    const m = binding.manifest;
    if (
      media.original_sha256 !== m.originalSha256 ||
      media.original_validation_sha256 !== m.originalValidationSha256 ||
      media.storage_object_id !== m.storage.objectId ||
      media.storage_object_version !== m.storage.objectVersion ||
      new Date(media.storage_object_updated_at).toISOString() !==
        new Date(m.storage.objectUpdatedAt).toISOString()
    )
      throw new Error("Originalens aktuelle filversion matcher ikke billedtilknytningen.");
  },
  persist: async (writer, input, actorId, manifest) => {
    const { data, error } = await writer.rpc("persist_survey_round_note", {
      p_project_id: input.projectId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_logical_note_id: input.logicalNoteId,
      p_media_binding_id: input.mediaBindingId,
      p_media_binding_sha256: input.mediaBindingSha256,
      p_manifest_text: surveyRoundNoteCanonicalText(manifest),
    });
    if (error || !data)
      throw new Error(
        "Noten blev ikke gemt. Kontrollér den aktuelle adgang, filversion og request.",
      );
    return data;
  },
};
async function inputs(
  deps: SurveyRoundNoteDependencies,
  client: SurveyRoundClient,
  actorId: string,
  projectId: string,
  bindingId: string,
) {
  const binding = await deps.loadBinding(client, actorId, projectId, bindingId);
  if (!binding || binding.projectId !== projectId || binding.id !== bindingId)
    throw new Error("Den gemte billedtilknytning blev ikke fundet i denne sag.");
  const plan = await deps.loadPlan(client, actorId, projectId, binding.manifest.planId);
  if (!plan) throw new Error("Billedtilknytningens gemte plan blev ikke fundet.");
  return { binding, plan };
}
export async function executeGetSurveyRoundNoteAccess(
  raw: { projectId: string },
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundNoteDependencies> = {},
) {
  const input = GetSurveyRoundNoteInputSchema.omit({ noteVersionId: true }).parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  const access = await deps.authorize(
    client as unknown as ProjectAuthorizationClient,
    actorId,
    input.projectId,
  );
  return {
    projectId: input.projectId,
    userId: actorId,
    canDraft: access.canPersist || access.role === "field",
  };
}
export async function executeSaveSurveyRoundNoteForCaller(
  raw: SaveSurveyRoundNoteEnvelope,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundNoteDependencies> = {},
) {
  const envelope = SaveSurveyRoundNoteEnvelopeSchema.parse(raw);
  if (envelope.expectedCallerUserId !== actorId)
    throw new Error("Den aktuelle bruger matcher ikke notens afsender. Hent adgangen igen.");
  const { expectedCallerUserId: _expectedCallerUserId, ...input } = envelope,
    deps = { ...DEFAULTS, ...overrides };
  const access = await deps.authorize(
    client as unknown as ProjectAuthorizationClient,
    actorId,
    input.projectId,
  );
  if (!access.canPersist && access.role !== "field")
    throw new Error("Du har kun læseadgang til denne sag.");
  const readDeps = authorizedReadDependencies(deps, overrides, client, actorId, input.projectId);
  const { binding, plan } = await inputs(
    readDeps,
    client,
    actorId,
    input.projectId,
    input.mediaBindingId,
  );
  const manifest = await buildSurveyRoundNoteManifestV1(input, binding, plan),
    writer = await deps.getWriter();
  await deps.prepare(writer, input.projectId, actorId, binding);
  const note = await surveyRoundNoteVersionFromRow(
    await deps.persist(writer, input, actorId, manifest),
    binding,
    plan,
  );
  if (
    note.projectId !== input.projectId ||
    note.createdBy !== actorId ||
    note.requestId !== input.requestId ||
    note.logicalNoteId !== input.logicalNoteId ||
    surveyRoundNoteCanonicalText(note.manifest) !== surveyRoundNoteCanonicalText(manifest)
  )
    throw new Error("Databasen bekræftede ikke den ønskede noteversion.");
  return note;
}
async function replay(
  row: unknown,
  deps: SurveyRoundNoteDependencies,
  client: SurveyRoundClient,
  actorId: string,
  projectId: string,
) {
  const id = Identity.parse(row);
  if (id.project_id !== projectId) throw new Error("Noten tilhører en anden sag.");
  const { binding, plan } = await inputs(deps, client, actorId, projectId, id.media_binding_id);
  return surveyRoundNoteVersionFromRow(row, binding, plan);
}
export async function executeGetSurveyRoundNote(
  raw: z.infer<typeof GetSurveyRoundNoteInputSchema>,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundNoteDependencies> = {},
) {
  const input = GetSurveyRoundNoteInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  const row = await deps.loadNote(client, input.projectId, input.noteVersionId);
  if (!row) return null;
  if (Identity.parse(row).id !== input.noteVersionId)
    throw new Error("Den valgte noteversion matcher ikke.");
  const readDeps = authorizedReadDependencies(deps, overrides, client, actorId, input.projectId);
  return replay(row, readDeps, client, actorId, input.projectId);
}
export async function executeListSurveyRoundNotes(
  raw: ListSurveyRoundNotesInput,
  actorId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundNoteDependencies> = {},
) {
  const input = ListSurveyRoundNotesInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  const rows = await deps.listNotes(client, input);
  if (rows.length > input.limit + 1) throw new Error("Databasen returnerede for mange noter.");
  const ids = rows.map((r) => Identity.parse(r));
  if (
    new Set(ids.map((r) => r.id)).size !== ids.length ||
    ids.some(
      (r, i) =>
        r.project_id !== input.projectId ||
        (input.roundVersionId && r.round_version_id !== input.roundVersionId) ||
        (input.mediaBindingId && r.media_binding_id !== input.mediaBindingId) ||
        (input.beforeVersion && r.version_no >= input.beforeVersion) ||
        (i > 0 && ids[i - 1].version_no <= r.version_no),
    )
  )
    throw new Error("Noternes sag, filtre eller rækkefølge matcher ikke.");
  const readDeps = authorizedReadDependencies(deps, overrides, client, actorId, input.projectId);
  await readDeps.preloadBindings(ids.slice(0, input.limit).map((row) => row.media_binding_id));
  const items: SurveyRoundNoteVersion[] = [];
  for (const row of rows.slice(0, input.limit))
    items.push(await replay(row, readDeps, client, actorId, input.projectId));
  return { items, nextBeforeVersion: rows.length > input.limit ? items.at(-1)!.version : null };
}
export const saveSurveyRoundNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveSurveyRoundNoteEnvelopeSchema.parse(raw))
  .handler(({ data, context }) =>
    executeSaveSurveyRoundNoteForCaller(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const getSurveyRoundNoteAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    GetSurveyRoundNoteInputSchema.omit({ noteVersionId: true }).parse(raw),
  )
  .handler(({ data, context }) =>
    executeGetSurveyRoundNoteAccess(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const getSurveyRoundNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => GetSurveyRoundNoteInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeGetSurveyRoundNote(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const listSurveyRoundNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListSurveyRoundNotesInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeListSurveyRoundNotes(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
