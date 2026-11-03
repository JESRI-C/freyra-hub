import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  getWorkOrderPrerequisite,
  saveWorkOrderPrerequisite,
} from "@/lib/work-order-prerequisite.functions";
import type { ProjectScope } from "@/services/project-workspace-service";

export function WorkOrderPrerequisite({
  scope,
  actionId,
  actorId,
  candidates,
  disabled,
  onSaving,
}: {
  scope: ProjectScope;
  actionId: string;
  actorId: string;
  candidates: { id: string; title: string }[];
  disabled: boolean;
  onSaving: (saving: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ version: number; id: string }>();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const attempt = useRef<{ key: string; id: string } | undefined>(undefined);
  const inFlight = useRef(false);
  const load = useServerFn(getWorkOrderPrerequisite);
  const save = useServerFn(saveWorkOrderPrerequisite);
  const cache = useQueryClient();
  const key = ["work-order-prerequisite", actorId, actionId];
  const state = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { actionId, expectedActorId: actorId } }),
    enabled: open,
    retry: false,
  });
  const previous = state.data?.prerequisiteActionId;
  const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";

  async function submit() {
    if (!draft || disabled || inFlight.current) return;
    inFlight.current = true;
    onSaving(true);
    setError("");
    setSaved(false);
    try {
      const signature = draft.version + ":" + draft.id;
      if (attempt.current?.key !== signature)
        attempt.current = { key: signature, id: crypto.randomUUID() };
      await save({
        data: {
          ...scope,
          actionId,
          expectedActorId: actorId,
          expectedVersion: draft.version,
          prerequisiteActionId: draft.id || null,
          requestId: attempt.current.id,
        },
      });
      setDraft(undefined);
      await Promise.all([
        cache.invalidateQueries({ queryKey: key }),
        cache.invalidateQueries({ queryKey: ["field-job-schedule", actorId, scope] }),
      ]);
      setSaved(true);
    } catch {
      setError(
        "Forudsætningen kunne ikke gemmes. Kontrollér opgavens status, eller vælg en opgave uden en cirkulær afhængighed.",
      );
    } finally {
      inFlight.current = false;
      onSaving(false);
    }
  }

  return (
    <details
      className="space-y-2 rounded-xl border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        Forudsætning for opstart
      </summary>
      {open && (
        <p className="text-sm">Vælg den opgave, der skal være udført, før arbejdet kan startes.</p>
      )}
      {open && state.isPending && <p role="status">Henter forudsætning…</p>}
      {open && state.isError && (
        <button type="button" className={button} onClick={() => void state.refetch()}>
          Hent forudsætning igen
        </button>
      )}
      {open && state.data && (
        <>
          {previous ? (
            <p className="text-sm">
              {state.data.ready ? "Udført" : "Afventer"} ·{" "}
              <Link
                className="underline"
                to="/app/projects/$slug"
                params={{ slug: scope.projectId }}
                search={{ tab: "handlinger", task: previous, work: "plan" }}
              >
                {candidates.find((item) => item.id === previous)?.title ?? "Åbn forudsætning"}
              </Link>
            </p>
          ) : (
            <p className="text-sm">Ingen forudsætning valgt.</p>
          )}
          {saved && <p role="status">Forudsætning gemt.</p>}
          {draft ? (
            <fieldset className="space-y-2" disabled={disabled}>
              <label className="block text-sm">
                Opgave der skal udføres først
                <select
                  className="block min-h-11 w-full rounded-xl border bg-background px-3"
                  value={draft.id}
                  onChange={(event) => setDraft({ ...draft, id: event.target.value })}
                >
                  <option value="">Ingen forudsætning</option>
                  {candidates
                    .filter((item) => item.id !== actionId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                </select>
              </label>
              {error && <p role="alert">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={draft.id === (previous ?? "")}
                  onClick={() => void submit()}
                >
                  Gem forudsætning
                </button>
                <button type="button" className={button} onClick={() => setDraft(undefined)}>
                  Fortryd
                </button>
              </div>
            </fieldset>
          ) : (
            <button
              type="button"
              className={button}
              disabled={disabled}
              onClick={() => {
                setDraft({ version: state.data.version, id: previous ?? "" });
                setSaved(false);
                setError("");
              }}
            >
              Vælg forudsætning
            </button>
          )}
        </>
      )}
    </details>
  );
}
