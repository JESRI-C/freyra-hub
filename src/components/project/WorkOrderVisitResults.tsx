import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

export function WorkOrderVisitResults({
  scope,
  actorId,
  actionId,
  planVersionId,
  planVersion,
  plan,
  primaryName,
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
      <p>Planversion {planVersion}. Udfaldet knyttes til denne version af arbejdsgrundlaget.</p>
      {results.isPending && <p role="status">Henter besøgsstatus…</p>}
      {results.isError && (
        <button type="button" className={button} onClick={() => void results.refetch()}>
          Hent besøgsstatus igen
        </button>
      )}
      {results.data && (
        <ol className="list-decimal space-y-3 pl-5">
          {stops.map((stop) => {
            const result = bySite.get(stop.siteId);
            return (
              <li key={stop.siteId} className="space-y-2 break-words">
                <p className="font-medium">{stop.name}</p>
                <p>
                  {result
                    ? label[result.outcome] + " · Version " + result.version
                    : "Afventer registrering"}
                </p>
                {result?.note && <p>{result.note}</p>}
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
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
