import { z } from "zod";
import {
  SaveSurveyRoundInputSchema,
  type SaveSurveyRoundInput,
  type SurveyRoundVersion,
} from "@/services/baseline/survey-round-persistence";

export interface SurveyRoundRequestScope {
  actorId: string;
  projectId: string;
  baselineId: string;
  baselineSha256: string;
  planId: string;
  planSha256: string;
  availableQuestionIds: string[];
}
export type SurveyRoundDraftInput = Pick<
  SaveSurveyRoundInput,
  "kind" | "title" | "recordingWindow" | "questionIds"
>;
export interface SurveyRoundRequestReceipt {
  schema: "gofreyra.survey-round-request/v1";
  actorId: string;
  input: SaveSurveyRoundInput;
}
export interface SurveyRoundExecutionToken {
  key: string;
  generation: number;
  instance: object;
}
export interface SurveyRoundMutationResult {
  version: SurveyRoundVersion;
  receipt: SurveyRoundRequestReceipt;
  execution: SurveyRoundExecutionToken;
}

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const ReceiptSchema = z
  .object({
    schema: z.literal("gofreyra.survey-round-request/v1"),
    actorId: Uuid,
    input: SaveSurveyRoundInputSchema,
  })
  .strict();

export function surveyRoundReceiptKey(scope: SurveyRoundRequestScope): string {
  for (const id of [scope.actorId, scope.projectId, scope.baselineId, scope.planId]) Uuid.parse(id);
  return `gofreyra.survey-round-request:${scope.actorId}:${scope.projectId}:${scope.baselineId}:${scope.planId}`;
}

function assertScope(input: SaveSurveyRoundInput, scope: SurveyRoundRequestScope): void {
  const available = new Set(scope.availableQuestionIds);
  if (
    input.projectId !== scope.projectId ||
    input.baselineId !== scope.baselineId ||
    input.baselineSha256 !== scope.baselineSha256 ||
    input.planId !== scope.planId ||
    input.planSha256 !== scope.planSha256 ||
    input.questionIds.some((id) => !available.has(id))
  )
    throw new Error("Genforsøget matcher ikke den valgte gemte baseline og planversion.");
}

/** A retry retains the exact request and input; changes require a separate new draft. */
export function createSurveyRoundReceipt(
  scope: SurveyRoundRequestScope,
  draft: SurveyRoundDraftInput,
  requestId: string,
): SurveyRoundRequestReceipt {
  const input = SaveSurveyRoundInputSchema.parse({
    projectId: scope.projectId,
    baselineId: scope.baselineId,
    baselineSha256: scope.baselineSha256,
    planId: scope.planId,
    planSha256: scope.planSha256,
    requestId,
    kind: draft.kind,
    title: draft.title.trim(),
    recordingWindow: { ...draft.recordingWindow },
    questionIds: [...draft.questionIds].sort(),
  });
  assertScope(input, scope);
  return ReceiptSchema.parse({
    schema: "gofreyra.survey-round-request/v1",
    actorId: scope.actorId,
    input,
  });
}

/** Invalid stored input fails visibly; it must not silently produce a new request ID. */
export function readSurveyRoundReceipt(
  text: string | null,
  scope: SurveyRoundRequestScope,
): SurveyRoundRequestReceipt | null {
  if (text === null) return null;
  if (new TextEncoder().encode(text).byteLength > 65_536)
    throw new Error("Den lokale genforsøgsreference er for stor.");
  const receipt = ReceiptSchema.parse(JSON.parse(text));
  if (receipt.actorId !== scope.actorId) throw new Error("Genforsøget tilhører en anden bruger.");
  assertScope(receipt.input, scope);
  return receipt;
}

export function surveyRoundMatchesSelection(
  round: SurveyRoundVersion,
  scope: Omit<SurveyRoundRequestScope, "actorId" | "availableQuestionIds">,
): boolean {
  return (
    Uuid.safeParse(round.id).success &&
    Uuid.safeParse(round.roundId).success &&
    round.roundVersion === 1 &&
    round.supersedesId === null &&
    Number.isInteger(round.version) &&
    round.version > 0 &&
    /^[0-9a-f]{64}$/.test(round.manifestSha256) &&
    round.projectId === scope.projectId &&
    round.baselineId === scope.baselineId &&
    round.baselineSha256 === scope.baselineSha256 &&
    round.planId === scope.planId &&
    round.planSha256 === scope.planSha256 &&
    round.status === "draft" &&
    round.manifest?.schema === "gofreyra.survey-round/v1" &&
    round.manifest?.status === "draft" &&
    round.manifest.projectId === scope.projectId &&
    round.manifest.baselineId === scope.baselineId &&
    round.manifest.baselineSha256 === scope.baselineSha256 &&
    round.manifest.planId === scope.planId &&
    round.manifest.planSha256 === scope.planSha256 &&
    round.manifest.recordingWindow.timeZone === "Europe/Copenhagen" &&
    round.manifest.recordingWindow.actualCoverage === "not_verified" &&
    round.manifest.acceptance.municipalScopeApproved === false &&
    round.manifest.acceptance.professionalApproved === false &&
    round.manifest.acceptance.reportAccepted === false
  );
}

export function assertSurveyRoundSaveResult(
  round: SurveyRoundVersion,
  receipt: SurveyRoundRequestReceipt,
): void {
  const input = receipt.input;
  if (
    !surveyRoundMatchesSelection(round, input) ||
    round.requestId !== input.requestId ||
    round.createdBy !== receipt.actorId ||
    round.manifest.kind !== input.kind ||
    round.manifest.title !== input.title ||
    round.manifest.recordingWindow.dateFrom !== input.recordingWindow.dateFrom ||
    round.manifest.recordingWindow.dateTo !== input.recordingWindow.dateTo ||
    round.manifest.recordingWindow.timeZone !== "Europe/Copenhagen" ||
    round.manifest.recordingWindow.actualCoverage !== "not_verified" ||
    JSON.stringify(round.manifest.questionIds) !== JSON.stringify([...input.questionIds].sort()) ||
    round.manifest.acceptance.municipalScopeApproved !== false ||
    round.manifest.acceptance.professionalApproved !== false ||
    round.manifest.acceptance.reportAccepted !== false
  )
    throw new Error("Den gemte registreringsrunde matcher ikke det sendte udkast.");
}
