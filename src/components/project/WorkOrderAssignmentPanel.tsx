import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  configureProjectWorkOrderAssignment,
  getProjectWorkOrderAssignmentHistory,
  getProjectWorkOrderGroupHistory,
  listProjectWorkOrderGroups,
  saveProjectWorkOrderGroup,
} from "@/lib/work-order-assignments.functions";
import {
  ConfigureWorkOrderAssignmentSchema,
  SaveWorkOrderGroupSchema,
  assignmentModeLabels,
  type WorkOrderAssignmentMode,
  type WorkOrderGroup,
  type WorkOrderPerson,
} from "@/lib/work-order-assignments";
import type { WorkOrderScope } from "@/lib/work-order-access";

const control =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
const button = "min-h-11 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50";
type Props = {
  scope: WorkOrderScope;
  actorId: string;
  planId: string;
  canManage: boolean;
  people: WorkOrderPerson[];
  onEditing: (value: boolean) => void;
};
type Draft = {
  base: number;
  planId: string;
  mode: WorkOrderAssignmentMode;
  candidateUserIds: string[];
  groupVersionId: string | null;
  reason: string;
};
const personLabel = (people: WorkOrderPerson[], id: string) => {
  const p = people.find((p) => p.user_id === id);
  return p?.display_name || p?.email || "Person · " + id.slice(-8);
};
export function WorkOrderAssignmentPanel(props: Props) {
  return <AssignmentPanel key={props.actorId + props.scope.actionId} {...props} />;
}
function AssignmentPanel({ scope, actorId, planId, canManage, people, onEditing }: Props) {
  const historyFn = useServerFn(getProjectWorkOrderAssignmentHistory),
    groupsFn = useServerFn(listProjectWorkOrderGroups),
    configure = useServerFn(configureProjectWorkOrderAssignment),
    cache = useQueryClient();
  const inputScope = { ...scope, expectedActorId: actorId };
  const historyKey = ["work-order-assignment-history", actorId, scope];
  const history = useInfiniteQuery({
    queryKey: historyKey,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      historyFn({ data: { ...inputScope, beforeVersion: pageParam, pageSize: 20 } }),
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    retry: false,
  });
  const groupKey = ["work-order-groups", actorId, scope.organizationId, scope.projectId];
  const groups = useInfiniteQuery({
    queryKey: groupKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      groupsFn({
        data: {
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          expectedActorId: actorId,
          afterGroupId: pageParam,
          pageSize: 50,
        },
      }),
    getNextPageParam: (page) => page.nextAfterGroupId ?? undefined,
    enabled: canManage,
    retry: false,
  });
  const current = history.isError ? undefined : history.data?.pages[0].items[0];
  const groupRows = groups.isError ? [] : (groups.data?.pages.flatMap((p) => p.items) ?? []);
  const [draft, setDraft] = useState<Draft | null>(null),
    [groupEditing, setGroupEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const inFlight = useRef(false),
    attempt = useRef<{ signature: string; id: string } | null>(null);
  function open() {
    setDraft({
      base: current?.version ?? 0,
      planId,
      mode: current?.mode ?? "person",
      candidateUserIds: [...(current?.candidate_user_ids ?? [])],
      groupVersionId: current?.source_group_version_id ?? null,
      reason: "",
    });
    setError("");
    setMessage("");
    attempt.current = null;
    onEditing(true);
  }
  async function save() {
    if (!draft || !canManage || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = ConfigureWorkOrderAssignmentSchema.safeParse({
        ...inputScope,
        expectedVersion: draft.base,
        planVersionId: draft.planId,
        mode: draft.mode,
        candidateUserIds: draft.candidateUserIds,
        sourceGroupVersionId: draft.groupVersionId,
        reason: draft.reason,
        requestId: attempt.current?.id ?? crypto.randomUUID(),
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Kontrollér tildelingen.");
      const { requestId: _requestId, ...payload } = parsed.data,
        signature = JSON.stringify(payload);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      await configure({ data: { ...payload, requestId: attempt.current.id } });
      setDraft(null);
      onEditing(false);
      setMessage("Tildelingen er gemt som ny version.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: historyKey }),
        cache.invalidateQueries({ queryKey: ["my-work-orders"] }),
        cache.invalidateQueries({ queryKey: ["work-order-capabilities", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-lifecycle", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-log", actorId] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tildelingen kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Arbejdsfordeling" className="min-w-0 space-y-3 rounded-xl border p-3">
      <h3 className="font-semibold">Arbejdsfordeling</h3>
      <p className="text-sm text-muted-foreground">
        Vælg en person, en arbejdsgruppe eller en pulje, hvor én udfører overtager opgaven.
        Tildelingen gemmer det valgte hold og arbejdsgrundlag.
      </p>
      {history.isPending && <p role="status">Henter tildeling…</p>}
      {history.isError && (
        <p role="alert">
          {history.error.message}
          <button className={button} onClick={() => void history.refetch()}>
            Hent tildelingen igen
          </button>
        </p>
      )}
      {!draft && history.isSuccess && (
        <>
          <p className="text-sm">
            {current
              ? `${assignmentModeLabels[current.mode]} · version ${current.version} · ${current.candidate_user_ids.length} udførere`
              : "Ingen opgavefordeling gemt."}
          </p>
          {current?.claimed_by && (
            <p className="text-sm">Overtaget af {personLabel(people, current.claimed_by)}.</p>
          )}
          {canManage && (
            <button className={button} disabled={history.isFetching || groupEditing} onClick={open}>
              Rediger arbejdsfordeling
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || !canManage} className="min-w-0 space-y-3">
            <legend>Rediger tildeling version {draft.base}</legend>
            <label className="block text-sm">
              Tildelingstype
              <select
                className={control}
                value={draft.mode}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mode: e.target.value as WorkOrderAssignmentMode,
                    candidateUserIds: [],
                    groupVersionId: null,
                  })
                }
              >
                {Object.entries(assignmentModeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(draft.mode === "group" || draft.mode === "pool") && (
              <label className="block text-sm">
                Arbejdsgruppe
                <select
                  className={control}
                  value={draft.groupVersionId ?? ""}
                  onChange={(e) => {
                    const group = groupRows.find((g) => g.id === e.target.value);
                    setDraft({
                      ...draft,
                      groupVersionId: group?.id ?? null,
                      candidateUserIds: group ? [...group.member_ids] : [],
                    });
                  }}
                >
                  <option value="">
                    {draft.mode === "pool" ? "Vælg personer enkeltvis" : "Vælg gruppe"}
                  </option>
                  {draft.groupVersionId &&
                    !groupRows.some((g) => g.id === draft.groupVersionId && g.active) && (
                      <option value={draft.groupVersionId}>Tidligere valgt gruppeversion</option>
                    )}
                  {groupRows
                    .filter((g) => g.active)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} · version {g.version}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {draft.mode === "person" && (
              <label className="block text-sm">
                Udfører
                <select
                  className={control}
                  value={draft.candidateUserIds[0] ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, candidateUserIds: e.target.value ? [e.target.value] : [] })
                  }
                >
                  <option value="">Vælg person</option>
                  {draft.candidateUserIds[0] &&
                    !people.some(
                      (p) => p.user_id === draft.candidateUserIds[0] && p.can_execute,
                    ) && <option value={draft.candidateUserIds[0]}>Tidligere valgt udfører</option>}
                  {people
                    .filter((p) => p.can_execute)
                    .map((p) => (
                      <option key={p.user_id} value={p.user_id}>
                        {personLabel(people, p.user_id)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {draft.mode === "pool" && !draft.groupVersionId && (
              <PeopleChecks
                people={people}
                selected={draft.candidateUserIds}
                onChange={(ids) => setDraft({ ...draft, candidateUserIds: ids })}
              />
            )}
            {draft.groupVersionId && (
              <p className="text-sm">
                Valgt hold: {draft.candidateUserIds.map((id) => personLabel(people, id)).join(", ")}
                . En ændret gruppe kræver et nyt valg.
              </p>
            )}
            {draft.mode === "unassigned" && (
              <p className="text-sm">
                Fjerner denne arbejdsfordeling. Særskilt personadgang og projektroller gælder
                fortsat.
              </p>
            )}
            <label className="block text-sm">
              Begrundelse
              <textarea
                className={control}
                value={draft.reason}
                maxLength={2000}
                required
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={button + " bg-primary text-primary-foreground"} type="submit">
                {busy ? "Gemmer…" : "Gem arbejdsfordeling"}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => {
                  setDraft(null);
                  setError("");
                  onEditing(false);
                }}
              >
                Fortryd
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {canManage && !draft && (
        <GroupManager
          scope={scope}
          actorId={actorId}
          people={people}
          groups={groupRows}
          unavailable={groups.isError || groups.isPending}
          onEditing={(value) => {
            setGroupEditing(value);
            onEditing(value);
          }}
          onSaved={async () => {
            await Promise.all([
              cache.invalidateQueries({ queryKey: groupKey }),
              cache.invalidateQueries({ queryKey: ["work-order-group-history", actorId] }),
              cache.invalidateQueries({ queryKey: ["my-work-orders"] }),
              cache.invalidateQueries({ queryKey: ["work-order-capabilities", actorId] }),
              cache.invalidateQueries({ queryKey: ["work-order-lifecycle", actorId] }),
              cache.invalidateQueries({ queryKey: ["work-order-log", actorId] }),
            ]);
          }}
        />
      )}
      {canManage && groups.isError && (
        <p role="alert">
          {groups.error.message}
          <button className={button} onClick={() => void groups.refetch()}>
            Hent grupper igen
          </button>
        </p>
      )}
      {canManage && groups.hasNextPage && (
        <button
          className={button}
          disabled={busy || !!draft || groupEditing || groups.isFetching}
          onClick={() => void groups.fetchNextPage()}
        >
          Hent flere grupper
        </button>
      )}
      {!draft && !groupEditing && history.isSuccess && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2">Tildelingshistorik</summary>
          <ol className="space-y-3">
            {history.data.pages
              .flatMap((p) => p.items)
              .map((row) => (
                <li key={row.id} className="rounded-xl border p-3 text-sm">
                  <p>
                    Version {row.version} · {assignmentModeLabels[row.mode]} ·{" "}
                    {new Date(row.created_at).toLocaleString("da-DK")}
                  </p>
                  <p>{row.reason}</p>
                  <p>
                    {row.candidate_user_ids.map((id) => personLabel(people, id)).join(", ") ||
                      "Ingen udførere"}
                  </p>
                  {row.claimed_by && <p>Overtaget af {personLabel(people, row.claimed_by)}</p>}
                </li>
              ))}
          </ol>
          {history.hasNextPage && (
            <button
              className={button}
              disabled={history.isFetching}
              onClick={() => void history.fetchNextPage()}
            >
              Hent ældre tildelinger
            </button>
          )}
        </details>
      )}
    </section>
  );
}
function PeopleChecks({
  people,
  selected,
  onChange,
}: {
  people: WorkOrderPerson[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const ids = [
    ...new Set([...people.filter((p) => p.can_execute).map((p) => p.user_id), ...selected]),
  ];
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Udførere</legend>
      {!ids.length && <p className="text-sm">Ingen udførere i den hentede personliste.</p>}
      {ids.map((id) => (
        <label key={id} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(id)}
            onChange={(e) =>
              onChange(
                e.target.checked ? [...selected, id] : selected.filter((value) => value !== id),
              )
            }
          />
          {personLabel(people, id)}
        </label>
      ))}
    </fieldset>
  );
}
type GroupDraft = {
  groupId: string;
  base: number;
  name: string;
  active: boolean;
  memberIds: string[];
  reason: string;
  originalMemberIds: string[];
};
function GroupManager({
  scope,
  actorId,
  people,
  groups,
  unavailable,
  onEditing,
  onSaved,
}: {
  scope: WorkOrderScope;
  actorId: string;
  people: WorkOrderPerson[];
  groups: WorkOrderGroup[];
  unavailable: boolean;
  onEditing: (value: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const saveFn = useServerFn(saveProjectWorkOrderGroup);
  const [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<GroupDraft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const inFlight = useRef(false),
    attempt = useRef<{ signature: string; id: string } | null>(null);
  function open(group?: WorkOrderGroup) {
    setDraft({
      groupId: group?.group_id ?? crypto.randomUUID(),
      base: group?.version ?? 0,
      name: group?.name ?? "",
      active: group?.active ?? true,
      memberIds: [...(group?.member_ids ?? [])],
      originalMemberIds: [...(group?.member_ids ?? [])],
      reason: "",
    });
    attempt.current = null;
    setError("");
    setMessage("");
    onEditing(true);
  }
  async function save() {
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const parsed = SaveWorkOrderGroupSchema.safeParse({
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        expectedActorId: actorId,
        groupId: draft.groupId,
        expectedVersion: draft.base,
        name: draft.name,
        active: draft.active,
        memberIds: draft.active ? draft.memberIds : draft.originalMemberIds,
        correctionReason: draft.reason,
        requestId: attempt.current?.id ?? crypto.randomUUID(),
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Kontrollér gruppen.");
      const { requestId: _requestId, ...payload } = parsed.data,
        signature = JSON.stringify(payload);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const saved = await saveFn({ data: { ...payload, requestId: attempt.current.id } });
      setSelected(saved.group_id);
      setDraft(null);
      onEditing(false);
      setMessage("Gruppen er gemt som ny version.");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gruppen kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <details open={draft ? true : undefined} className="space-y-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        Arbejdsgrupper på projektet
      </summary>
      {!draft && (
        <>
          <label className="block text-sm">
            Gruppe
            <select
              className={control}
              value={selected}
              disabled={unavailable}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Vælg gruppe</option>
              {groups.map((g) => (
                <option key={g.group_id} value={g.group_id}>
                  {g.name}
                  {g.active ? "" : " · Arkiveret"}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 py-2">
            <button className={button} disabled={unavailable} onClick={() => open()}>
              Opret arbejdsgruppe
            </button>
            {selected && (
              <button
                className={button}
                disabled={unavailable || !groups.some((g) => g.group_id === selected)}
                onClick={() => open(groups.find((g) => g.group_id === selected))}
              >
                Rediger gruppe
              </button>
            )}
          </div>
          {selected && (
            <GroupHistory scope={scope} actorId={actorId} groupId={selected} people={people} />
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <legend>{draft.base ? `Gruppe version ${draft.base}` : "Ny arbejdsgruppe"}</legend>
            <label className="block text-sm">
              Gruppenavn
              <input
                className={control}
                value={draft.name}
                maxLength={160}
                required
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Aktiv gruppe
            </label>
            {draft.active ? (
              <PeopleChecks
                people={people}
                selected={draft.memberIds}
                onChange={(memberIds) => setDraft({ ...draft, memberIds })}
              />
            ) : (
              <p className="text-sm">
                Arkivering bevarer den tidligere medlemsliste og historik. Gruppens tildelinger
                giver ikke længere udføreradgang.
              </p>
            )}
            <label className="block text-sm">
              Årsag til gruppeændring
              <textarea
                className={control}
                value={draft.reason}
                maxLength={2000}
                required={draft.base > 0}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={button}>
                {busy ? "Gemmer…" : "Gem arbejdsgruppe"}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => {
                  setDraft(null);
                  setError("");
                  onEditing(false);
                }}
              >
                Fortryd
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </details>
  );
}
function GroupHistory({
  scope,
  actorId,
  groupId,
  people,
}: {
  scope: WorkOrderScope;
  actorId: string;
  groupId: string;
  people: WorkOrderPerson[];
}) {
  const load = useServerFn(getProjectWorkOrderGroupHistory);
  const history = useInfiniteQuery({
    queryKey: ["work-order-group-history", actorId, scope, groupId],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      load({
        data: {
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          expectedActorId: actorId,
          groupId,
          beforeVersion: pageParam,
          pageSize: 20,
        },
      }),
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    retry: false,
  });
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-2">Gruppens historik</summary>
      {history.isError ? (
        <p role="alert">{history.error.message}</p>
      ) : (
        <ol className="space-y-2">
          {history.data?.pages
            .flatMap((p) => p.items)
            .map((g) => (
              <li className="rounded-xl border p-3 text-sm" key={g.id}>
                <p>
                  {g.name} · version {g.version} · {g.active ? "Aktiv" : "Arkiveret"}
                </p>
                <p>
                  {g.member_ids.map((id) => personLabel(people, id)).join(", ") ||
                    "Ingen medlemmer"}
                </p>
                <p>{g.correction_reason || "Gruppen blev oprettet."}</p>
              </li>
            ))}
        </ol>
      )}
      {history.hasNextPage && (
        <button
          className={button}
          disabled={history.isFetching}
          onClick={() => void history.fetchNextPage()}
        >
          Hent ældre gruppeversioner
        </button>
      )}
    </details>
  );
}
