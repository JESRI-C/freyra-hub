import type { RequiredJobCard } from "@/lib/work-order-plan";

export function RequiredJobCards({ cards }: { cards?: RequiredJobCard[] }) {
  if (!cards?.length) return null;
  return (
    <div className="space-y-2 rounded-xl border p-3 text-sm">
      <p className="font-medium">Jobkort der kræves ved aflevering</p>
      <p>
        Hvert jobkort skal være udfyldt og tilknyttet dokumentationen med et verificeret
        originalfoto.
      </p>
      {cards.map((card) => (
        <details key={card.templateVersionId}>
          <summary className="min-h-11 cursor-pointer py-2">
            {card.definition.title} · version {card.version}
          </summary>
          <ul className="list-disc space-y-1 pl-5">
            {card.definition.fields.map((field) => (
              <li key={field.key}>
                {field.label}
                {field.unit ? ` (${field.unit})` : ""} ·{" "}
                {field.required ? "Nødvendigt" : "Valgfrit"}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
