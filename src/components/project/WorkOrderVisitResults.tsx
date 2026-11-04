import { useId, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import type { WorkOrderPlan } from "@/lib/work-order-plan";
import type { ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";

const table = "work_order_visit_results";
const uuid = z.string().uuid();
const outcome = z.enum(["visited", "skipped"]);
const rowSchema = z.object({
  id: uuid,
  site_id: uuid,
  version: z.number().int().positive(),
  outcome,
  note: z.string(),
  created_by: uuid,
});
const fields = "id,site_id,version,outcome,note,created_by";
const label = { visited: "Gennemført", skipped: "Sprunget over" };
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const control = "mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 text-base";

const historyPageSize = 20;
const historyRowSchema = rowSchema.extend({ created_at: z.string().datetime({ offset: true }) });
const historyDate = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" });

function VisitResultHistory({
  scope,
  actorId,
  actionId,
  planVersionId,
  result,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  planVersionId: string;
  result: z.infer<typeof rowSchema>;
}) {
  const [open, setOpen] = useState(false);
  const history = useInfiniteQuery({
    queryKey: [
      "work-order-visit-history",
      actorId,
      scope,
      actionId,
      planVersionId,
      result.site_id,
      result.version,
    ],
    enabled: open,
    retry: false,
    initialPageParam: result.version,
    queryFn: async ({ pageParam, signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const response = await client
        .from(table)
        .select(fields + ",created_at")
        .eq("organization_id", scope.organizationId)
        .eq("project_id", scope.projectId)
        .eq("action_id", actionId)
        .eq("plan_version_id", planVersionId)
        .eq("site_id", result.site_id)
        .lt("version", pageParam)
        .order("version", { ascending: false })
        .limit(historyPageSize)
        .abortSignal(signal);
      if (response.error) throw new Error("Tidligere besøgsudfald kunne ikke hentes.");
      return z.array(historyRowSchema).max(historyPageSize).parse(response.data);
    },
    getNextPageParam: (lastPage) =>
      lastPage.length === historyPageSize && lastPage.at(-1)?.version !== 1
        ? lastPage.at(-1)?.version
        : undefined,
  });
  return (
    <details
      className="rounded-lg border px-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-3 font-medium">
        Tidligere udfald ({result.version - 1})
      </summary>
      {open && history.isPending && <p role="status">Henter tidligere udfald…</p>}
      {open && history.isError && <p role="alert">Tidligere besøgsudfald kunne ikke hentes.</p>}
      {history.data && (
        <ol className="space-y-2 pb-2">
          {history.data.pages.flat().map((entry) => (
            <li key={entry.id} className="rounded-lg bg-muted/40 p-2">
              <p>
                {label[entry.outcome]} · Version {entry.version}
              </p>
              <time dateTime={entry.created_at}>
                {historyDate.format(new Date(entry.created_at))}
              </time>
              {entry.note && <p>{entry.note}</p>}
            </li>
          ))}
        </ol>
      )}
      {open && (history.hasNextPage || history.isError) && (
        <button
          type="button"
          className={button + " mb-2"}
          disabled={history.isFetching}
          onClick={() => {
            if (history.hasNextPage) void history.fetchNextPage();
            else void history.refetch();
          }}
        >
          {history.isError ? "Prøv igen" : "Vis ældre udfald"}
        </button>
      )}
    </details>
  );
}

export function WorkOrderVisitResults({
  scope,
  actorId,
  actionId,
  planVersionId,
  planVersion,
  plan,
  primaryName,
  historical = false,
  canWrite = false,
  disabled = false,
  onEditing,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  planVersionId: string;
  planVersion: number;
  plan: WorkOrderPlan;
  primaryName?: string;
  historical?: boolean;
  canWrite?: boolean;
  disabled?: boolean;
  onEditing?: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState<{
    siteId: string;
    base: number;
    outcome: z.infer<typeof outcome>;
    note: string;
  }>();
  const [onlyPending, setOnlyPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const attempt = useRef<{ signature: string; id: string } | undefined>(undefined);
  const inFlight = useRef(false);
  useWorkOrderEditorLock(!!draft || busy, onEditing);
  const stops = [
    ...(plan.siteId ? [{ siteId: plan.siteId, name: primaryName ?? "Hovedlokalitet" }] : []),
    ...(plan.visitStops ?? []),
  ];
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const results = useQuery({
    queryKey: ["work-order-visit-results", actorId, scope, actionId, planVersionId],
    retry: false,
    refetchOnWindowFocus: !draft,
    refetchOnReconnect: !draft,
    enabled: stops.length > 0,
    queryFn: async ({ signal }) => {
      const result = await db()
        .rpc("list_work_order_visit_results", {
          p_organization_id: scope.organizationId,
          p_project_id: scope.projectId,
          p_action_id: actionId,
          p_plan_version_id: planVersionId,
        })
        .abortSignal(signal);
      if (result.error) throw new Error("Besøgsstatus kunne ikke hentes.");
      return z.array(rowSchema).max(21).parse(result.data);
    },
  });
  const bySite = new Map(results.data?.map((row) => [row.site_id, row]));
  const ordered = stops.map((stop, index) => ({
    ...stop,
    number: index + 1,
    result: bySite.get(stop.siteId),
  }));
  const visited = ordered.filter(({ result }) => result?.outcome === "visited").length;
  const skipped = ordered.filter(({ result }) => result?.outcome === "skipped").length;
  const pending = ordered.length - visited - skipped;
  const nextStop = ordered.find((stop) => !stop.result);
  const stopId = useId();
  const visible = onlyPending
    ? ordered.filter((stop) => !stop.result || draft?.siteId === stop.siteId)
    : ordered;

  async function save() {
    if (!draft || !canWrite || disabled || inFlight.current) return;
    const note = draft.note.trim();
    if ((draft.base || draft.outcome === "skipped") && !note) {
      setError("Skriv en begrundelse for det valgte udfald.");
      return;
    }
    const signature = JSON.stringify([draft.siteId, draft.base, draft.outcome, note]);
    if (attempt.current?.signature !== signature)
      attempt.current = { id: crypto.randomUUID(), signature };
    const id = attempt.current.id;
    const input = {
      id,
      action_id: actionId,
      plan_version_id: planVersionId,
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      site_id: draft.siteId,
      version: draft.base + 1,
      outcome: draft.outcome,
      note,
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const client = db();
      const result = await client.from(table).insert(input).select(fields).single();
      const confirmed = result.error
        ? await client
            .from(table)
            .select(fields)
            .eq("id", id)
            .eq("action_id", actionId)
            .eq("plan_version_id", planVersionId)
            .eq("project_id", scope.projectId)
            .eq("organization_id", scope.organizationId)
            .maybeSingle()
        : result;
      const receipt = rowSchema.safeParse(confirmed.data);
      if (
        !receipt.success ||
        receipt.data.id !== id ||
        receipt.data.created_by !== actorId ||
        receipt.data.site_id !== input.site_id ||
        receipt.data.version !== input.version ||
        receipt.data.outcome !== input.outcome ||
        receipt.data.note !== note
      )
        throw new Error(
          result.error?.code === "40001" || result.error?.code === "23505"
            ? "Planen eller besøget er ændret. Fortryd kladden og opdater opgaven før et nyt forsøg."
            : "Besøget kunne ikke bekræftes. Prøv igen.",
        );
      setDraft(undefined);
      attempt.current = undefined;
      setMessage("Besøget er gemt.");
      await results.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Besøget kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!stops.length) return null;
  return (
    <section aria-label="Besøgsstatus" className="space-y-3 rounded-xl border bg-card p-3 text-sm">
      <h3 className="font-semibold">Besøgsstatus</h3>
      <p>
        {historical
          ? `Tidligere planversion ${planVersion}. Her vises udfaldene for den gemte plan.`
          : `Planversion ${planVersion}. Udfaldet knyttes til denne version af arbejdsgrundlaget.`}
      </p>
      {results.isPending && <p role="status">Henter besøgsstatus…</p>}
      {results.isError && (
        <button type="button" className={button} onClick={() => void results.refetch()}>
          Hent besøgsstatus igen
        </button>
      )}
      {results.data && (
        <>
          <p role="status" className="font-medium">
            {visited} gennemført · {skipped} sprunget over · {pending} uden udfald
          </p>
          {!historical && results.isSuccess && nextStop && (
            <button
              type="button"
              className="min-h-11 rounded-lg bg-primary/5 px-3 text-left font-medium text-primary underline disabled:opacity-50"
              disabled={!!draft || busy || disabled}
              onClick={() => document.getElementById(stopId + nextStop.number)?.focus()}
            >
              Næste stop uden udfald · {nextStop.number}. {nextStop.name}
            </button>
          )}
          {!historical && (
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={onlyPending}
                disabled={!!draft || busy || disabled}
                onChange={(event) => setOnlyPending(event.target.checked)}
              />
              Kun stop uden udfald
            </label>
          )}
          {!visible.length && <p>Alle stop på denne plan har et registreret udfald.</p>}
          {!!visible.length && (
            <ol className="list-decimal space-y-3 pl-5">
              {visible.map((stop) => {
                const { result } = stop;
                return (
                  <li
                    key={stop.siteId}
                    id={stopId + stop.number}
                    tabIndex={-1}
                    value={stop.number}
                    className="scroll-mt-24 space-y-2 break-words"
                  >
                    <p className="font-medium">{stop.name}</p>
                    <p>
                      {result
                        ? label[result.outcome] + " · Version " + result.version
                        : historical
                          ? "Intet udfald registreret"
                          : "Afventer registrering"}
                    </p>
                    {result?.note && <p>{result.note}</p>}
                    {result && result.version > 1 && (
                      <VisitResultHistory
                        scope={scope}
                        actorId={actorId}
                        actionId={actionId}
                        planVersionId={planVersionId}
                        result={result}
                      />
                    )}
                    {canWrite && draft?.siteId !== stop.siteId && (
                      <button
                        type="button"
                        className={button}
                        disabled={disabled || busy || !!draft}
                        onClick={() => {
                          setMessage("");
                          setError("");
                          setDraft({
                            siteId: stop.siteId,
                            base: result?.version ?? 0,
                            outcome: result?.outcome ?? "visited",
                            note: "",
                          });
                        }}
                      >
                        {result ? "Ret besøg" : "Registrér besøg"}
                      </button>
                    )}
                    {canWrite && draft?.siteId === stop.siteId && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void save();
                        }}
                      >
                        <fieldset disabled={disabled || busy} className="space-y-2">
                          <label className="block">
                            Udfald
                            <select
                              className={control}
                              value={draft.outcome}
                              onChange={(event) =>
                                setDraft({ ...draft, outcome: outcome.parse(event.target.value) })
                              }
                            >
                              <option value="visited">Gennemført</option>
                              <option value="skipped">Sprunget over</option>
                            </select>
                          </label>
                          <label className="block">
                            {draft.base || draft.outcome === "skipped"
                              ? "Begrundelse"
                              : "Bemærkning (valgfri)"}
                            <textarea
                              className={control}
                              maxLength={2000}
                              value={draft.note}
                              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button type="submit" className={button}>
                              {busy ? "Gemmer…" : "Gem besøg"}
                            </button>
                            <button
                              type="button"
                              className={button}
                              onClick={() => {
                                setDraft(undefined);
                                setError("");
                                attempt.current = undefined;
                                void results.refetch();
                              }}
                            >
                              Fortryd
                            </button>
                          </div>
                        </fieldset>
                      </form>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
