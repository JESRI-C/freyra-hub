import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveWorkCustomerCommand } from "@/lib/work-customers.functions";
import { CustomerCommandSchema, type CustomerCommand } from "@/lib/work-customers";
import { WorkOrderRequestError } from "@/lib/work-order-access";

type Draft<T> = T extends CustomerCommand
  ? Omit<T, "organizationId" | "expectedActorId" | "requestId">
  : never;
export type CustomerCommandDraft = Draft<CustomerCommand>;
type Receipt = Awaited<ReturnType<typeof saveWorkCustomerCommand>>;

function knownFailure(failure: unknown) {
  for (const code of ["access", "conflict", "validation"] as const) {
    const reference = new WorkOrderRequestError(code);
    if (
      failure instanceof Error &&
      (failure.message === reference.message ||
        (failure instanceof WorkOrderRequestError && failure.code === code))
    )
      return code;
  }
  return undefined;
}

/** An uncertain response keeps the exact request and fields until a confirmed retry. */
export function useCustomerCommand(
  organizationId: string,
  actorId: string,
  onSaved: (receipt: Receipt) => void,
) {
  const save = useServerFn(saveWorkCustomerCommand);
  const attempt = useRef<CustomerCommand | undefined>(undefined);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function submit(draft: CustomerCommandDraft) {
    if (inFlight.current) return;
    const parsed = CustomerCommandSchema.safeParse({
      ...draft,
      organizationId,
      expectedActorId: actorId,
      requestId: attempt.current?.requestId ?? crypto.randomUUID(),
    });
    if (!parsed.success) {
      setError("Kontrollér navn, kontaktoplysninger og de øvrige felter.");
      return;
    }
    const command = attempt.current ?? parsed.data;
    attempt.current = command;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let receipt: Receipt;
    try {
      receipt = await save({ data: command });
    } catch (failure) {
      if (alive.current) {
        const known = knownFailure(failure);
        if (known) attempt.current = undefined;
        setUncertain(!known);
        setError(
          known === "conflict"
            ? "En anden har ændret oplysningerne. Dit udkast er bevaret. Luk udkastet og hent den seneste version, før du retter igen."
            : known === "access"
              ? "Du har ikke længere adgang til at gemme her. Dit udkast er bevaret."
              : known === "validation"
                ? "Kontrollér felterne. Udkastet er bevaret."
                : "Svaret kunne ikke bekræftes. Behold siden åben og prøv samme gemning igen; der oprettes ikke en ekstra post.",
        );
      }
      return;
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
    if (!alive.current) return;
    attempt.current = undefined;
    setUncertain(false);
    // Cache/selection work is outside the request catch: its failure cannot make a saved command uncertain.
    onSaved(receipt);
  }
  return { submit, busy, uncertain, error, locked: busy || uncertain };
}
