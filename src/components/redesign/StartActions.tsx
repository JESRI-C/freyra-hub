import { ArrowRight, FileDown, FolderPlus, ClipboardList, Layers, ScanEye } from "lucide-react";
import type { ProjectJourneyId } from "@/lib/project-journey";

export const START_ACTIONS = [
  {
    id: "new",
    label: "Start et naturprojekt",
    description: "Beskriv problemet, målet og området, hvor I vil gøre en indsats.",
    icon: FolderPlus,
  },
  {
    id: "plan",
    label: "Planlæg og følg indsatsen",
    description: "Opret opgaver, aftal ansvar, og følg det udførte arbejde.",
    icon: ClipboardList,
  },
  {
    id: "foundation",
    label: "Forstå området",
    description: "Undersøg stedets forhold, kilder og det grundlag, I skal arbejde ud fra.",
    icon: Layers,
  },
  {
    id: "assessment",
    label: "Vurdér ændringen",
    description: "Sammenhold før og efter, og vurder hvad materialet viser.",
    icon: ScanEye,
  },
  {
    id: "report",
    label: "Saml dokumentationen",
    description: "Gennemgå rapporter, kilder og mangler før aflevering.",
    icon: FileDown,
  },
] as const;

export function StartActions({
  canCreate,
  selected,
  onChoose,
}: {
  canCreate: boolean;
  selected: ProjectJourneyId | null;
  onChoose: (action: "new" | ProjectJourneyId) => void;
}) {
  return (
    <section aria-labelledby="start-heading" className="space-y-6">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
          Freyra · Projektledelse for naturindsatser
        </p>
        <h1 id="start-heading" className="mt-3 text-3xl leading-tight sm:text-5xl">
          Fra naturproblem til dokumenteret indsats
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Beskriv, hvad I vil forbedre. Planlæg arbejdet, følg udførelsen, og saml grundlaget for at
          vurdere resultatet. Begynd med et projekt, eller fortsæt en eksisterende indsats.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {START_ACTIONS.map(({ id, label, description, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled={id === "new" && !canCreate}
            aria-pressed={id !== "new" ? selected === id : undefined}
            onClick={() => onChoose(id)}
            className={`start-action group flex min-h-32 flex-col rounded-lg border p-5 text-left transition hover:border-primary hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-40 ${id === "new" ? "border-primary bg-primary text-primary-foreground" : selected === id ? "border-primary bg-secondary" : "bg-card"}`}
          >
            <span className="flex w-full items-center justify-between">
              <Icon className="size-5" aria-hidden="true" />
              <ArrowRight
                className="size-4 opacity-60 transition group-hover:translate-x-1"
                aria-hidden="true"
              />
            </span>
            <span className="mt-5 text-base font-semibold">{label}</span>
            <span
              className={`mt-2 text-sm leading-6 ${id === "new" ? "text-primary-foreground/85" : "text-muted-foreground"}`}
            >
              {description}
            </span>
          </button>
        ))}
      </div>
      {!canCreate && (
        <p className="text-sm text-muted-foreground">
          Du kan åbne de sager, du har adgang til. En ejer, administrator eller redaktør kan starte
          en ny sag.
        </p>
      )}
    </section>
  );
}
