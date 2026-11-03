import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  getWorkOrderPrerequisite,
  saveWorkOrderPrerequisites,
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
  const [draft, setDraft] = useState<{ version: number; ids: string[] }>();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const attempt = useRef<{ key: string; id: string } | undefined>(undefined);
  const inFlight = useRef(false);
  const load = useServerFn(getWorkOrderPrerequisite);
  const save = useServerFn(saveWorkOrderPrerequisites);
  const cache = useQueryClient();
  const key = ["work-order-prerequisite", actorId, actionId];
  const state = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { actionId, expectedActorId: actorId } }),
    enabled: open,
    retry: false,
  });
  const previous = state.data?.prerequisites ?? [];
  const [selected, setSelected] = useState("");
  const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";

  async function submit() {
    if (!draft || disabled || inFlight.current) return;
    inFlight.current = true;
    onSaving(true);
    setError("");
    setSaved(false);
    try {
      const signature = JSON.stringify([draft.version, draft.ids]);
      if (attempt.current?.key !== signature)
        attempt.current = { key: signature, id: crypto.randomUUID() };
      await save({
        data: {
          ...scope,
          actionId,
          expectedActorId: actorId,
          expectedVersion: draft.version,
          prerequisiteActionIds: draft.ids,
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
        Forudsætninger for opstart
      </summary>
      {open && (
        <p className="text-sm">
          Vælg op til 12 opgaver, der alle skal være udført, før arbejdet kan startes.
        </p>
      )}
      {open && state.isPending && <p role="status">Henter forudsætning…</p>}
      {open && state.isError && (
        <button type="button" className={button} onClick={() => void state.refetch()}>
          Hent forudsætning igen
        </button>
      )}
      {open && state.data && (
        <>
          {previous.length ? (
            <ul className="space-y-1 text-sm">
              {previous.map(({ actionId: prerequisiteId, ready }) => (
                <li key={prerequisiteId}>
                  {ready ? "Udført" : "Afventer"} ·{" "}
                  <Link
                    className="underline"
                    to="/app/projects/$slug"
                    params={{ slug: scope.projectId }}
                    search={{ tab: "handlinger", task: prerequisiteId, work: "plan" }}
                  >
                    {candidates.find((item) => item.id === prerequisiteId)?.title ??
                      "Åbn forudsætning"}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">Ingen forudsætninger valgt.</p>
          )}
          {saved && <p role="status">Forudsætninger gemt.</p>}
          {draft ? (
            <fieldset className="space-y-2" disabled={disabled}>
              <ul className="space-y-1 text-sm">
                {draft.ids.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span>
                      {candidates.find((item) => item.id === id)?.title ?? "Registreret opgave"}
                    </span>
                    <button
                      type="button"
                      className={button}
                      aria-label={
                        "Fjern forudsætning: " +
                        (candidates.find((item) => item.id === id)?.title ?? "Registreret opgave")
                      }
                      onClick={() =>
                        setDraft({ ...draft, ids: draft.ids.filter((item) => item !== id) })
                      }
                    >
                      Fjern
                    </button>
                  </li>
                ))}
              </ul>
              <label className="block text-sm">
                Tilføj en opgave der skal udføres først
                <select
                  className="block min-h-11 w-full rounded-xl border bg-background px-3"
                  value={selected}
                  disabled={draft.ids.length >= 12}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  <option value="">Vælg opgave</option>
                  {candidates
                    .filter((item) => item.id !== actionId && !draft.ids.includes(item.id))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className={button}
                disabled={!selected || draft.ids.length >= 12}
                onClick={() => {
                  setDraft({ ...draft, ids: [...draft.ids, selected] });
                  setSelected("");
                }}
              >
                Tilføj forudsætning
              </button>
              {error && <p role="alert">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={
                    !!selected ||
                    JSON.stringify(draft.ids) ===
                      JSON.stringify(previous.map((item) => item.actionId))
                  }
                  onClick={() => void submit()}
                >
                  Gem forudsætninger
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
                setDraft({
                  version: state.data.version,
                  ids: previous.map((item) => item.actionId),
                });
                setSelected("");
                setSaved(false);
                setError("");
              }}
            >
              Rediger forudsætninger
            </button>
          )}
        </>
      )}
    </details>
  );
}
