export const REPORT_TEMPLATE_IDS = [
  "watercourse",
  "construction_baseline",
  "nature_baseline",
  "annual_followup",
] as const;
export type ReportTemplateId = (typeof REPORT_TEMPLATE_IDS)[number];

export function isReportTemplateId(value: unknown): value is ReportTemplateId {
  return typeof value === "string" && REPORT_TEMPLATE_IDS.some((id) => id === value);
}

export interface ReportTemplate {
  id: ReportTemplateId;
  label: string;
  description: string;
  scope: string;
  title: string;
  headings: readonly string[];
  limitations: string;
}

// Keep section-1 (summary), section-4 (observations) and section-10
// (limitations) compatible with the existing evidence/AI import actions.
export const REPORT_TEMPLATES: readonly ReportTemplate[] = [
  {
    id: "watercourse",
    label: "Vandløb og beplantning",
    description: "Naturforhold, delstrækninger, beplantningsmuligheder og pleje.",
    scope: "Vandløbsvegetation og grundlag for træplantning",
    title: "Vegetation og grundlag for træplantning",
    headings: [
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
    ],
    limitations:
      "Almindelige RGB-skråfotos dokumenterer ikke kg biomasse eller hydraulisk kapacitet. GPS-fotopunkter er ikke et målfast ortofoto. NDVI kræver egnede spektralbånd. Artsforslag kræver faglig godkendelse. Plantning af eksempelvis rødel eller eg kræver stedbunden vurdering.",
  },
  {
    id: "construction_baseline",
    label: "Byggeri og naturbaseline",
    description: "Dokumentér naturgrundlaget før et byggeprojekt og planlæg opfølgningen.",
    scope: "Naturbaseline, projektpåvirkning og opfølgning ved byggeri",
    title: "Naturbaseline for byggeprojekt",
    headings: [
      "Konklusion og anbefalinger",
      "Projektgrænse og undersøgelsesdækning",
      "Baselinedato og metode",
      "Feltobservationer før indgreb",
      "Naturtyper, arter og eksisterende træer",
      "Vand, terræn og afvanding",
      "Projektpåvirkning og sammenligningsgrundlag",
      "Naturhensyn og afværgetiltag",
      "Myndighedsforhold og screening",
      "Begrænsninger",
      "Fotopunkter, bilag og kilderegister",
    ],
    limitations:
      "En baseline beskriver de dokumenterede forhold på undersøgelsestidspunktet. Screening er ikke en myndighedsafgørelse. Manglende registrering er ikke dokumentation for fravær af naturværdier. Afvanding og hydrauliske forhold kræver et egnet måle- og modelgrundlag.",
  },
  {
    id: "nature_baseline",
    label: "Naturbaseline",
    description: "Fælles udgangspunkt for et kommunalt eller privat naturprojekt.",
    scope: "Dokumenteret naturtilstand før projektets indsats",
    title: "Naturbaseline",
    headings: [
      "Konklusion og anbefalinger",
      "Område og undersøgelsesdækning",
      "Baselinedato og registreringsmetode",
      "Feltobservationer pr. delområde",
      "Naturtyper og bestemmelsesniveau",
      "Eksisterende træer og levesteder",
      "Historiske data og sammenlignelighed",
      "Naturhensyn og mulige indsatser",
      "Bindinger og screening",
      "Begrænsninger",
      "Fotoatlas, gentagelsespunkter og kilder",
    ],
    limitations:
      "Registreringerne gælder deres dato og metode. Historiske artsfund er ikke en aktuel feltbestemmelse. GPS-fotopunkter angiver kameraets placering og dokumenterer ikke en opmålt arealdækning. En undersøgelse efter indsatsen må ikke betegnes som en førmåling.",
  },
  {
    id: "annual_followup",
    label: "Årsstatus og pleje",
    description: "Sammenhold baseline, udført indsats, årets registreringer og næste plejeindsats.",
    scope: "Årlig opfølgning på naturprojektets etablering, drift og udvikling",
    title: "Årsstatus og pleje",
    headings: [
      "Konklusion og anbefalinger",
      "Opfølgningsområde og faste punkter",
      "Registreringsperiode og metode",
      "Årets observationer pr. strækning eller delområde",
      "Plantning, overlevelse og efterplantning",
      "Vegetation, arter og lokale forhold",
      "Sammenligning med baseline og tidligere år",
      "Udført pleje og anbefalet næste indsats",
      "Ansvar, adgang og afklaringer",
      "Begrænsninger",
      "Før/nu-fotos, feltlog og kilderegister",
    ],
    limitations:
      "Overlevelse kræver registreret plantet og levende antal på samme afgrænsning. Udvikling kræver sammenlignelige datoer, metoder og fotopunkter. Solskitser er modelillustrationer; de dokumenterer ikke i sig selv biologisk effekt, temperaturændring eller sparet arbejdstid.",
  },
];

export function getReportTemplate(id: ReportTemplateId = "watercourse"): ReportTemplate {
  const template = REPORT_TEMPLATES.find((item) => item.id === id);
  if (!template) throw new Error("Ukendt rapportskabelon.");
  return template;
}
