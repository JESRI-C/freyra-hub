import type { WorkOrderView } from "./work-order-navigation";
/** Presentation metadata only. Access is still checked by the existing server and database. */
export const PROJECT_TABS = [
  { id: "arbejde", label: "Undersøgelse" },
  { id: "rapporter", label: "Rapport og levering" },
  { id: "grundlag", label: "Grundlag" },
  { id: "overblik", label: "Overblik" },
  { id: "sites", label: "Fotopunkter" },
  { id: "datakilder", label: "Datakilder" },
  { id: "indikatorer", label: "Indikatorer" },
  { id: "handlinger", label: "Handlinger" },
  { id: "audit", label: "Revisionsspor" },
  { id: "roller", label: "Roller" },
  { id: "dokumentation", label: "Dokumentation" },
  { id: "medier", label: "Fotoatlas" },
  { id: "miljodata", label: "Miljødata" },
  { id: "livekort", label: "Livekort" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["id"];
export type ProjectStep =
  | "billeder"
  | "datagrundlag"
  | "gennemgang"
  | "baseline"
  | "udfoerelse"
  | "sammenligning"
  | "beplantning"
  | "rapport";
export type ProjectView = { kind: "tab"; id: ProjectTab } | { kind: "step"; id: ProjectStep };
export type ProjectNavigationSearch = {
  tab?: string;
  step?: ProjectStep;
  round?: string;
  task?: string;
  work?: WorkOrderView;
};
type Destination = { label: string; view: ProjectView };
export const PROJECT_AREAS: { id: string; label: string; destinations: Destination[] }[] = [
  {
    id: "overview",
    label: "Overblik",
    destinations: [
      { label: "Projektoversigt", view: { kind: "tab", id: "overblik" } },
      { label: "Revisionsspor", view: { kind: "tab", id: "audit" } },
      { label: "Roller og adgang", view: { kind: "tab", id: "roller" } },
    ],
  },
  {
    id: "tasks",
    label: "Plan og opgaver",
    destinations: [
      { label: "Arbejdsopgaver og udførelse", view: { kind: "tab", id: "handlinger" } },
    ],
  },
  {
    id: "foundation",
    label: "Kort og grundlag",
    destinations: [
      { label: "Offentligt datagrundlag", view: { kind: "tab", id: "grundlag" } },
      { label: "Projektkort", view: { kind: "tab", id: "livekort" } },
      { label: "Fotopunkter", view: { kind: "tab", id: "sites" } },
      { label: "Datakilder", view: { kind: "tab", id: "datakilder" } },
      { label: "Miljødata", view: { kind: "tab", id: "miljodata" } },
      { label: "Gemte baselineversioner", view: { kind: "step", id: "baseline" } },
    ],
  },
  {
    id: "field",
    label: "Felt og dokumentation",
    destinations: [
      { label: "Fotoatlas og upload", view: { kind: "tab", id: "medier" } },
      { label: "Originalbilleder", view: { kind: "step", id: "billeder" } },
      { label: "Opret undersøgelse", view: { kind: "step", id: "datagrundlag" } },
      { label: "Undersøgelser", view: { kind: "tab", id: "arbejde" } },
      { label: "Dokumenter og bilag", view: { kind: "tab", id: "dokumentation" } },
    ],
  },
  {
    id: "assessment",
    label: "Vurdering og effekt",
    destinations: [
      { label: "Faglig gennemgang", view: { kind: "step", id: "gennemgang" } },
      { label: "Før og efter", view: { kind: "step", id: "sammenligning" } },
      { label: "Indikatorer", view: { kind: "tab", id: "indikatorer" } },
      { label: "Beplantning (valgfri)", view: { kind: "step", id: "beplantning" } },
    ],
  },
  {
    id: "delivery",
    label: "Rapport og opfølgning",
    destinations: [{ label: "Rapporter og opfølgning", view: { kind: "tab", id: "rapporter" } }],
  },
];

export function resolveProjectView(search: ProjectNavigationSearch): ProjectView {
  // Retain legacy utility links, and use ONE task/report workspace for both entry points.
  if (search.tab === "audit" || search.tab === "roller") return { kind: "tab", id: search.tab };
  if (search.step === "udfoerelse") return { kind: "tab", id: "handlinger" };
  if (search.step === "rapport") return { kind: "tab", id: "rapporter" };
  if (search.step) return { kind: "step", id: search.step };
  const tab = PROJECT_TABS.find((item) => item.id === search.tab);
  return { kind: "tab", id: tab?.id ?? "overblik" };
}
export function sameProjectView(a: ProjectView, b: ProjectView) {
  return a.kind === b.kind && a.id === b.id;
}
export function projectViewSearch(
  search: ProjectNavigationSearch,
  view: ProjectView,
): ProjectNavigationSearch {
  const { tab: _tab, step: _step, ...context } = search;
  return { ...context, ...(view.kind === "tab" ? { tab: view.id } : { step: view.id }) };
}
