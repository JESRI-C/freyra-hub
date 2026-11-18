export const REPORT_TEMPLATE_IDS = [
  "watercourse",
  "construction_baseline",
  "nature_baseline",
  "annual_followup",
  "before_after",
  "biodiversity",
  "bridge_registration",
  "planting_restoration",
  "project_status",
  "map_photo_documentation",
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
  {
    id: "before_after",
    label: "Før/efter-dokumentation",
    description: "Sammenhold to registreringer og vis, hvilke ændringer datagrundlaget bærer.",
    scope: "Sammenlignelige registreringer før og efter en dokumenteret indsats",
    title: "Før/efter-dokumentation",
    headings: [
      "Konklusion og opfølgning",
      "Strækninger og fotopunkter",
      "Datoer og sammenligningsmetode",
      "Registrerede synlige ændringer",
      "Faktisk udført indsats",
      "Sammenlignelige billedpar",
      "Referencedækning og alternative forklaringer",
      "Beregninger og faglig vurdering",
      "Datamangler og afvigelser",
      "Begrænsninger",
      "Originalfotos, kilder og bilag",
    ],
    limitations:
      "Visuelle ændringer kan beskrives ud fra sammenlignelige fotos. En dokumenteret effekt kræver et egnet sammenligningsgrundlag, oplysninger om indsatsen og vurdering af andre forklaringer.",
  },
  {
    id: "biodiversity",
    label: "Arter og biodiversitet",
    description: "Dokumentér artsfund, levesteder og registreringens dækning.",
    scope: "Artsfund og biodiversitetsobservationer i den undersøgte periode",
    title: "Arts- og biodiversitetsrapport",
    headings: [
      "Konklusion og opfølgning",
      "Område, lokaliteter og kort",
      "Feltmetoder, sæson og indsats",
      "Feltobservationer og dokumenterede artsfund",
      "Levesteder og vegetationsstruktur",
      "Artsforslag og faglig verifikation",
      "Indeks, beregninger og datagrundlag",
      "Udvikling og historiske registreringer",
      "Forvaltning og anbefalinger",
      "Begrænsninger",
      "Artsliste, kilder og fotobilag",
    ],
    limitations:
      "Angiv bestemmelsesniveau, undersøgt dækning og sæson. Et artsforslag kræver verifikation. Fundlisten beskriver de registrerede observationer og undersøgelsesindsatsen.",
  },
  {
    id: "bridge_registration",
    label: "Broer og rørunderføringer",
    description: "Saml stedfæstede objekter og visuelle registreringer i én oversigt.",
    scope: "Visuel registrering af broer, rørbroer og underføringer",
    title: "Bro- og konstruktionsregistrering",
    headings: [
      "Konklusion og anbefalet opfølgning",
      "Oversigtskort og objekt-ID'er",
      "Besøg og visuel metode",
      "Observationer pr. objekt",
      "Synlige materialer og dimensioner",
      "Synlig erosion og tilstopning",
      "Dokumenterede ændringer siden tidligere besøg",
      "Opfølgning og videre vurdering",
      "Adgang og afgrænsning",
      "Begrænsninger",
      "Objektregister, fotos og kilder",
    ],
    limitations:
      "Rapporten beskriver synlige forhold på registreringstidspunktet. Bæreevne og konstruktionssikkerhed kræver en særskilt faglig vurdering.",
  },
  {
    id: "planting_restoration",
    label: "Træplantning og restaurering",
    description: "Beskriv udgangspunkt, udført arbejde og plan for at følge udviklingen.",
    scope: "Naturgrundlag, træplantning eller restaureringsindsats og opfølgning",
    title: "Træplantnings- og restaureringsrapport",
    headings: [
      "Konklusion og anbefalinger",
      "Område, indsatszoner og kort",
      "Baseline og metode",
      "Feltobservationer og registreret tilstand",
      "Planlagt og udført indsats",
      "Arter, mængder og placering",
      "Overlevelse, genplantning og udvikling",
      "Forventede effekter og opfølgningsbehov",
      "Plejeplan og ansvar",
      "Begrænsninger",
      "Indsatsregister, fotos og kilder",
    ],
    limitations:
      "Fasthold den oprindelige plantningskohorte og registrér nyplantning særskilt. Forventede effekter beskrives som forventninger, indtil passende opfølgningsdata foreligger.",
  },
  {
    id: "project_status",
    label: "Projekt og status",
    description: "Saml projektets observationer, fremdrift og beslutninger for perioden.",
    scope: "Projektets fremdrift, dokumentation og næste handlinger",
    title: "Projekt- og statusrapport",
    headings: [
      "Resume og beslutninger",
      "Projektområde og afgrænsning",
      "Periode og datakilder",
      "Observationer i perioden",
      "Udførte og planlagte opgaver",
      "Milepæle og afvigelser",
      "Resultater og datastatus",
      "Næste handlinger og ansvar",
      "Risici og uafklarede forhold",
      "Begrænsninger",
      "Dokumentation, kilder og bilag",
    ],
    limitations:
      "Status gælder den viste periode og det angivne omfang. Planer, udført arbejde og fagligt vurderede resultater har eget grundlag.",
  },
  {
    id: "map_photo_documentation",
    label: "Kort og fotodokumentation",
    description: "Saml kortudsnit og stedfæstede fotos med et sporbart register.",
    scope: "Kortdækning, registreringspunkter og geografisk fotodokumentation",
    title: "Kort- og fotodokumentationsrapport",
    headings: [
      "Resume",
      "Projektkort, målestok og signatur",
      "Koordinatsystem, kortkilde og optagemetode",
      "Observationer fra fotopunkter",
      "Optagedækning og geografisk præcision",
      "Manuelt placerede fotos og ukendte positioner",
      "Gentagelsesfotos og optageforskelle",
      "Udvalgte kortudsnit",
      "Billedvalg og dokumentationsstatus",
      "Begrænsninger",
      "Fotoregister, kortkilder og bilag",
    ],
    limitations:
      "Skeln mellem kameraets position, det fotograferede objekt og dokumenteret optagedækning. Angiv koordinatsystem, positionskilde og kendt præcision.",
  },
];

export function getReportTemplate(id: ReportTemplateId = "watercourse"): ReportTemplate {
  const template = REPORT_TEMPLATES.find((item) => item.id === id);
  if (!template) throw new Error("Ukendt rapportskabelon.");
  return template;
}
