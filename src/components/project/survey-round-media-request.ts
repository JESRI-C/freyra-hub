import { z } from "zod";
import {
  SaveSurveyRoundMediaInputSchema,
  type SurveyRoundMediaVersion,
} from "@/services/baseline/survey-round-media-persistence";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";
import type { SurveyRoundMediaCandidate } from "@/lib/survey-round-media.functions";

const Uuid = SaveSurveyRoundMediaInputSchema.shape.projectId;
const Hash = SaveSurveyRoundMediaInputSchema.shape.roundSha256;
const ReceiptSchema = z
  .object({
    schema: z.literal("gofreyra.survey-round-media-request/v1"),
    actorId: Uuid,
    fileName: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (value) =>
          !value.includes("/") &&
          !value.includes("\\") &&
          [...value].every((character) => {
            const code = character.codePointAt(0)!;
            return code >= 32 && (code < 127 || code > 159);
          }),
      ),
    originalSha256: Hash,
    originalValidationSha256: Hash,
    input: SaveSurveyRoundMediaInputSchema,
  })
  .strict();
export type SurveyRoundMediaReceipt = z.infer<typeof ReceiptSchema>;
export interface SurveyRoundMediaScope {
  actorId: string;
  round: SurveyRoundVersion;
}
export interface SurveyRoundMediaExecution {
  key: string;
  generation: number;
  instance: object;
}
export interface SurveyRoundMediaSaveResult {
  version: SurveyRoundMediaVersion;
  receipt: SurveyRoundMediaReceipt;
  execution: SurveyRoundMediaExecution;
}
export function surveyRoundMediaReceiptKey(scope: SurveyRoundMediaScope): string {
  Uuid.parse(scope.actorId);
  Uuid.parse(scope.round.projectId);
  Uuid.parse(scope.round.id);
  return `gofreyra.survey-round-media-request:${scope.actorId}:${scope.round.projectId}:${scope.round.id}`;
}
function assertInputScope(receipt: SurveyRoundMediaReceipt, scope: SurveyRoundMediaScope): void {
  const input = receipt.input,
    round = scope.round;
  if (
    receipt.actorId !== scope.actorId ||
    input.projectId !== round.projectId ||
    input.roundVersionId !== round.id ||
    input.roundSha256 !== round.manifestSha256 ||
    input.baselineId !== round.baselineId ||
    input.baselineSha256 !== round.baselineSha256 ||
    input.planId !== round.planId ||
    input.planSha256 !== round.planSha256 ||
    input.questionIds.some((id) => !round.manifest.questionIds.includes(id))
  )
    throw new Error("Genforsøget matcher ikke den aktuelle bruger, runde og de valgte spørgsmål.");
}
export function createSurveyRoundMediaReceipt(
  scope: SurveyRoundMediaScope,
  candidate: SurveyRoundMediaCandidate,
  questionIds: string[],
  requestId: string,
): SurveyRoundMediaReceipt {
  const round = scope.round;
  const receipt = ReceiptSchema.parse({
    schema: "gofreyra.survey-round-media-request/v1",
    actorId: scope.actorId,
    fileName: candidate.fileName,
    originalSha256: candidate.originalSha256,
    originalValidationSha256: candidate.originalValidationSha256,
    input: {
      projectId: round.projectId,
      roundVersionId: round.id,
      roundSha256: round.manifestSha256,
      baselineId: round.baselineId,
      baselineSha256: round.baselineSha256,
      planId: round.planId,
      planSha256: round.planSha256,
      mediaId: candidate.mediaId,
      requestId,
      questionIds: [...questionIds].sort(),
    },
  });
  assertInputScope(receipt, scope);
  return receipt;
}
export function readSurveyRoundMediaReceipt(
  text: string | null,
  scope: SurveyRoundMediaScope,
): SurveyRoundMediaReceipt | null {
  if (text === null) return null;
  if (new TextEncoder().encode(text).byteLength > 32_768)
    throw new Error("Den lokale genforsøgsreference er for stor.");
  const receipt = ReceiptSchema.parse(JSON.parse(text));
  assertInputScope(receipt, scope);
  return receipt;
}
export function surveyRoundMediaMatchesRound(
  version: SurveyRoundMediaVersion,
  round: SurveyRoundVersion,
): boolean {
  const m = version.manifest;
  return (
    Uuid.safeParse(version.id).success &&
    Hash.safeParse(version.manifestSha256).success &&
    version.projectId === round.projectId &&
    version.roundVersionId === round.id &&
    Number.isInteger(version.version) &&
    version.version > 0 &&
    m?.schema === "gofreyra.survey-round-media/v1" &&
    m.status === "draft_assignment" &&
    m.projectId === round.projectId &&
    m.roundVersionId === round.id &&
    m.roundSha256 === round.manifestSha256 &&
    m.baselineId === round.baselineId &&
    m.baselineSha256 === round.baselineSha256 &&
    m.planId === round.planId &&
    m.planSha256 === round.planSha256 &&
    m.mediaId === version.mediaId &&
    m.questionIds.length > 0 &&
    m.questionIds.every((id) => round.manifest.questionIds.includes(id)) &&
    m.acceptance.municipalScopeApproved === false &&
    m.acceptance.professionalApproved === false &&
    m.acceptance.pixelDecoded === false &&
    m.acceptance.georeferenced === false &&
    m.acceptance.reportEligible === false &&
    m.acceptance.reportAccepted === false
  );
}
export function assertSurveyRoundMediaSaved(
  version: SurveyRoundMediaVersion,
  receipt: SurveyRoundMediaReceipt,
  round: SurveyRoundVersion,
): void {
  const input = receipt.input;
  if (
    !surveyRoundMediaMatchesRound(version, round) ||
    version.requestId !== input.requestId ||
    version.createdBy !== receipt.actorId ||
    version.mediaId !== input.mediaId ||
    version.manifest.originalSha256 !== receipt.originalSha256 ||
    version.manifest.originalValidationSha256 !== receipt.originalValidationSha256 ||
    JSON.stringify(version.manifest.questionIds) !== JSON.stringify([...input.questionIds].sort())
  )
    throw new Error("Den gemte billedtilknytning matcher ikke det sendte udkast og originalfoto.");
}
