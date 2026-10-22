import { ArrowRight, Camera, FileDown, FolderPlus, Leaf, Layers } from "lucide-react";
import type { MunicipalStep } from "@/components/project/MunicipalCaseWorkspace";

export const START_ACTIONS = [
  {
    id: "new",
    label: "Start en ny sag",
    description: "Saml et naturprojekt med billeder, kilder og faglige beslutninger.",
    icon: FolderPlus,
  },
  {
    id: "billeder",
    label: "Upload dronefotos",
    description: "Tilføj originalfotos, og få hjælp til sted og optagedato.",
    icon: Camera,
  },
  {
    id: "baseline",
    label: "Se baseline",
    description: "Se det gemte datagrundlag, kildernes dækning og det, der mangler.",
    icon: Layers,
  },
  {
    id: "beplantning",
    label: "Find steder at plante træer",
    description: "Undersøg mulige arealer langs vandløbet og deres begrænsninger.",
    icon: Leaf,
  },
  {
    id: "rapport",
    label: "Hent rapport",
    description: "Genåbn en rapportversion, eller saml dokumentationen i PDF og ZIP.",
    icon: FileDown,
  },
] as const;

export function StartActions({
  canCreate,
  selected,
  onChoose,
}: {
  canCreate: boolean;
  selected: MunicipalStep | null;
  onChoose: (action: "new" | MunicipalStep) => void;
}) {
  return (
    <section aria-labelledby="start-heading" className="space-y-6">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
          Freyra · Naturdokumentation
        </p>
        <h1 id="start-heading" className="mt-3 text-3xl leading-tight sm:text-5xl">
          Hvad vil du gøre?
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Fra dronefoto til dokumenteret baseline. Freyra samler billeder, offentlige kilder og din
          faglige vurdering i én sag.
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
