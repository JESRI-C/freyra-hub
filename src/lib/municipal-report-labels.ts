import type { MunicipalReportManifest } from "@/services/monitoring/municipal-report";

export const municipalCoverageLabels = {
  complete: "fuld",
  partial: "delvis",
  none: "ingen",
  unknown: "ukendt",
} as const;

export const municipalPinLabels: Record<string, string> = {
  baseline: "Kildeversion",
  plan: "Verifikationsplan",
  round: "Undersøgelse",
  mediaBindings: "Fototilknytninger",
  notes: "Manuelle noter",
  inspections: "Billedvurderinger",
  answers: "Gemte svar",
  photoPointReviews: "Faglige fotobeslutninger",
};

export const municipalSourceStatusLabels = {
  complete: "komplet svar",
  partial: "delvis dækning",
  no_coverage: "ingen dokumenteret dækning",
  not_configured: "adgang mangler",
  not_implemented: "ikke tilsluttet",
  timeout: "tidsgrænsen er nået",
  failed: "indhentning mislykkedes",
} as const;

export function municipalSourceTitle(
  source: Pick<MunicipalReportManifest["sources"][number], "id" | "dataset">,
) {
  return source.id === "dmi-historical" ? "DMI – nedbør fra målestation" : source.dataset;
}

/** Known system messages are presented in Danish; source evidence stays intact. */
export function municipalReportSourceText(
  report: Pick<MunicipalReportManifest, "sources">,
  value: string,
) {
  for (const source of report.sources) {
    const status = municipalSourceStatusLabels[source.status];
    if (value === `Afklar datakilden: ${source.dataset}`)
      return `Afklar datakilden: ${municipalSourceTitle(source)}`;
    if (
      value ===
      `Kildens gemte status er ${source.status}; ufuldstændig dækning er ikke et negativt fund.`
    )
      return `Kildens gemte status er ${status}; ufuldstændig dækning er ikke et negativt fund.`;
    const remainder =
      "Afklar om kilden kan suppleres, eller dokumentér hvorfor den ikke er nødvendig for den aftalte opgave.";
    if (value === `Gemt status: ${source.status}. ${remainder}`)
      return `Gemt status: ${status}. ${remainder}`;
  }
  return value;
}

/** Translate only a known generated sentence, without changing frozen evidence. */
export function municipalReportSummaryText(
  report: Pick<MunicipalReportManifest, "sources">,
  value: string,
) {
  const incomplete = report.sources.filter((source) => source.status !== "complete").length;
  const original = `Der er ${report.sources.length} daterede kilder. ${incomplete} har en anden status end complete; status er en dækningsoplysning, ikke en faglig konklusion.`;
  return value === original
    ? `Der er ${report.sources.length} daterede kilder. ${incomplete} har delvist eller manglende datagrundlag. Kildestatus er ikke en faglig konklusion.`
    : value;
}
