import { z } from "zod";
import type { ReportContent } from "./report-document";

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const NatureSurveyReportSchema = z.object({
  areas: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().min(1),
        method: z.string().min(1),
        hectares: z.number().nonnegative().nullable(),
        geometry: z.object({
          type: z.literal("Polygon"),
          coordinates: z.array(z.array(position).min(4)).min(1),
        }),
      }),
    )
    .min(1),
  observations: z.array(
    z.object({
      id: z.uuid(),
      zoneId: z.uuid(),
      kind: z.enum(["species", "habitat"]),
      label: z.string().min(1),
      method: z.string().min(1),
      notes: z.string().min(1),
      determination: z.enum(["species", "genus", "group", "uncertain"]).nullable(),
      observedAt: z.iso.datetime({ offset: true }),
    }),
  ),
});
export type NatureSurveyReport = z.infer<typeof NatureSurveyReportSchema>;

const determinationLabels = {
  species: "art",
  genus: "slægt",
  group: "gruppe",
  uncertain: "uafklaret bestemmelse",
};
const formatHectares = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 4 });

const areaMethodText = (survey: NatureSurveyReport) =>
  survey.areas.map((area, index) => `${index + 1}. ${area.name}\n${area.method}`).join("\n\n");

export function includeNatureSurvey(
  report: ReportContent,
  survey: NatureSurveyReport,
): ReportContent {
  const byArea = new Map(
    survey.areas.map((area, index) => [area.id, `${index + 1}. ${area.name}`]),
  );
  const observationText = (row: NatureSurveyReport["observations"][number]) =>
    `${byArea.get(row.zoneId)} · ${row.observedAt.slice(0, 10)} · ${row.label}${row.determination ? ` (${determinationLabels[row.determination]})` : ""}\n${row.notes}\nMetode: ${row.method}`;
  const species = survey.observations.filter(({ kind }) => kind === "species");
  const habitat = survey.observations.filter(({ kind }) => kind === "habitat");
  const biodiversity = report.templateId === "biodiversity";
  const entries: Record<string, string> = {
    "section-2": [
      ...survey.areas.map(
        ({ id, hectares }) =>
          `${byArea.get(id)} · ${hectares === null ? "areal ikke angivet" : `${formatHectares.format(hectares)} ha`}`,
      ),
      "Kortbilaget bruger de samme områdenumre.",
    ].join("\n"),
    "section-3": areaMethodText(survey),
    "section-4": survey.observations.map(observationText).join("\n\n"),
    ...(biodiversity
      ? {
          "section-5": habitat.map(observationText).join("\n\n"),
          "section-6": species
            .filter(({ determination }) => determination !== "species")
            .map(observationText)
            .join("\n\n"),
          "section-11": species.map(observationText).join("\n\n"),
        }
      : {
          "section-5": [...habitat, ...species].map(observationText).join("\n\n"),
        }),
  };
  // Refresh the previously imported area methods while keeping the practitioner's
  // references and notes, including text entered before the first field import.
  const methodSection = report.sections.find((section) => section.id === "section-3");
  if (report.templateId === "nature_baseline" && methodSection?.text) {
    const previousMethods = report.natureSurvey ? areaMethodText(report.natureSurvey) : "";
    let notes = methodSection.text;
    if (
      previousMethods &&
      (notes === previousMethods || notes.startsWith(previousMethods + "\n\n"))
    ) {
      notes = notes.slice(previousMethods.length + 2);
    }
    if (notes) entries["section-3"] += "\n\n" + notes;
  }
  return {
    ...report,
    natureSurvey: survey,
    sections: report.sections.map((section) =>
      entries[section.id] !== undefined
        ? {
            ...section,
            text: entries[section.id],
            basis: entries[section.id] ? "observed" : "not_measured",
            reviewed: false,
          }
        : section,
    ),
  };
}
