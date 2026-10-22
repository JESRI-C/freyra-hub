import { z } from "zod";
import {
  baselineSha256,
  canonicalBaselineJson,
  validatePublicBaselineManifest,
} from "@/services/baseline/public-baseline-service";
import type {
  PublicBaselineSnapshot,
  PublicBaselineSource,
} from "@/services/baseline/public-baseline-types";
import type { VerificationPlanVersion } from "@/services/baseline/verification-plan-persistence";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import {
  SurveyRoundNoteManifestSchema,
  type SurveyRoundNoteVersion,
} from "@/services/baseline/survey-round-note-persistence";
import { DroneImageInspectionDraftSchema } from "./drone-image-inspection";
import { PhotoPointReviewSchema, type PhotoPointReviewRecord } from "./photo-point-review";
import { PlantingReportSchema, compilePlantingReportV1 } from "@/services/planting/planting-report";
import {
  droneImageInspectionAnswersCanonicalText,
  validateDroneImageInspectionAnswerQuestions,
  type DroneImageInspectionRecord,
  type DroneImageInspectionAnswersRecord,
} from "./drone-image-inspection-persistence";

export const MUNICIPAL_REPORT_SCHEMA = "gofreyra.municipal-report/v1" as const;
export const MUNICIPAL_REPORT_GENERATOR = "municipal-evidence-report/v1" as const;
export const MUNICIPAL_REPORT_GENERATOR_V2 = "municipal-evidence-report/v2" as const;
export type MunicipalReportGenerator =
  | typeof MUNICIPAL_REPORT_GENERATOR
  | typeof MUNICIPAL_REPORT_GENERATOR_V2;
export const MAX_MUNICIPAL_REPORT_BYTES = 2 * 1024 * 1024;
const Uuid = z.string().uuid(),
  Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Timestamp = z.string().datetime({ offset: true });
const Text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (value) =>
        [...value].every((c) => {
          const p = c.codePointAt(0)!;
          return p === 10 || (p >= 32 && (p < 127 || p > 159));
        }),
      "Rapporttekst indeholder kontroltegn.",
    );
const Pin = z.object({ id: Uuid, sha256: Hash }).strict();
const FrozenPhotoReview = z
  .object({
    id: Uuid,
    projectId: Uuid,
    bindingId: Uuid,
    reviewedBy: Uuid,
    requestId: Uuid,
    review: PhotoPointReviewSchema,
    reviewSha256: Hash,
    createdAt: Timestamp,
  })
  .strict();
const Question = z
  .object({
    id: Text(300),
    question: Text(1000),
    rationale: Text(2000),
    assessment: z.enum(["confirmed", "not_confirmed", "uncertain"]).nullable(),
    note: Text(2000).nullable(),
    followup: Text(1000).nullable(),
    answerVersionId: Uuid.nullable(),
  })
  .strict();
const ManualNote = z
  .object({
    id: Uuid,
    sha256: Hash,
    createdAt: Timestamp,
    questionId: Text(300),
    question: Text(1000),
    qualitativeAnswer: z.enum(["supports_reference", "does_not_support_reference", "inconclusive"]),
    statement: Text(2000),
    uncertainty: Text(1000),
    proposedFollowup: Text(1000),
    proposedPriority: z.enum(["not_assessed", "high", "normal", "low"]),
  })
  .strict();
const Inspection = z
  .object({
    id: Uuid,
    sha256: Hash,
    model: Text(150),
    generatedAt: Timestamp,
    quality: z.enum(["usable", "limited", "unusable"]),
    qualityLimitation: Text(1000),
    watercourseVisibility: z.enum(["visible", "partly_visible", "not_visible", "uncertain"]),
    uncertainty: Text(1000),
    features: z
      .array(
        z
          .object({
            kind: z.enum([
              "vegetation_cover",
              "possible_obstruction",
              "bank_surface_change",
              "artificial_structure",
              "surface_water",
            ]),
            description: Text(1000),
            uncertainty: Text(1000),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(5),
    questions: z.array(Question).min(1).max(9),
  })
  .strict();
const Source = z
  .object({
    id: Text(200),
    provider: Text(500),
    dataset: Text(1000),
    datasetVersion: Text(300).nullable(),
    sourceUrl: z.string().url().nullable(),
    sourceModifiedAt: Text(100).nullable(),
    fetchedAt: Text(100),
    requestedFrom: Text(100),
    requestedTo: Text(100),
    observedFrom: Text(100).nullable(),
    observedTo: Text(100).nullable(),
    mode: z.enum(["live", "import", "preview", "error"]),
    status: z.enum([
      "complete",
      "partial",
      "no_coverage",
      "not_configured",
      "not_implemented",
      "timeout",
      "failed",
    ]),
    evidenceKind: z.enum([
      "official_registration",
      "measurement",
      "calculation",
      "estimate",
      "preview",
    ]),
    spatialCoverage: z.enum(["complete", "partial", "none", "unknown"]),
    temporalCoverage: z.enum(["complete", "partial", "none", "unknown"]),
    paginationComplete: z.boolean(),
    returnedCount: z.number().int().nonnegative().nullable(),
    payloadSha256: Hash.nullable(),
    facts: z.array(Text(2000)).max(30),
    limitations: z.array(Text(5000)).max(100),
  })
  .strict();
const Photo = z
  .object({
    bindingId: Uuid,
    bindingSha256: Hash,
    mediaId: Uuid,
    originalSha256: Hash,
    originalValidationSha256: Hash,
    capturedAtUtc: Timestamp.nullable(),
    localTimestamp: Text(100).nullable(),
    timezoneKnown: z.boolean(),
    cameraPosition: z
      .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
      .strict()
      .nullable(),
    captureWithinPlannedWindow: z.literal("not_verified"),
    manualNotes: z.array(ManualNote).max(400),
    inspections: z.array(Inspection).max(400),
  })
  .strict();
const Followup = z
  .object({
    id: Text(400),
    priority: z.enum(["before_delivery", "field_review", "supplementary"]),
    title: Text(1000),
    rationale: Text(5000),
    action: Text(2000),
    proposedBy: z.enum(["system", "user"]),
    sourceIds: z.array(Text(200)).max(30),
    mediaIds: z.array(Uuid).max(200),
    evidenceRefs: z.array(Text(400)).max(800),
  })
  .strict();
export const MunicipalReportManifestSchema = z
  .object({
    schema: z.literal(MUNICIPAL_REPORT_SCHEMA),
    generatorVersion: z.enum([MUNICIPAL_REPORT_GENERATOR, MUNICIPAL_REPORT_GENERATOR_V2]),
    projectId: Uuid,
    generatedAt: Timestamp,
    recipient: z.literal("Haderslev Kommune"),
    status: z.literal("draft_unreviewed"),
    reportEligible: z.literal(false),
    professionallyReviewed: z.literal(false),
    municipalScopeApproved: z.literal(false),
    projectName: Text(1000),
    purpose: Text(2000),
    executiveSummary: z.array(Text(2000)).max(20),
    pins: z
      .object({
        baseline: Pin,
        plan: Pin,
        round: Pin,
        mediaBindings: z
          .array(
            Pin.extend({
              mediaId: Uuid,
              originalSha256: Hash,
              originalValidationSha256: Hash,
            }).strict(),
          )
          .max(200),
        notes: z.array(Pin).max(400),
        inspections: z.array(Pin.extend({ mediaId: Uuid }).strict()).max(400),
        answers: z.array(Pin.extend({ inspectionId: Uuid }).strict()).max(400),
      })
      .strict(),
    scope: z
      .object({
        referenceId: Text(300),
        referenceName: Text(1000),
        referenceNameStatus: Text(200),
        municipalities: z.array(Text(200)).max(100),
        sourceModifiedAt: Text(100).nullable(),
        savedAt: Text(100),
        referenceSourceUrl: z.string().url().nullable(),
        period: z.object({ from: Text(100), to: Text(100) }).strict(),
        roundKind: z.enum(["before", "after", "control"]),
        roundTitle: Text(200),
        recordingWindow: z
          .object({
            dateFrom: Text(100),
            dateTo: Text(100),
            timeZone: z.literal("Europe/Copenhagen"),
          })
          .strict(),
        actualCoverage: z.literal("not_verified"),
        spatialInterpretation: z.literal("saved_reference_and_aoi_not_approved_municipal_reach"),
      })
      .strict(),
    sources: z.array(Source).max(30),
    photos: z.array(Photo).max(200),
    prioritizedFollowup: z.array(Followup).max(5000),
    deliveryGaps: z
      .array(
        z
          .object({
            code: Text(400),
            title: Text(1000),
            detail: Text(3000),
            evidenceRefs: z.array(Text(400)).max(800),
          })
          .strict(),
      )
      .max(500),
    limitations: z.array(Text(3000)).max(30),
    planting: PlantingReportSchema.optional(),
    photoPointReviews: z.array(FrozenPhotoReview).max(200).optional(),
  })
  .strict()
  .superRefine((report, ctx) => {
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    if (report.generatorVersion === MUNICIPAL_REPORT_GENERATOR) {
      if (report.planting !== undefined || report.photoPointReviews !== undefined)
        ctx.addIssue({
          code: "custom",
          message: "Historiske rapporter må ikke tilføjes nye afsnit.",
        });
    } else if (!report.planting || !report.photoPointReviews) {
      ctx.addIssue({
        code: "custom",
        message: "Rapport v2 mangler beplantningsgrundlag eller fotogennemgang.",
      });
    }
    if (
      report.planting &&
      (report.planting.projectId !== report.projectId ||
        report.planting.baselineId !== report.pins.baseline.id ||
        report.planting.baselineSha256 !== report.pins.baseline.sha256)
    )
      ctx.addIssue({
        code: "custom",
        message: "Beplantningsskitsen matcher ikke rapportens kildeversion.",
      });
    if (
      report.photoPointReviews &&
      (!unique(report.photoPointReviews.map((review) => review.id)) ||
        !unique(report.photoPointReviews.map((review) => review.bindingId)) ||
        report.photoPointReviews.some((record) => {
          const review = record.review;
          return (
            record.projectId !== report.projectId ||
            review.projectId !== report.projectId ||
            record.bindingId !== review.bindingId ||
            review.baselineId !== report.pins.baseline.id ||
            review.baselineSha256 !== report.pins.baseline.sha256 ||
            Date.parse(record.createdAt) > Date.parse(report.generatedAt) ||
            !report.pins.mediaBindings.some(
              (pin) =>
                pin.id === review.bindingId &&
                pin.sha256 === review.bindingSha256 &&
                pin.mediaId === review.mediaId &&
                pin.originalSha256 === review.originalSha256,
            ) ||
            (review.inspectionId !== null &&
              !report.pins.inspections.some(
                (pin) =>
                  pin.id === review.inspectionId &&
                  pin.sha256 === review.inspectionSha256 &&
                  pin.mediaId === review.mediaId,
              ))
          );
        }))
    )
      ctx.addIssue({
        code: "custom",
        message: "Faglig fotogennemgang matcher ikke rapportens præcise input.",
      });
    if (
      ![
        report.pins.mediaBindings,
        report.pins.notes,
        report.pins.inspections,
        report.pins.answers,
      ].every((pins) => unique(pins.map((p) => p.id))) ||
      !unique(report.photos.map((p) => p.mediaId))
    )
      ctx.addIssue({
        code: "custom",
        message: "Rapporten indeholder gentagne versionsreferencer.",
      });
    if (
      report.photos.length !== report.pins.mediaBindings.length ||
      report.photos.some(
        (photo) =>
          !report.pins.mediaBindings.some(
            (pin) =>
              pin.id === photo.bindingId &&
              pin.sha256 === photo.bindingSha256 &&
              pin.mediaId === photo.mediaId &&
              pin.originalSha256 === photo.originalSha256 &&
              pin.originalValidationSha256 === photo.originalValidationSha256,
          ),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Rapportens fotos matcher ikke versionsreferencerne.",
      });
    const noteRefs = report.photos.flatMap((photo) => photo.manualNotes);
    const inspectionRefs = report.photos.flatMap((photo) =>
      photo.inspections.map((inspection) => ({ ...inspection, mediaId: photo.mediaId })),
    );
    if (
      noteRefs.length !== report.pins.notes.length ||
      noteRefs.some(
        (note) =>
          !report.pins.notes.some((pin) => pin.id === note.id && pin.sha256 === note.sha256),
      ) ||
      inspectionRefs.length !== report.pins.inspections.length ||
      inspectionRefs.some(
        (inspection) =>
          !report.pins.inspections.some(
            (pin) =>
              pin.id === inspection.id &&
              pin.sha256 === inspection.sha256 &&
              pin.mediaId === inspection.mediaId,
          ),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Rapportens noter og billedvurderinger matcher ikke versionsreferencerne.",
      });
    if (
      !unique(report.pins.answers.map((answer) => answer.inspectionId)) ||
      report.pins.answers.some(
        (answer) => !inspectionRefs.some((inspection) => inspection.id === answer.inspectionId),
      ) ||
      inspectionRefs.some((inspection) =>
        inspection.questions.some(
          (question) =>
            question.answerVersionId !== null &&
            !report.pins.answers.some(
              (answer) =>
                answer.id === question.answerVersionId && answer.inspectionId === inspection.id,
            ),
        ),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Rapportens egne svar matcher ikke de valgte svarversioner.",
      });
  });
export type MunicipalReportManifest = z.infer<typeof MunicipalReportManifestSchema>;
export interface MunicipalReportCompileInput {
  generatorVersion?: MunicipalReportGenerator;
  photoPointReviews?: PhotoPointReviewRecord[];
  projectId: string;
  generatedAt: string;
  baseline: PublicBaselineSnapshot;
  plan: VerificationPlanVersion;
  round: SurveyRoundVersion;
  mediaBindings: SurveyRoundMediaVersion[];
  notes: SurveyRoundNoteVersion[];
  inspections: DroneImageInspectionRecord[];
  answers: DroneImageInspectionAnswersRecord[];
}
export interface MunicipalReportPdfVersion {
  id: string;
  version: number;
  manifestSha256: string;
  createdAt: string;
  manifest: MunicipalReportManifest;
}
export function municipalReportCanonicalText(raw: unknown): string {
  const text = canonicalBaselineJson(MunicipalReportManifestSchema.parse(raw));
  if (new TextEncoder().encode(text).byteLength > MAX_MUNICIPAL_REPORT_BYTES)
    throw new Error(
      "Rapporten overskrider 2 MiB. Ingen valgte fotos er udeladt; vælg et mindre udsnit.",
    );
  return text;
}
/** Publish the public endpoint only: credentials, query strings and fragments never enter a report. */
export function municipalReportPublicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const shownNumber = (value: number) =>
  new Intl.NumberFormat("da-DK", { useGrouping: false, maximumFractionDigits: 3 }).format(value);
function clean(value: string): string {
  return [...value]
    .map((character) => {
      const point = character.codePointAt(0)!;
      return point === 10 || (point >= 32 && (point < 127 || point > 159)) ? character : " ";
    })
    .join("")
    .replace(
      /https?:\/\/[^\s)]+/g,
      (url) => municipalReportPublicUrl(url) ?? "[kildelink udeladt]",
    );
}
export function municipalReportSourceProjection(
  source: PublicBaselineSource,
): z.infer<typeof Source> {
  const payload = record(source.payload),
    facts: string[] = [];
  if (source.coverage.returnedCount !== null)
    facts.push(
      `Kilden returnerede ${source.coverage.returnedCount} poster; dette antal dokumenterer ikke i sig selv en påvirkning af vandløbet.`,
    );
  if (source.id === "dmi-historical") {
    const station = record(payload.station),
      summary = record(payload.summary),
      subset = record(payload.availableDailySummary);
    if (typeof station.id === "string")
      facts.push(
        `Nedbørsstation: ${typeof station.name === "string" ? clean(station.name) : "navn ikke angivet"} (${clean(station.id)}). Oplandsrepræsentativitet er ikke vurderet.`,
      );
    if (
      summary.complete === true &&
      summary.unit === "mm" &&
      finite(summary.totalMm) &&
      typeof summary.coveredFrom === "string" &&
      typeof summary.coveredTo === "string"
    )
      facts.push(
        `Gemt stationssum: ${shownNumber(summary.totalMm)} mm for ${summary.coveredFrom} til ${summary.coveredTo}. Stationsnedbør er ikke lokal vandføring.`,
      );
    else
      facts.push(
        "Ingen fuld nedbørssum for den bestilte periode er dokumenteret i denne kildeversion.",
      );
    if (
      subset.scope === "complete_daily_intervals_inside_requested_period" &&
      subset.complete === true &&
      subset.unit === "mm" &&
      typeof subset.representsEntireRequestedPeriod === "boolean" &&
      finite(subset.totalMm) &&
      typeof subset.coveredFrom === "string" &&
      typeof subset.coveredTo === "string"
    )
      facts.push(
        `Dokumenterede komplette døgn: ${shownNumber(subset.totalMm)} mm for ${subset.coveredFrom} til ${subset.coveredTo}. Dette er en afgrænset døgnsum, ikke hele den bestilte periode eller lokal vandføring.`,
      );
  }
  if (source.id === "sentinel-2-scenes")
    facts.push(
      "Scenekatalog og optagedatoer er kildekontekst. Der er ikke udført satellitpixelanalyse eller målt ændring i vandløbet.",
    );
  if (source.id === "orthophoto-terrain")
    facts.push(
      "Rasterinventar er en oversigt over tilgængelige produkter. Genereringsdatoer er ikke dokumenterede optagedatoer, og rasteranalyse er ikke udført.",
    );
  if (source.id === "public-monitoring-stations")
    facts.push(
      "Stationsregisteret er et inventar. Lokale måleserier, oplandskobling og forbindelse til vandløbet er ikke dokumenteret her.",
    );
  const limitations = source.quality.warnings.map(clean);
  if (source.mode === "preview" || source.mode === "error")
    limitations.push("Kilden er ikke dokumenterede, fuldt tilgængelige data i denne version.");
  if (source.status !== "complete")
    limitations.push(
      `Kildens gemte status er ${source.status}; ufuldstændig dækning er ikke et negativt fund.`,
    );
  if (
    source.coverage.spatial !== "complete" ||
    source.coverage.temporal !== "complete" ||
    !source.coverage.paginationComplete
  )
    limitations.push(
      "Geografisk, tidsmæssig eller sidemæssig fuldstændighed er ikke dokumenteret.",
    );
  if (source.payload === null || source.payloadSha256 === null || source.error !== null)
    limitations.push(
      "Kildens indhold er ikke fuldt tilgængeligt. En ny indhentning kan være nødvendig.",
    );
  return Source.parse({
    id: source.id,
    provider: clean(source.provider),
    dataset: clean(source.dataset),
    datasetVersion: source.datasetVersion,
    sourceUrl: municipalReportPublicUrl(source.sourceUrl),
    sourceModifiedAt: source.sourceModifiedAt,
    fetchedAt: source.fetchedAt,
    requestedFrom: source.query.requestedFrom,
    requestedTo: source.query.requestedTo,
    observedFrom: source.coverage.observedFrom,
    observedTo: source.coverage.observedTo,
    mode: source.mode,
    status: source.status,
    evidenceKind: source.quality.evidenceKind,
    spatialCoverage: source.coverage.spatial,
    temporalCoverage: source.coverage.temporal,
    paginationComplete: source.coverage.paginationComplete,
    returnedCount: source.coverage.returnedCount,
    payloadSha256: source.payloadSha256,
    facts,
    limitations: [...new Set(limitations)],
  });
}
function sorted<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id, "en"));
}
function ensureUnique(items: { id: string }[], maximum: number): void {
  if (items.length > maximum || new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error(
      "Rapportvalget indeholder for mange eller gentagne versioner. Ingen poster er udeladt.",
    );
  items.forEach((item) => Uuid.parse(item.id));
}
async function verifyManifestPin(
  value: { id: string; projectId: string; manifestSha256: string; manifest: unknown },
  projectId: string,
): Promise<void> {
  Uuid.parse(value.id);
  Hash.parse(value.manifestSha256);
  if (
    value.projectId !== projectId ||
    (await baselineSha256(value.manifest)) !== value.manifestSha256
  )
    throw new Error("En valgt version matcher ikke sagen eller sin gemte checksum.");
}
/** The server supplies canonical saved inputs, never browser prose. This builder
 * independently checks graph pins and hashes before deriving a draft report. */
export async function compileMunicipalReportV1(
  input: MunicipalReportCompileInput,
): Promise<MunicipalReportManifest> {
  Uuid.parse(input.projectId);
  Timestamp.parse(input.generatedAt);
  ensureUnique(input.mediaBindings, 200);
  ensureUnique(input.notes, 400);
  ensureUnique(input.inspections, 400);
  ensureUnique(input.answers, 400);
  const { baseline, plan, round, projectId } = input;
  const generatorVersion = input.generatorVersion ?? MUNICIPAL_REPORT_GENERATOR;
  const photoPointReviews =
    generatorVersion === MUNICIPAL_REPORT_GENERATOR_V2
      ? sorted(input.photoPointReviews ?? [])
      : undefined;
  if (photoPointReviews) {
    ensureUnique(photoPointReviews, 200);
    for (const record of photoPointReviews) {
      const review = PhotoPointReviewSchema.parse(record.review);
      if ((await baselineSha256(review)) !== record.reviewSha256)
        throw new Error("Den faglige fotogennemgang matcher ikke sin gemte checksum.");
    }
  } else if (input.photoPointReviews?.length)
    throw new Error("Fotogennemgang kræver rapportgenerator v2.");
  await verifyManifestPin(baseline, projectId);
  await verifyManifestPin(plan, projectId);
  await verifyManifestPin(round, projectId);
  const base = await validatePublicBaselineManifest(baseline.manifest);
  if (
    base.project.id !== projectId ||
    plan.baselineId !== baseline.id ||
    plan.baselineSha256 !== baseline.manifestSha256 ||
    plan.manifest.projectId !== projectId ||
    plan.manifest.snapshotId !== baseline.id ||
    plan.manifest.snapshotSha256 !== baseline.manifestSha256 ||
    round.manifest.projectId !== projectId ||
    round.baselineId !== baseline.id ||
    round.baselineSha256 !== baseline.manifestSha256 ||
    round.planId !== plan.id ||
    round.planSha256 !== plan.manifestSha256 ||
    round.manifest.baselineId !== baseline.id ||
    round.manifest.baselineSha256 !== baseline.manifestSha256 ||
    round.manifest.planId !== plan.id ||
    round.manifest.planSha256 !== plan.manifestSha256 ||
    round.kind !== round.manifest.kind
  )
    throw new Error(
      "Rapporten kræver én præcis gemt kildeversion, plan og registreringsrunde i samme sag.",
    );
  const bindings = sorted(input.mediaBindings),
    notes = sorted(input.notes),
    inspections = sorted(input.inspections),
    answers = sorted(input.answers);
  if (
    new Set(bindings.map((b) => b.mediaId)).size !== bindings.length ||
    new Set(answers.map((a) => a.inspectionId)).size !== answers.length
  )
    throw new Error(
      "Vælg én billedtilknytning pr. foto og én gemt svarversion pr. billedvurdering.",
    );
  for (const binding of bindings) {
    await verifyManifestPin(binding, projectId);
    const m = binding.manifest;
    if (
      binding.roundVersionId !== round.id ||
      m.projectId !== projectId ||
      m.roundVersionId !== round.id ||
      m.roundSha256 !== round.manifestSha256 ||
      m.baselineId !== baseline.id ||
      m.baselineSha256 !== baseline.manifestSha256 ||
      m.planId !== plan.id ||
      m.planSha256 !== plan.manifestSha256 ||
      m.mediaId !== binding.mediaId ||
      m.status !== "draft_assignment" ||
      m.questionIds.some((q) => !round.manifest.questionIds.includes(q))
    )
      throw new Error("Et foto er ikke knyttet til den præcise valgte runde og kildeversion.");
  }
  for (const note of notes) {
    await verifyManifestPin(note, projectId);
    const m = SurveyRoundNoteManifestSchema.parse(note.manifest),
      binding = bindings.find((b) => b.id === note.mediaBindingId);
    if (
      !binding ||
      note.roundVersionId !== round.id ||
      m.projectId !== projectId ||
      m.mediaBindingId !== binding.id ||
      m.mediaBindingSha256 !== binding.manifestSha256 ||
      m.roundVersionId !== round.id ||
      m.roundSha256 !== round.manifestSha256 ||
      m.baselineId !== baseline.id ||
      m.baselineSha256 !== baseline.manifestSha256 ||
      m.planId !== plan.id ||
      m.planSha256 !== plan.manifestSha256 ||
      m.mediaId !== binding.mediaId ||
      m.originalSha256 !== binding.manifest.originalSha256 ||
      m.originalValidationSha256 !== binding.manifest.originalValidationSha256 ||
      !binding.manifest.questionIds.includes(m.questionId)
    )
      throw new Error("En manuel note matcher ikke rapportens valgte foto, runde og kildeversion.");
  }
  for (const inspection of inspections) {
    const binding = bindings.find((b) => b.mediaId === inspection.mediaId),
      result = DroneImageInspectionDraftSchema.parse(inspection.result);
    if (
      !binding ||
      inspection.projectId !== projectId ||
      inspection.status !== "completed" ||
      inspection.resultSha256 === null ||
      (await baselineSha256(result)) !== inspection.resultSha256 ||
      inspection.sourceSnapshotId !== baseline.id ||
      inspection.sourceSnapshotHash !== baseline.manifestSha256 ||
      result.sourceContext?.snapshotId !== baseline.id ||
      result.sourceContext.snapshotSha256 !== baseline.manifestSha256 ||
      inspection.originalSha256 !== binding.manifest.originalSha256 ||
      inspection.originalValidationSha256 !== binding.manifest.originalValidationSha256 ||
      inspection.storageObjectId !== binding.manifest.storage.objectId ||
      inspection.storageObjectVersion !== binding.manifest.storage.objectVersion ||
      inspection.storageObjectUpdatedAt !== binding.manifest.storage.objectUpdatedAt ||
      result.provenance.projectId !== projectId ||
      result.provenance.mediaId !== inspection.mediaId ||
      result.provenance.originalSha256 !== inspection.originalSha256 ||
      result.provenance.originalValidationSha256 !== inspection.originalValidationSha256 ||
      result.provenance.model !== inspection.modelId
    )
      throw new Error(
        "En billedvurdering matcher ikke rapportens præcise kildeversion og originalfoto.",
      );
  }
  for (const answer of answers) {
    const inspection = inspections.find((i) => i.id === answer.inspectionId);
    if (
      !inspection ||
      answer.projectId !== projectId ||
      answer.inspectionResultSha256 !== inspection.resultSha256 ||
      (await baselineSha256(
        JSON.parse(droneImageInspectionAnswersCanonicalText(answer.answers)),
      )) !== answer.answersSha256 ||
      answer.status !== "draft_unreviewed" ||
      answer.professionallyReviewed ||
      answer.reportEligible
    )
      throw new Error("En svarversion matcher ikke rapportens valgte billedvurdering og checksum.");
    validateDroneImageInspectionAnswerQuestions(answer.answers, inspection);
  }
  const sources = [...base.sources]
    .sort((a, b) => a.id.localeCompare(b.id, "en"))
    .map(municipalReportSourceProjection);
  const photos: z.infer<typeof Photo>[] = bindings.map((binding) => ({
    bindingId: binding.id,
    bindingSha256: binding.manifestSha256,
    mediaId: binding.mediaId,
    originalSha256: binding.manifest.originalSha256,
    originalValidationSha256: binding.manifest.originalValidationSha256,
    capturedAtUtc: binding.manifest.sourceMetadata.capture.capturedAtUtc,
    localTimestamp: binding.manifest.sourceMetadata.capture.localTimestamp,
    timezoneKnown: binding.manifest.sourceMetadata.capture.timezoneKnown,
    cameraPosition: binding.manifest.sourceMetadata.cameraPosition
      ? {
          latitude: binding.manifest.sourceMetadata.cameraPosition.latitude,
          longitude: binding.manifest.sourceMetadata.cameraPosition.longitude,
        }
      : null,
    captureWithinPlannedWindow: "not_verified",
    manualNotes: notes
      .filter((n) => n.mediaBindingId === binding.id)
      .map((note) => ({
        id: note.id,
        sha256: note.manifestSha256,
        createdAt: note.createdAt,
        questionId: note.manifest.questionId,
        question:
          plan.manifest.questions.find((q) => q.id === note.manifest.questionId)?.question ??
          note.manifest.questionId,
        qualitativeAnswer: note.manifest.manual.qualitativeAnswer,
        statement: note.manifest.manual.manualStatement,
        uncertainty: note.manifest.manual.uncertainty,
        proposedFollowup: note.manifest.manual.proposedFollowup,
        proposedPriority: note.manifest.manual.proposedPriority,
      })),
    inspections: inspections
      .filter((i) => i.mediaId === binding.mediaId)
      .map((inspection) => {
        const result = inspection.result!,
          answerVersion = answers.find((a) => a.inspectionId === inspection.id);
        return {
          id: inspection.id,
          sha256: inspection.resultSha256!,
          model: inspection.modelId,
          generatedAt: result.provenance.generatedAt,
          quality: result.visual.quality.assessment,
          qualityLimitation: result.visual.quality.limitation,
          watercourseVisibility: result.visual.watercourseVisibility,
          uncertainty: result.visual.overallUncertainty,
          features: result.visual.features.map((feature) => ({
            kind: feature.kind,
            description: feature.appearance,
            uncertainty: feature.uncertainty,
            confidence: feature.confidence,
          })),
          questions: result.followupQuestions.map((question) => {
            const answer = answerVersion?.answers.find((a) => a.questionId === question.id);
            return {
              id: question.id,
              question: question.question,
              rationale: question.rationale,
              assessment: answer?.assessment ?? null,
              note: answer?.note ?? null,
              followup: answer?.followup ?? null,
              answerVersionId: answer ? answerVersion!.id : null,
            };
          }),
        };
      }),
  }));
  const gaps: MunicipalReportManifest["deliveryGaps"] = [
    {
      code: "municipal_scope",
      title: "Afklar den kommunale delstrækning",
      detail:
        "Den gemte kortreference og projektpolygon er ikke en godkendt kommunal delstrækning. Aftal strækning, formål og afgrænsning med kommunen.",
      evidenceRefs: [round.id, baseline.id],
    },
    {
      code: "professional_review",
      title: "Udpeg faglig gennemgang og godkendelse",
      detail:
        "AI-forslag og egne svar er kladder. Rapporten kræver faglig kontrol af indhold, relevans og konklusioner før aflevering.",
      evidenceRefs: [round.id],
    },
  ];
  for (const source of sources)
    if (
      source.status !== "complete" ||
      source.mode === "preview" ||
      source.mode === "error" ||
      source.payloadSha256 === null
    )
      gaps.push({
        code: `source:${source.id}`,
        title: `Afklar datakilden: ${source.dataset}`,
        detail: `Gemt status: ${source.status}. Afklar om kilden kan suppleres, eller dokumentér hvorfor den ikke er nødvendig for den aftalte opgave.`,
        evidenceRefs: [baseline.id, source.id],
      });
  if (!photos.length)
    gaps.push({
      code: "no_photos",
      title: "Knyt originale fotos til registreringsrunden",
      detail: "Rapporten indeholder endnu ingen valgte, versionsbundne originale fotos.",
      evidenceRefs: [round.id],
    });
  if (photos.some((p) => !p.timezoneKnown || !p.capturedAtUtc))
    gaps.push({
      code: "capture_time",
      title: "Afklar fotos med usikker optagetid",
      detail:
        "En lokal tid uden tidszone kan ikke automatisk sammenholdes med daterede kilder. Den planlagte runde er ikke dokumentation for faktisk optagetid.",
      evidenceRefs: photos
        .filter((p) => !p.timezoneKnown || !p.capturedAtUtc)
        .map((p) => p.bindingId),
    });
  const followups: MunicipalReportManifest["prioritizedFollowup"] = gaps.map((gap) => ({
    id: gap.code,
    priority: "before_delivery",
    title: gap.title,
    rationale: gap.detail,
    action: gap.title,
    proposedBy: "system",
    sourceIds: gap.code.startsWith("source:") ? [gap.code.slice(7)] : [],
    mediaIds: [],
    evidenceRefs: gap.evidenceRefs,
  }));
  for (const photo of photos) {
    if (!photo.inspections.length)
      followups.push({
        id: `photo:${photo.mediaId}:review`,
        priority: "field_review",
        title: "Gennemgå fotoet og dokumentér relevante observationer",
        rationale:
          "Der er ingen valgt billed-AI-vurdering for dette foto. Et upload er ikke en vurdering.",
        action: "Vælg en relevant billedvurdering eller dokumentér en manuel gennemgang.",
        proposedBy: "system",
        sourceIds: [],
        mediaIds: [photo.mediaId],
        evidenceRefs: [photo.bindingId],
      });
    for (const note of photo.manualNotes)
      followups.push({
        id: `note:${note.id}`,
        priority: note.proposedPriority === "high" ? "before_delivery" : "field_review",
        title: note.proposedFollowup,
        rationale: `Eget forslag, ikke godkendt indgreb. Begrundelse: ${note.statement} Usikkerhed: ${note.uncertainty}`,
        action: note.proposedFollowup,
        proposedBy: "user",
        sourceIds: [],
        mediaIds: [photo.mediaId],
        evidenceRefs: [note.id],
      });
    for (const inspection of photo.inspections)
      for (const question of inspection.questions)
        if (
          question.assessment === null ||
          question.assessment === "uncertain" ||
          question.followup
        )
          followups.push({
            id: `inspection:${inspection.id}:${question.id}`,
            priority: question.id.endsWith(":geographic_link") ? "before_delivery" : "field_review",
            title: question.question,
            rationale: question.note ? `Eget svar: ${question.note}` : question.rationale,
            action:
              question.followup ||
              "Afklar spørgsmålet ved dokumentation eller en relevant faglig besigtigelse.",
            proposedBy: question.followup ? "user" : "system",
            sourceIds: [],
            mediaIds: [photo.mediaId],
            evidenceRefs: [
              inspection.id,
              ...(question.answerVersionId ? [question.answerVersionId] : []),
            ],
          });
  }
  const rank = { before_delivery: 0, field_review: 1, supplementary: 2 };
  followups.sort((a, b) => rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id, "en"));
  const report = MunicipalReportManifestSchema.parse({
    schema: MUNICIPAL_REPORT_SCHEMA,
    generatorVersion,
    projectId,
    generatedAt: input.generatedAt,
    recipient: "Haderslev Kommune",
    status: "draft_unreviewed",
    reportEligible: false,
    professionallyReviewed: false,
    municipalScopeApproved: false,
    projectName: base.project.name,
    purpose:
      "Samlet dokumentationsgrundlag for den valgte vandløbsregistrering: daterede offentlige kilder, originale fotos, billedforslag, gemte egne svar og begrundet opfølgning.",
    executiveSummary: [
      `Rapporten samler ${photos.length} valgte originale fotos, ${notes.length} gemte manuelle noter, ${inspections.length} billedvurderinger og ${answers.length} gemte svarversioner.`,
      `Der er ${sources.length} daterede kilder. ${sources.filter((s) => s.status !== "complete").length} har en anden status end complete; status er en dækningsoplysning, ikke en faglig konklusion.`,
      "Opfølgningen prioriterer dokumentationsmangler og faglig afklaring. Den er ikke en automatisk prioritering af vedligeholdelsesindgreb.",
      generatorVersion === MUNICIPAL_REPORT_GENERATOR
        ? "Ingen miljøeffekt, længde, areal, vandføring eller ændring før/efter er beregnet i denne rapport."
        : "Beplantning vises som en geometrisk skitse med kildeforbehold. Ingen lokal miljøeffekt, vandføring eller ændring før/efter er beregnet.",
    ],
    pins: {
      baseline: { id: baseline.id, sha256: baseline.manifestSha256 },
      plan: { id: plan.id, sha256: plan.manifestSha256 },
      round: { id: round.id, sha256: round.manifestSha256 },
      mediaBindings: bindings.map((b) => ({
        id: b.id,
        sha256: b.manifestSha256,
        mediaId: b.mediaId,
        originalSha256: b.manifest.originalSha256,
        originalValidationSha256: b.manifest.originalValidationSha256,
      })),
      notes: notes.map((n) => ({ id: n.id, sha256: n.manifestSha256 })),
      inspections: inspections.map((i) => ({
        id: i.id,
        sha256: i.resultSha256!,
        mediaId: i.mediaId,
      })),
      answers: answers.map((a) => ({
        id: a.id,
        sha256: a.answersSha256,
        inspectionId: a.inspectionId,
      })),
    },
    scope: {
      referenceId: base.reference.id,
      referenceName: base.reference.name,
      referenceNameStatus: base.reference.nameStatus,
      municipalities: [...base.reference.municipalities],
      sourceModifiedAt: base.reference.modifiedAt,
      savedAt: base.reference.savedAt,
      referenceSourceUrl: municipalReportPublicUrl(base.reference.sourceUrl),
      period: { ...base.period },
      roundKind: round.manifest.kind,
      roundTitle: round.manifest.title,
      recordingWindow: {
        dateFrom: round.manifest.recordingWindow.dateFrom,
        dateTo: round.manifest.recordingWindow.dateTo,
        timeZone: "Europe/Copenhagen",
      },
      actualCoverage: "not_verified",
      spatialInterpretation: "saved_reference_and_aoi_not_approved_municipal_reach",
    },
    sources,
    photos,
    prioritizedFollowup: followups,
    deliveryGaps: gaps,
    limitations: [
      "Rapporten er en samlet kladde, ikke en fagligt godkendt kommunal aflevering.",
      "Kamera-GPS er kun kameraets placering. Et foto dokumenterer ikke et objekt på jorden eller et geografisk dækningsområde.",
      "Før/efter/kontrol følger den eksplicit gemte registreringsrunde. Mappenavn, uploadtid og planlagt periode dokumenterer ikke faktisk optagedato eller ændring over tid.",
      "Billed-AI udvælger synlige forslag og faste opfølgningsspørgsmål. Modellsikkerhed er en ukalibreret egenvurdering, ikke en målt sandsynlighed.",
      "Gemte manuelle noter og svar er egne observationer. Bekræftet er ikke det samme som fagligt godkendt.",
      "Satellit-, kort- og stationsinventarer er kildereferencer. Ingen satellitpixelanalyse, lokal hydraulik eller miljøeffekt er udledt her.",
      "Kun de udtrykkeligt valgte, gemte versioner indgår. Senere redigeringer og nyere kilder ændrer ikke denne rapportversion.",
    ],
    ...(generatorVersion === MUNICIPAL_REPORT_GENERATOR_V2
      ? {
          planting: compilePlantingReportV1(baseline),
          photoPointReviews,
        }
      : {}),
  });
  municipalReportCanonicalText(report);
  return report;
}
