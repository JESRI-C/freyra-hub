import { z } from "zod";
import type {
  CreatePublicBaselineInput,
  PublicBaselineSnapshot,
} from "@/services/baseline/public-baseline-types";
import {
  baselineSha256,
  baselineSnapshotFromRow,
  canonicalBaselineJson,
} from "@/services/baseline/public-baseline-service";
import {
  buildVerificationPlanManifest,
  verificationPlanVersionFromRow,
  type SaveVerificationPlanInput,
  type VerificationPlanVersion,
} from "@/services/baseline/verification-plan-persistence";
import {
  SaveSurveyRoundInputSchema,
  surveyRoundVersionFromRow,
  type SaveSurveyRoundInput,
  type SurveyRoundVersion,
} from "@/services/baseline/survey-round-persistence";
import {
  assertSurveyRoundSaveResult,
  createSurveyRoundReceipt,
  readSurveyRoundReceipt,
  type SurveyRoundRequestReceipt,
  type SurveyRoundRequestScope,
} from "./survey-round-request";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const DateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      value >= "0001-01-01" &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Vælg en gyldig kalenderdato.");
const Period = z
  .object({ dateFrom: DateText, dateTo: DateText })
  .strict()
  .refine((value) => value.dateFrom <= value.dateTo, "Slutdato ligger før startdato.");
const ScopeSchema = z
  .object({
    actorId: Uuid,
    projectId: Uuid,
    projectName: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (value) =>
          value.trim().length > 0 &&
          [...value].every((character) => {
            const code = character.codePointAt(0)!;
            return code >= 32 && (code < 127 || code > 159);
          }),
      ),
    geometrySha256: Hash,
    reference: z
      .object({
        id: Uuid,
        zoneId: Uuid,
        geometrySha256: Hash,
        sourceProvider: z.literal("datafordeler-ds-bearbejdet-wfs/v1").optional(),
      })
      .strict(),
    baselinePeriod: Period,
    recordingPeriod: Period,
  })
  .strict();

/** Confirmed scope, not a claim of a commissioned reach or a georeferenced image. */
export type StreamInspectionScope = z.infer<typeof ScopeSchema>;
export type StreamInspectionProgress = "baseline" | "plan" | "round" | "complete";
export interface StreamInspectionResult {
  snapshot: PublicBaselineSnapshot;
  plan: VerificationPlanVersion;
  round: SurveyRoundVersion;
}
type ServerCall<Input, Output> = (request: { data: Input }) => Promise<Output>;
export interface StreamInspectionDependencies {
  getAccess: ServerCall<
    { projectId: string },
    { projectId: string; userId: string; canPersist: boolean }
  >;
  createBaseline: ServerCall<CreatePublicBaselineInput, PublicBaselineSnapshot>;
  getBaseline: ServerCall<{ projectId: string; snapshotId: string }, PublicBaselineSnapshot | null>;
  savePlan: ServerCall<SaveVerificationPlanInput, VerificationPlanVersion>;
  getPlan: ServerCall<{ projectId: string; planId: string }, VerificationPlanVersion | null>;
  saveRound: ServerCall<
    SaveSurveyRoundInput & { expectedCallerUserId: string },
    SurveyRoundVersion
  >;
  getRound: ServerCall<{ projectId: string; roundVersionId: string }, SurveyRoundVersion | null>;
}
export type StreamInspectionStorage = Pick<Storage, "getItem" | "setItem">;
export interface StreamInspectionOptions {
  storage: StreamInspectionStorage;
  /** Must include current actor, project, geography, dates and component generation. */
  isCurrent(): boolean;
  onProgress?(progress: StreamInspectionProgress): void;
  randomUUID?(): string;
}

const Pin = z.object({ id: Uuid, sha256: Hash }).strict();
const ReceiptSchema = z
  .object({
    schema: z.literal("gofreyra.stream-inspection-start/v1"),
    scope: ScopeSchema,
    requests: z.object({ baseline: Uuid, plan: Uuid, round: Uuid }).strict(),
    snapshot: Pin.nullable(),
    plan: Pin.nullable(),
    roundReceipt: z
      .object({
        schema: z.literal("gofreyra.survey-round-request/v1"),
        actorId: Uuid,
        input: SaveSurveyRoundInputSchema,
      })
      .strict()
      .nullable(),
    round: Pin.nullable(),
  })
  .strict();
export type StreamInspectionReceipt = z.infer<typeof ReceiptSchema>;

function parseScope(raw: StreamInspectionScope): StreamInspectionScope {
  const scope = ScopeSchema.parse(raw);
  if (scope.reference.sourceProvider === undefined) delete scope.reference.sourceProvider;
  return scope;
}

export function streamInspectionReceiptKey(raw: StreamInspectionScope): string {
  const scope = parseScope(raw);
  return `gofreyra.stream-inspection-start:${scope.actorId}:${scope.projectId}:${encodeURIComponent(canonicalBaselineJson(scope))}`;
}

/** Corrupt/different stored input must stop visibly, never create another request. */
export function readStreamInspectionReceipt(
  storage: StreamInspectionStorage,
  raw: StreamInspectionScope,
): StreamInspectionReceipt | null {
  const scope = parseScope(raw);
  const text = storage.getItem(streamInspectionReceiptKey(scope));
  if (text === null) return null;
  if (new TextEncoder().encode(text).byteLength > 65536)
    throw new Error("Den gemte undersøgelseskvittering er for stor.");
  const receipt = ReceiptSchema.parse(JSON.parse(text));
  if (new Set(Object.values(receipt.requests)).size !== 3)
    throw new Error("Den gemte undersøgelse genbruger en anmodningsidentitet.");
  if (canonicalBaselineJson(receipt.scope) !== canonicalBaselineJson(scope))
    throw new Error("Genforsøget matcher ikke den valgte bruger, sag, geografi og periode.");
  if (
    (receipt.plan && !receipt.snapshot) ||
    (receipt.roundReceipt && !receipt.plan) ||
    (receipt.round && !receipt.roundReceipt)
  )
    throw new Error("Den gemte undersøgelseskvittering mangler et forudgående trin.");
  if (
    receipt.roundReceipt &&
    (receipt.roundReceipt.actorId !== scope.actorId ||
      receipt.roundReceipt.input.requestId !== receipt.requests.round)
  )
    throw new Error("Rundens gemte genforsøg matcher ikke undersøgelsen.");
  return receipt;
}

/** No UTC conversion: these are the user's confirmed Copenhagen calendar dates. */
export function streamInspectionRoundTitle(scope: StreamInspectionScope): string {
  const period = scope.recordingPeriod;
  const dates =
    period.dateFrom === period.dateTo ? period.dateFrom : `${period.dateFrom}–${period.dateTo}`;
  const suffix = ` · ${dates}`;
  const prefix = "FØR · ";
  let name = scope.projectName.trim();
  while ((prefix + name + suffix).length > 120) name = Array.from(name).slice(0, -1).join("");
  return prefix + name + suffix;
}

function roundScope(
  scope: StreamInspectionScope,
  snapshot: PublicBaselineSnapshot,
  plan: VerificationPlanVersion,
): SurveyRoundRequestScope {
  return {
    actorId: scope.actorId,
    projectId: scope.projectId,
    baselineId: snapshot.id,
    baselineSha256: snapshot.manifestSha256,
    planId: plan.id,
    planSha256: plan.manifestSha256,
    availableQuestionIds: plan.manifest.questions.map((question) => question.id),
  };
}

function planRow(value: VerificationPlanVersion) {
  return {
    id: value.id,
    project_id: value.projectId,
    version_no: value.version,
    baseline_id: value.baselineId,
    baseline_sha256: value.baselineSha256,
    generator_version: value.generatorVersion,
    manifest_sha256: value.manifestSha256,
    created_at: value.createdAt,
    created_by: value.createdBy,
    request_id: value.requestId,
    manifest: value.manifest,
  };
}

function execution(
  scope: StreamInspectionScope,
  dependencies: StreamInspectionDependencies,
  options: StreamInspectionOptions,
) {
  const guard = () => {
    if (!options.isCurrent())
      throw new Error(
        "Undersøgelsen blev stoppet, fordi bruger, sag eller de valgte oplysninger er ændret.",
      );
  };
  const wait = async <T>(operation: Promise<T>): Promise<T> => {
    const value = await operation;
    guard();
    return value;
  };
  const access = async (write: boolean) => {
    guard();
    const current = await wait(dependencies.getAccess({ data: { projectId: scope.projectId } }));
    if (
      current.projectId !== scope.projectId ||
      current.userId !== scope.actorId ||
      (write && !current.canPersist)
    )
      throw new Error("Din aktuelle adgang giver ikke lov til at fortsætte denne undersøgelse.");
    guard();
  };
  const progress = (stage: StreamInspectionProgress) => {
    guard();
    options.onProgress?.(stage);
    guard();
  };
  const baseline = async (
    value: PublicBaselineSnapshot | null,
    receipt: StreamInspectionReceipt,
  ): Promise<PublicBaselineSnapshot> => {
    if (!value)
      throw new Error("Det gemte datagrundlag kunne ikke genåbnes. Prøv samme undersøgelse igen.");
    value = structuredClone(value);
    const snapshot = await wait(
      baselineSnapshotFromRow({
        id: value.id,
        project_id: value.projectId,
        version_no: value.version,
        created_at: value.createdAt,
        created_by: value.createdBy,
        request_id: value.requestId,
        manifest_sha256: value.manifestSha256,
        manifest: value.manifest,
      }),
    );
    const referenceHash = await wait(baselineSha256(snapshot.manifest.reference.geometry));
    if (
      snapshot.projectId !== scope.projectId ||
      snapshot.createdBy !== scope.actorId ||
      snapshot.requestId !== receipt.requests.baseline ||
      snapshot.manifest.project.name !== scope.projectName ||
      snapshot.manifest.project.polygonSha256 !== scope.geometrySha256 ||
      snapshot.manifest.reference.id !== scope.reference.id ||
      snapshot.manifest.reference.zoneId !== scope.reference.zoneId ||
      snapshot.manifest.reference.sourceProvider !== scope.reference.sourceProvider ||
      referenceHash !== scope.reference.geometrySha256 ||
      snapshot.manifest.period.from !== scope.baselinePeriod.dateFrom ||
      snapshot.manifest.period.to !== scope.baselinePeriod.dateTo ||
      (receipt.snapshot &&
        (snapshot.id !== receipt.snapshot.id ||
          snapshot.manifestSha256 !== receipt.snapshot.sha256))
    )
      throw new Error(
        "Datagrundlaget matcher ikke undersøgelsens gemte geografi, bruger eller periode. Afklar området før du fortsætter.",
      );
    return snapshot;
  };
  const plan = async (
    value: VerificationPlanVersion | null,
    snapshot: PublicBaselineSnapshot,
    receipt: StreamInspectionReceipt,
  ): Promise<VerificationPlanVersion> => {
    if (!value) throw new Error("Den gemte spørgsmålsplan kunne ikke genåbnes.");
    value = structuredClone(value);
    if (value.status !== "draft")
      throw new Error("Spørgsmålsplanens status matcher ikke et gemt udkast.");
    const result = await wait(verificationPlanVersionFromRow(planRow(value), snapshot));
    if (
      result.createdBy !== scope.actorId ||
      result.requestId !== receipt.requests.plan ||
      (receipt.plan &&
        (result.id !== receipt.plan.id || result.manifestSha256 !== receipt.plan.sha256))
    )
      throw new Error("Spørgsmålsplanen matcher ikke undersøgelsens gemte anmodning.");
    if (!result.manifest.questions.length)
      throw new Error(
        "Datagrundlaget giver endnu ingen konkrete spørgsmål. Afklar vandløbets reference og overlap med området.",
      );
    return result;
  };
  const round = async (
    value: SurveyRoundVersion | null,
    snapshot: PublicBaselineSnapshot,
    savedPlan: VerificationPlanVersion,
    receipt: StreamInspectionReceipt,
  ): Promise<SurveyRoundVersion> => {
    if (!value || !receipt.roundReceipt)
      throw new Error("Den gemte FØR-runde kunne ikke genåbnes.");
    value = structuredClone(value);
    if (value.recordingWindow.timeZone !== "Europe/Copenhagen")
      throw new Error("Rundens kalenderperiode har en anden tidszone.");
    const result = await wait(
      surveyRoundVersionFromRow(
        {
          id: value.id,
          round_id: value.roundId,
          round_version_no: value.roundVersion,
          supersedes_id: value.supersedesId,
          project_id: value.projectId,
          version_no: value.version,
          baseline_id: value.baselineId,
          baseline_sha256: value.baselineSha256,
          plan_id: value.planId,
          plan_sha256: value.planSha256,
          builder_version: value.builderVersion,
          status: value.status,
          kind: value.kind,
          title: value.title,
          recording_date_from: value.recordingWindow.dateFrom,
          recording_date_to: value.recordingWindow.dateTo,
          manifest_sha256: value.manifestSha256,
          created_at: value.createdAt,
          created_by: value.createdBy,
          request_id: value.requestId,
          manifest: value.manifest,
        },
        snapshot,
        planRow(savedPlan),
      ),
    );
    const expected = createSurveyRoundReceipt(
      roundScope(scope, snapshot, savedPlan),
      {
        kind: "before",
        title: streamInspectionRoundTitle(scope),
        recordingWindow: scope.recordingPeriod,
        questionIds: savedPlan.manifest.questions.map((question) => question.id),
      },
      receipt.requests.round,
    );
    const stored = readSurveyRoundReceipt(
      JSON.stringify(receipt.roundReceipt),
      roundScope(scope, snapshot, savedPlan),
    );
    if (!stored || canonicalBaselineJson(stored) !== canonicalBaselineJson(expected))
      throw new Error("FØR-rundens præcise genforsøg matcher ikke den valgte undersøgelse.");
    assertSurveyRoundSaveResult(result, stored);
    if (
      receipt.round &&
      (result.id !== receipt.round.id || result.manifestSha256 !== receipt.round.sha256)
    )
      throw new Error("Den genåbnede FØR-runde matcher ikke den gemte version.");
    return result;
  };
  return { guard, wait, access, progress, baseline, plan, round };
}

/** Read-only mount/reload path: never creates rows or repairs/writes local receipts. */
export async function resumeCompletedStreamInspection(
  raw: StreamInspectionScope,
  dependencies: StreamInspectionDependencies,
  options: StreamInspectionOptions,
): Promise<StreamInspectionResult | null> {
  const scope = parseScope(raw);
  const run = execution(scope, dependencies, options);
  run.guard();
  const receipt = readStreamInspectionReceipt(options.storage, scope);
  if (!receipt?.snapshot || !receipt.plan || !receipt.round || !receipt.roundReceipt) return null;
  await run.access(false);
  const snapshot = await run.baseline(
    await run.wait(
      dependencies.getBaseline({
        data: { projectId: scope.projectId, snapshotId: receipt.snapshot.id },
      }),
    ),
    receipt,
  );
  run.guard();
  const plan = await run.plan(
    await run.wait(
      dependencies.getPlan({ data: { projectId: scope.projectId, planId: receipt.plan.id } }),
    ),
    snapshot,
    receipt,
  );
  run.guard();
  const round = await run.round(
    await run.wait(
      dependencies.getRound({
        data: { projectId: scope.projectId, roundVersionId: receipt.round.id },
      }),
    ),
    snapshot,
    plan,
    receipt,
  );
  run.guard();
  return { snapshot, plan, round };
}

const active = new Set<string>();

/** Explicit user action only. Each write is a separately authorized, idempotent draft step. */
export async function startStreamInspection(
  raw: StreamInspectionScope,
  dependencies: StreamInspectionDependencies,
  options: StreamInspectionOptions,
): Promise<StreamInspectionResult> {
  const scope = parseScope(raw);
  const key = streamInspectionReceiptKey(scope);
  const perform = async (): Promise<StreamInspectionResult> => {
    if (active.has(key)) throw new Error("Denne undersøgelse er allerede ved at blive klargjort.");
    active.add(key);
    const run = execution(scope, dependencies, options);
    try {
      await run.access(true);
      let receipt = readStreamInspectionReceipt(options.storage, scope);
      const assertDurable = (expected: StreamInspectionReceipt) => {
        run.guard();
        if (
          canonicalBaselineJson(readStreamInspectionReceipt(options.storage, scope)) !==
          canonicalBaselineJson(expected)
        )
          throw new Error("Undersøgelsens gemte genforsøg er ændret. Genåbn det gemte forløb.");
      };
      const store = (next: StreamInspectionReceipt) => {
        run.guard();
        const current = readStreamInspectionReceipt(options.storage, scope);
        if (canonicalBaselineJson(current) !== canonicalBaselineJson(receipt))
          throw new Error("Undersøgelsen er ændret i et andet vindue. Genåbn det gemte forløb.");
        const encoded = JSON.stringify(ReceiptSchema.parse(next));
        options.storage.setItem(key, encoded);
        if (options.storage.getItem(key) !== encoded)
          throw new Error(
            "Genforsøget kunne ikke gemmes sikkert. Ingen yderligere trin er startet.",
          );
        receipt = readStreamInspectionReceipt(options.storage, scope);
        if (!receipt) throw new Error("Undersøgelsens genforsøg mangler efter gemning.");
        run.guard();
      };
      if (!receipt) {
        const uuid = options.randomUUID ?? (() => crypto.randomUUID());
        const requests = { baseline: uuid(), plan: uuid(), round: uuid() };
        if (new Set(Object.values(requests)).size !== 3)
          throw new Error("Undersøgelsens anmodninger skal have forskellige identiteter.");
        store({
          schema: "gofreyra.stream-inspection-start/v1",
          scope,
          requests,
          snapshot: null,
          plan: null,
          roundReceipt: null,
          round: null,
        });
      }
      // The durable exact receipt exists before the first mutation or an ambiguous retry.
      let saved = receipt!;
      run.progress("baseline");
      let snapshot: PublicBaselineSnapshot;
      if (saved.snapshot) {
        snapshot = await run.baseline(
          await run.wait(
            dependencies.getBaseline({
              data: { projectId: scope.projectId, snapshotId: saved.snapshot.id },
            }),
          ),
          saved,
        );
        run.guard();
      } else {
        await run.access(true);
        assertDurable(saved);
        snapshot = await run.baseline(
          await run.wait(
            dependencies.createBaseline({
              data: {
                projectId: scope.projectId,
                ...scope.baselinePeriod,
                requestId: saved.requests.baseline,
              },
            }),
          ),
          saved,
        );
        run.guard();
        store({ ...saved, snapshot: { id: snapshot.id, sha256: snapshot.manifestSha256 } });
        saved = receipt!;
        snapshot = await run.baseline(
          await run.wait(
            dependencies.getBaseline({
              data: { projectId: scope.projectId, snapshotId: snapshot.id },
            }),
          ),
          saved,
        );
        run.guard();
      }
      const preview = await run.wait(buildVerificationPlanManifest(snapshot));
      if (!preview.questions.length)
        throw new Error(
          "Datagrundlaget giver endnu ingen konkrete spørgsmål. Afklar vandløbets reference og overlap med området.",
        );
      run.progress("plan");
      let plan: VerificationPlanVersion;
      if (saved.plan) {
        plan = await run.plan(
          await run.wait(
            dependencies.getPlan({ data: { projectId: scope.projectId, planId: saved.plan.id } }),
          ),
          snapshot,
          saved,
        );
        run.guard();
      } else {
        await run.access(true);
        assertDurable(saved);
        plan = await run.plan(
          await run.wait(
            dependencies.savePlan({
              data: {
                projectId: scope.projectId,
                baselineId: snapshot.id,
                requestId: saved.requests.plan,
              },
            }),
          ),
          snapshot,
          saved,
        );
        run.guard();
        store({ ...saved, plan: { id: plan.id, sha256: plan.manifestSha256 } });
        saved = receipt!;
        plan = await run.plan(
          await run.wait(
            dependencies.getPlan({ data: { projectId: scope.projectId, planId: plan.id } }),
          ),
          snapshot,
          saved,
        );
        run.guard();
      }
      run.progress("round");
      if (!saved.roundReceipt) {
        const roundReceipt = createSurveyRoundReceipt(
          roundScope(scope, snapshot, plan),
          {
            kind: "before",
            title: streamInspectionRoundTitle(scope),
            recordingWindow: scope.recordingPeriod,
            questionIds: plan.manifest.questions.map((question) => question.id),
          },
          saved.requests.round,
        );
        store({ ...saved, roundReceipt });
        saved = receipt!;
      }
      // Validate durable round input against the exact current saved baseline/plan before writing.
      const exact: SurveyRoundRequestReceipt = createSurveyRoundReceipt(
        roundScope(scope, snapshot, plan),
        {
          kind: "before",
          title: streamInspectionRoundTitle(scope),
          recordingWindow: scope.recordingPeriod,
          questionIds: plan.manifest.questions.map((question) => question.id),
        },
        saved.requests.round,
      );
      if (canonicalBaselineJson(saved.roundReceipt) !== canonicalBaselineJson(exact))
        throw new Error("Rundens gemte input matcher ikke undersøgelsen.");
      let round: SurveyRoundVersion;
      if (saved.round) {
        round = await run.round(
          await run.wait(
            dependencies.getRound({
              data: { projectId: scope.projectId, roundVersionId: saved.round.id },
            }),
          ),
          snapshot,
          plan,
          saved,
        );
        run.guard();
      } else {
        await run.access(true);
        assertDurable(saved);
        round = await run.round(
          await run.wait(
            dependencies.saveRound({
              data: { ...exact.input, expectedCallerUserId: scope.actorId },
            }),
          ),
          snapshot,
          plan,
          saved,
        );
        run.guard();
        store({ ...saved, round: { id: round.id, sha256: round.manifestSha256 } });
        saved = receipt!;
        round = await run.round(
          await run.wait(
            dependencies.getRound({
              data: { projectId: scope.projectId, roundVersionId: round.id },
            }),
          ),
          snapshot,
          plan,
          saved,
        );
        run.guard();
      }
      run.progress("complete");
      return { snapshot, plan, round };
    } finally {
      active.delete(key);
    }
  };
  // Serialize cooperating browser tabs as well as mounted components. SQL request IDs
  // remain authoritative if a tab closes during a request or Web Locks is unavailable.
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(key, { mode: "exclusive", ifAvailable: true }, (lock) => {
      if (!lock) throw new Error("Denne undersøgelse er allerede åben i et andet vindue.");
      return perform();
    });
  }
  return perform();
}
