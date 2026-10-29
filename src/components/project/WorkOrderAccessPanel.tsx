import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getProjectWorkOrderAccess,
  getProjectWorkOrderAccessHistory,
  getProjectWorkOrderAccessSubjects,
  saveProjectWorkOrderAccess,
} from "@/lib/work-order-access.functions";
import type { WorkOrderScope, WorkOrderAccessVersion } from "@/lib/work-order-access";
import type { WorkOrderPerson } from "@/lib/work-order-assignments";
const control =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm disabled:opacity-50";
type Props = {
  scope: WorkOrderScope;
  actorId: string;
  members: WorkOrderPerson[];
  onEditing: (value: boolean) => void;
};
export function WorkOrderAccessPanel(props: Props) {
  return (
    <AccessPanel
      key={`${props.actorId}:${props.scope.organizationId}:${props.scope.projectId}:${props.scope.actionId}`}
      {...props}
    />
  );
}
function AccessPanel({ scope, actorId, members, onEditing }: Props) {
  const getAccess = useServerFn(getProjectWorkOrderAccess),
    subjectsFn = useServerFn(getProjectWorkOrderAccessSubjects);
  const access = useQuery({
    queryKey: ["work-order-capabilities", actorId, scope],
    queryFn: () => getAccess({ data: scope }),
    retry: false,
  });
  const showManager = access.data?.user_id === actorId && access.data.can_manage_access === true;
  const canManage = showManager && !access.isError;
  const subjects = useQuery({
    queryKey: ["work-order-access-subjects", actorId, scope],
    queryFn: () => subjectsFn({ data: { ...scope, afterUserId: null, pageSize: 50 } }),
    enabled: canManage,
    retry: false,
  });
  const [extra, setExtra] = useState<string[]>([]),
    [next, setNext] = useState<string | null | undefined>(),
    [moreBusy, setMoreBusy] = useState(false),
    [error, setError] = useState("");
  const [userId, setUser] = useState(""),
    [editing, setEditing] = useState(false);
  const cursor = next === undefined ? subjects.data?.nextAfterUserId : next;
  async function more() {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    setError("");
    try {
      const page = await subjectsFn({ data: { ...scope, afterUserId: cursor, pageSize: 50 } });
      setExtra((old) => [...new Set([...old, ...page.items])]);
      setNext(page.nextAfterUserId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adgangslisten kunne ikke hentes.");
    } finally {
      setMoreBusy(false);
    }
  }
  const ids = [
    ...new Set([...members.map((m) => m.user_id), ...(subjects.data?.items ?? []), ...extra]),
  ];
  return (
    <section
      aria-label="Tildeling og kontroladgang"
      className="min-w-0 space-y-3 rounded-xl border p-3"
    >
      <h3 className="font-semibold">Tildeling og kontroladgang</h3>
      <p className="text-sm text-muted-foreground">
        Udførelse og faglig kontrol tildeles hver for sig. Projektroller og gruppetildeling kan også
        give adgang. En puljeopgave skal overtages, før udførelsen kan gemmes.
      </p>
      {access.isFetching && <p role="status">Kontrollerer din adgang…</p>}
      {(access.error || subjects.error || error) && (
        <p role="alert">{error || access.error?.message || subjects.error?.message}</p>
      )}
      {access.data && (
        <p className="text-sm">
          Din opgaveadgang: {access.data.can_execute ? "udførelse tilladt" : "ingen udføreradgang"};{" "}
          {access.data.can_review ? "kontrol tildelt" : "kontrol ikke tildelt"}. Kontroladgang er
          ikke en godkendelse af dokumentationen.
        </p>
      )}
      {showManager && (
        <>
          <label className="block text-sm">
            Person
            <select
              className={control}
              value={userId}
              disabled={editing}
              onChange={(e) => setUser(e.target.value)}
            >
              <option value="">Vælg person</option>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {memberLabel(members, id)}
                </option>
              ))}
            </select>
          </label>
          {cursor && (
            <button className={button} disabled={editing || moreBusy} onClick={() => void more()}>
              {moreBusy ? "Henter…" : "Hent flere tidligere modtagere"}
            </button>
          )}
          {userId && (
            <PersonAccess
              key={userId}
              scope={scope}
              actorId={actorId}
              userId={userId}
              members={members}
              canManage={canManage && !access.isFetching}
              onEditing={(value) => {
                setEditing(value);
                onEditing(value);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
function memberLabel(members: WorkOrderPerson[], id: string) {
  const person = members.find((m) => m.user_id === id);
  return (
    person?.display_name ||
    person?.email ||
    (person ? "Projektmedlem · " : "Tidligere projektmedlem · ") + id.slice(-8)
  );
}
function PersonAccess({
  scope,
  actorId,
  userId,
  members,
  canManage,
  onEditing,
}: Props & { userId: string; canManage: boolean }) {
  const getHistory = useServerFn(getProjectWorkOrderAccessHistory),
    save = useServerFn(saveProjectWorkOrderAccess),
    cache = useQueryClient();
  const key = ["work-order-access-history", actorId, scope, userId];
  const history = useQuery({
    queryKey: key,
    queryFn: () => getHistory({ data: { ...scope, userId, beforeVersion: null, pageSize: 20 } }),
    retry: false,
  });
  const [older, setOlder] = useState<WorkOrderAccessVersion[]>([]),
    [next, setNext] = useState<number | null | undefined>();
  const [draft, setDraft] = useState<{
    base: number;
    active: boolean;
    canExecute: boolean;
    canReview: boolean;
    reason: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [olderBusy, setOlderBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const inFlight = useRef(false),
    attempt = useRef<{ signature: string; id: string } | null>(null);
  const latest = history.data?.items[0];
  const person = members.find((m) => m.user_id === userId);
  const mayExecute = !!person && person.can_execute;
  const cursor = next === undefined ? history.data?.nextBeforeVersion : next;
  function open() {
    setDraft({
      base: latest?.version ?? 0,
      active: latest?.active ?? true,
      canExecute: latest?.can_execute ?? false,
      canReview: latest?.can_review ?? false,
      reason: "",
    });
    setError("");
    setMessage("");
    attempt.current = null;
    onEditing(true);
  }
  async function submit() {
    if (!draft || !canManage || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const signature = JSON.stringify({ ...draft, reason: draft.reason.trim() });
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const row = await save({
        data: {
          ...scope,
          expectedActorId: actorId,
          userId,
          expectedVersion: draft.base,
          active: draft.active,
          canExecute: draft.active && draft.canExecute,
          canReview: draft.active && draft.canReview,
          reason: draft.reason,
          requestId: attempt.current.id,
        },
      });
      setDraft(null);
      onEditing(false);
      setMessage(`Adgang version ${row.version} er gemt.`);
      setOlder([]);
      setNext(undefined);
      await Promise.all([
        cache.invalidateQueries({ queryKey: key }),
        cache.invalidateQueries({ queryKey: ["work-order-capabilities", actorId, scope] }),
        cache.invalidateQueries({ queryKey: ["work-order-access-subjects", actorId, scope] }),
      ]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Adgangen kunne ikke gemmes. Dine ændringer er bevaret.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor || olderBusy) return;
    setOlderBusy(true);
    try {
      const page = await getHistory({
        data: { ...scope, userId, beforeVersion: cursor, pageSize: 20 },
      });
      setOlder((old) => [...old, ...page.items]);
      setNext(page.nextBeforeVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Historikken kunne ikke hentes.");
    } finally {
      setOlderBusy(false);
    }
  }
  const rows = [
    ...new Map([...(history.data?.items ?? []), ...older].map((row) => [row.id, row])).values(),
  ].sort((a, b) => b.version - a.version);
  return (
    <div className="space-y-3">
      {history.isFetching && <p role="status">Henter tildelingshistorik…</p>}
      {(history.error || error) && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {error || history.error?.message}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!draft && history.data && !history.error && (
        <>
          <p className="text-sm">
            {latest
              ? `Version ${latest.version}: ${latest.active ? "aktiv adgang" : "tilbagekaldt adgang"}; ${latest.can_execute ? "udførelse" : "ingen udførelse"}; ${latest.can_review ? "faglig kontrol" : "ingen kontrol"}.`
              : "Ingen eksplicit opgavetildeling er gemt for personen."}
          </p>
          <button className={button} disabled={!canManage || history.isFetching} onClick={open}>
            {latest ? "Rediger adgang som ny version" : "Tildel adgang"}
          </button>
        </>
      )}
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 text-sm font-medium">
              Adgang til {memberLabel(members, userId)}
            </legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Aktiv adgang til opgavens arbejdsgrundlag
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.active && draft.canExecute}
                disabled={!draft.active || !mayExecute}
                onChange={(e) => setDraft({ ...draft, canExecute: e.target.checked })}
              />
              Må udføre og registrere på opgaven
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.active && draft.canReview}
                disabled={!draft.active || !person}
                onChange={(e) => setDraft({ ...draft, canReview: e.target.checked })}
              />
              Tildel faglig kontrol
            </label>
            {!person && (
              <p className="text-sm">
                Personen findes ikke længere på projektets medlemsliste. Eksisterende adgang kan
                tilbagekaldes; ny adgang kræver et aktuelt medlemskab.
              </p>
            )}
            <label className="block text-sm">
              Begrundelse
              <textarea
                className={control}
                required
                maxLength={2000}
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Tilbagekaldelse gemmes som ny historik. Projektets øvrige roller kan fortsat give
              adgang. Faglig kontrol skal senere udføres på en konkret aflevering.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={button} disabled={!canManage}>
                {busy ? "Gemmer adgang…" : "Gem tildeling"}
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
                Fortryd tildeling
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {rows.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm">
            Tildelingshistorik ({rows.length} indlæst)
          </summary>
          <ol className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border p-3 text-sm">
                <p>
                  Version {row.version} · {new Date(row.created_at).toLocaleString("da-DK")}
                </p>
                <p>
                  {row.active ? "Aktiv adgang" : "Tilbagekaldt"};{" "}
                  {row.can_execute ? "udførelse" : "ingen udførelse"};{" "}
                  {row.can_review ? "kontrol" : "ingen kontrol"}.
                </p>
                <p>{row.reason}</p>
                <p>Registreret af {memberLabel(members, row.created_by)}</p>
              </li>
            ))}
          </ol>
          {cursor && (
            <button className={button} disabled={olderBusy} onClick={() => void more()}>
              {olderBusy ? "Henter…" : "Hent ældre tildelinger"}
            </button>
          )}
        </details>
      )}
    </div>
  );
}
