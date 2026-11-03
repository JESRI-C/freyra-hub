import { useRef, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  materialBillingColumns,
  materialBillingCsvRow,
  materialBillingSchema,
} from "@/lib/project-material-billing";
import { MaterialBillingPreview } from "./MaterialBillingPreview";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { buildCsv, downloadCsv } from "@/services/export-service";
import type { ProjectScope } from "@/services/project-workspace-service";

const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const input = "mt-1 block min-h-11 w-full rounded-xl border bg-background px-2 text-base";
export function ProjectMaterialBillingExport({
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
  const [rows, setRows] = useState<z.infer<typeof materialBillingSchema>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function calculate() {
    if (!active || inFlight.current) return;
    setRows(undefined);
    setError("");
    if (
      !CalendarDate.safeParse(from).success ||
      !CalendarDate.safeParse(through).success ||
      from > through ||
      Date.parse(through) - Date.parse(from) >= 31 * 86400000
    ) {
      setError("Vælg en periode på højst 31 dage.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const db = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const result = await db.rpc("get_project_material_billing_export", {
        p_organization_id: scope.organizationId,
        p_project_id: scope.projectId,
        p_from: from,
        p_through: through,
      });
      if (result.error)
        throw new Error(
          result.error.code === "54000"
            ? "Udtrækket har over 5.000 linjer. Vælg en kortere periode."
            : "Materialegrundlaget kunne ikke hentes.",
        );
      const parsed = materialBillingSchema.safeParse(result.data);
      if (!parsed.success) throw new Error("Materialegrundlaget kunne ikke bekræftes.");
      setRows(parsed.data);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Materialegrundlaget kunne ikke hentes.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function download() {
    if (!active || !rows?.length) return;
    const csv = buildCsv(
      rows.map((row) => materialBillingCsvRow(scope.projectId, row)),
      materialBillingColumns,
    );
    downloadCsv(csv, `freyra-materialegrundlag-${from}-${through}.csv`);
  }

  return (
    <details className="space-y-3 rounded-xl border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Faktureringsgrundlag for materialer
      </summary>
      <p>
        Vælg datoerne, hvor materialerne først blev registreret. Freyra bruger den seneste mængde og
        enhedsprisen fra første registrering. Beløb vises uden moms.
      </p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void calculate();
        }}
      >
        <fieldset disabled={busy || !active} className="grid gap-2 sm:grid-cols-2">
          <label>
            Materialer fra dato
            <input
              type="date"
              className={input}
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
            Materialer til og med
            <input
              type="date"
              className={input}
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
          {busy ? "Henter…" : "Beregn materialegrundlag"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {rows && <MaterialBillingPreview rows={rows} />}
      {!!rows?.length && (
        <div>
          <button type="button" className={button} disabled={!active} onClick={download}>
            Hent materiale-CSV
          </button>
        </div>
      )}
    </details>
  );
}
