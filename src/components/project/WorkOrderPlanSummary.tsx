import type { WorkOrderPlanVersion } from "@/lib/work-order-plan";
import type { WorkOrderPerson } from "@/lib/work-order-assignments";
const profiles = {
  general: "Generel opgave",
  watercourse: "Vandløb",
  nature: "Natur",
  construction: "Byggeri og natur",
  grazing: "Græsningspleje",
};
export function WorkOrderPlanSummary({
  row,
  members = [],
}: {
  row: Pick<WorkOrderPlanVersion, "plan" | "version">;
  members?: Array<Pick<WorkOrderPerson, "user_id" | "display_name" | "email">>;
}) {
  const plan = row.plan;
  return (
    <div className="space-y-2 text-sm [overflow-wrap:anywhere]">
      <p className="font-semibold">
        {plan.title} · plan version {row.version}
      </p>
      <p>
        {plan.profile ? profiles[plan.profile] : "Metodeprofil uafklaret"} ·{" "}
        {plan.plannedStart ?? "Start uafklaret"}
        {plan.plannedEnd ? ` til ${plan.plannedEnd}` : ""}
      </p>
      <p>
        Ansvarlig:{" "}
        {plan.responsibleId
          ? members.find((m) => m.user_id === plan.responsibleId)?.display_name ||
            members.find((m) => m.user_id === plan.responsibleId)?.email ||
            "Registreret person"
          : "Uafklaret"}
        . Planlagt metode: {plan.plannedMethod ?? "Uafklaret"}.
      </p>
      {plan.locationNote && <p>Sted: {plan.locationNote}</p>}
      {plan.description && <p>{plan.description}</p>}
      {plan.instructions && <p>Instruktion: {plan.instructions}</p>}
      {plan.watercourse && (
        <dl className="grid grid-cols-2 gap-2">
          {Object.entries(plan.watercourse).map(([key, value]) => (
            <div key={key}>
              <dt>
                {
                  (
                    {
                      name: "Vandløb",
                      externalId: "Vandløbs-ID",
                      regulationReference: "Regulativ",
                      regulationVersion: "Dokumentversion",
                      stationFromM: "Station fra (m)",
                      stationToM: "Station til (m)",
                      stationDirection: "Stationeringsretning",
                      lengthM: "Oplyst længde (m)",
                      bottomWidthM: "Oplyst bundbredde (m)",
                      measurementSource: "Målkilde",
                      term: "Termin",
                    } as Record<string, string>
                  )[key]
                }
              </dt>
              <dd>
                {value === null
                  ? "Uafklaret"
                  : key === "stationDirection"
                    ? ({
                        unknown: "Uafklaret",
                        upstream: "Mod strømretningen",
                        downstream: "Med strømretningen",
                      }[String(value)] ?? String(value))
                    : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
