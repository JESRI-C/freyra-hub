import { useEffect, useState } from "react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  createDraftVerificationPlan,
  type DraftVerificationPlan,
} from "@/services/baseline/verification-plan";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";

/** Read-only draft: a displayed suggestion cannot masquerade as a saved review. */
export function VerificationPlanPanel({ snapshot }: { snapshot: PublicBaselineSnapshot }) {
  const [plan, setPlan] = useState<DraftVerificationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setPlan(null);
    setError(null);
    void createDraftVerificationPlan(snapshot)
      .then((draft) => {
        if (current) setPlan(draft);
      })
      .catch((failure: unknown) => {
        if (current)
          setError(
            failure instanceof Error ? failure.message : "Verifikationsudkastet kunne ikke dannes.",
          );
      });
    return () => {
      current = false;
    };
  }, [snapshot]);

  return (
    <Card>
      <CardHeader
        title="Spørgsmål til drone og felt"
        subtitle={`Forslag fra gemt datagrundlag, version ${snapshot.version}`}
      />
      <div className="px-5 pb-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Rækkefølgen er datagrundlag → spørgsmål → drone/felt → faglig gennemgang. Disse forslag er
          endnu ikke en godkendt flyveplan eller registrerede resultater.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!plan && !error && (
          <p className="text-sm text-muted-foreground">Danner forslag fra den gemte version …</p>
        )}
        {plan && (
          <>
            {plan.questions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Datagrundlaget giver endnu ingen dokumenterbare drone- eller feltspørgsmål.
              </p>
            )}
            {plan.questions.map((question) => (
              <div key={question.id} className="rounded border p-3 space-y-2">
                <div className="flex justify-between gap-3 text-sm">
                  <strong>{question.title}</strong>
                  <Pill tone="info">Udkast · normal prioritet</Pill>
                </div>
                <p className="text-sm">{question.question}</p>
                <p className="text-xs text-muted-foreground">{question.rationale}</p>
                <p className="text-xs text-muted-foreground">{question.area.restriction}</p>
                <p className="text-xs text-muted-foreground">
                  Undersøgelsesperiode: {question.dates.baselineFrom}–{question.dates.baselineTo}.
                  Kilde hentet: {question.dates.sourceFetchedAt.slice(0, 10)}.
                </p>
                <p className="text-sm">
                  <strong>Dokumentation:</strong>{" "}
                  {
                    question.requiredEvidence.find((evidence) => evidence.kind === "original_photo")
                      ?.description
                  }
                </p>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Metode og usikkerhed</summary>
                  <p className="mt-2">{question.method}</p>
                  {question.uncertainty.map((warning) => (
                    <p key={warning} className="mt-1">
                      {warning}
                    </p>
                  ))}
                </details>
                <p className="text-xs text-muted-foreground">
                  Faglig gennemgang skal senere registrere: understøttet, afkræftet, ikke afgørligt
                  eller kræver besigtigelse.
                </p>
              </div>
            ))}
            {plan.baselineDataGaps.length > 0 && (
              <details className="rounded border p-3 text-sm">
                <summary className="cursor-pointer">
                  {plan.baselineDataGaps.length} kilder kræver mere datagrundlag
                </summary>
                <p className="mt-2 text-muted-foreground">
                  Manglende offentlige kilder skal hentes eller importeres. Dronefotos kan ikke
                  udfylde disse kildehuller.
                </p>
                {plan.baselineDataGaps.map((gap) => (
                  <p key={gap.sourceId} className="mt-2 text-xs text-muted-foreground">
                    <strong>
                      {gap.provider} · {gap.dataset}:
                    </strong>{" "}
                    {gap.reason}
                  </p>
                ))}
              </details>
            )}
            {plan.warnings.map((warning) => (
              <p key={warning} className="text-xs text-muted-foreground">
                {warning}
              </p>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}
