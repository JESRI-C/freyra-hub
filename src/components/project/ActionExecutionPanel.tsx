import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { WorkspaceEntry } from "@/lib/project-workspace";
import {
  ActionExecutionSchema,
  emptyExecution,
  executionGaps,
  latestExecutions,
  type ActionExecution,
} from "@/lib/action-execution";
import {
  createProjectAction,
  loadProjectWorkspace,
  type ProjectScope,
} from "@/services/project-workspace-service";
import { listActionExecutions, saveActionExecution } from "@/services/action-execution-service";

export function ActionExecutionPanel({
  scope,
  canEdit,
  selectedRoundId,
}: {
  scope: ProjectScope;
  canEdit: boolean;
  selectedRoundId?: string;
}) {
  const cache = useQueryClient();
  const workspace = useQuery({
    queryKey: ["project-workspace", scope.organizationId, scope.projectId],
    queryFn: () => loadProjectWorkspace(scope),
    retry: false,
  });
  const key = ["action-executions", scope.organizationId, scope.projectId];
  const history = useQuery({
    queryKey: key,
    queryFn: () => listActionExecutions(scope),
    retry: false,
  });
  const [actionId, setActionId] = useState("");
  const [draft, setDraft] = useState<ActionExecution | null>(null);
  const [baseVersion, setBaseVersion] = useState<WorkspaceEntry | undefined>();
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setActionId("");
    setDraft(null);
    setBaseVersion(undefined);
    setError("");
    setMessage("");
  }, [scope.organizationId, scope.projectId]);
  // Do not reset an edited form when a background response arrives.
  function open(id: string) {
    setActionId(id);
    setError("");
    setMessage("");
    const existing = history.data
      ? latestExecutions(history.data).find((e) => e.execution.actionId === id)
      : undefined;
    setBaseVersion(existing?.entry);
    setDraft(
      existing
        ? { ...existing.execution, correctionReason: "" }
        : { ...emptyExecution(id), surveyRoundId: selectedRoundId ?? null },
    );
  }
  async function save() {
    if (!draft || !canEdit) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveActionExecution(
        scope,
        ActionExecutionSchema.parse(draft),
        baseVersion,
      );
      await cache.invalidateQueries({ queryKey: key });
      setDraft(null);
      setActionId("");
      setMessage(
        "Udførelsesregistrering gemt som version " +
          saved.version +
          ". Den er ikke en faglig godkendelse.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }
  const inputClass = "mt-1 block w-full rounded border bg-background p-2";
  const textFields = [
    ["actualDate", "Faktisk startdato", "date"],
    ["actualEndDate", "Faktisk slutdato (valgfri)", "date"],
    ["method", "Faktisk metode – tomt felt betyder uafklaret", "text"],
    ["reach", "Udført delstrækning og stedreference", "text"],
    ["performedBy", "Udførende – tomt felt betyder ukendt", "text"],
    ["sourceReference", "Arbejdslog, feltregistrering eller anden udførelseskilde", "text"],
    ["deviation", "Afvigelser fra planen", "text"],
    ["coverageDescription", "Faktisk dækning, metode og begrænsninger", "text"],
    ["correctionReason", "Årsag til rettelse (kræves ved ny version)", "text"],
  ] as const;
  return (
    <section aria-label="Faktisk udførelse" className="space-y-4">
      <p>
        Plan og udførelse registreres hver for sig. Skæredatoen er ikke fotodatoen. En rettelse
        bevarer den tidligere version og kræver ny vurdering af berørte sammenligninger.
      </p>
      {(workspace.isError || history.isError || workspace.data?.errors.actions) && (
        <p role="alert">
          Handlinger eller historik kunne ikke hentes. Genindlæs før du registrerer udførelse.
        </p>
      )}
      {(workspace.isFetching || history.isFetching) && (
        <p role="status">Henter handlinger og udførelseshistorik…</p>
      )}
      {canEdit && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const action = await createProjectAction(
                scope,
                newTitle,
                "Plan; faktisk udførelse registreres særskilt.",
              );
              await cache.invalidateQueries({ queryKey: ["project-workspace"] });
              setNewTitle("");
              open(action.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kunne ikke oprette handling.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="grow">
            Ny planlagt handling
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              maxLength={200}
              className={inputClass}
              disabled={busy}
            />
          </label>
          <Button className="self-end" disabled={busy}>
            Opret handling
          </Button>
        </form>
      )}
      <label className="block">
        Handling
        <select
          className={inputClass}
          value={actionId}
          disabled={busy || !history.isSuccess}
          onChange={(e) =>
            e.target.value ? open(e.target.value) : (setActionId(""), setDraft(null))
          }
        >
          <option value="">Vælg handling</option>
          {(workspace.data?.actions ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      {!canEdit && (
        <p>Du har læseadgang. En udførelse kan registreres af en medarbejder med skriveret.</p>
      )}
      {draft && (
        <form
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={!canEdit || busy} className="space-y-3">
            <legend>
              Udførelse ·{" "}
              {baseVersion ? "version " + (baseVersion.version + 1) : "første registrering"}
            </legend>
            <label className="block">
              Status
              <select
                className={inputClass}
                value={draft.stage}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    stage: e.target.value as ActionExecution["stage"],
                    ...(e.target.value === "planned"
                      ? { actualDate: null, actualEndDate: null }
                      : {}),
                  })
                }
              >
                <option value="planned">Planlagt – ikke udført</option>
                <option value="performed">Faktisk udførelse registreret</option>
              </select>
            </label>
            <label className="block">
              Indsats
              <select
                className={inputClass}
                value={draft.workType}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    workType: e.target.value as ActionExecution["workType"],
                  })
                }
              >
                <option value="weed_cutting">Grødeskæring</option>
                <option value="other">Anden indsats</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {textFields.map(([name, label, type]) => (
                <label key={name}>
                  {label}
                  <input
                    className={inputClass}
                    type={type}
                    value={draft[name] ?? ""}
                    disabled={type === "date" && draft.stage === "planned"}
                    maxLength={2000}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [name]: ["actualDate", "actualEndDate", "method", "performedBy"].includes(
                          name,
                        )
                          ? e.target.value || null
                          : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="block">
              Faktisk undersøgelsesdækning
              <select
                className={inputClass}
                value={draft.coverage}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    coverage: e.target.value as ActionExecution["coverage"],
                  })
                }
              >
                <option value="unknown">Ukendt</option>
                <option value="limited">Begrænset delstrækning</option>
                <option value="documented">Dokumenteret dækning</option>
              </select>
            </label>
            <fieldset>
              <legend>Bilag på denne sag (valgfrit)</legend>
              {(workspace.data?.evidence ?? []).map((item) => (
                <label key={item.id} className="block">
                  <input
                    type="checkbox"
                    checked={draft.evidenceIds.includes(item.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        evidenceIds: e.target.checked
                          ? [...draft.evidenceIds, item.id]
                          : draft.evidenceIds.filter((id) => id !== item.id),
                      })
                    }
                  />{" "}
                  {item.title}
                </label>
              ))}
            </fieldset>
          </fieldset>
          <ul className="text-sm">
            {executionGaps(draft).map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
          {canEdit && <Button disabled={busy || !history.isSuccess}>Gem udførelsesversion</Button>}
        </form>
      )}
      {actionId && (
        <details>
          <summary>Udførelseshistorik</summary>
          {(history.data ?? [])
            .filter((e) => e.payload.source === "action-execution:" + actionId)
            .sort((a, b) => b.version - a.version)
            .map((e) => (
              <article key={e.id} className="my-2 rounded border p-3">
                <p>
                  Version {e.version} · {new Date(e.created_at).toLocaleString("da-DK")} ·{" "}
                  {e.created_by}
                </p>
                <pre className="whitespace-pre-wrap break-words text-xs">{e.payload.decision}</pre>
              </article>
            ))}
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
