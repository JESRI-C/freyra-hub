import { useRef, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { formatWorkOrderHours } from "@/lib/work-order-plan";
import { buildCsv, downloadCsv } from "@/services/export-service";
import type { ProjectScope } from "@/services/project-workspace-service";

const uuid = z.string().uuid();
const rowSchema = z.object({
  time_id: uuid,
  action_id: uuid,
  title: z.string(),
  actor_id: uuid,
  work_date: CalendarDate,
  version: z.number().int().positive(),
  minutes: z.number().int().min(1).max(1440),
  approved_by: uuid,
  approved_at: z.string().datetime({ offset: true }),
});
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const control = "mt-1 block min-h-11 w-full rounded-xl border bg-background px-2 text-base";

export function ProjectApprovedTimeExport({
  scope,
  actorId,
  active,
}: {
  scope: ProjectScope;
  actorId: string;
  active: boolean;
}) {
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [through, setThrough] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [rows, setRows] = useState<z.infer<typeof rowSchema>[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function load() {
    if (!active || inFlight.current) return;
    if (
      !CalendarDate.safeParse(from).success ||
      !CalendarDate.safeParse(through).success ||
      from > through ||
      Date.parse(through) - Date.parse(from) >= 31 * 86_400_000
    ) {
      setError("Vælg en periode på højst 31 dage.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setRows(undefined);
    setError("");
    try {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const { data, error: failure } = await client.rpc("get_project_approved_time_export", {
        p_organization_id: scope.organizationId,
        p_project_id: scope.projectId,
        p_from: from,
        p_through: through,
      });
      if (failure)
        throw new Error(
          failure.code === "54000"
            ? "Udtrækket har over 5.000 linjer. Vælg en kortere periode."
            : "De godkendte timer kunne ikke hentes.",
        );
      const snapshot = z.array(rowSchema).max(5000).parse(data);
      if (snapshot.some((row) => row.work_date < from || row.work_date > through))
        throw new Error("Udtrækket stemmer ikke med den valgte periode.");
      setRows(snapshot);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Udtrækket kunne ikke hentes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function download() {
    if (!active || !rows?.length) return;
    const columns = [
      "projekt_id",
      "opgave_id",
      "opgave",
      "udfoerer_id",
      "dato",
      "minutter",
      "tidsversion",
      "tidsversion_id",
      "godkendt_af",
      "godkendt_tidspunkt",
    ];
    const csv = buildCsv(
      rows.map((row) => {
        const title = row.title.replace(/[\r\n]/g, " ");
        return {
          projekt_id: scope.projectId,
          opgave_id: row.action_id,
          opgave: /^\s*[=+\-@]/.test(title) ? "'" + title : title,
          udfoerer_id: row.actor_id,
          dato: row.work_date,
          minutter: row.minutes,
          tidsversion: row.version,
          tidsversion_id: row.time_id,
          godkendt_af: row.approved_by,
          godkendt_tidspunkt: row.approved_at,
        };
      }),
      columns,
    );
    downloadCsv(csv, `freyra-godkendte-timer-${from}-${through}.csv`);
  }

  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Udtræk godkendte timer
      </summary>
      <p>
        Hent et faktureringsgrundlag for op til 31 dage. Udtrækket indeholder timer og godkendelser.
        Satser og beløb angives særskilt. CSV-filen afspejler godkendelserne på
        beregningstidspunktet.
      </p>
      <form
        className="mt-2 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <fieldset disabled={busy || !active} className="grid gap-2 sm:grid-cols-2">
          <label>
            Fra dato
            <input
              type="date"
              className={control}
              required
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setRows(undefined);
                setError("");
              }}
            />
          </label>
          <label>
            Til og med
            <input
              type="date"
              className={control}
              required
              value={through}
              onChange={(event) => {
                setThrough(event.target.value);
                setRows(undefined);
                setError("");
              }}
            />
          </label>
        </fieldset>
        <button type="submit" className={button} disabled={busy || !active}>
          {busy ? "Henter…" : "Beregn udtræk"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2">
          {error}
        </p>
      )}
      {rows && (
        <p role="status" className="mt-2">
          {rows.length
            ? `${rows.length} linjer · ${formatWorkOrderHours(rows.reduce((sum, row) => sum + row.minutes, 0) / 60)} godkendt`
            : "Ingen aktuelt godkendte timer i perioden."}
        </p>
      )}
      {!!rows?.length && (
        <button type="button" className={button + " mt-2"} onClick={download}>
          Hent CSV
        </button>
      )}
    </details>
  );
}
