import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useBlocker } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { getFieldJobAccess } from "@/lib/field-job-access.functions";
import {
  getProjectWorkOrderPlanHistory,
  saveProjectWorkOrderPlan,
} from "@/lib/work-order-plan.functions";
import {
  emptyWorkOrderPlan,
  emptyWorkOrderWatercourse,
  parseWorkOrderMetres,
  WorkOrderPlanSchema,
  workOrderPlanGaps,
  type WorkOrderPlan,
  type WorkOrderPlanVersion,
} from "@/lib/work-order-plan";
import { listFieldJobActions, type listFieldJobSchedule } from "@/services/field-job-cards-service";
import { useWorkOrderPeople } from "./useWorkOrderPeople";
import { MoreWorkOrderPeople } from "./MoreWorkOrderPeople";
import { WorkOrderEquipmentBooking } from "./WorkOrderEquipmentBooking";
import { WorkOrderVisitResults } from "./WorkOrderVisitResults";
import { WorkOrderVisitMap } from "./WorkOrderVisitMap";
import { WorkOrderSeries } from "./WorkOrderSeries";
import { WorkOrderFollowUps } from "./WorkOrderFollowUps";
import { WorkOrderPlanSummary } from "./WorkOrderPlanSummary";
import { fetchSitesByProject } from "@/lib/supabase/queries";
import { getWatercourseVersions } from "@/services/watercourse-service";
import type { ProjectScope } from "@/services/project-workspace-service";
import { WorkOrderAccessPanel } from "./WorkOrderAccessPanel";
import { WorkOrderAssignmentPanel } from "./WorkOrderAssignmentPanel";
import { WorkOrderStatusPanel } from "./WorkOrderStatusPanel";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";
const control =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-50";
const profiles = {
  general: "Generel opgave",
  watercourse: "Vandløb",
  nature: "Natur",
  construction: "Byggeri og natur",
  grazing: "Græsningspleje",
};
const nullable = (value: string) => (value.trim() ? value : null);
type Page = { items: WorkOrderPlanVersion[]; nextBeforeVersion: number | null };
type PlanPanelProps = {
  scope: ProjectScope;
  round?: string;
  selectedActionId?: string;
  openBooking?: boolean;
  openReschedule?: boolean;
  planSource?: WorkOrderPlanVersion;
  onFollowUp?: (source: WorkOrderPlanVersion) => void;
  suggestedStart?: string;
  onEditing?: (value: boolean) => void;
};
export function WorkOrderPlansPanel(props: PlanPanelProps) {
  const { scope } = props;
  const { user } = useAuth();
  return (
    <WorkOrderPlans
      key={`${scope.organizationId}:${scope.projectId}:${user?.id ?? "anonymous"}`}
      {...props}
      actorId={user?.id}
    />
  );
}
function WorkOrderPlans({
  scope,
  round,
  actorId,
  selectedActionId,
  openBooking,
  openReschedule,
  planSource,
  onFollowUp,
  suggestedStart,
  onEditing,
}: PlanPanelProps & {
  actorId?: string;
}) {
  const accessFn = useServerFn(getFieldJobAccess);
  const access = useQuery({
    queryKey: ["field-job-access", actorId, scope.projectId],
    queryFn: () => accessFn({ data: { projectId: scope.projectId } }),
    enabled: !!actorId,
    retry: false,
  });
  const sameAccess =
    !!actorId && access.data?.userId === actorId && access.data.projectId === scope.projectId;
  const enabled = sameAccess && !access.isError;
  const actions = useQuery({
    queryKey: ["field-job-actions", actorId, scope],
    queryFn: ({ signal }) => listFieldJobActions(scope, signal),
    enabled,
    retry: false,
  });
  const [localActionId, setAction] = useState(""),
    [editing, setEditing] = useState(false);
  const actionId = selectedActionId ?? localActionId;
  useWorkOrderEditorLock(editing, onEditing);
  useBlocker({ shouldBlockFn: () => editing, enableBeforeUnload: editing });
  return (
    <section
      aria-label="Arbejdsopgavens plan"
      className="min-w-0 space-y-4 rounded-2xl border bg-card p-3 sm:p-5 [overflow-wrap:anywhere]"
    >
      <h2 className="text-lg font-semibold">Arbejdsopgaver · plan og historik</h2>
      <p className="text-sm text-muted-foreground">
        Gem arbejdsgrundlaget på samme opgave som dine feltregistreringer. Planlagte datoer og
        metode er adskilt fra faktisk udførelse.
      </p>
      {editing && (
        <p role="status" className="text-sm">
          Gem planen eller fortryd ændringerne, før du skifter side eller opgave.
        </p>
      )}
      {!actorId && <p>Log ind for at åbne arbejdsopgaver.</p>}
      {(access.isFetching || actions.isFetching) && (
        <p role="status" className="text-sm">
          Henter arbejdsopgaver…
        </p>
      )}
      {(access.error || actions.error) && (
        <p role="alert">{(access.error || actions.error)?.message}</p>
      )}
      {sameAccess && actions.data && (
        <div hidden={!enabled || actions.isError}>
          {selectedActionId === undefined && (
            <label className="block text-sm">
              Eksisterende opgave
              <select
                className={control}
                value={actionId}
                disabled={editing}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="">Vælg opgave</option>
                {actions.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!actions.data.length && (
            <p className="text-sm">
              Opret en opgave på projektet, før du gemmer arbejdsgrundlaget.
            </p>
          )}
          {actionId && actorId && actions.data.some((a) => a.id === actionId) && (
            <PlanWorkspace
              key={actorId + actionId}
              scope={scope}
              actorId={actorId}
              actionId={actionId}
              title={actions.data.find((a) => a.id === actionId)?.title ?? "Arbejdsopgave"}
              canPlan={
                enabled &&
                !actions.isError &&
                access.data?.canConfigure === true &&
                !access.isFetching
              }
              openBooking={openBooking}
              openReschedule={openReschedule}
              planSource={planSource}
              onFollowUp={onFollowUp}
              suggestedStart={suggestedStart}
              canBook={access.data?.canManageAvailability === true}
              onEditing={setEditing}
            />
          )}
        </div>
      )}
      {selectedActionId === undefined && (
        <Link
          to="/app/projects/$slug"
          params={{ slug: scope.projectId }}
          search={{ step: "udfoerelse", round, task: actionId || undefined }}
          className="inline-block min-h-11 py-2 text-sm underline"
        >
          Åbn faktisk udførelse og feltregistrering
        </Link>
      )}
    </section>
  );
}
function PlanWorkspace({
  scope,
  actorId,
  actionId,
  title,
  canPlan,
  canBook,
  openBooking,
  openReschedule,
  planSource,
  onFollowUp,
  suggestedStart,
  onEditing,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  title: string;
  canPlan: boolean;
  canBook: boolean;
  openBooking?: boolean;
  openReschedule?: boolean;
  planSource?: WorkOrderPlanVersion;
  onFollowUp?: (source: WorkOrderPlanVersion) => void;
  suggestedStart?: string;
  onEditing: (value: boolean) => void;
}) {
  const load = useServerFn(getProjectWorkOrderPlanHistory),
    save = useServerFn(saveProjectWorkOrderPlan),
    cache = useQueryClient();
  const key = ["work-order-plan-history", actorId, scope, actionId];
  const history = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { ...scope, actionId, beforeVersion: null, pageSize: 20 } }),
    retry: false,
  });
  const members = useWorkOrderPeople(scope, actorId);
  const [bookingEditing, setBookingEditing] = useState(false);
  const [seriesSaving, setSeriesSaving] = useState(false);
  const [historicalVisits, setHistoricalVisits] = useState<string>();
  const [visitMapOpen, setVisitMapOpen] = useState(false);
  const sites = useQuery({
    queryKey: ["work-order-plan-sites", actorId, scope],
    queryFn: () => fetchSitesByProject(scope.projectId),
    retry: false,
  });
  const centerlines = useQuery({
    queryKey: ["work-order-plan-centerlines", actorId, scope],
    queryFn: () => getWatercourseVersions(scope.projectId, scope.organizationId),
    retry: false,
  });
  const [pages, setPages] = useState<Page[]>([]),
    [olderBusy, setOlderBusy] = useState(false),
    [draft, setDraft] = useState<WorkOrderPlan | null>(null),
    [base, setBase] = useState(0),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [accessEditing, setAccessEditing] = useState(false),
    [assignmentEditing, setAssignmentEditing] = useState(false),
    [lifecycleEditing, setLifecycleEditing] = useState(false),
    [busy, setBusy] = useState(false);
  const [datesOnly, setDatesOnly] = useState(false);
  const [hoursText, setHoursText] = useState("");
  const [meters, setMeters] = useState<Record<string, string>>({});
  const saving = useRef(false),
    attempt = useRef<{ signature: string; id: string } | null>(null);
  const latest = history.data?.items[0];
  const [openSourceId, setOpenSourceId] = useState<string>();
  const sourceId = latest?.source_plan_version_id;
  const sourceActionId = latest?.source_action_id;
  const sourceVersion = latest?.source_plan_version;
  const sourcePlan = useQuery({
    queryKey: ["work-order-plan-source", actorId, scope, sourceActionId, sourceId, sourceVersion],
    enabled:
      canPlan &&
      history.isSuccess &&
      !!sourceId &&
      !!sourceActionId &&
      !!sourceVersion &&
      openSourceId === sourceId,
    retry: false,
    queryFn: async () => {
      if (!sourceId || !sourceActionId || !sourceVersion) throw new Error("Kildeplanen mangler.");
      const page = await load({
        data: {
          ...scope,
          actionId: sourceActionId,
          beforeVersion: sourceVersion === 2147483647 ? null : sourceVersion + 1,
          pageSize: 1,
        },
      });
      const row = page.items[0];
      if (row?.id !== sourceId || row.version !== sourceVersion)
        throw new Error("Den konkrete kildeplan kunne ikke hentes.");
      return row;
    },
  });
  const next = pages.length ? pages.at(-1)!.nextBeforeVersion : history.data?.nextBeforeVersion;
  const versions = [
    ...new Map(
      [...(history.data?.items ?? []), ...pages.flatMap((p) => p.items)].map((v) => [v.id, v]),
    ).values(),
  ].sort((a, b) => b.version - a.version);
  const open = useCallback(
    (onlyDates = false) => {
      setDatesOnly(onlyDates);
      const plan = latest?.plan ?? {
        ...(planSource?.plan ?? emptyWorkOrderPlan(title)),
        title,
        responsibleId: null,
        plannedStart: suggestedStart ?? null,
        plannedEnd: null,
      };
      setDraft(plan);
      setHoursText(plan.estimatedHours?.toString().replace(".", ",") ?? "");
      setBase(latest?.version ?? 0);
      setReason("");
      setError("");
      setMessage("");
      attempt.current = null;
      setMeters(
        Object.fromEntries(
          ["stationFromM", "stationToM", "lengthM", "bottomWidthM"].map((k) => [
            k,
            String(plan.watercourse?.[k as "lengthM"] ?? ""),
          ]),
        ),
      );
      onEditing(true);
    },
    [latest, onEditing, planSource, suggestedStart, title],
  );
  const openedReschedule = useRef(false);
  useEffect(() => {
    if (
      !openReschedule ||
      openedReschedule.current ||
      !canPlan ||
      !latest ||
      history.isFetching ||
      history.isError
    )
      return;
    openedReschedule.current = true;
    open(true);
  }, [openReschedule, canPlan, latest, history.isFetching, history.isError, open]);
  async function submit() {
    if (!draft || !canPlan || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const hours = hoursText.trim();
      if (!datesOnly && hours && !/^\d+(?:[.,]\d{1,2})?$/.test(hours))
        throw new Error("Angiv estimeret tid i timer med højst to decimaler.");
      const estimatedHours = datesOnly
        ? draft.estimatedHours
        : hours
          ? Number(hours.replace(",", "."))
          : draft.estimatedHours === undefined
            ? undefined
            : null;
      const plan = WorkOrderPlanSchema.parse({
        ...draft,
        ...(estimatedHours === undefined ? {} : { estimatedHours }),
        watercourse:
          !datesOnly && draft.watercourse
            ? {
                ...draft.watercourse,
                ...Object.fromEntries(
                  Object.entries(meters).map(([k, v]) => [k, parseWorkOrderMetres(v)]),
                ),
              }
            : draft.watercourse,
      });
      const sourcePlanVersionId = base === 0 ? planSource?.id : undefined;
      const signature = JSON.stringify({ plan, base, reason: reason.trim(), sourcePlanVersionId });
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const saved = await save({
        data: {
          ...scope,
          actionId,
          expectedActorId: actorId,
          expectedVersion: base,
          requestId: attempt.current.id,
          plan,
          correctionReason: reason,
          ...(sourcePlanVersionId ? { sourcePlanVersionId } : {}),
        },
      });
      cache.setQueryData<Awaited<ReturnType<typeof listFieldJobSchedule>>>(
        ["field-job-schedule", actorId, scope],
        (current) =>
          current && {
            ...current,
            [actionId]: {
              start: saved.plan.plannedStart,
              end: saved.plan.plannedEnd,
              responsibleId: saved.plan.responsibleId,
              estimatedHours: saved.plan.estimatedHours ?? null,
            },
          },
      );
      void cache.invalidateQueries({ queryKey: ["project-work-time", actorId, scope] });
      setDraft(null);
      onEditing(false);
      setMessage(
        `Plan version ${saved.version} er gemt. Det er ikke en registrering af udført arbejde.`,
      );
      setPages([]);
      await Promise.all([
        cache.invalidateQueries({ queryKey: key }),
        ...(sourcePlanVersionId && planSource
          ? [
              cache.invalidateQueries({
                queryKey: ["work-order-follow-ups", actorId, scope, planSource.action_id],
              }),
            ]
          : []),
        cache.invalidateQueries({ queryKey: ["work-order-lifecycle", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-log", actorId] }),
        cache.invalidateQueries({
          queryKey: ["work-order-time-summary", actorId, scope, actionId],
        }),
      ]);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["field-job-actions", actorId, scope] }),
        cache.invalidateQueries({ queryKey: ["field-job-schedule", actorId, scope] }),
      ]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Planen kunne ikke gemmes. Dine ændringer er bevaret.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function more() {
    if (!next || olderBusy) return;
    setOlderBusy(true);
    setError("");
    try {
      const page = await load({ data: { ...scope, actionId, beforeVersion: next, pageSize: 20 } });
      setPages((old) => [...old, page]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Historikken kunne ikke hentes.");
    } finally {
      setOlderBusy(false);
    }
  }
  const set = <K extends keyof WorkOrderPlan>(key: K, value: WorkOrderPlan[K]) =>
    setDraft((old) => (old ? { ...old, [key]: value } : old));
  const gaps = draft ? workOrderPlanGaps(draft) : [];
  const dateFields = draft && (
    <>
      <label className="block text-sm">
        Planlagt fra
        <input
          className={control}
          type="date"
          value={draft.plannedStart ?? ""}
          onChange={(e) => set("plannedStart", e.target.value || null)}
        />
      </label>
      <label className="block text-sm">
        Planlagt til
        <input
          className={control}
          type="date"
          value={draft.plannedEnd ?? ""}
          onChange={(e) => set("plannedEnd", e.target.value || null)}
        />
      </label>
    </>
  );
  return (
    <div className="min-w-0 space-y-4">
      {history.isFetching && <p role="status">Henter planhistorik…</p>}
      {(history.error || error) && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {error || history.error?.message}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {(members.error || sites.error || centerlines.error) && (
        <p role="alert" className="text-sm">
          En person-, lokalitets- eller vandløbsliste kunne ikke hentes. Gemte referencer bevares;
          genindlæs for at vælge et andet grundlag.
        </p>
      )}
      {!draft && history.data && !history.error && (
        <>
          {latest ? (
            <>
              <WorkOrderPlanSummary row={latest} members={members.data ?? []} />
              {canPlan && (
                <WorkOrderFollowUps
                  actorId={actorId}
                  scope={scope}
                  actionId={actionId}
                  canShift={canBook}
                  shiftDisabled={
                    seriesSaving ||
                    accessEditing ||
                    assignmentEditing ||
                    lifecycleEditing ||
                    bookingEditing
                  }
                  onSeriesSaving={(saving) => {
                    setSeriesSaving(saving);
                    onEditing(saving);
                  }}
                />
              )}
              {canPlan && sourceId && sourceActionId && sourceVersion && (
                <div className="space-y-2">
                  <details
                    key={sourceId}
                    className="space-y-2 rounded-xl border p-3 text-sm"
                    onToggle={(event) =>
                      setOpenSourceId(event.currentTarget.open ? sourceId : undefined)
                    }
                  >
                    <summary className="min-h-11 cursor-pointer py-2 font-medium">
                      Kilde: planversion {sourceVersion}. Vis gemt kildeplan
                    </summary>
                    {openSourceId === sourceId && sourcePlan.isPending && (
                      <p role="status">Henter kildeplanen…</p>
                    )}
                    {openSourceId === sourceId && sourcePlan.isError && (
                      <div>
                        <p role="alert">Den konkrete kildeplan kunne ikke hentes.</p>
                        <button
                          type="button"
                          className={button}
                          onClick={() => void sourcePlan.refetch()}
                        >
                          Prøv igen
                        </button>
                      </div>
                    )}
                    {openSourceId === sourceId && sourcePlan.isSuccess && (
                      <WorkOrderPlanSummary row={sourcePlan.data} members={members.data ?? []} />
                    )}
                  </details>
                  <Link
                    to="/app/projects/$slug"
                    params={{ slug: scope.projectId }}
                    search={{ tab: "handlinger", task: sourceActionId, work: "plan" }}
                    className="inline-flex min-h-11 items-center text-primary underline underline-offset-2"
                  >
                    Åbn kildeopgaven
                  </Link>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm">Arbejdsgrundlaget er endnu ikke gemt som plan.</p>
          )}
          {latest && (latest.plan.siteId || !!latest.plan.visitStops?.length) && (
            <details
              className="rounded-xl border px-3 pb-2"
              onToggle={(event) => setVisitMapOpen(event.currentTarget.open)}
            >
              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                Vis besøg på kort
              </summary>
              {visitMapOpen &&
                (sites.isSuccess ? (
                  <WorkOrderVisitMap
                    key={latest.id}
                    plan={latest.plan}
                    sites={sites.data}
                    projectId={scope.projectId}
                  />
                ) : sites.isError ? (
                  <button type="button" className={button} onClick={() => void sites.refetch()}>
                    Hent lokaliteter igen
                  </button>
                ) : (
                  <p role="status">Henter lokaliteter…</p>
                ))}
            </details>
          )}
          {latest && (latest.plan.siteId || !!latest.plan.visitStops?.length) && (
            <WorkOrderVisitResults
              key={latest.id}
              scope={scope}
              actorId={actorId}
              actionId={actionId}
              planVersionId={latest.id}
              planVersion={latest.version}
              plan={latest.plan}
              primaryName={sites.data?.find((site) => site.id === latest.plan.siteId)?.name}
            />
          )}
          {canPlan &&
            latest?.plan.plannedStart &&
            !draft &&
            !accessEditing &&
            !assignmentEditing &&
            !lifecycleEditing &&
            !bookingEditing && (
              <WorkOrderSeries
                key={latest.id}
                source={latest}
                scope={scope}
                actorId={actorId}
                onSaving={(saving) => {
                  setSeriesSaving(saving);
                  onEditing(saving);
                }}
              />
            )}
          {canPlan && (
            <div className="flex flex-wrap gap-2">
              {latest && onFollowUp && (
                <button
                  type="button"
                  className={button}
                  disabled={history.isFetching || seriesSaving}
                  onClick={() => onFollowUp(latest)}
                >
                  Opret opfølgende opgave
                </button>
              )}
              {latest && (
                <button
                  type="button"
                  className={button}
                  disabled={
                    history.isFetching ||
                    accessEditing ||
                    assignmentEditing ||
                    lifecycleEditing ||
                    seriesSaving ||
                    bookingEditing
                  }
                  onClick={() => open(true)}
                >
                  Omplanlæg datoer
                </button>
              )}
              <button
                type="button"
                className={button}
                disabled={
                  history.isFetching ||
                  accessEditing ||
                  assignmentEditing ||
                  lifecycleEditing ||
                  seriesSaving ||
                  bookingEditing
                }
                onClick={() => open()}
              >
                {latest ? "Rediger plan som ny version" : "Opret arbejdsopgavens plan"}
              </button>
            </div>
          )}
          {!canPlan && (
            <p className="text-sm text-muted-foreground">
              Planen redigeres af projektets ansvarlige.
            </p>
          )}
        </>
      )}
      <MoreWorkOrderPeople query={members} />
      {latest && canBook && !seriesSaving && (
        <WorkOrderEquipmentBooking
          scope={scope}
          actorId={actorId}
          actionId={actionId}
          initialOpen={openBooking}
          plannedStart={latest.plan.plannedStart}
          plannedEnd={latest.plan.plannedEnd}
          disabled={
            !!draft || accessEditing || assignmentEditing || lifecycleEditing || history.isError
          }
          onEditing={(value) => {
            setBookingEditing(value);
            if (!draft && !accessEditing && !assignmentEditing && !lifecycleEditing)
              onEditing(value);
          }}
        />
      )}
      {latest &&
        !draft &&
        !seriesSaving &&
        !bookingEditing &&
        !assignmentEditing &&
        !lifecycleEditing && (
          <WorkOrderAccessPanel
            scope={{ ...scope, actionId }}
            actorId={actorId}
            members={members.data ?? []}
            onEditing={(value) => {
              setAccessEditing(value);
              onEditing(value);
            }}
          />
        )}
      {latest &&
        !draft &&
        !seriesSaving &&
        !bookingEditing &&
        !accessEditing &&
        !lifecycleEditing && (
          <WorkOrderAssignmentPanel
            scope={{ ...scope, actionId }}
            actorId={actorId}
            planId={latest.id}
            canManage={canPlan && !history.isError && !history.isFetching}
            people={members.data ?? []}
            onEditing={(value) => {
              setAssignmentEditing(value);
              onEditing(value);
            }}
          />
        )}
      {latest &&
        !draft &&
        !seriesSaving &&
        !bookingEditing &&
        !accessEditing &&
        !assignmentEditing && (
          <WorkOrderStatusPanel
            scope={{ ...scope, actionId }}
            actorId={actorId}
            manageNavigation={false}
            onEditing={(value) => {
              setLifecycleEditing(value);
              onEditing(value);
            }}
          />
        )}
      {draft && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset className="min-w-0 space-y-3" disabled={busy || !canPlan}>
            <legend className="font-medium">
              {datesOnly ? "Omplanlæg datoer" : base ? `Rediger plan version ${base}` : "Ny plan"}
            </legend>
            {datesOnly ? (
              <div className="grid gap-3 sm:grid-cols-2">{dateFields}</div>
            ) : (
              <>
                <label className="block text-sm">
                  Titel
                  <input
                    className={control}
                    maxLength={160}
                    required
                    value={draft.title}
                    onChange={(e) => set("title", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Beskrivelse
                  <textarea
                    className={control}
                    maxLength={4000}
                    value={draft.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    Metodeprofil
                    <select
                      className={control}
                      value={draft.profile ?? ""}
                      onChange={(e) => {
                        const profile = (e.target.value || null) as WorkOrderPlan["profile"];
                        if (profile !== "watercourse") setMeters({});
                        setDraft((old) =>
                          old
                            ? {
                                ...old,
                                profile,
                                watercourse:
                                  profile === "watercourse"
                                    ? (old.watercourse ?? emptyWorkOrderWatercourse())
                                    : null,
                                watercourseVersionId:
                                  profile === "watercourse" ? old.watercourseVersionId : null,
                              }
                            : old,
                        );
                      }}
                    >
                      <option value="">Uafklaret</option>
                      {Object.entries(profiles).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Prioritet
                    <select
                      className={control}
                      value={draft.priority ?? ""}
                      onChange={(e) =>
                        set("priority", (e.target.value || null) as WorkOrderPlan["priority"])
                      }
                    >
                      <option value="">Uafklaret</option>
                      <option value="high">Høj</option>
                      <option value="medium">Mellem</option>
                      <option value="low">Lav</option>
                    </select>
                  </label>
                  {dateFields}
                  <label className="block text-sm">
                    Estimeret arbejdstid (timer)
                    <input
                      className={control}
                      inputMode="decimal"
                      maxLength={8}
                      value={hoursText}
                      onChange={(event) => setHoursText(event.target.value)}
                      placeholder="Fx 2,5"
                    />
                    <span className="text-xs text-muted-foreground">Estimat for hele opgaven.</span>
                  </label>
                </div>
                <label className="block text-sm">
                  Ansvarlig
                  <select
                    className={control}
                    value={draft.responsibleId ?? ""}
                    onChange={(e) => set("responsibleId", e.target.value || null)}
                  >
                    <option value="">Uafklaret</option>
                    {draft.responsibleId &&
                      !members.data?.some((m) => m.user_id === draft.responsibleId) && (
                        <option value={draft.responsibleId}>Tidligere valgt ansvarlig</option>
                      )}
                    {members.data?.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name || m.email || "Projektmedlem"}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-muted-foreground">
                  Den ansvarlige er adskilt fra den person, som faktisk udfører arbejdet. Dette valg
                  ændrer ingen adgangsrettigheder.
                </p>
                <label className="block text-sm">
                  Planlagt metode
                  <input
                    className={control}
                    maxLength={2000}
                    value={draft.plannedMethod ?? ""}
                    onChange={(e) => set("plannedMethod", nullable(e.target.value))}
                  />
                </label>
                <label className="block text-sm">
                  Arbejdsinstruktion
                  <textarea
                    className={control}
                    maxLength={4000}
                    value={draft.instructions}
                    onChange={(e) => set("instructions", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Sted eller delstrækning
                  <input
                    className={control}
                    maxLength={2000}
                    value={draft.locationNote}
                    onChange={(e) => set("locationNote", e.target.value)}
                  />
                </label>
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm">
                    Vælg lokaliteter og besøg
                  </summary>
                  <label className="block text-sm">
                    Hovedlokalitet
                    <select
                      className={control}
                      value={draft.siteId ?? ""}
                      onChange={(e) => set("siteId", e.target.value || null)}
                    >
                      <option value="">Ingen fast binding</option>
                      {draft.siteId && !sites.data?.some((s) => s.id === draft.siteId) && (
                        <option value={draft.siteId}>Tidligere valgt lokalitet</option>
                      )}
                      {sites.data?.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          disabled={draft.visitStops?.some((stop) => stop.siteId === s.id)}
                        >
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="space-y-2 py-2">
                    <p className="font-medium">Ekstra besøg i rækkefølge</p>
                    <p className="text-sm text-muted-foreground">
                      Vælg projektsteder og flyt dem i den rækkefølge, udføreren skal besøge dem.
                    </p>
                    {!!draft.visitStops?.length && (
                      <ol className="list-decimal space-y-2 pl-6">
                        {draft.visitStops.map((stop, index, stops) => (
                          <li key={stop.siteId}>
                            <p>{stop.name}</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={button}
                                disabled={index === 0}
                                aria-label={"Flyt " + stop.name + " op"}
                                onClick={() => {
                                  const next = [...stops];
                                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                  set("visitStops", next);
                                }}
                              >
                                Flyt op
                              </button>
                              <button
                                type="button"
                                className={button}
                                disabled={index === stops.length - 1}
                                aria-label={"Flyt " + stop.name + " ned"}
                                onClick={() => {
                                  const next = [...stops];
                                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                  set("visitStops", next);
                                }}
                              >
                                Flyt ned
                              </button>
                              <button
                                type="button"
                                className={button}
                                aria-label={"Fjern " + stop.name}
                                onClick={() =>
                                  set(
                                    "visitStops",
                                    stops.filter((item) => item.siteId !== stop.siteId),
                                  )
                                }
                              >
                                Fjern
                              </button>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                    <label className="block text-sm">
                      Tilføj et ekstra besøg
                      <select
                        className={control}
                        value=""
                        disabled={!sites.isSuccess || (draft.visitStops?.length ?? 0) >= 20}
                        onChange={(event) => {
                          const site = sites.data?.find((item) => item.id === event.target.value);
                          if (site)
                            set("visitStops", [
                              ...(draft.visitStops ?? []),
                              { siteId: site.id, name: site.name.trim() },
                            ]);
                        }}
                      >
                        <option value="">Vælg projektsted</option>
                        {sites.data
                          ?.filter(
                            (site) =>
                              site.id !== draft.siteId &&
                              !draft.visitStops?.some((stop) => stop.siteId === site.id),
                          )
                          .map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {sites.isError && (
                      <button type="button" className={button} onClick={() => void sites.refetch()}>
                        Hent lokaliteter igen
                      </button>
                    )}
                    {draft.visitStops?.length === 20 && (
                      <p>Planen har plads til 20 ekstra besøg.</p>
                    )}
                  </div>
                  {draft.profile === "watercourse" && (
                    <label className="block text-sm">
                      Vandløbsgrundlag
                      <select
                        className={control}
                        value={draft.watercourseVersionId ?? ""}
                        onChange={(e) => set("watercourseVersionId", e.target.value || null)}
                      >
                        <option value="">Grundlag er uafklaret</option>
                        {draft.watercourseVersionId &&
                          !centerlines.data?.some((v) => v.id === draft.watercourseVersionId) && (
                            <option value={draft.watercourseVersionId}>
                              Tidligere valgt grundlag
                            </option>
                          )}
                        {centerlines.data?.map((v) => (
                          <option key={v.id} value={v.id}>
                            Version {v.version} · {v.source}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </details>
                {draft.watercourse && (
                  <details open>
                    <summary className="min-h-11 cursor-pointer py-2 font-medium">
                      Vandløbsoplysninger
                    </summary>
                    <div className="space-y-3">
                      {(
                        [
                          ["name", "Vandløbsnavn"],
                          ["externalId", "Vandløbs-ID"],
                          ["regulationReference", "Regulativreference"],
                          ["regulationVersion", "Regulativets dokumentversion"],
                          ["term", "Termin"],
                          ["measurementSource", "Kilde til stationer og mål"],
                        ] as const
                      ).map(([key, label]) => (
                        <label className="block text-sm" key={key}>
                          {label}
                          <input
                            className={control}
                            maxLength={
                              key === "term" || key === "measurementSource"
                                ? 2000
                                : key === "regulationReference"
                                  ? 1000
                                  : 200
                            }
                            value={draft.watercourse![key] ?? ""}
                            onChange={(e) =>
                              set("watercourse", {
                                ...draft.watercourse!,
                                [key]: nullable(e.target.value),
                              })
                            }
                          />
                        </label>
                      ))}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            ["stationFromM", "Station fra (m)"],
                            ["stationToM", "Station til (m)"],
                            ["lengthM", "Oplyst længde (m)"],
                            ["bottomWidthM", "Oplyst bundbredde (m)"],
                          ] as const
                        ).map(([key, label]) => (
                          <label className="block text-sm" key={key}>
                            {label}
                            <input
                              className={control}
                              inputMode="decimal"
                              value={meters[key] ?? ""}
                              onChange={(e) =>
                                setMeters((old) => ({ ...old, [key]: e.target.value }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <label className="block text-sm">
                        Stationeringsretning
                        <select
                          className={control}
                          value={draft.watercourse.stationDirection}
                          onChange={(e) =>
                            set("watercourse", {
                              ...draft.watercourse!,
                              stationDirection: e.target.value as
                                | "unknown"
                                | "upstream"
                                | "downstream",
                            })
                          }
                        >
                          <option value="unknown">Uafklaret</option>
                          <option value="upstream">Mod strømretningen</option>
                          <option value="downstream">Med strømretningen</option>
                        </select>
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Decimal-komma og punktum accepteres. Længden beregnes ikke automatisk ud fra
                        stationerne. Tomme felter er ukendte.
                      </p>
                    </div>
                  </details>
                )}
              </>
            )}
            {base > 0 && (
              <label className="block text-sm">
                Årsag til planændring
                <textarea
                  className={control}
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {!datesOnly && gaps.length > 0 && (
              <div className="text-sm">
                <p>Kan gemmes med synlige afklaringer:</p>
                <ul className="list-disc pl-5">
                  {gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={button + " bg-primary text-primary-foreground"}>
                {busy ? "Gemmer plan…" : "Gem planversion"}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => {
                  setDraft(null);
                  onEditing(false);
                  setError("");
                }}
              >
                Fortryd ændringer
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {versions.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm">
            Tidligere planversioner ({versions.length} indlæst)
          </summary>
          <ul className="space-y-3">
            {versions.map((row) => (
              <li key={row.id} className="rounded-xl border p-3">
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm">
                    Version {row.version} · {new Date(row.created_at).toLocaleString("da-DK")}
                  </summary>
                  <WorkOrderPlanSummary row={row} members={members.data ?? []} />
                  <p className="text-sm">{row.correction_reason || "Første registrering"}</p>
                  {(row.plan.siteId || !!row.plan.visitStops?.length) && (
                    <>
                      <button
                        type="button"
                        className={button}
                        aria-expanded={historicalVisits === row.id}
                        onClick={() =>
                          setHistoricalVisits(historicalVisits === row.id ? undefined : row.id)
                        }
                      >
                        {historicalVisits === row.id
                          ? "Skjul besøg fra denne plan"
                          : "Se besøg fra denne plan"}
                      </button>
                      {historicalVisits === row.id && (
                        <WorkOrderVisitResults
                          scope={scope}
                          actorId={actorId}
                          actionId={actionId}
                          planVersionId={row.id}
                          planVersion={row.version}
                          plan={row.plan}
                          historical
                          primaryName={
                            sites.data?.find((site) => site.id === row.plan.siteId)?.name
                          }
                        />
                      )}
                    </>
                  )}
                </details>
              </li>
            ))}
          </ul>
          {next && (
            <button className={button} disabled={olderBusy} onClick={() => void more()}>
              {olderBusy ? "Henter historik…" : "Hent ældre versioner"}
            </button>
          )}
        </details>
      )}
    </div>
  );
}
