import { useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Activity, Loader2, X } from "lucide-react";

export function ActivityTray({
  projectId,
  waiting = [],
  inline = false,
}: {
  projectId?: string | null;
  waiting?: string[];
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reads = useIsFetching({
    predicate: (query) => !projectId || query.queryKey.includes(projectId),
  });
  const writes = useIsMutating();
  const busy = reads + writes > 0;
  const body = (
    <section
      aria-label="Aktivitetsbakke"
      className="rounded-lg border bg-card p-5 text-sm shadow-soft"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg">Aktivitetsbakke</h2>
        {!inline && (
          <button
            type="button"
            aria-label="Luk aktivitetsbakke"
            onClick={() => setOpen(false)}
            className="rounded p-2 hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div role="status" className="mt-4 flex items-start gap-2 leading-6">
        {busy ? (
          <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-primary" />
        ) : (
          <Activity className="mt-1 size-4 shrink-0 text-primary" />
        )}
        <p>
          {writes
            ? "En handling behandles. Vent på kvitteringen i det åbne trin."
            : reads
              ? "Henter gemte oplysninger. Det ændrer ikke sagens dokumentation."
              : "Ingen registrerede hentninger eller gemninger i gang."}
        </p>
      </div>
      {waiting.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Venter på dig</h3>
          <ul className="mt-2 space-y-3 text-sm text-muted-foreground">
            {waiting.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 border-t pt-3 text-xs leading-5 text-muted-foreground">
        Kun visning. Viser hentninger og gemninger i denne fane. Upload og rapportdownload viser
        også fremdrift i det åbne trin.
      </p>
    </section>
  );
  if (inline) return body;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Åbn aktivitetsbakke"
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border bg-card px-3 text-xs hover:bg-muted"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Activity className="size-4" />}
        <span className="hidden sm:inline">Aktivitet</span>
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          {body}
        </div>
      )}
    </div>
  );
}
