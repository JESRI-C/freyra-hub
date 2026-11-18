interface ReportMethod {
  code: string;
  version: string;
  title: string;
  url: string;
  scope?: string;
  reviewNote?: string;
  requirements: string;
  limitations: string;
}

// Pin the cited editions. Saved report sections contain their own editable copy.
const auFreshwaterFiles = "https://ecos.au.dk/fileadmin/ecos/Fagdatacentre/Ferskvand/";
export const WATERCOURSE_METHODS: readonly ReportMethod[] = [
  {
    code: "V05",
    version: "3.0",
    title: "Dansk Fysisk Indeks (DFI)",
    url: auFreshwaterFiles + "V05_DFI_ver3.pdf",
    requirements:
      "DFI kræver en afgrænset vandløbsstrækning og et dateret feltskema med de fysiske parametre for strækningen, vandløbsbunden og strømforholdene.",
    limitations:
      "Fotos kan vise synlige træk. En DFI-værdi kræver registrering og scoring af parametrene efter anvisningen.",
  },
  {
    code: "V07",
    version: "2.7",
    title: "Makroinvertebrater (smådyr) i vandløb",
    url: auFreshwaterFiles + "V07_ver2_7.pdf",
    requirements:
      "Angiv station, prøvedato og prøvetagningsmetode. En DVFI-bedømmelse kræver en faunaprøve med udsortering, identifikation og optælling af smådyr efter anvisningen.",
    limitations:
      "Et foto af et enkelt dyr eller af vandløbet giver ikke grundlag for at tildele en faunaklasse.",
  },
  {
    code: "V17",
    version: "3.0",
    title: "Vandplanter i vandløb",
    url: auFreshwaterFiles + "V17_Revision_version3.0_final.pdf",
    requirements:
      "Angiv station, dato og undersøgelsesstrækning. Registrér arter og dækningsgrader i feltskemaerne for den relevante undersøgelse.",
    limitations:
      "En DVPI-vurdering kræver et egnet datasæt om vandplanterne. Skråfotos alene kan hverken fastslå artssammensætningen eller give en indeksværdi.",
  },
  {
    code: "V18",
    version: "8.3",
    title: "Fiskeundersøgelser i vandløb",
    url: auFreshwaterFiles + "V18_fisk_version_8-3.pdf",
    requirements:
      "Angiv station, dato, befisket areal og anvendt befiskningsmetode. Dokumentér fangsten med arter, antal og de længdedata, som metoden kræver.",
    limitations:
      "Valg af fiskeindeks afhænger af stationen og befiskningen. Fotos eller enkeltfund giver ikke en bestandsopgørelse eller en DFFV-værdi.",
  },
];

export const OPEN_HABITAT_METHODS: readonly ReportMethod[] = [
  {
    code: "N03",
    version: "1",
    title: "Kortlægning af terrestriske, lysåbne habitatnaturtyper",
    url: "https://ecos.au.dk/fileadmin/ecos/Fagdatacentre/Biodiversitet/TAN03_KortlaegningLysaaben_ver1.pdf",
    scope:
      "Anvisningen omfatter 34 lysåbne, terrestriske habitatnaturtyper inden for habitatområderne.",
    requirements:
      "Afgræns forekomsten i felten, bestem habitatnaturtypen og registrér dens strukturindikatorer. Angiv besøgsdato, placering af dokumentationsfeltet og plantelisten fra feltet.",
    limitations:
      "Et indtegnet areal, enkeltfund og fotos er utilstrækkelige til at vurdere naturtilstand efter N03. Angiv manglende feltdata og hvilke dele af arealet registreringen dækker.",
    reviewNote: "Ved metodevalget afventer grundlaget for en N03-vurdering faglig gennemgang.",
  },
];

export function methodCitation(method: ReportMethod) {
  return `Aarhus Universitet · TA ${method.code}, version ${method.version} · ${method.title}`;
}

export function methodReferenceText(method: ReportMethod) {
  return [
    methodCitation(method),
    "Valgt som faglig reference. Udførelse og eventuelle indeksresultater kræver særskilt dokumentation fra projektet.",
    ...(method.scope ? [method.scope] : []),
    method.requirements,
    method.limitations,
    ...(method.reviewNote ? [method.reviewNote] : []),
    method.url,
  ].join("\n");
}
