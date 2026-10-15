import { z } from "zod";
import {
  SaveSurveyRoundNoteInputSchema,
  SurveyRoundNoteManifestSchema,
  buildSurveyRoundNoteManifestV1,
  surveyRoundNoteCanonicalText,
  type SaveSurveyRoundNoteInput,
  type SurveyRoundNoteVersion,
} from "@/services/baseline/survey-round-note-persistence";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";
import type { VerificationPlanVersion } from "@/services/baseline/verification-plan-persistence";
import { surveyRoundMediaMatchesRound } from "./survey-round-media-request";

const Uuid = SaveSurveyRoundNoteInputSchema.shape.projectId;
const Hash = SaveSurveyRoundNoteInputSchema.shape.roundSha256;
const ReceiptSchema = z
  .object({
    schema: z.literal("gofreyra.survey-round-note-request/v1"),
    actorId: Uuid,
    originalSha256: Hash,
    originalValidationSha256: Hash,
    input: SaveSurveyRoundNoteInputSchema,
  })
  .strict();
export type SurveyRoundNoteReceipt = z.infer<typeof ReceiptSchema>;
export interface SurveyRoundNoteScope {
  actorId: string;
  binding: SurveyRoundMediaVersion;
  round: SurveyRoundVersion;
  plan: VerificationPlanVersion;
}
export interface SurveyRoundNoteExecution {
  key: string;
  generation: number;
  instance: object;
}
export interface SurveyRoundNoteSaveResult {
  version: SurveyRoundNoteVersion;
  receipt: SurveyRoundNoteReceipt;
  execution: SurveyRoundNoteExecution;
}

export function surveyRoundNoteQuestions(scope: Omit<SurveyRoundNoteScope, "actorId">) {
  const { binding, round, plan } = scope;
  if (
    !surveyRoundMediaMatchesRound(binding, round) ||
    plan.projectId !== round.projectId ||
    plan.id !== round.planId ||
    plan.manifestSha256 !== round.planSha256 ||
    plan.baselineId !== round.baselineId ||
    plan.baselineSha256 !== round.baselineSha256 ||
    plan.status !== "draft" ||
    round.status !== "draft"
  )
    return [];
  return plan.manifest.questions.filter(
    (question) =>
      binding.manifest.questionIds.includes(question.id) &&
      round.manifest.questionIds.includes(question.id) &&
      question.id === `verification:${round.baselineId}:official-reference-location:v1` &&
      question.snapshotId === round.baselineId &&
      question.snapshotSha256 === round.baselineSha256 &&
      question.sourceIds.length === 1 &&
      question.sourceIds[0] === "official-watercourse-reference" &&
      question.result === null,
  );
}
export function surveyRoundNoteReceiptKey(scope: SurveyRoundNoteScope): string {
  Uuid.parse(scope.actorId);
  Uuid.parse(scope.round.projectId);
  Uuid.parse(scope.binding.id);
  return `gofreyra.survey-round-note-request:${scope.actorId}:${scope.round.projectId}:${scope.binding.id}`;
}
function assertScope(receipt: SurveyRoundNoteReceipt, scope: SurveyRoundNoteScope): void {
  const i = receipt.input,
    r = scope.round,
    b = scope.binding;
  if (
    receipt.actorId !== scope.actorId ||
    i.projectId !== r.projectId ||
    i.mediaBindingId !== b.id ||
    i.mediaBindingSha256 !== b.manifestSha256 ||
    i.roundVersionId !== r.id ||
    i.roundSha256 !== r.manifestSha256 ||
    i.baselineId !== r.baselineId ||
    i.baselineSha256 !== r.baselineSha256 ||
    i.planId !== r.planId ||
    i.planSha256 !== r.planSha256 ||
    receipt.originalSha256 !== b.manifest.originalSha256 ||
    receipt.originalValidationSha256 !== b.manifest.originalValidationSha256 ||
    !surveyRoundNoteQuestions(scope).some((question) => question.id === i.questionId)
  )
    throw new Error(
      "Genforsøget matcher ikke den aktuelle bruger, billedtilknytning og det gemte spørgsmål.",
    );
}
export async function createSurveyRoundNoteReceipt(
  scope: SurveyRoundNoteScope,
  questionId: string,
  manual: SaveSurveyRoundNoteInput["manual"],
  requestId: string,
  logicalNoteId: string,
): Promise<SurveyRoundNoteReceipt> {
  const r = scope.round;
  const receipt = ReceiptSchema.parse({
    schema: "gofreyra.survey-round-note-request/v1",
    actorId: scope.actorId,
    originalSha256: scope.binding.manifest.originalSha256,
    originalValidationSha256: scope.binding.manifest.originalValidationSha256,
    input: {
      projectId: r.projectId,
      mediaBindingId: scope.binding.id,
      mediaBindingSha256: scope.binding.manifestSha256,
      roundVersionId: r.id,
      roundSha256: r.manifestSha256,
      baselineId: r.baselineId,
      baselineSha256: r.baselineSha256,
      planId: r.planId,
      planSha256: r.planSha256,
      questionId,
      manual,
      requestId,
      logicalNoteId,
    },
  });
  assertScope(receipt, scope);
  await buildSurveyRoundNoteManifestV1(receipt.input, scope.binding, scope.plan);
  return receipt;
}
export function readSurveyRoundNoteReceipt(
  text: string | null,
  scope: SurveyRoundNoteScope,
): SurveyRoundNoteReceipt | null {
  if (text === null) return null;
  if (new TextEncoder().encode(text).byteLength > 32768)
    throw new Error("Den lokale genforsøgsreference er for stor.");
  const receipt = ReceiptSchema.parse(JSON.parse(text));
  assertScope(receipt, scope);
  return receipt;
}
export function sameSurveyRoundNoteReceipt(
  a: SurveyRoundNoteReceipt | null,
  b: SurveyRoundNoteReceipt,
): boolean {
  return !!a && surveyRoundNoteCanonicalText(a) === surveyRoundNoteCanonicalText(b);
}
export async function assertSurveyRoundNoteMatchesScope(
  version: SurveyRoundNoteVersion,
  scope: SurveyRoundNoteScope,
): Promise<void> {
  Uuid.parse(version.id);
  Uuid.parse(version.createdBy);
  Uuid.parse(version.requestId);
  z.string().datetime({ offset: true }).parse(version.createdAt);
  Hash.parse(version.manifestSha256);
  const m = SurveyRoundNoteManifestSchema.parse(version.manifest);
  const input = SaveSurveyRoundNoteInputSchema.parse({
    projectId: m.projectId,
    logicalNoteId: m.logicalNoteId,
    requestId: version.requestId,
    mediaBindingId: m.mediaBindingId,
    mediaBindingSha256: m.mediaBindingSha256,
    roundVersionId: m.roundVersionId,
    roundSha256: m.roundSha256,
    baselineId: m.baselineId,
    baselineSha256: m.baselineSha256,
    planId: m.planId,
    planSha256: m.planSha256,
    questionId: m.questionId,
    manual: m.manual,
  });
  assertScope(
    {
      schema: "gofreyra.survey-round-note-request/v1",
      actorId: scope.actorId,
      originalSha256: m.originalSha256,
      originalValidationSha256: m.originalValidationSha256,
      input,
    },
    scope,
  );
  if (
    version.projectId !== m.projectId ||
    version.logicalNoteId !== m.logicalNoteId ||
    version.mediaBindingId !== m.mediaBindingId ||
    version.roundVersionId !== m.roundVersionId ||
    version.noteVersion !== 1 ||
    !Number.isInteger(version.version) ||
    version.version < 1
  )
    throw new Error("Notens registrering matcher ikke den valgte billedtilknytning.");
  const expected = await buildSurveyRoundNoteManifestV1(input, scope.binding, scope.plan);
  if (
    surveyRoundNoteCanonicalText(m) !== surveyRoundNoteCanonicalText(expected) ||
    (await baselineSha256(m)) !== version.manifestSha256
  )
    throw new Error("Notens indhold eller referencer matcher ikke det gemte grundlag.");
}
export async function assertSurveyRoundNoteSaved(
  version: SurveyRoundNoteVersion,
  receipt: SurveyRoundNoteReceipt,
  scope: SurveyRoundNoteScope,
): Promise<void> {
  assertScope(receipt, scope);
  await assertSurveyRoundNoteMatchesScope(version, scope);
  const expected = await buildSurveyRoundNoteManifestV1(receipt.input, scope.binding, scope.plan);
  if (
    version.createdBy !== receipt.actorId ||
    version.requestId !== receipt.input.requestId ||
    version.logicalNoteId !== receipt.input.logicalNoteId ||
    surveyRoundNoteCanonicalText(version.manifest) !== surveyRoundNoteCanonicalText(expected)
  )
    throw new Error("Den gemte note matcher ikke det præcise udkast og genforsøg.");
}
