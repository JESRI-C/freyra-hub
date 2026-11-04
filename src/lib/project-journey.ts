import type { ProjectView, ProjectNavigationSearch } from "./project-navigation";

/** User actions route to existing tools; these are not completion or effect assessments. */
export const PROJECT_JOURNEY = [
  {
    id: "purpose",
    title: "Problem og mål",
    question: "Hvad skal forbedres?",
    description: "Beskriv problemet, det ønskede resultat og hvem indsatsen er til for.",
    output: "Et fælles formål at planlægge efter.",
    action: "Beskriv problem og mål",
    view: { kind: "tab", id: "overblik" },
  },
  {
    id: "foundation",
    title: "Forstå området",
    question: "Hvad ved vi om stedet?",
    description: "Afgræns området, og undersøg de eksisterende forhold og kilder.",
    output: "Et grundlag for at vælge indsatsen.",
    action: "Undersøg området",
    view: { kind: "tab", id: "grundlag" },
  },
  {
    id: "plan",
    title: "Planlæg indsatsen",
    question: "Hvem skal gøre hvad?",
    description: "Opret arbejdsopgaver, beskriv metode og ansvar, og aftal dokumentationen.",
    output: "En konkret plan for arbejdet.",
    action: "Åbn plan og opgaver",
    view: { kind: "tab", id: "handlinger" },
    work: "plan",
  },
  {
    id: "execution",
    title: "Følg udførelsen",
    question: "Hvad er faktisk gjort?",
    description:
      "Registrér arbejdet og forholdene i felten. Knyt de relevante originalfotos til opgaven.",
    output: "En sporbar registrering af den udførte indsats.",
    action: "Åbn udført arbejde",
    view: { kind: "tab", id: "handlinger" },
    work: "execution",
  },
  {
    id: "submission",
    title: "Aflevér til faglig gennemgang",
    question: "Er opgavens udførelse og dokumentation klar?",
    description:
      "Saml de gemte registreringer og originalfotos i en afleveringsversion. Send den til en person med gennemgangsadgang.",
    output: "En afleveringsversion med kilder og en synlig afgørelse efter gennemgang.",
    action: "Åbn opgavens aflevering",
    view: { kind: "tab", id: "handlinger" },
    work: "submission",
  },
  {
    id: "assessment",
    title: "Vurdér ændringen",
    question: "Hvad viser før og efter?",
    description:
      "Sammenhold materialet, og vurder ændringer, usikkerheder og behov for opfølgning.",
    output: "En vurdering med et synligt grundlag.",
    action: "Sammenhold før og efter",
    view: { kind: "step", id: "sammenligning" },
  },
  {
    id: "report",
    title: "Saml dokumentationen",
    question: "Hvad kan vi aflevere?",
    description: "Gennemgå projektets rapporter, kilder og mangler før aflevering.",
    output: "Et samlet materiale til kunde, kommune eller kolleger.",
    action: "Åbn rapport og opfølgning",
    view: { kind: "tab", id: "rapporter" },
  },
] as const satisfies readonly {
  id: string;
  title: string;
  question: string;
  description: string;
  output: string;
  action: string;
  view: ProjectView;
  work?: "plan" | "execution" | "submission";
}[];

export type ProjectJourneyId = (typeof PROJECT_JOURNEY)[number]["id"];
export function projectJourneySearch(
  id?: ProjectJourneyId,
  search: ProjectNavigationSearch = {},
): ProjectNavigationSearch {
  const item = PROJECT_JOURNEY.find((step) => step.id === id) ?? PROJECT_JOURNEY[0];
  const { tab: _tab, step: _step, work: _work, ...context } = search;
  return {
    ...context,
    ...(item.view.kind === "tab" ? { tab: item.view.id } : { step: item.view.id }),
    ...("work" in item ? { work: item.work } : {}),
    ...(item.id === "submission" && !context.task ? { taskList: "tasks" as const } : {}),
  };
}
