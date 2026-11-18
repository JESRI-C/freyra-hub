import { z } from "zod";
import { WorkOrderActionIdSchema } from "./work-order-access";
import { getReportTemplate, REPORT_TEMPLATE_IDS, type ReportTemplateId } from "./report-templates";
import { WorkflowReportSnapshotSchema } from "./workflow-report";
import { ActionExecutionSchema, CalendarDate } from "./action-execution";
import { BridgeReportObservationSchema } from "./bridge-observation";
import { NatureSurveyReportSchema } from "./nature-survey-report";
import { ReportMapViewportSchema } from "./report-map";

const PhotoReviewHash = z.string().regex(/^[a-f0-9]{64}$/);
export const ReportPhotoPointReviewSchema = z
  .object({
    id: z.string().uuid(),
    sha256: PhotoReviewHash,
    bindingId: z.string().uuid(),
    bindingSha256: PhotoReviewHash,
    originalSha256: PhotoReviewHash,
    originalValidationSha256: PhotoReviewHash,
  })
  .strict();
export const SourceSchema = z.object({
  filePath: z.string().nullable().optional(),
  storageBucket: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  id: z.string().min(1),
  title: z.string(),
  kind: z.string(),
  capturedAt: z.string().nullable(),
  localCaptureDate: CalendarDate.optional(),
  photoPointReview: ReportPhotoPointReviewSchema.optional(),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  position: z.tuple([z.number(), z.number()]).nullable(),
  method: z.string(),
  version: z.string(),
});
export const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  sourceIds: z.array(z.string()),
  reviewed: z.boolean(),
  basis: z.enum(["documented", "observed", "screening", "not_measured"]),
});
export const ReportContentSchema = z.object({
  requestedCorrection: z
    .object({
      reviewedVersion: z.number().int().positive(),
      sectionId: z.string().min(1),
      reason: z.string().trim().min(1).max(3000),
    })
    .optional(),
  workOrderApproval: z
    .object({
      actionId: WorkOrderActionIdSchema,
      submissionId: z.string().uuid(),
      submissionVersion: z.number().int().positive(),
      reviewId: z.string().uuid(),
      basisHash: z.string().regex(/^[a-f0-9]{64}$/),
      executionRevisionId: z.string().uuid().optional(),
      executionDataBasis: ActionExecutionSchema.shape.dataBasis.optional(),
    })
    .superRefine((pin, ctx) => {
      if ((pin.executionRevisionId === undefined) !== (pin.executionDataBasis === undefined))
        ctx.addIssue({
          code: "custom",
          message: "Udførelsens version og registreringstype skal følges ad.",
        });
    })
    .optional(),
  workflowSnapshot: WorkflowReportSnapshotSchema.optional(),
  photoLayoutVersion: z.literal(2).optional(),
  templateId: z.enum(REPORT_TEMPLATE_IDS).optional(),
  title: z.string().min(1),
  projectName: z.string().min(1),
  organizationName: z.string().min(1),
  scope: z.string().min(1),
  audience: z.string().min(1),
  sections: z.array(SectionSchema),
  sources: z.array(SourceSchema),
  bridgeObservations: z.array(BridgeReportObservationSchema).optional(),
  natureSurvey: NatureSurveyReportSchema.optional(),
  mapViewport: ReportMapViewportSchema.optional(),
  photoAtlas: z
    .object({
      evidenceId: z.string().uuid(),
      checksum: z.string().regex(/^[a-f0-9]{64}$/),
      photoIds: z.array(z.string().min(1).max(120)).min(1).max(10000),
      illustratedPhotoCount: z.number().int().min(0).max(10000).optional(),
      mapPoints: z
        .array(
          z.object({
            id: z.string().min(1).max(120),
            position: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
            nearestWatercourse: z.string().max(10000).optional(),
            positionFlag: z.string().max(10000).optional(),
            distanceToLineM: z.number().nonnegative().optional(),
          }),
        )
        .max(10000)
        .optional(),
      captions: z.record(z.string(), z.string().max(40000)).optional(),
    })
    .refine(
      ({ photoIds, illustratedPhotoCount }) =>
        illustratedPhotoCount === undefined || illustratedPhotoCount <= photoIds.length,
      "Fotoatlasset har flere illustrationer end valgte fotos.",
    )
    .refine(({ photoIds, mapPoints }) => {
      if (!mapPoints) return true;
      const selected = new Set(mapPoints.map((point) => point.id));
      const ordered = photoIds.filter((id) => selected.has(id));
      return (
        ordered.length === mapPoints.length &&
        selected.size === ordered.length &&
        ordered.every((id, index) => id === mapPoints[index].id)
      );
    }, "Kortpunkterne skal følge de valgte atlasfotos i rækkefølge.")
    .optional(),
});
export type ReportContent = z.infer<typeof ReportContentSchema>;
export type ReportSource = z.infer<typeof SourceSchema>;
/** Photo markers follow positioned sources, then the selected atlas photos with GPS. */
export function reportPhotoMapNumbers(content: ReportContent) {
  const numbers = new Map<string, number>();
  if (
    !content.photoLayoutVersion ||
    content.workOrderApproval ||
    content.natureSurvey?.areas.length ||
    content.bridgeObservations?.length
  )
    return numbers;
  for (const source of content.sources) {
    if (source.position) numbers.set(source.id, numbers.size + 1);
  }
  const atlas = content.photoAtlas;
  if (atlas) {
    for (const point of atlas.mapPoints ?? []) {
      numbers.set(`atlas:${atlas.evidenceId}:${point.id}`, numbers.size + 1);
    }
  }
  return numbers;
}
export function numberedAtlasMapPoints(
  content: ReportContent,
  numbers: ReadonlyMap<string, number>,
) {
  const atlas = content.photoAtlas;
  if (!atlas?.mapPoints) return [];
  return atlas.mapPoints.flatMap((point) => {
    const sourceId = `atlas:${atlas.evidenceId}:${point.id}`;
    const number = numbers.get(sourceId);
    return number
      ? [
          {
            ...point,
            number,
            sourceId,
            evidenceId: atlas.evidenceId,
            atlasChecksum: atlas.checksum,
          },
        ]
      : [];
  });
}
export function hasConfirmedReportPhoto(source: ReportSource) {
  const review = source.photoPointReview;
  return !!review && review.sha256 === source.version && review.originalSha256 === source.checksum;
}
export type ReportSection = z.infer<typeof SectionSchema>;
export type ReportStatus = "draft" | "review" | "approved";
export interface ReportRevision {
  id: string;
  report_id: string;
  version: number;
  status: ReportStatus;
  content: ReportContent;
  created_at: string;
  created_by: string;
}
export interface ReportDocument {
  id: string;
  organization_id: string;
  project_id: string;
  created_at: string;
}
export const BASIS_LABELS = {
  documented: "Dokumenteret",
  observed: "Observeret",
  screening: "Screening",
  not_measured: "Ikke målt",
};

/** Classification is copied from the approved packet, never inferred from its review status. */
export function reportWorkOrderDataBasis(content: ReportContent) {
  const pin = content.workOrderApproval;
  if (!pin) return undefined;
  switch (pin.executionRevisionId ? pin.executionDataBasis : undefined) {
    case "synthetic":
      return {
        kind: "synthetic" as const,
        label: "Syntetiske prøvedata",
        description:
          "Udførelsen i den godkendte aflevering er mærket som en syntetisk prøve. Rapporten dokumenterer ikke en faktisk naturindsats eller natureffekt.",
      };
    case "demo":
      return {
        kind: "demo" as const,
        label: "Demonstrationsdata",
        description:
          "Udførelsen i den godkendte aflevering er mærket som demonstration. Rapporten dokumenterer ikke en faktisk naturindsats eller natureffekt.",
      };
    case "real":
      return {
        kind: "real" as const,
        label: "Udførelsesregistrering: Faktisk arbejde",
        description:
          "Udførelsen er registreret som faktisk arbejde. Mærkningen dokumenterer ikke i sig selv en målt natureffekt.",
      };
    default:
      return {
        kind: "unknown" as const,
        label: "Registreringstype ikke gemt i rapportversionen",
        description:
          "Kontrollér den godkendte aflevering for udførelsens registreringstype. Historiske eksportfiler genskaber den gemte rapportversion.",
      };
  }
}
export function newReportContent(
  projectName: string,
  organizationName: string,
  scope: string,
  audience: string,
  templateId: ReportTemplateId = "watercourse",
): ReportContent {
  const template = getReportTemplate(templateId);
  return {
    templateId,
    title: `${projectName} - ${template.title}`,
    projectName,
    organizationName,
    scope,
    audience,
    sources: [],
    sections: template.headings.map((title, i) => ({
      id: `section-${i + 1}`,
      title,
      text: i === 9 ? template.limitations : "",
      sourceIds: [],
      reviewed: false,
      basis: "not_measured",
    })),
  };
}
type ReportIssue = { message: string; sectionId?: string; sourceRegister?: true };

export function reportIssueDetails(content: ReportContent): ReportIssue[] {
  const issues: ReportIssue[] = [];
  if (content.requestedCorrection)
    issues.push({
      message: "Gennemgå det returnerede afsnit, og indsend rettelsen til ny gennemgang.",
      sectionId: content.requestedCorrection.sectionId,
    });
  const source = reportWorkOrderDataBasis(content);
  if (source?.kind === "unknown")
    issues.push({ message: "Rapportversionen mangler udførelsens registreringstype." });
  else if (source && source.kind !== "real")
    issues.push({
      message:
        "Udførelsen er prøve- eller demonstrationsdata og kan ikke godkendes som virkeligt datagrundlag.",
    });
  if (
    content.workflowSnapshot &&
    (content.workflowSnapshot.review?.decision !== "accepted" ||
      content.workflowSnapshot.dataBasis !== "real")
  )
    issues.push({
      message:
        "Workflowgrundlaget mangler versionsafgrænset dokumentationsreview af virkelige data.",
    });
  const review = content.workflowSnapshot?.review;
  if (review?.decision === "changes_requested")
    issues.push({
      message: "Dokumentationsreviewet har åbne rettelser, som kræver et nyt accepteret review.",
    });
  if (
    review &&
    (Object.keys(review.sectionTexts).length !== content.sections.length ||
      content.sections.some((section) => review.sectionTexts[section.id] !== section.text))
  )
    issues.push({
      message: "Dokumentationsreviewet gælder en anden udgave af rapportens resultater.",
    });
  if (!content.sources.length)
    issues.push({ message: "Rapporten mangler kilder.", sourceRegister: true });
  for (const source of content.sources) {
    if (source.storageBucket === "monitoring-uploads" && !hasConfirmedReportPhoto(source)) {
      issues.push({
        message: `${source.title || source.id} mangler et entydigt fagligt bekræftet fotopunkt. Gennemgå fotopunktet på sagen, og genindlæs rapportens kilderegister.`,
        sourceRegister: true,
      });
      continue;
    }
    if (!source.checksum || !/^[a-f0-9]{64}$/.test(source.checksum)) {
      issues.push({
        message: `${source.title || source.id} (${source.id}) mangler en gyldig SHA-256-kontrolsum.`,
        sourceRegister: true,
      });
    }
  }
  const ids = new Set(content.sources.map((s) => s.id));
  if (content.templateId === "bridge_registration" && !content.bridgeObservations?.length)
    issues.push({ message: "Indlæs broregistreringerne før godkendelse.", sectionId: "section-2" });
  const missingBridgePhotos = new Set(
    (content.bridgeObservations ?? []).flatMap((row) =>
      row.photoSourceIds.filter((id) => !ids.has(id)),
    ),
  );
  for (const id of missingBridgePhotos)
    issues.push({ message: `Broregistreringens fotokilde mangler (${id}).`, sourceRegister: true });
  for (const section of content.sections) {
    const add = (message: string) =>
      issues.push({ message: `${section.title}: ${message}`, sectionId: section.id });
    if (!section.text.trim()) add("indhold mangler.");
    if (!section.reviewed) add("faglig gennemgang mangler.");
    if (section.basis !== "not_measured" && !section.sourceIds.length)
      add("kildereference mangler.");
    const unknownIds = section.sourceIds.filter((id) => !ids.has(id));
    if (unknownIds.length) add(`ukendt kilde (${unknownIds.join(", ")}).`);
  }
  return issues;
}

export function reportIssues(content: ReportContent): string[] {
  return reportIssueDetails(content).map(({ message }) => message);
}
export function moveSection(sections: ReportSection[], from: number, to: number): ReportSection[] {
  if (from < 0 || to < 0 || from >= sections.length || to >= sections.length) return sections;
  const next = [...sections];
  const [section] = next.splice(from, 1);
  next.splice(to, 0, section);
  return next;
}
export function validateReportRevision(content: ReportContent, status: ReportStatus) {
  ReportContentSchema.parse(content);
  if (new Set(content.sources.map((s) => s.id)).size !== content.sources.length)
    throw new Error("Kilde-id'er skal være entydige.");
  if (
    !content.sections.length ||
    new Set(content.sections.map((s) => s.id)).size !== content.sections.length
  )
    throw new Error("Rapportens afsnit skal være entydige og må ikke være tomme.");
  if (status === "approved" && reportIssues(content).length)
    throw new Error("Rapporten kan ikke godkendes, før datagrundlag og gennemgang er komplette.");
}
