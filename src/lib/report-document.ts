import { z } from "zod";

export const SourceSchema = z.object({
  filePath: z.string().nullable().optional(),
  storageBucket: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  id: z.string().min(1),
  title: z.string(),
  kind: z.string(),
  capturedAt: z.string().nullable(),
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
  title: z.string().min(1),
  projectName: z.string().min(1),
  organizationName: z.string().min(1),
  scope: z.string().min(1),
  audience: z.string().min(1),
  sections: z.array(SectionSchema),
  sources: z.array(SourceSchema),
});
export type ReportContent = z.infer<typeof ReportContentSchema>;
export type ReportSource = z.infer<typeof SourceSchema>;
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
const HEADINGS = [
  "Konklusion og anbefalinger",
  "Oversigtskort og dækning",
  "Datagrundlag og metode",
  "Resultater pr. delstrækning",
  "Vegetation og bestemmelsesniveau",
  "Træer og trægrupper",
  "Før/efter og sammenlignelighed",
  "Bevarelse og mulig plantning",
  "Bindinger og screening",
  "Begrænsninger",
  "Fotoatlas og register",
];
export function newReportContent(
  projectName: string,
  organizationName: string,
  scope: string,
  audience: string,
): ReportContent {
  return {
    title: `${projectName} - Vegetation og grundlag for træplantning`,
    projectName,
    organizationName,
    scope,
    audience,
    sources: [],
    sections: HEADINGS.map((title, i) => ({
      id: `section-${i + 1}`,
      title,
      text:
        i === 9
          ? "Almindelige RGB-skråfotos dokumenterer ikke kg biomasse eller hydraulisk kapacitet. GPS-fotopunkter er ikke et målfast ortofoto. NDVI kræver egnede spektralbånd. Artsforslag kræver faglig godkendelse. Plantning af eksempelvis rødel eller eg kræver stedbunden vurdering."
          : "",
      sourceIds: [],
      reviewed: false,
      basis: "not_measured",
    })),
  };
}
export function reportIssues(content: ReportContent): string[] {
  const issues: string[] = [];
  if (!content.sources.length) issues.push("Rapporten mangler kilder.");
  if (content.sources.some((s) => !s.checksum || !/^[a-f0-9]{64}$/.test(s.checksum)))
    issues.push("Originalfilernes checksums er ikke dokumenteret for alle kilder.");
  const ids = new Set(content.sources.map((s) => s.id));
  for (const section of content.sections) {
    if (!section.text.trim()) issues.push(`${section.title}: indhold mangler.`);
    if (!section.reviewed) issues.push(`${section.title}: faglig gennemgang mangler.`);
    if (section.basis !== "not_measured" && !section.sourceIds.length)
      issues.push(`${section.title}: kildereference mangler.`);
    if (section.sourceIds.some((id) => !ids.has(id)))
      issues.push(`${section.title}: ukendt kilde.`);
  }
  return issues;
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
