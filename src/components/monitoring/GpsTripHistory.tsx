import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";

const entries = z.array(
  z.object({
    revision: z.number().int().positive(),
    classification: z.enum(["private", "business"]),
    purpose: z.string().nullable(),
    captured_at: z.string().datetime({ offset: true }),
    baseline: z.boolean(),
  }),
);
const dateTime = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });

export function GpsTripHistory({
  tripId,
  revision,
  actorId,
}: {
  tripId: string;
  revision: number;
  actorId: string;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  const history = useQuery({
    queryKey: ["gps-trip-amendment-history", actorId, tripId, revision, limit],
    enabled: open,
    retry: false,
    queryFn: async ({ signal }) => {
      const db = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const response = await db
        .from("gps_trip_amendment_history")
        .select("revision,classification,purpose,captured_at,baseline")
        .eq("trip_id", tripId)
        .order("revision", { ascending: false })
        .limit(limit + 1)
        .abortSignal(signal);
      if (response.error) throw response.error;
      return entries.parse(response.data);
    },
  });
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="mt-2 text-sm">
      <summary className="min-h-11 cursor-pointer py-2">Ændringshistorik</summary>
      {open && history.isPending && <p role="status">Henter ændringer…</p>}
      {open && history.isError && (
        <p role="alert">
          Historikken kunne ikke hentes.{" "}
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => void history.refetch()}
          >
            Prøv igen
          </button>
        </p>
      )}
      {open && history.isSuccess && (
        <ol className="space-y-2">
          {history.data.slice(0, limit).map((entry) => (
            <li key={entry.revision} className="break-words border-l-2 pl-2">
              <p>
                Version {entry.revision} ·{" "}
                {entry.classification === "business" ? "Erhverv" : "Privat"}
                {entry.purpose && " · " + entry.purpose}
              </p>
              <p className="text-muted-foreground">
                {entry.baseline ? "Historik startet" : entry.revision === 1 ? "Oprettet" : "Rettet"}
                {" · "}
                {dateTime.format(new Date(entry.captured_at))}
              </p>
            </li>
          ))}
          {!history.data.length && <li>Ingen registreret historik.</li>}
        </ol>
      )}
      {open && history.isSuccess && history.data.length > limit && (
        <button
          type="button"
          className="min-h-11 rounded border px-2"
          onClick={() => setLimit(limit + 20)}
        >
          Vis tidligere ændringer
        </button>
      )}
    </details>
  );
}
