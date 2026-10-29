import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBlocker } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  loadProjectWorkOrderExecutionContext,
  saveProjectWorkOrderExecution,
} from "@/lib/work-order-execution.functions";
import type { WorkOrderPlanVersion } from "@/lib/work-order-plan";
import { assignmentModeLabels, type WorkOrderAssignment } from "@/lib/work-order-assignments";
import { claimProjectWorkOrderPool } from "@/lib/work-order-assignments.functions";
import {
  workOrderExecutionGapLabels,
  type WorkOrderExecutionBinding,
} from "@/lib/work-order-execution";
import { useWorkOrderPeople } from "./useWorkOrderPeople";
import { MoreWorkOrderPeople } from "./MoreWorkOrderPeople";
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

type ExecutionPanelProps = { scope: ProjectScope; canEdit: boolean; selectedRoundId?: string };
export function ActionExecutionPanel(props: ExecutionPanelProps) {
  const { user } = useAuth();
  return (
    <ExecutionPanel
      key={`${user?.id ?? "anonymous"}:${props.scope.organizationId}:${props.scope.projectId}`}
      {...props}
      actorId={user?.id}
    />
  );
}
function ExecutionPanel({
  scope,
  canEdit,
  selectedRoundId,
  actorId,
}: ExecutionPanelProps & { actorId?: string }) {
  const cache = useQueryClient();
  const loadContext = useServerFn(loadProjectWorkOrderExecutionContext),
    saveBound = useServerFn(saveProjectWorkOrderExecution),
    claimPool = useServerFn(claimProjectWorkOrderPool);
  const workspace = useQuery({
    queryKey: ["project-workspace", scope.organizationId, scope.projectId, actorId],
    queryFn: () => loadProjectWorkspace(scope),
    retry: false,
  });
  const key = ["action-executions", scope.organizationId, scope.projectId, actorId];
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
  const [context, setContext] = useState<{
    plan: WorkOrderPlanVersion | null;
    binding: WorkOrderExecutionBinding | null;
    assignment: WorkOrderAssignment | null;
    canClaim: boolean;
    canExecute: boolean | null;
  } | null>(null);
  const [performedById, setPerformedById] = useState<string | null>(null),
    [deviationReason, setDeviationReason] = useState("");
  const attempt = useRef<{ signature: string; id: string } | null>(null),
    saving = useRef(false);
  const claimAttempt = useRef<{ signature: string; id: string } | null>(null);
  const members = useWorkOrderPeople(scope, actorId, canEdit);
  useBlocker({ shouldBlockFn: () => !!draft && canEdit, enableBeforeUnload: !!draft && canEdit });
  useEffect(() => {
    setActionId("");
    setDraft(null);
    setBaseVersion(undefined);
    setError("");
    setMessage("");
  }, [scope.organizationId, scope.projectId]);
  // Do not reset an edited form when a background response arrives.
  async function open(id: string) {
    if (!actorId) return;
    setError("");
    setMessage("");
    setBusy(true);
    const existing = history.data
      ? latestExecutions(history.data).find((e) => e.execution.actionId === id)
      : undefined;
    try {
      const loaded = await loadContext({
        data: {
          ...scope,
          expectedActorId: actorId,
          actionId: id,
          previousRevisionId: existing?.entry.id ?? null,
        },
      });
      setActionId(id);
      setBaseVersion(existing?.entry);
      setContext(loaded);
      attempt.current = null;
      claimAttempt.current = null;
      setPerformedById(loaded.binding?.performed_by_id ?? null);
      setDeviationReason(loaded.binding?.deviation_reason ?? "");
      setDraft(
        existing
          ? { ...existing.execution, correctionReason: "" }
          : { ...emptyExecution(id), surveyRoundId: selectedRoundId ?? null },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan og udførelse kunne ikke kontrolleres.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (
      !draft ||
      !canEdit ||
      !actorId ||
      !context ||
      saving.current ||
      (context.plan && context.canExecute !== true)
    )
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const execution = ActionExecutionSchema.parse(draft);
      const signature = JSON.stringify({
        execution,
        base: baseVersion?.version ?? 0,
        planId: context.plan?.id,
        assignmentId: context.assignment?.id ?? null,
        assignmentVersion: context.assignment?.version ?? 0,
        performedById,
        deviationReason: deviationReason.trim(),
      });
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const saved = context.plan
        ? await saveBound({
            data: {
              ...scope,
              actionId: draft.actionId,
              expectedActorId: actorId,
              planVersionId: context.plan.id,
              expectedPlanVersion: context.plan.version,
              expectedVersion: baseVersion?.version ?? 0,
              assignmentVersionId: context.assignment?.id ?? null,
              expectedAssignmentVersion: context.assignment?.version ?? 0,
              requestId: attempt.current.id,
              execution,
              performedById,
              deviationReason,
            },
          })
        : await saveActionExecution(scope, execution, baseVersion);
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
      saving.current = false;
      setBusy(false);
    }
  }
  async function takePool() {
    if (
      !actorId ||
      !draft ||
      !canEdit ||
      !context?.plan ||
      !context.assignment ||
      !context.canClaim ||
      saving.current
    )
      return;
    const issued = context;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify({
        planId: issued.plan!.id,
        assignmentId: issued.assignment!.id,
        version: issued.assignment!.version,
      });
      if (claimAttempt.current?.signature !== signature)
        claimAttempt.current = { signature, id: crypto.randomUUID() };
      const claimed = await claimPool({
        data: {
          ...scope,
          actionId: draft.actionId,
          expectedActorId: actorId,
          expectedVersion: issued.assignment!.version,
          planVersionId: issued.plan!.id,
          requestId: claimAttempt.current.id,
        },
      });
      setContext({ ...issued, assignment: claimed, canClaim: false, canExecute: true });
      attempt.current = null;
      setMessage("Puljeopgaven er overtaget. Dine indtastninger er bevaret.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["my-work-orders", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-assignment-state", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-capabilities", actorId] }),
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Opgaven kunne ikke overtages. Dine indtastninger er bevaret.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const inputClass =
    "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background p-2 text-base";
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
      {busy && !draft && <p role="status">Åbner arbejdsgrundlag…</p>}
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
              await open(action.id);
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
              disabled={busy || !!draft}
            />
          </label>
          <Button className="self-end min-h-11" disabled={busy || !!draft}>
            Opret handling
          </Button>
        </form>
      )}
      <label className="block">
        Handling
        <select
          className={inputClass}
          value={actionId}
          disabled={busy || !history.isSuccess || !!draft}
          onChange={(e) =>
            e.target.value ? void open(e.target.value) : (setActionId(""), setDraft(null))
          }
        >
          <option value="">Vælg handling</option>
          {(workspace.data?.actions ?? [])
            .filter((a) => a.action_type !== "workflow_followup")
            .map((a) => (
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
            {context?.plan && (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <p>
                  Arbejdsgrundlag: {context.plan.plan.title} · plan version {context.plan.version}.
                </p>
                <p>
                  Planlagt: {context.plan.plan.plannedStart ?? "start uafklaret"}
                  {context.plan.plan.plannedEnd ? ` til ${context.plan.plan.plannedEnd}` : ""}.
                  Planlagt metode: {context.plan.plan.plannedMethod ?? "uafklaret"}.
                </p>
                {context.binding && (
                  <p>
                    Den tidligere udførelse henviser til plan version {context.binding.plan_version}
                    . Denne rettelse knyttes til det viste arbejdsgrundlag.
                  </p>
                )}
                {context.assignment && (
                  <p>
                    Tildeling: {assignmentModeLabels[context.assignment.mode]} · version{" "}
                    {context.assignment.version}.
                  </p>
                )}
                {context.assignment?.mode === "pool" && !context.assignment.claimed_by && (
                  <p>Puljeopgaven skal overtages, før udførelsen kan gemmes.</p>
                )}
                {canEdit && context.canClaim && (
                  <Button type="button" className="mt-2 min-h-11" onClick={() => void takePool()}>
                    Overtag puljeopgaven
                  </Button>
                )}
              </div>
            )}
            {context?.plan && (
              <>
                <label className="block">
                  Registreret udfører
                  <select
                    className={inputClass}
                    value={performedById ?? ""}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      setPerformedById(value);
                      const person = members.data?.find((m) => m.user_id === value);
                      if (person)
                        setDraft({
                          ...draft,
                          performedBy:
                            person.display_name ||
                            person.email ||
                            "Projektmedlem · " + person.user_id.slice(-8),
                        });
                    }}
                  >
                    <option value="">Udførerens identitet er uafklaret</option>
                    {performedById &&
                      !members.data?.some((m) => m.user_id === performedById && m.can_execute) && (
                        <option value={performedById}>Tidligere registreret udfører</option>
                      )}
                    {members.data
                      ?.filter((m) => m.can_execute)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name || m.email || "Projektmedlem · " + m.user_id.slice(-8)}
                        </option>
                      ))}
                  </select>
                </label>
                <MoreWorkOrderPeople query={members} />
                {members.isError && (
                  <p role="alert">
                    Medlemslisten kunne ikke hentes. Den tidligere udfører bevares.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Den faktiske udfører vælges særskilt fra planens ansvarlige og den bruger, der
                  gemmer registreringen.
                </p>
              </>
            )}
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
            {context?.plan && draft.deviation && (
              <label className="block">
                Begrundelse for afvigelsen
                <textarea
                  className={inputClass}
                  required
                  maxLength={2000}
                  value={deviationReason}
                  onChange={(e) => setDeviationReason(e.target.value)}
                />
              </label>
            )}
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
          {context?.binding && context.binding.documentation_gaps.length > 0 && (
            <div className="text-sm">
              <p>Afklaringer i gemt version {context.binding.version}:</p>
              <ul>
                {context.binding.documentation_gaps.map((gap) => (
                  <li key={gap}>{workOrderExecutionGapLabels[gap]}</li>
                ))}
              </ul>
            </div>
          )}
          <ul className="text-sm">
            {executionGaps(draft).map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button
                className="min-h-11"
                disabled={
                  busy || !history.isSuccess || (!!context?.plan && context.canExecute !== true)
                }
              >
                Gem udførelsesversion
              </Button>
            )}
            <Button
              className="min-h-11"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setActionId("");
                setContext(null);
                setError("");
              }}
            >
              Luk registrering uden at gemme
            </Button>
          </div>
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
