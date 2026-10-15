import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "./project-nature-access.server";
import type { CanonicalDroneMediaClient } from "./canonical-drone-media.functions";
import type { SurveyRoundClient } from "./survey-round.functions";
import { executeGetProjectBaseline, type PublicBaselineClient } from "./public-baseline.functions";
import {
  baselineSha256,
  validatePublicBaselineManifest,
} from "@/services/baseline/public-baseline-service";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";
import { parseHistoricalSurveyRoundMediaOriginalRows } from "./survey-round-media.functions";
import {
  canonicalDroneMediaReference,
  validateCanonicalDroneMediaRead,
  type CanonicalDroneMediaReference,
} from "@/services/monitoring/canonical-drone-media-reference";
import type { DroneOriginalValidation } from "@/services/monitoring/drone-original-validation.server";
import {
  buildDroneImageInspectionDraft,
  DRONE_IMAGE_INSPECTION_METHOD,
  DRONE_IMAGE_INSPECTION_PROMPT_VERSION,
  DroneImageSourceContextSchema,
  type DroneImageSourceContext,
  MAX_DRONE_INSPECTION_ORIGINAL_BYTES,
} from "@/services/monitoring/drone-image-inspection";
import {
  droneImageInspectionFromRow,
  droneImageInspectionClaimFromRow,
  droneImageInspectionResultText,
  DRONE_IMAGE_INSPECTION_SELECT,
  type DroneImageInspectionRecord,
  type DroneImageInspectionFailure,
  SaveDroneImageInspectionAnswersInputSchema,
  droneImageInspectionAnswersCanonicalText,
  droneImageInspectionAnswersFromRow,
  validateDroneImageInspectionAnswerQuestions,
  DRONE_IMAGE_INSPECTION_ANSWERS_SELECT,
  type DroneImageInspectionAnswersRecord,
} from "@/services/monitoring/drone-image-inspection-persistence";
import {
  inspectDroneImageBytes,
  DRONE_VISION_MODEL,
  DRONE_VISION_PROVIDER,
  DroneVisionError,
} from "./drone-vision-provider.server";

const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());
export const InspectDroneImageInputSchema = z
  .object({
    projectId: Uuid,
    mediaId: Uuid,
    requestId: Uuid,
    expectedCallerUserId: Uuid,
    baselineSnapshotId: Uuid.optional(),
    baselineSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (input) => (input.baselineSnapshotId === undefined) === (input.baselineSha256 === undefined),
    "Datagrundlagets version og kontrolsum skal angives sammen.",
  );
export type InspectDroneImageInput = z.infer<typeof InspectDroneImageInputSchema>;
export const SaveDroneImageInspectionAnswersEnvelopeSchema =
  SaveDroneImageInspectionAnswersInputSchema.extend({
    expectedCallerUserId: Uuid,
  }).strict();
type SaveAnswersInput = z.infer<typeof SaveDroneImageInspectionAnswersEnvelopeSchema>;
const ListAnswersInputSchema = z.object({ projectId: Uuid, inspectionId: Uuid }).strict();
type ListAnswersInput = z.infer<typeof ListAnswersInputSchema>;
export const ListDroneImageInspectionsInputSchema = z
  .object({
    projectId: Uuid,
    mediaId: Uuid.optional(),
    beforeId: Uuid.optional(),
    limit: z.number().int().min(1).max(30).default(10),
  })
  .strict();
type ListInput = z.infer<typeof ListDroneImageInspectionsInputSchema>;
export { MAX_DRONE_INSPECTION_ORIGINAL_BYTES };
const DOWNLOAD_TIMEOUT_MS = 20_000;
type InspectionClient = CanonicalDroneMediaClient & SurveyRoundClient;
type Writer = Pick<SurveyRoundClient, "rpc">;
type Claim = Awaited<ReturnType<typeof droneImageInspectionClaimFromRow>>;

export interface DroneImageInspectionDependencies {
  authorize(
    client: ProjectAuthorizationClient,
    actorId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  getWriter(): Promise<Writer>;
  loadBaseline(
    client: InspectionClient,
    actorId: string,
    projectId: string,
    snapshotId: string,
  ): Promise<PublicBaselineSnapshot | null>;
  loadOriginal(
    client: InspectionClient,
    projectId: string,
    mediaId: string,
  ): Promise<{ media: CanonicalDroneMediaReference; validation: DroneOriginalValidation }>;
  prepare(writer: Writer, actorId: string, media: CanonicalDroneMediaReference): Promise<void>;
  claim(writer: Writer, input: InspectDroneImageInput, actorId: string): Promise<unknown>;
  download(client: InspectionClient, media: CanonicalDroneMediaReference): Promise<Uint8Array>;
  inspect: typeof inspectDroneImageBytes;
  finish(
    writer: Writer,
    record: DroneImageInspectionRecord,
    actorId: string,
    token: string,
    resultText: string | null,
    failureCode: DroneImageInspectionFailure | null,
  ): Promise<unknown>;
  list(client: InspectionClient, input: ListInput): Promise<unknown[]>;
  loadInspection(
    client: InspectionClient,
    projectId: string,
    inspectionId: string,
  ): Promise<unknown | null>;
  saveAnswers(
    writer: Writer,
    input: SaveAnswersInput,
    actorId: string,
    text: string,
  ): Promise<unknown>;
  listAnswers(client: InspectionClient, input: ListAnswersInput): Promise<unknown[]>;
  now(): string;
}

function assertContributor(access: ProjectNatureAccess): void {
  if (!access.canPersist && access.role !== "field")
    throw new Error("Du har ikke rettighed til at analysere projektets dronebilleder.");
}
function assertRecordPins(
  record: DroneImageInspectionRecord,
  media: CanonicalDroneMediaReference,
  sourceContext: DroneImageSourceContext | null = null,
  requireCurrentModel = true,
): void {
  if (
    record.projectId !== media.project_id ||
    record.mediaId !== media.id ||
    record.originalSha256 !== media.original_sha256 ||
    record.originalValidationSha256 !== media.original_validation_sha256 ||
    record.storageObjectId !== media.storage_object_id ||
    record.storageObjectVersion !== media.storage_object_version ||
    record.storageObjectUpdatedAt !== media.storage_object_updated_at ||
    record.provider !== DRONE_VISION_PROVIDER ||
    (requireCurrentModel && record.modelId !== DRONE_VISION_MODEL) ||
    record.promptVersion !== DRONE_IMAGE_INSPECTION_PROMPT_VERSION ||
    record.methodVersion !== DRONE_IMAGE_INSPECTION_METHOD ||
    record.sourceSnapshotId !== (sourceContext?.snapshotId ?? null) ||
    record.sourceSnapshotHash !== (sourceContext?.snapshotSha256 ?? null)
  )
    throw new Error(
      "Billedanalysens gemte filreference eller metode matcher ikke den aktuelle original.",
    );
}

/** Derive only bounded, factual quality limitations from the actual saved source manifest. */
export async function droneInspectionSourceContext(
  snapshot: PublicBaselineSnapshot,
  projectId: string,
  snapshotId: string,
  expectedSha256: string,
): Promise<DroneImageSourceContext> {
  if (
    snapshot.id !== snapshotId ||
    snapshot.projectId !== projectId ||
    snapshot.manifestSha256 !== expectedSha256
  )
    throw new Error("Datagrundlaget matcher ikke den valgte sag og version.");
  const manifest = await validatePublicBaselineManifest(snapshot.manifest);
  if (manifest.project.id !== projectId || (await baselineSha256(manifest)) !== expectedSha256)
    throw new Error("Datagrundlagets gemte indhold matcher ikke kontrolsummen.");
  const clean = (value: string) =>
    [...value]
      .filter((c) => {
        const point = c.codePointAt(0)!;
        return point >= 32 && (point < 127 || point > 159);
      })
      .join("")
      .slice(0, 100);
  const gaps = manifest.sources.flatMap((source) => {
    const reasons: string[] = [];
    if (source.mode !== "live" && source.mode !== "import")
      reasons.push("kilden er ikke hentet som dokumenterede data");
    if (source.status !== "complete") reasons.push("ufuldstændig eller manglende kildedækning");
    if (source.coverage.spatial !== "complete")
      reasons.push("geografisk dækning er ikke fuldstændig");
    if (source.coverage.temporal !== "complete")
      reasons.push("tidsmæssig dækning er ikke fuldstændig");
    if (!source.coverage.paginationComplete)
      reasons.push("ikke alle resultatsider er dokumenteret");
    if (source.payload === null || source.payloadSha256 === null || source.error !== null)
      reasons.push("datagrundlaget er ikke fuldt tilgængeligt");
    if (source.quality.evidenceKind === "estimate" || source.quality.evidenceKind === "preview")
      reasons.push("kilden er et skøn eller en forhåndsvisning");
    if (source.quality.warnings.length) reasons.push("kilden har dokumenterede forbehold");
    return reasons.length
      ? [`${clean(source.dataset) || "Kilde"}: ${[...new Set(reasons)].join("; ")}.`.slice(0, 500)]
      : [];
  });
  return DroneImageSourceContextSchema.parse({
    snapshotId,
    snapshotSha256: expectedSha256,
    limitations: [
      "Kildernes datoer og dækning skal sammenholdes med fotoets optagetid. Kildehenvisninger er ikke satellitfortolkning eller feltmålinger fra fotoet.",
      ...gaps.slice(0, 6),
      ...(gaps.length > 6
        ? [
            "Yderligere kilder i den gemte version indeholder datamangler. Gennemgå hele datagrundlaget før en faglig konklusion.",
          ]
        : []),
    ],
  });
}

/** The private signed URL never leaves this server boundary or enters the vision request. */
export async function downloadDroneInspectionOriginal(
  client: CanonicalDroneMediaClient,
  media: CanonicalDroneMediaReference,
  options: { fetch?: typeof fetch; supabaseUrl?: string; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  canonicalDroneMediaReference(media, media.project_id, media.id);
  if (media.file_size_bytes > MAX_DRONE_INSPECTION_ORIGINAL_BYTES)
    throw new Error("Billed-AI understøtter endnu kun JPEG-originaler på højst 20 MB.");
  const { data, error } = await client.storage
    .from("monitoring-uploads")
    .createSignedUrl(media.file_path, 60);
  if (error || !data)
    throw new Error("Originalfilen kunne ikke læses med din aktuelle projektadgang.");
  const configured = options.supabaseUrl ?? process.env.SUPABASE_URL;
  if (!configured) throw new Error("Serverens private fillager er ikke konfigureret.");
  let url: URL;
  try {
    url = new URL(data.signedUrl);
  } catch {
    throw new Error("Originalfilens lageradresse kunne ikke bekræftes.");
  }
  const path = `/storage/v1/object/sign/monitoring-uploads/${media.file_path.split("/").map(encodeURIComponent).join("/")}`;
  if (
    url.origin !== new URL(configured).origin ||
    url.pathname !== path ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get("token")
  )
    throw new Error("Originalfilens lageradresse matcher ikke den kanoniske filreference.");
  const timeout = options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > DOWNLOAD_TIMEOUT_MS)
    throw new Error("Originalfilens læsegrænse er ugyldig.");
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Originalfilens download overskred tidsgrænsen."));
    }, timeout);
  });
  try {
    const fetching = (options.fetch ?? fetch)(url.toString(), {
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    void fetching.then(
      (late) => {
        if (controller.signal.aborted) void late.body?.cancel().catch(() => undefined);
      },
      () => undefined,
    );
    response = await Promise.race([fetching, deadline]);
    if (response.redirected || !response.ok || !response.body)
      throw new Error("Originalfilen kunne ikke hentes sikkert.");
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) !== media.file_size_bytes)
    )
      throw new Error("Originalfilens download matcher ikke den gemte filstørrelse.");
    const bytes = new Uint8Array(media.file_size_bytes);
    reader = response.body.getReader();
    let offset = 0;
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (controller.signal.aborted)
        throw new Error("Originalfilens download overskred tidsgrænsen.");
      if (chunk.done) break;
      if (offset + chunk.value.byteLength > bytes.byteLength)
        throw new Error("Originalfilens download overstiger den gemte filstørrelse.");
      bytes.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
    if (offset !== bytes.byteLength) throw new Error("Originalfilens download er ufuldstændig.");
    complete = true;
    return bytes;
  } catch {
    throw new Error("Originalfilens private download fejlede eller overskred tidsgrænsen.");
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (!complete) {
      if (reader) void reader.cancel().catch(() => undefined);
      else void response?.body?.cancel().catch(() => undefined);
    }
    reader?.releaseLock();
  }
}

async function readOne(
  client: InspectionClient,
  table: string,
  projectId: string,
  id: string,
): Promise<unknown> {
  const { data, error } = await client
    .from(table)
    .select("*")
    .eq("project_id", projectId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data)
    throw new Error("Originalens gemte proveniens kunne ikke læses med din aktuelle adgang.");
  return data;
}
const DEFAULTS: DroneImageInspectionDependencies = {
  authorize: requireProjectNatureAccess,
  loadBaseline: (client, actorId, projectId, snapshotId) =>
    executeGetProjectBaseline(
      { projectId, snapshotId },
      actorId,
      client as unknown as PublicBaselineClient,
    ),
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as Writer;
  },
  loadOriginal: async (client, projectId, mediaId) => {
    const media = canonicalDroneMediaReference(
      await readOne(client, "project_media", projectId, mediaId),
      projectId,
      mediaId,
    );
    return parseHistoricalSurveyRoundMediaOriginalRows(
      media,
      await readOne(client, "uploads", projectId, media.source_upload_id),
      projectId,
      mediaId,
    );
  },
  prepare: async (writer, actorId, media) => {
    const { data, error } = await writer.rpc("prepare_project_media_original_read", {
      p_project_id: media.project_id,
      p_media_id: media.id,
      p_actor_id: actorId,
    });
    if (error || !data)
      throw new Error("Originalens aktuelle filversion eller din projektadgang er ændret.");
    validateCanonicalDroneMediaRead(data, media);
  },
  claim: async (writer, input, actorId) => {
    const { data, error } = await writer.rpc("claim_drone_image_inspection", {
      p_project_id: input.projectId,
      p_media_id: input.mediaId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_provider: DRONE_VISION_PROVIDER,
      p_model_id: DRONE_VISION_MODEL,
      p_prompt_version: DRONE_IMAGE_INSPECTION_PROMPT_VERSION,
      p_method_version: DRONE_IMAGE_INSPECTION_METHOD,
      p_source_snapshot_id: input.baselineSnapshotId ?? null,
      p_source_snapshot_sha256: input.baselineSha256 ?? null,
    });
    if (error || !data)
      throw new Error("Billedanalysen kunne ikke startes eller genoptages sikkert.");
    return data;
  },
  download: downloadDroneInspectionOriginal,
  inspect: inspectDroneImageBytes,
  finish: async (writer, record, actorId, token, resultText, failureCode) => {
    const { data, error } = await writer.rpc("finish_drone_image_inspection", {
      p_project_id: record.projectId,
      p_inspection_id: record.id,
      p_actor_id: actorId,
      p_claim_token: token,
      p_result_text: resultText,
      p_failure_code: failureCode,
    });
    if (error || !data)
      throw new Error(
        "Billedudkastet blev ikke gemt. Filversion, adgang eller analyseforsøg kan være ændret.",
      );
    return data;
  },
  list: async (client, input) => {
    let query = (client as unknown as SurveyRoundClient)
      .from("drone_image_inspections")
      .select(DRONE_IMAGE_INSPECTION_SELECT)
      .eq("project_id", input.projectId)
      .eq("status", "completed");
    if (input.mediaId) query = query.eq("media_id", input.mediaId);
    if (input.beforeId) query = query.lt("id", input.beforeId);
    const { data, error } = await query.order("id", { ascending: false }).limit(input.limit + 1);
    if (error || !Array.isArray(data)) throw new Error("De gemte billedudkast kunne ikke læses.");
    return data;
  },
  loadInspection: async (client, projectId, inspectionId) => {
    const { data, error } = await client
      .from("drone_image_inspections")
      .select(DRONE_IMAGE_INSPECTION_SELECT)
      .eq("project_id", projectId)
      .eq("id", inspectionId)
      .maybeSingle();
    if (error)
      throw new Error("Den gemte billedvurdering kunne ikke læses med din aktuelle adgang.");
    return data;
  },
  saveAnswers: async (writer, input, actorId, text) => {
    const { data, error } = await writer.rpc("save_drone_image_inspection_answers", {
      p_project_id: input.projectId,
      p_inspection_id: input.inspectionId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_inspection_result_sha256: input.inspectionResultSha256,
      p_answers_text: text,
    });
    if (error || !data)
      throw new Error(
        "Svarene blev ikke gemt. Kontrollér billedversion, adgang og det valgte gemmeforsøg.",
      );
    return data;
  },
  listAnswers: async (client, input) => {
    const { data, error } = await (client as unknown as SurveyRoundClient)
      .from("drone_image_inspection_answer_versions")
      .select(DRONE_IMAGE_INSPECTION_ANSWERS_SELECT)
      .eq("project_id", input.projectId)
      .eq("inspection_id", input.inspectionId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(31);
    if (error || !Array.isArray(data)) throw new Error("De gemte svarversioner kunne ikke læses.");
    return data;
  },
  now: () => new Date().toISOString(),
};

export async function executeInspectDroneImage(
  raw: InspectDroneImageInput,
  actorId: string,
  client: InspectionClient,
  overrides: Partial<DroneImageInspectionDependencies> = {},
): Promise<{ status: "completed" | "busy"; inspection: DroneImageInspectionRecord }> {
  const input = InspectDroneImageInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  if (actorId !== input.expectedCallerUserId)
    throw new Error("Den aktuelle bruger matcher ikke det valgte analyseforsøg.");
  assertContributor(await deps.authorize(client, actorId, input.projectId));
  let sourceContext: DroneImageSourceContext | null = null;
  if (input.baselineSnapshotId && input.baselineSha256) {
    const baseline = await deps.loadBaseline(
      client,
      actorId,
      input.projectId,
      input.baselineSnapshotId,
    );
    if (!baseline) throw new Error("Den valgte version af datagrundlaget kunne ikke læses.");
    sourceContext = await droneInspectionSourceContext(
      baseline,
      input.projectId,
      input.baselineSnapshotId,
      input.baselineSha256,
    );
  }
  const { media, validation } = await deps.loadOriginal(client, input.projectId, input.mediaId);
  canonicalDroneMediaReference(media, input.projectId, input.mediaId);
  if (
    validation.status === "rejected" ||
    validation.original.sha256 !== media.original_sha256 ||
    validation.uploadId !== media.source_upload_id ||
    validation.projectId !== input.projectId
  )
    throw new Error("Originalens gemte serverkontrol matcher ikke det valgte billede.");
  if (media.file_size_bytes > MAX_DRONE_INSPECTION_ORIGINAL_BYTES)
    throw new Error("Billed-AI understøtter endnu kun JPEG-originaler på højst 20 MB.");
  const writer = await deps.getWriter();
  await deps.prepare(writer, actorId, media);
  const claim: Claim = await droneImageInspectionClaimFromRow(
    await deps.claim(writer, input, actorId),
    input.projectId,
    input.mediaId,
  );
  assertRecordPins(claim.inspection, media, sourceContext);
  if (claim.state !== "claimed") {
    assertContributor(await deps.authorize(client, actorId, input.projectId));
    await deps.prepare(writer, actorId, media);
    return {
      status: claim.state === "completed" ? "completed" : "busy",
      inspection: claim.inspection,
    };
  }
  const token = claim.claimToken;
  if (!token) throw new Error("Billedanalysens forsøg blev ikke bekræftet.");
  let phase: "image_error" | "provider_error" | "invalid_output" = "image_error";
  try {
    assertContributor(await deps.authorize(client, actorId, input.projectId));
    await deps.prepare(writer, actorId, media);
    const bytes = await deps.download(client, media);
    if (bytes.byteLength !== media.file_size_bytes)
      throw new Error("Originalfilens filstørrelse er ændret.");
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== media.original_sha256)
      throw new Error("Originalfilens indhold matcher ikke den gemte kontrolsum.");
    // Recheck revocation and object replacement immediately before provider transfer.
    assertContributor(await deps.authorize(client, actorId, input.projectId));
    await deps.prepare(writer, actorId, media);
    phase = "provider_error";
    const inspected = await deps.inspect(bytes, {
      sourceContext,
      // Image decoding may take time. Recheck at the actual model boundary too.
      beforeModelTransfer: async () => {
        assertContributor(await deps.authorize(client, actorId, input.projectId));
        await deps.prepare(writer, actorId, media);
      },
    });
    phase = "invalid_output";
    if (inspected.provider !== DRONE_VISION_PROVIDER || inspected.model !== DRONE_VISION_MODEL)
      throw new Error("Billedmodellens identitet matcher ikke analyseforsøget.");
    const draft = buildDroneImageInspectionDraft({
      visual: inspected.visual,
      sourceContext,
      provenance: {
        projectId: input.projectId,
        mediaId: input.mediaId,
        requestId: claim.inspection.requestId,
        originalSha256: media.original_sha256,
        originalValidationSha256: media.original_validation_sha256,
        derivative: inspected.derivative,
        provider: inspected.provider,
        model: inspected.model,
        promptVersion: DRONE_IMAGE_INSPECTION_PROMPT_VERSION,
        generatedAt: deps.now(),
      },
    });
    const text = droneImageInspectionResultText(draft);
    assertContributor(await deps.authorize(client, actorId, input.projectId));
    await deps.prepare(writer, actorId, media);
    const saved = await droneImageInspectionFromRow(
      await deps.finish(writer, claim.inspection, actorId, token, text, null),
      input.projectId,
      input.mediaId,
    );
    assertRecordPins(saved, media, sourceContext);
    if (
      saved.id !== claim.inspection.id ||
      saved.status !== "completed" ||
      saved.requestId !== claim.inspection.requestId ||
      droneImageInspectionResultText(saved.result) !== text
    )
      throw new Error("Databasen bekræftede ikke det præcise billedudkast.");
    assertContributor(await deps.authorize(client, actorId, input.projectId));
    await deps.prepare(writer, actorId, media);
    return { status: "completed", inspection: saved };
  } catch (error) {
    const failureCode: DroneImageInspectionFailure =
      error instanceof DroneVisionError
        ? error.code === "unavailable"
          ? "provider_unavailable"
          : error.code === "timeout"
            ? "timeout"
            : error.code === "invalid_output"
              ? "invalid_output"
              : error.code === "invalid_image" || error.code === "image_size"
                ? "image_error"
                : "provider_error"
        : phase;
    // Cleanup is best effort and must itself pass the same current contributor/object gate.
    try {
      assertContributor(await deps.authorize(client, actorId, input.projectId));
      await deps.prepare(writer, actorId, media);
      await deps.finish(writer, claim.inspection, actorId, token, null, failureCode);
    } catch {
      /* Expiring leases retain uncertain attempts without bypassing revocation. */
    }
    throw new Error(
      error instanceof DroneVisionError
        ? error.message
        : "Billedanalysen blev ikke færdig. Kontrollér filen, AI-adgangen og din projektadgang, og prøv igen.",
    );
  }
}

export async function executeListDroneImageInspections(
  raw: z.input<typeof ListDroneImageInspectionsInputSchema>,
  actorId: string,
  client: InspectionClient,
  overrides: Partial<DroneImageInspectionDependencies> = {},
) {
  const input = ListDroneImageInspectionsInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client, actorId, input.projectId);
  const rawRows = await deps.list(client, input);
  if (rawRows.length > input.limit + 1)
    throw new Error("Databasen returnerede for mange billedudkast.");
  const rows = await Promise.all(
    rawRows.map((row) => droneImageInspectionFromRow(row, input.projectId, input.mediaId)),
  );
  if (
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.some(
      (row, index) =>
        row.status !== "completed" ||
        (input.beforeId && row.id >= input.beforeId) ||
        (index > 0 && rows[index - 1].id <= row.id),
    )
  )
    throw new Error("Billedudkastenes sag, status eller rækkefølge matcher ikke.");
  await deps.authorize(client, actorId, input.projectId);
  return {
    items: rows.slice(0, input.limit),
    nextBeforeId: rows.length > input.limit ? rows[input.limit - 1].id : null,
  };
}

export async function executeSaveDroneImageInspectionAnswers(
  raw: z.input<typeof SaveDroneImageInspectionAnswersEnvelopeSchema>,
  actorId: string,
  client: InspectionClient,
  overrides: Partial<DroneImageInspectionDependencies> = {},
): Promise<DroneImageInspectionAnswersRecord> {
  const input = SaveDroneImageInspectionAnswersEnvelopeSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  if (actorId !== input.expectedCallerUserId)
    throw new Error("Den aktuelle bruger matcher ikke det valgte gemmeforsøg.");
  assertContributor(await deps.authorize(client, actorId, input.projectId));
  const inspection = await droneImageInspectionFromRow(
    await deps.loadInspection(client, input.projectId, input.inspectionId),
    input.projectId,
  );
  if (
    inspection.id !== input.inspectionId ||
    inspection.resultSha256 !== input.inspectionResultSha256
  )
    throw new Error("Svarene henviser ikke til den præcise gemte billedvurdering.");
  validateDroneImageInspectionAnswerQuestions(input.answers, inspection);
  const text = droneImageInspectionAnswersCanonicalText(input.answers);
  const { media } = await deps.loadOriginal(client, input.projectId, inspection.mediaId);
  canonicalDroneMediaReference(media, input.projectId, inspection.mediaId);
  assertRecordPins(inspection, media, inspection.result?.sourceContext ?? null, false);
  assertContributor(await deps.authorize(client, actorId, input.projectId));
  const writer = await deps.getWriter();
  await deps.prepare(writer, actorId, media);
  const saved = await droneImageInspectionAnswersFromRow(
    await deps.saveAnswers(writer, input, actorId, text),
    input.projectId,
    inspection,
  );
  if (
    saved.createdBy !== actorId ||
    saved.requestId !== input.requestId ||
    droneImageInspectionAnswersCanonicalText(saved.answers) !== text
  )
    throw new Error("Databasen bekræftede ikke den ønskede svarversion.");
  assertContributor(await deps.authorize(client, actorId, input.projectId));
  await deps.prepare(writer, actorId, media);
  return saved;
}

export async function executeListDroneImageInspectionAnswers(
  raw: ListAnswersInput,
  actorId: string,
  client: InspectionClient,
  overrides: Partial<DroneImageInspectionDependencies> = {},
) {
  const input = ListAnswersInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client, actorId, input.projectId);
  const inspection = await droneImageInspectionFromRow(
    await deps.loadInspection(client, input.projectId, input.inspectionId),
    input.projectId,
  );
  if (inspection.id !== input.inspectionId || inspection.status !== "completed")
    throw new Error("Svaroversigten kræver den præcise gemte billedvurdering.");
  const rawRows = await deps.listAnswers(client, input);
  if (rawRows.length > 31) throw new Error("Databasen returnerede for mange svarversioner.");
  const rows = await Promise.all(
    rawRows.map((row) => droneImageInspectionAnswersFromRow(row, input.projectId, inspection)),
  );
  if (
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.some((row, index) => {
      if (index === 0) return false;
      const previous = rows[index - 1];
      return (
        Date.parse(previous.createdAt) < Date.parse(row.createdAt) ||
        (Date.parse(previous.createdAt) === Date.parse(row.createdAt) && previous.id <= row.id)
      );
    })
  )
    throw new Error("Svarversionernes rækkefølge matcher ikke.");
  await deps.authorize(client, actorId, input.projectId);
  return { items: rows.slice(0, 30), hasMore: rows.length > 30 };
}

export const inspectDroneImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InspectDroneImageInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeInspectDroneImage(data, context.userId, context.supabase as unknown as InspectionClient),
  );
export const listDroneImageInspections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListDroneImageInspectionsInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeListDroneImageInspections(
      data,
      context.userId,
      context.supabase as unknown as InspectionClient,
    ),
  );
export const saveDroneImageInspectionAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveDroneImageInspectionAnswersEnvelopeSchema.parse(raw))
  .handler(({ data, context }) =>
    executeSaveDroneImageInspectionAnswers(
      data,
      context.userId,
      context.supabase as unknown as InspectionClient,
    ),
  );
export const listDroneImageInspectionAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListAnswersInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeListDroneImageInspectionAnswers(
      data,
      context.userId,
      context.supabase as unknown as InspectionClient,
    ),
  );
