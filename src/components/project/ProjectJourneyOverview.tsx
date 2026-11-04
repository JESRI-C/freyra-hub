import { ArrowRight, Pencil } from "lucide-react";
import { PROJECT_JOURNEY, type ProjectJourneyId } from "@/lib/project-journey";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium";

export function ProjectJourneyOverview({
  description,
  onChoose,
  onEditPurpose,
  onOpenReviewQueue,
}: {
  description: string | null;
  onChoose: (id: ProjectJourneyId) => void;
  onEditPurpose?: () => void;
  onOpenReviewQueue?: () => void;
}) {
  return (
    <section
      aria-labelledby="project-journey-heading"
      className="min-w-0 space-y-5 [overflow-wrap:anywhere]"
    >
      <div className="rounded-2xl border bg-primary/5 p-5 sm:p-6">
        <p className="text-sm font-medium text-primary">Dit forløb som projektleder</p>
        <h2 id="project-journey-heading" className="mt-2 text-2xl font-semibold">
          Fra naturproblem til dokumenteret indsats
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Freyra hjælper dig med at samle grundlaget, planlægge arbejdet og følge, hvad der bliver
          udført. Billeder og registreringer bruges til at underbygge indsatsen og vurdere, hvad der
          har ændret sig.
        </p>
        <div className="mt-5 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Projektets problem og mål</h3>
          {description?.trim() ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{description}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Formålet er endnu ikke beskrevet. Hvad er problemet på området, hvad vil I opnå, og
              hvordan vil I følge op?
            </p>
          )}
          {onEditPurpose && (
            <button type="button" onClick={onEditPurpose} className={button + " mt-3"}>
              <Pencil className="size-4" aria-hidden="true" />
              {description?.trim() ? "Redigér problem og mål" : "Beskriv problem og mål"}
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={button + " bg-primary text-primary-foreground"}
            onClick={() =>
              description?.trim() || !onEditPurpose ? onChoose("plan") : onEditPurpose()
            }
          >
            {description?.trim() || !onEditPurpose ? "Planlæg indsatsen" : "Begynd med formålet"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={button + " bg-background"}
            onClick={() => onChoose("foundation")}
          >
            Undersøg området først
          </button>
        </div>
      </div>
      {onOpenReviewQueue && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Afleveringer til gennemgang eller rettelse</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Find afleveringer, der venter på en faglig afgørelse, og opgaver, der er sendt tilbage
            med mangler.
          </p>
          <button type="button" className={button + " mt-3"} onClick={onOpenReviewQueue}>
            Se afleveringer der kræver handling
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold">Sådan hænger arbejdet sammen</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Åbn det trin, du arbejder med. Du kan vende tilbage og supplere grundlaget undervejs.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECT_JOURNEY.map((item, index) => (
            <li key={item.id} className="flex min-w-0 flex-col rounded-xl border bg-card p-4">
              <p className="text-xs font-medium text-primary">Trin {index + 1}</p>
              <h4 className="mt-2 font-semibold">{item.title}</h4>
              <p className="mt-2 text-sm font-medium">{item.question}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
              <p className="mt-3 border-t pt-3 text-sm">
                <span className="font-medium">Formål: </span>
                {item.output}
              </p>
              {item.id === "purpose" && !onEditPurpose ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Projektets formål er vist ovenfor.
                </p>
              ) : (
                <button
                  type="button"
                  className={button + " mt-4 w-full"}
                  onClick={() =>
                    item.id === "purpose" && onEditPurpose ? onEditPurpose() : onChoose(item.id)
                  }
                >
                  {item.action}
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">
        <p className="font-semibold">Et eksempel på sammenhængen</p>
        <p className="mt-1">
          En eng gror til → du beskriver målet → planlægger plejen → registrerer det udførte arbejde
          → afleverer dokumentationen til faglig gennemgang → sammenholder før og efter → samler
          rapporten.
        </p>
        <p className="mt-2 text-muted-foreground">
          Et foto viser forholdene på et tidspunkt. Opgaven forklarer, hvad der skulle gøres.
          Udførelsen fortæller, hvad der blev gjort. Den faglige vurdering skal vise, hvad
          materialet siger om ændringen i naturen.
        </p>
      </div>
    </section>
  );
}
