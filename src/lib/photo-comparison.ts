import { z } from "zod";
import type { ProjectMediaItem } from "./platform/media-types";
import { CalendarDate, executionGaps, type ExecutionRevision } from "./action-execution";
export const PhotoComparisonSchema = z
  .object({
    schema: z.literal("freyra.photo-comparison/v1"),
    comparisonId: z.string().uuid(),
    executionRevisionId: z.string().uuid(),
    beforeId: z.string().uuid(),
    afterId: z.string().uuid(),
    parameter: z.enum(["visible_vegetation", "access", "other"]),
    samePlaceEvidence: z.string().trim().max(2000),
    commonCoverage: z.enum(["unknown", "limited", "documented"]),
    coverageDescription: z.string().trim().max(2000),
    excludedAreas: z.string().trim().max(2000),
    captureDifferences: z.string().trim().max(2000),
    conclusion: z.string().trim().max(2000),
    correctionReason: z.string().trim().max(2000),
    quantitative: z.literal(false),
  })
  .strict()
  .refine((p) => p.beforeId !== p.afterId, "Vælg to forskellige originaler.");
export type PhotoComparison = z.infer<typeof PhotoComparisonSchema>;
export type ComparisonAssessment = {
  status: "insufficient" | "descriptive" | "reassessment_required";
  gaps: string[];
  quantitative: false;
};
const captureDate = (value?: string) => {
  const day = value?.slice(0, 10);
  return CalendarDate.safeParse(day).success ? day! : null;
};
/** Camera positions and pixel sizes never grant metric eligibility. */
export function assessPhotoComparison(
  input: PhotoComparison,
  revision: ExecutionRevision,
  latest: ExecutionRevision,
  before: ProjectMediaItem,
  after: ProjectMediaItem,
): ComparisonAssessment {
  PhotoComparisonSchema.parse(input);
  if (
    latest.entry.id !== input.executionRevisionId ||
    revision.entry.id !== input.executionRevisionId ||
    latest.execution.actionId !== revision.execution.actionId
  )
    return {
      status: "reassessment_required",
      quantitative: false,
      gaps: ["Udførelsens grundlag er ændret. Gennemgå sammenligningen mod den nye version."],
    };
  const e = revision.execution;
  const beforeDate = captureDate(before.capturedAt),
    afterDate = captureDate(after.capturedAt);
  const gaps = [
    ...executionGaps(e),
    ...(before.id !== input.beforeId ||
    after.id !== input.afterId ||
    before.projectId !== after.projectId
      ? ["Originalerne tilhører ikke det valgte par og samme projekt."]
      : []),
    ...(!before.sha256 || !after.sha256 ? ["Originalernes kontrolsummer mangler."] : []),
    ...(before.sha256 && before.sha256 === after.sha256
      ? ["Samme originalfil kan ikke være både før og efter."]
      : []),
    ...(!beforeDate || !afterDate ? ["Optagedato for en eller begge originaler er ukendt."] : []),
    ...(!e.actualDate ||
    (beforeDate && beforeDate >= e.actualDate) ||
    (afterDate && afterDate <= (e.actualEndDate ?? e.actualDate!))
      ? ["Optagelserne omslutter ikke den dokumenterede udførelsesperiode."]
      : []),
    ...(!input.samePlaceEvidence
      ? [
          "Dokumentér samme sted med strækning og pejlemærker; kamera-GPS er ikke motivets position.",
        ]
      : []),
    ...(input.commonCoverage === "unknown" || !input.coverageDescription
      ? ["Fælles synlig dækning er ikke beskrevet."]
      : []),
    ...(!input.excludedAreas
      ? ["Beskriv skjulte og udeladte områder; de tælles ikke som fjernet grøde."]
      : []),
    ...(!input.captureDifferences ? ["Beskriv sæson, vinkel, lys og øvrige optageforskelle."] : []),
    ...(e.workType !== "weed_cutting" && input.parameter === "visible_vegetation"
      ? ["Den registrerede indsats er ikke grødeskæring."]
      : []),
  ];
  return { status: gaps.length ? "insufficient" : "descriptive", gaps, quantitative: false };
}
