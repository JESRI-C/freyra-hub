import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  materialBillingColumns,
  materialBillingCsvRow,
  materialBillingRefs,
  materialBillingSchema,
} from "@/lib/project-material-billing";
import { MaterialBillingPreview } from "./MaterialBillingPreview";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { formatWorkOrderHours } from "@/lib/work-order-plan";
import { billedLineOre, billingDecimal, parseHourlyRateOre } from "@/lib/work-time-billing";
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
const draftsTable = "project_approved_time_drafts";
const draftFields = "id,date_from,date_through,rate_ore,total_ore,created_at";
const draftSchema = z.object({
  id: uuid,
  date_from: CalendarDate,
  date_through: CalendarDate,
  rate_ore: z.number().int().min(0).max(99999999),
  total_ore: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
});
const snapshotFields = draftFields + ",snapshot,time_ids,material_refs,material_snapshot";
const draftSnapshotSchema = draftSchema.extend({
  material_refs: z
    .array(z.tuple([uuid, uuid.nullable()]))
    .max(5000)
    .nullable(),
  material_snapshot: materialBillingSchema,
  snapshot: z.array(rowSchema).min(1).max(5000),
  time_ids: z.array(uuid).min(1).max(5000),
});
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const previewPageSize = 20;
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
  const [rate, setRate] = useState("");
  const [rows, setRows] = useState<z.infer<typeof rowSchema>[]>();
  const [includeMaterials, setIncludeMaterials] = useState(false);
  const [materials, setMaterials] = useState<z.infer<typeof materialBillingSchema>>();
  const [previewPage, setPreviewPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const [savedId, setSavedId] = useState<string>();
  const attempt = useRef<{ id: string; signature: string } | null>(null);
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const drafts = useQuery({
    queryKey: ["approved-time-drafts", actorId, scope],
    enabled: active,
    retry: false,
    queryFn: async () => {
      const result = await db()
        .from(draftsTable)
        .select(draftFields)
        .eq("organization_id", scope.organizationId)
        .eq("project_id", scope.projectId)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(20);
      if (result.error) throw new Error("Gemte grundlag kunne ikke hentes.");
      return z.array(draftSchema).parse(result.data);
    },
  });
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
    setMaterials(undefined);
    setSavedId(undefined);
    setError("");
    try {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const params = {
        p_organization_id: scope.organizationId,
        p_project_id: scope.projectId,
        p_from: from,
        p_through: through,
      };
      const [{ data, error: failure }, materialResult] = await Promise.all([
        client.rpc("get_project_approved_time_export", params),
        includeMaterials ? client.rpc("get_project_material_billing_export", params) : null,
      ]);
      if (failure)
        throw new Error(
          failure.code === "54000"
            ? "Udtrækket har over 5.000 linjer. Vælg en kortere periode."
            : "De godkendte timer kunne ikke hentes.",
        );
      const snapshot = z.array(rowSchema).max(5000).parse(data);
      if (snapshot.some((row) => row.work_date < from || row.work_date > through))
        throw new Error("Udtrækket stemmer ikke med den valgte periode.");
      if (materialResult?.error)
        throw new Error(
          materialResult.error.code === "54000"
            ? "Udtrækket har over 5.000 materialelinjer. Vælg en kortere periode."
            : "Materialerne kunne ikke hentes.",
        );
      setMaterials(materialResult ? materialBillingSchema.parse(materialResult.data) : undefined);
      setPreviewPage(0);
      setRows(snapshot);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Udtrækket kunne ikke hentes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const hourlyRateOre = parseHourlyRateOre(rate);
  const rateInvalid = !!rate.trim() && hourlyRateOre === null;
  const totalOre =
    hourlyRateOre === null
      ? null
      : rows?.reduce((sum, row) => sum + billedLineOre(row.minutes, hourlyRateOre), 0);

  const combinedOre =
    materials && totalOre != null
      ? materials.reduce((sum, row) => sum + BigInt(row.amount_ore ?? 0), BigInt(totalOre))
      : undefined;
  const combinedDigits = combinedOre?.toString().padStart(3, "0");

  async function saveDraft() {
    if (!active || inFlight.current || !rows?.length || hourlyRateOre === null || savedId) return;
    const timeIds = rows.map((row) => row.time_id);
    const materialRefs = materials ? materialBillingRefs(materials) : null;
    const signature = JSON.stringify([from, through, hourlyRateOre, timeIds, materialRefs]);
    if (attempt.current?.signature !== signature)
      attempt.current = { id: crypto.randomUUID(), signature };
    const id = attempt.current.id;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await db()
        .from(draftsTable)
        .insert({
          id,
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          date_from: from,
          date_through: through,
          rate_ore: hourlyRateOre,
          time_ids: timeIds,
          material_refs: materialRefs,
        })
        .select(snapshotFields)
        .single();
      const recovered = result.error
        ? await db()
            .from(draftsTable)
            .select(snapshotFields)
            .eq("id", id)
            .eq("organization_id", scope.organizationId)
            .eq("project_id", scope.projectId)
            .maybeSingle()
        : result;
      const receipt = draftSnapshotSchema.safeParse(recovered.data);
      if (
        !receipt.success ||
        receipt.data.id !== id ||
        receipt.data.total_ore !== totalOre ||
        receipt.data.date_from !== from ||
        receipt.data.date_through !== through ||
        receipt.data.rate_ore !== hourlyRateOre ||
        JSON.stringify(receipt.data.time_ids) !== JSON.stringify(timeIds) ||
        JSON.stringify(receipt.data.material_refs) !== JSON.stringify(materialRefs) ||
        JSON.stringify(materialBillingRefs(receipt.data.material_snapshot)) !==
          JSON.stringify(materialRefs ?? [])
      ) {
        throw new Error(
          result.error?.code === "40001"
            ? "Timer eller materialer er ændret. Beregn udtrækket igen før gemning."
            : "Grundlaget kunne ikke bekræftes. Prøv igen.",
        );
      }
      setRows(receipt.data.snapshot);
      setMaterials(materialRefs ? receipt.data.material_snapshot : undefined);
      setSavedId(id);
      await drafts.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Grundlaget kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function openDraft(id: string) {
    if (!active || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await db()
        .from(draftsTable)
        .select(snapshotFields)
        .eq("id", id)
        .eq("organization_id", scope.organizationId)
        .eq("project_id", scope.projectId)
        .single();
      if (result.error) throw new Error("Det gemte grundlag kunne ikke åbnes.");
      const saved = draftSnapshotSchema.parse(result.data);
      if (
        saved.id !== id ||
        JSON.stringify(materialBillingRefs(saved.material_snapshot)) !==
          JSON.stringify(saved.material_refs ?? []) ||
        JSON.stringify(saved.snapshot.map((row) => row.time_id)) !==
          JSON.stringify(saved.time_ids) ||
        saved.snapshot.reduce((sum, row) => sum + billedLineOre(row.minutes, saved.rate_ore), 0) !==
          saved.total_ore
      )
        throw new Error("Det gemte grundlag kunne ikke kontrolleres.");
      setFrom(saved.date_from);
      setThrough(saved.date_through);
      setRate(billingDecimal(saved.rate_ore));
      setPreviewPage(0);
      setRows(saved.snapshot);
      setIncludeMaterials(saved.material_refs !== null);
      setMaterials(saved.material_refs ? saved.material_snapshot : undefined);
      setSavedId(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Det gemte grundlag kunne ikke åbnes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function download() {
    if (!active || !rows?.length || rateInvalid) return;
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
      ...(hourlyRateOre === null ? [] : ["timesats_dkk", "belob_dkk"]),
    ];
    const timeRows = rows.map((row) => {
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
        ...(hourlyRateOre === null
          ? {}
          : {
              timesats_dkk: billingDecimal(hourlyRateOre),
              belob_dkk: billingDecimal(billedLineOre(row.minutes, hourlyRateOre)),
            }),
      };
    });
    if (materials) {
      const combinedColumns = [
        "linjetype",
        ...new Set([
          ...columns.filter((column) => column !== "belob_dkk"),
          ...materialBillingColumns,
        ]),
      ];
      const csv = buildCsv(
        [
          ...timeRows.map(({ belob_dkk, ...row }) => ({
            ...row,
            linjetype: "Timer",
            beloeb_dkk: belob_dkk,
          })),
          ...materials.map((row) => ({
            ...materialBillingCsvRow(scope.projectId, row),
            linjetype: "Materialer",
          })),
        ],
        combinedColumns,
      );
      downloadCsv(csv, `freyra-faktureringsgrundlag-${from}-${through}.csv`);
    } else {
      downloadCsv(buildCsv(timeRows, columns), `freyra-godkendte-timer-${from}-${through}.csv`);
    }
  }

  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Udtræk godkendte timer
      </summary>
      <p>
        Vælg op til 31 dage, og kontrollér hvilke godkendte timer der kommer med. Angiv en timesats,
        hvis du vil gemme grundlaget og kunne hente det igen senere.
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
                setMaterials(undefined);
                setSavedId(undefined);
                setRate("");
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
                setMaterials(undefined);
                setSavedId(undefined);
                setRate("");
                setError("");
              }}
            />
          </label>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={includeMaterials}
            disabled={busy || !active}
            onChange={(event) => {
              setIncludeMaterials(event.target.checked);
              setRows(undefined);
              setMaterials(undefined);
              setSavedId(undefined);
              setError("");
            }}
          />
          Medtag materialer fra samme periode
        </label>
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
            ? `${rows.length} ${rows.length === 1 ? "linje" : "linjer"} · ${formatWorkOrderHours(rows.reduce((sum, row) => sum + row.minutes, 0) / 60)} godkendt`
            : "Ingen aktuelt godkendte timer i perioden."}
        </p>
      )}
      {combinedDigits && (
        <p className="mt-3 font-semibold">
          Timer og prissatte materialer uden moms · {combinedDigits.slice(0, -2)},
          {combinedDigits.slice(-2)} DKK
        </p>
      )}
      {materials && (
        <details className="mt-3 space-y-2 rounded-xl border px-3 pb-3">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            Materialer i grundlaget ({materials.length})
          </summary>
          <MaterialBillingPreview rows={materials} />
        </details>
      )}
      {!!rows?.length && (
        <div className="mt-3 space-y-2">
          <label className="block">
            Aftalt timesats i DKK (valgfri)
            <input
              className={control}
              inputMode="decimal"
              maxLength={9}
              placeholder="Fx 500,00"
              value={rate}
              aria-invalid={rateInvalid || undefined}
              disabled={busy || !!savedId}
              onChange={(event) => setRate(event.target.value)}
            />
          </label>
          <p>
            Satsen bruges for alle linjer i dette udtræk. Beløb afrundes pr. linje. Moms og øvrige
            tillæg indgår ikke.
          </p>
          {rateInvalid && <p role="alert">Angiv en sats med højst seks cifre og to decimaler.</p>}
          {totalOre !== null && totalOre !== undefined && (
            <p role="status" className="font-medium">
              Samlet beløb uden moms · {billingDecimal(totalOre)} DKK
            </p>
          )}
        </div>
      )}
      {!!rows?.length && (
        <div className="mt-3 space-y-3">
          <details className="rounded-xl border px-3">
            <summary className="min-h-11 cursor-pointer py-3 font-medium">
              Kontrollér timer pr. opgave og dato
            </summary>
            <ul className="divide-y border-t">
              {rows
                .slice(previewPage * previewPageSize, (previewPage + 1) * previewPageSize)
                .map((row) => (
                  <li key={row.time_id} className="flex flex-wrap justify-between gap-x-4 py-2">
                    <div className="min-w-0 break-words">
                      <p className="font-medium">{row.title}</p>
                      <p className="text-muted-foreground">
                        {row.work_date} · Tidsversion {row.version}
                      </p>
                    </div>
                    <div>
                      <p>{formatWorkOrderHours(row.minutes / 60)}</p>
                      {hourlyRateOre !== null && (
                        <p>{billingDecimal(billedLineOre(row.minutes, hourlyRateOre))} DKK</p>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
            {rows.length > previewPageSize && (
              <nav
                aria-label="Sider med godkendte timer"
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <button
                  type="button"
                  className={button}
                  disabled={previewPage === 0 || busy}
                  onClick={() => setPreviewPage(previewPage - 1)}
                >
                  Forrige
                </button>
                <span role="status">
                  Side {previewPage + 1} af {Math.ceil(rows.length / previewPageSize)}
                </span>
                <button
                  type="button"
                  className={button}
                  disabled={(previewPage + 1) * previewPageSize >= rows.length || busy}
                  onClick={() => setPreviewPage(previewPage + 1)}
                >
                  Næste
                </button>
              </nav>
            )}
          </details>
          {savedId && (
            <p role="status" className="font-medium">
              Gemt faktureringsgrundlag. Du kan hente CSV-filen nu eller åbne grundlaget igen
              nedenfor.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {hourlyRateOre !== null && !savedId && (
              <button
                type="button"
                className={button + " bg-primary text-primary-foreground"}
                disabled={busy || !active}
                onClick={() => void saveDraft()}
              >
                Gem faktureringsgrundlag
              </button>
            )}
            <button
              type="button"
              className={button}
              disabled={busy || rateInvalid || !active}
              onClick={download}
            >
              Hent CSV
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 space-y-2 border-t pt-3">
        <h4 className="font-semibold">Seneste 20 gemte grundlag</h4>
        {drafts.isLoading && <p role="status">Henter gemte grundlag…</p>}
        {drafts.isError && (
          <button
            type="button"
            className={button}
            disabled={!active}
            onClick={() => void drafts.refetch()}
          >
            Hent gemte grundlag igen
          </button>
        )}
        {drafts.isSuccess && !drafts.data.length && <p>Der er endnu ingen gemte grundlag.</p>}
        {drafts.data?.map((draft) => (
          <button
            key={draft.id}
            type="button"
            className={button + " block"}
            disabled={busy || !active}
            onClick={() => void openDraft(draft.id)}
          >
            Åbn grundlag · {draft.date_from} til {draft.date_through} ·{" "}
            {billingDecimal(draft.total_ore)} DKK ·{" "}
            {new Date(draft.created_at).toLocaleString("da-DK")}
          </button>
        ))}
      </div>
    </details>
  );
}
