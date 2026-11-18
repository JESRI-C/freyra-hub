import { z } from "zod";
import type { ProjectMediaItem } from "./platform/media-types";
import {
  CalendarDate,
  executionGaps,
  type ActionExecution,
  type ExecutionRevision,
} from "./action-execution";
import { PhotoPointSchema, photoDistanceMeters } from "./field-photo-position";
export const PhotoComparisonSchema = z
  .object({
    schema: z.literal("freyra.photo-comparison/v1"),
    comparisonId: z.string().uuid(),
    executionRevisionId: z.string().uuid().nullable(),
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
  status: "insufficient" | "descriptive" | "visual_only" | "reassessment_required";
  gaps: string[];
  quantitative: false;
};
const captureDate = (value?: string) => {
  const day = value?.slice(0, 10);
  return CalendarDate.safeParse(day).success ? day! : null;
};

export type ComparisonPhoto = Pick<
  ProjectMediaItem,
  | "id"
  | "projectId"
  | "title"
  | "capturedAt"
  | "coordinates"
  | "status"
  | "actionId"
  | "beforeMediaId"
  | "sha256"
> & { localCaptureDate?: string };

export function comparisonCaptureLabel(photo: {
  capturedAt?: string | null;
  localCaptureDate?: string;
}) {
  if (photo.capturedAt) return photo.capturedAt;
  return photo.localCaptureDate
    ? `${photo.localCaptureDate}, lokal kameradato uden dokumenteret tidszone`
    : "ukendt optagedato";
}
type PhotoPairSuggestion = {
  before: ComparisonPhoto;
  after: ComparisonPhoto;
  distanceM: number | null;
  linked: boolean;
};

export function suggestPhotoPairs(
  media: ComparisonPhoto[],
  projectId: string,
  execution: ActionExecution | undefined,
  dates?: { earlier: string; later: string },
): PhotoPairSuggestion[] {
  if (
    dates &&
    (!CalendarDate.safeParse(dates.earlier).success ||
      !CalendarDate.safeParse(dates.later).success ||
      dates.earlier >= dates.later)
  )
    return [];
  if (!dates && (execution?.stage !== "performed" || !execution.actualDate)) return [];
  const start = execution?.actualDate ?? "";
  const end = execution?.actualEndDate ?? start;
  const eligible = media.flatMap((photo) => {
    const date = captureDate(photo.capturedAt ?? photo.localCaptureDate);
    if (
      !date ||
      !photo.sha256 ||
      photo.projectId !== projectId ||
      (execution && photo.actionId && photo.actionId !== execution.actionId) ||
      photo.status === "archived"
    )
      return [];
    const point = PhotoPointSchema.safeParse({
      lat: photo.coordinates?.lat,
      lng: photo.coordinates?.lng,
    });
    return [{ photo, date, point: point.success ? point.data : null }];
  });
  const before = eligible.filter(({ date }) => (dates ? date === dates.earlier : date < start));
  const after = eligible.filter(({ date }) => (dates ? date === dates.later : date > end));

  const suggestions: PhotoPairSuggestion[] = [];
  for (const later of after) {
    let best: PhotoPairSuggestion | undefined;
    for (const earlier of before) {
      if (earlier.photo.sha256 === later.photo.sha256) continue;
      const linked = later.photo.beforeMediaId === earlier.photo.id;
      const distanceM =
        earlier.point && later.point ? photoDistanceMeters(earlier.point, later.point) : null;
      if (!linked && (distanceM === null || distanceM > 30)) continue;
      if (!best || linked || (distanceM !== null && distanceM < (best.distanceM ?? Infinity))) {
        best = { before: earlier.photo, after: later.photo, distanceM, linked };
      }
      if (linked) break;
    }
    if (best) suggestions.push(best);
  }
  return suggestions
    .sort(
      (a, b) =>
        Number(b.linked) - Number(a.linked) ||
        (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) ||
        a.after.id.localeCompare(b.after.id),
    )
    .slice(0, 5);
}
/** Camera positions and pixel sizes never grant metric eligibility. */
export function assessPhotoComparison(
  input: PhotoComparison,
  revision: ExecutionRevision | undefined,
  latest: ExecutionRevision | undefined,
  before: ComparisonPhoto,
  after: ComparisonPhoto,
): ComparisonAssessment {
  PhotoComparisonSchema.parse(input);
  if (
    input.executionRevisionId !== null &&
    (latest?.entry.id !== input.executionRevisionId ||
      revision?.entry.id !== input.executionRevisionId ||
      latest?.execution.actionId !== revision?.execution.actionId)
  )
    return {
      status: "reassessment_required",
      quantitative: false,
      gaps: ["Udførelsens grundlag er ændret. Gennemgå sammenligningen mod den nye version."],
    };
  const e = input.executionRevisionId === null ? undefined : revision?.execution;
  const beforeDate = captureDate(before.capturedAt ?? before.localCaptureDate),
    afterDate = captureDate(after.capturedAt ?? after.localCaptureDate);
  const visualGaps = [
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
    ...(beforeDate && afterDate && beforeDate >= afterDate
      ? ["Vælg en tidligere og en senere optagedato."]
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
  ];
  const executionLimitations = e
    ? [
        ...executionGaps(e),
        ...(!e.actualDate
          ? [
              "Den faktiske arbejdsdato er ukendt. Forholdet mellem udførelse og optagelser er uafklaret.",
            ]
          : (beforeDate && beforeDate >= e.actualDate) ||
              (afterDate && afterDate <= (e.actualEndDate ?? e.actualDate))
            ? ["Optagelserne omslutter ikke den registrerede udførelsesperiode."]
            : []),
        ...(e.workType !== "weed_cutting" && input.parameter === "visible_vegetation"
          ? ["Den registrerede indsats er ikke grødeskæring."]
          : []),
      ]
    : ["Billedparret viser to optagedatoer. Der er ingen tilknyttet udførelsesregistrering."];
  return {
    status: visualGaps.length
      ? "insufficient"
      : executionLimitations.length
        ? "visual_only"
        : "descriptive",
    gaps: [...visualGaps, ...executionLimitations],
    quantitative: false,
  };
}
