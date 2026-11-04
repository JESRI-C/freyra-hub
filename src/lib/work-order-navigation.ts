import type { WorkOrderStatus } from "./work-order-lifecycle";

// The existing app-shell target stays mounted while the project route is loading.
export const WORK_ORDER_ENTRY_ANCHOR = "workspace-content";

/** Shared presentation and deep links; authorization remains in the existing services. */
export const WORK_ORDER_PARTS = [
  {
    id: "plan",
    label: "Arbejdsgrundlag",
    question: "Hvad skal der gøres, og hvem har ansvaret?",
    purpose:
      "Beskriv den planlagte indsats, metoden og de forhold, medarbejderen skal kende. Her aftaler I arbejdet, før det udføres.",
    output: "En plan med instruktion, ansvar og tildeling.",
  },
  {
    id: "field",
    label: "Feltregistrering",
    question: "Hvad observerer I på stedet?",
    purpose:
      "Gem de forhold, der er relevante for opgaven. Et foto kan underbygge registreringen; foto og registrering tilknyttes udtrykkeligt under Dokumentation.",
    output: "En gemt registrering med den anvendte skabelon.",
  },
  {
    id: "execution",
    label: "Udført arbejde",
    question: "Hvad blev faktisk gjort?",
    purpose:
      "Registrér, hvornår og hvordan indsatsen blev udført, og beskriv det, der mangler. Den oprindelige plan bevares som grundlag.",
    output: "En særskilt version af den faktiske udførelse.",
  },
  {
    id: "evidence",
    label: "Dokumentation",
    question: "Hvilket materiale underbygger arbejdet?",
    purpose:
      "Knyt den relevante registrering og et verificeret originalfoto til opgaven. Vælg eventuelt den konkrete udførelsesversion. Det giver et sporbart grundlag for gennemgang og opfølgning.",
    output: "En præcis relation mellem opgave, registrering, udførelse og originalfoto.",
  },
  {
    id: "submission",
    label: "Aflevering",
    question: "Hvilket grundlag afleverer vi til gennemgang?",
    purpose:
      "Kontrollér mangler, og fasthold præcise versioner af plan, udførelse, registreringer og originalfotos. En afleveringsversion bevarer grundlaget, når projektet senere ændres.",
    output:
      "Et fastholdt afleveringsgrundlag med særskilt, versionsbundet gennemgang af udførelse og dokumentation.",
  },
] as const;
export type WorkOrderListView = "tasks" | "schedule" | "calendar" | "time" | "bookings";
export function isWorkOrderListView(value: unknown): value is WorkOrderListView {
  return (
    value === "tasks" ||
    value === "schedule" ||
    value === "calendar" ||
    value === "time" ||
    value === "bookings"
  );
}

export type WorkOrderView = (typeof WORK_ORDER_PARTS)[number]["id"];
export function isWorkOrderView(value: unknown): value is WorkOrderView {
  return WORK_ORDER_PARTS.some((part) => part.id === value);
}

/** A recorded status suggests where to look; the destination still checks access and freshness. */
export function workOrderStatusDestination(
  status: WorkOrderStatus | null | undefined,
): { view: WorkOrderView; label: string } | undefined {
  switch (status) {
    case "submitted":
      return { view: "submission", label: "Åbn afleveringen" };
    case "returned":
    case "reopened":
      return { view: "submission", label: "Se mangler" };
    case "performed":
      return { view: "submission", label: "Kontrollér afleveringen" };
    case "approved":
      return { view: "submission", label: "Se afleveringen" };
    case "cancelled":
      return { view: "plan", label: "Se arbejdsgrundlaget" };
    default:
      return undefined;
  }
}
