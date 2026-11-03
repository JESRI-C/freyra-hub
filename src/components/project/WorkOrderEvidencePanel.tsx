import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBlocker } from "@tanstack/react-router";
import { getProjectWorkOrderAccess } from "@/lib/work-order-access.functions";
import {
  getProjectWorkOrderEvidenceOriginal,
  listProjectWorkOrderEvidence,
  listProjectWorkOrderEvidenceSources,
  listProjectWorkOrderEvidenceExecutions,
  saveProjectWorkOrderEvidence,
} from "@/lib/work-order-evidence.functions";
import { fieldJobGaps } from "@/lib/field-job-cards";
import type { EvidenceVersion } from "@/lib/work-order-evidence";
import type { ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";
import { WorkOrderExecutionReference } from "./WorkOrderExecutionReference";

const button = "min-h-11 rounded-xl border px-4 py-2 text-sm disabled:opacity-50";
const control = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background p-3 text-base";
type Draft = {
  evidenceId: string;
  expectedVersion: number;
  observationVersionId: string;
  uploadId: string;
  executionRevisionId: string | null;
  state: "attached" | "withdrawn";
  reason: string;
};
type Props = {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  canContribute: boolean;
  onEditing?: (value: boolean) => void;
  onOpenField?: () => void;
};

/** Mounted only after opening Documentation; the task workspace owns the actor/project key. */
export function WorkOrderEvidencePanel({
  scope,
  actorId,
  actionId,
  canContribute,
  onEditing,
  onOpenField,
}: Props) {
  const cache = useQueryClient();
  const accessFn = useServerFn(getProjectWorkOrderAccess);
  const listFn = useServerFn(listProjectWorkOrderEvidence);
  const sourcesFn = useServerFn(listProjectWorkOrderEvidenceSources);
  const executionsFn = useServerFn(listProjectWorkOrderEvidenceExecutions);
  const saveFn = useServerFn(saveProjectWorkOrderEvidence);
  const originalFn = useServerFn(getProjectWorkOrderEvidenceOriginal);
  const task = { ...scope, actionId };
  const key = ["work-order-evidence", actorId, scope.organizationId, scope.projectId, actionId];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false),
    [opening, setOpening] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const attempt = useRef<{ signature: string; id: string } | undefined>(undefined);
  const inFlight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const locked = !!draft || busy || opening;
  useWorkOrderEditorLock(locked, onEditing);
  useBlocker({ shouldBlockFn: () => locked, enableBeforeUnload: locked });
  const access = useQuery({
    queryKey: ["work-order-evidence-access", actorId, task],
    queryFn: () => accessFn({ data: task }),
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  const authorized =
    !access.isError &&
    access.data?.user_id === actorId &&
    access.data.action_id === actionId &&
    access.data.organization_id === scope.organizationId &&
    access.data.project_id === scope.projectId;
  const writable = authorized && canContribute && !!access.data?.can_execute;
  const history = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => listFn({ data: { ...task, afterId: pageParam, pageSize: 20 } }),
    getNextPageParam: (page) => page.nextAfterId ?? undefined,
    enabled: authorized,
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  function useSources(kind: "observation" | "photo") {
    return useInfiniteQuery({
      queryKey: [...key, "sources", kind],
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) =>
        sourcesFn({ data: { ...task, kind, afterId: pageParam, pageSize: 20 } }),
      getNextPageParam: (page) => page.nextAfterId ?? undefined,
      enabled: writable && !!draft && draft.state === "attached",
      retry: false,
      refetchOnWindowFocus: !locked,
      refetchOnReconnect: !locked,
    });
  }
  const observations = useSources("observation"),
    photos = useSources("photo");
  const executions = useInfiniteQuery({
    queryKey: ["work-order-evidence-executions", actorId, task],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      executionsFn({ data: { ...task, afterId: pageParam, pageSize: 20 } }),
    getNextPageParam: (page) => page.nextAfterId ?? undefined,
    enabled: writable && !!draft && draft.state === "attached",
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  const rows = history.data?.pages.flatMap((page) => page.items) ?? [];
  const latest = new Map<string, number>();
  rows.forEach((row) =>
    latest.set(row.evidence_id, Math.max(latest.get(row.evidence_id) ?? 0, row.version)),
  );
  function edit(row?: EvidenceVersion, withdraw = false) {
    if (!writable || locked) return;
    setDraft({
      evidenceId: row?.evidence_id ?? crypto.randomUUID(),
      expectedVersion: row?.version ?? 0,
      observationVersionId: row?.observation_version_id ?? "",
      uploadId: row?.upload_id ?? "",
      executionRevisionId: row?.execution_revision_id ?? null,
      state: withdraw ? "withdrawn" : "attached",
      reason: "",
    });
    attempt.current = undefined;
    setError("");
    setNotice("");
  }
  async function save() {
    if (!draft || !writable || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify({ ...draft, reason: draft.reason.trim() });
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      await saveFn({
        data: {
          ...task,
          ...draft,
          reason: draft.reason.trim(),
          expectedActorId: actorId,
          requestId: attempt.current.id,
        },
      });
      if (!alive.current) return;
      setDraft(null);
      attempt.current = undefined;
      setNotice("Dokumentationen er gemt som en ny version.");
      await cache.invalidateQueries({ queryKey: key });
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Koblingen kunne ikke gemmes. Kladden er bevaret.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function openOriginal(row: EvidenceVersion) {
    if (!authorized || inFlight.current) return;
    inFlight.current = true;
    setOpening(true);
    setError("");
    try {
      const result = await originalFn({ data: { ...task, id: row.id, expectedActorId: actorId } });
      if (!alive.current) return;
      // The URL is short-lived and never placed in query storage, persistent state or metadata.
      const link = document.createElement("a");
      link.href = result.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      link.click();
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : "Originalen kunne ikke åbnes.");
    } finally {
      inFlight.current = false;
      if (alive.current) setOpening(false);
    }
  }
  const failure = access.error || history.error;
  return (
    <section
      aria-label="Opgavens dokumentation"
      className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]"
    >
      <h3 className="text-lg font-semibold">Dokumentation</h3>
      <p className="text-sm text-muted-foreground">
        Kobl en gemt feltregistrering til et verificeret originalfoto. Rettelser gemmes i
        historikken. En tilknytning er ikke en faglig godkendelse.
      </p>
      {(access.isPending || (authorized && history.isPending)) && (
        <p role="status">Henter dokumentation…</p>
      )}
      {failure && (
        <div>
          <p role="alert">{failure.message} En åben kladde bevares.</p>
          <button
            type="button"
            className={button}
            disabled={busy || opening}
            onClick={() => void access.refetch().then(() => history.refetch())}
          >
            Kontrollér igen
          </button>
        </div>
      )}
      {authorized && !history.isError && (
        <div className="space-y-4">
          {history.isSuccess && !rows.length && (
            <p>Der er endnu ingen koblet dokumentation på opgaven.</p>
          )}
          {writable && !draft && (
            <button
              type="button"
              className={button}
              disabled={locked || history.isPending}
              onClick={() => edit()}
            >
              Tilknyt registrering og foto
            </button>
          )}
          {draft && (
            <form
              className="space-y-3 rounded-xl border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <h4 className="font-medium">
                {draft.state === "withdrawn"
                  ? "Træk koblingen tilbage"
                  : draft.expectedVersion
                    ? "Ret koblingen"
                    : "Ny kobling"}
              </h4>
              {draft.state === "attached" && (
                <>
                  <label className="block">
                    Gemt feltregistrering
                    <select
                      required
                      className={control}
                      value={draft.observationVersionId}
                      disabled={busy || !writable || observations.isError || observations.isPending}
                      onChange={(event) =>
                        setDraft({ ...draft, observationVersionId: event.target.value })
                      }
                    >
                      <option value="">Vælg en gemt registrering</option>
                      {draft.observationVersionId &&
                        !observations.data?.pages.some((p) =>
                          p.items.some((r) => r.id === draft.observationVersionId),
                        ) && (
                          <option value={draft.observationVersionId}>
                            Tidligere valgt registrering
                          </option>
                        )}
                      {observations.data?.pages
                        .flatMap((p) => p.items)
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.label} · version {row.version} · {row.id.slice(-8)}
                          </option>
                        ))}
                    </select>
                  </label>
                  {observations.isPending && <p role="status">Henter gemte registreringer…</p>}
                  {observations.isSuccess && !observations.data.pages[0].items.length && (
                    <p>Gem først et jobkort under Feltregistrering. Kladder kan ikke tilknyttes.</p>
                  )}
                  {observations.hasNextPage && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy || observations.isFetching}
                      onClick={() => void observations.fetchNextPage()}
                    >
                      Flere registreringer
                    </button>
                  )}
                  <label className="block">
                    Verificeret originalfoto
                    <select
                      required
                      className={control}
                      value={draft.uploadId}
                      disabled={busy || !writable || photos.isError || photos.isPending}
                      onChange={(event) => setDraft({ ...draft, uploadId: event.target.value })}
                    >
                      <option value="">Vælg et originalfoto</option>
                      {draft.uploadId &&
                        !photos.data?.pages.some((p) =>
                          p.items.some((r) => r.id === draft.uploadId),
                        ) && <option value={draft.uploadId}>Tidligere valgt originalfoto</option>}
                      {photos.data?.pages
                        .flatMap((p) => p.items)
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.label} · {row.id.slice(-8)}
                          </option>
                        ))}
                    </select>
                  </label>
                  {photos.isPending && <p role="status">Henter verificerede originaler…</p>}
                  {photos.isSuccess && !photos.data.pages[0].items.length && (
                    <p>
                      Der er ingen verificerede feltfotos at vælge. Modtagelse og filkontrol skal
                      være færdige først.
                    </p>
                  )}
                  {photos.hasNextPage && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy || photos.isFetching}
                      onClick={() => void photos.fetchNextPage()}
                    >
                      Flere originalfotos
                    </button>
                  )}
                  {(observations.error || photos.error) && (
                    <div>
                      <p role="alert">{(observations.error || photos.error)?.message}</p>
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() => void Promise.all([observations.refetch(), photos.refetch()])}
                      >
                        Hent valgmuligheder igen
                      </button>
                    </div>
                  )}
                  <label className="block">
                    Udført arbejde (valgfrit)
                    <select
                      className={control}
                      value={draft.executionRevisionId ?? ""}
                      disabled={busy || !writable || executions.isPending || executions.isError}
                      onChange={(event) =>
                        setDraft({ ...draft, executionRevisionId: event.target.value || null })
                      }
                    >
                      <option value="">Ikke knyttet til en udførelse</option>
                      {draft.executionRevisionId &&
                        !executions.data?.pages.some((p) =>
                          p.items.some((r) => r.workspace_entry_id === draft.executionRevisionId),
                        ) && (
                          <option value={draft.executionRevisionId}>
                            Tidligere valgt udførelsesversion
                          </option>
                        )}
                      {executions.data?.pages
                        .flatMap((p) => p.items)
                        .map((row) => (
                          <option key={row.workspace_entry_id} value={row.workspace_entry_id}>
                            Version {row.version} ·{" "}
                            {row.actual_start
                              ? row.actual_start.split("-").reverse().join(".")
                              : "Ukendt dato"}{" "}
                            · {row.actual_method ?? "Ukendt metode"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Vælg den gemte udførelse, som registreringen og fotoet dokumenterer. Valget
                    følger denne version, selv om arbejdet senere rettes.
                  </p>
                  {executions.isPending && <p role="status">Henter udførelsesversioner…</p>}
                  {executions.isSuccess && !executions.data.pages[0].items.length && (
                    <p>
                      Der er endnu ingen gemt faktisk udførelse på opgaven. Dokumentationen kan
                      gemmes uden denne kobling.
                    </p>
                  )}
                  {executions.isError && (
                    <div>
                      <p role="alert">{executions.error.message}</p>
                      <button
                        type="button"
                        className={button}
                        disabled={busy || executions.isFetching}
                        onClick={() => void executions.refetch()}
                      >
                        Hent udførelsesversioner igen
                      </button>
                    </div>
                  )}
                  {executions.hasNextPage && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy || executions.isFetching}
                      onClick={() => void executions.fetchNextPage()}
                    >
                      Flere udførelsesversioner
                    </button>
                  )}
                </>
              )}
              <label className="block">
                Begrundelse
                <textarea
                  required
                  maxLength={2000}
                  className={control}
                  value={draft.reason}
                  disabled={busy || !writable}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={
                    busy ||
                    !writable ||
                    !draft.reason.trim() ||
                    !draft.observationVersionId ||
                    !draft.uploadId ||
                    (draft.state === "attached" &&
                      (observations.isError ||
                        photos.isError ||
                        (!!draft.executionRevisionId && executions.isError)))
                  }
                >
                  {busy ? "Gemmer…" : "Gem dokumentation"}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    attempt.current = undefined;
                    setError("");
                  }}
                >
                  Fortryd
                </button>
              </div>
            </form>
          )}
          {rows.map((row) => (
            <article key={row.id} className="space-y-2 rounded-xl border p-3">
              <h4 className="font-medium">
                {row.observation_snapshot.template.title} · kobling version {row.version}
                {row.state === "withdrawn" ? " · trukket tilbage" : ""}
              </h4>
              <p className="text-sm">
                Registrering version {row.observation_snapshot.version} · gemt{" "}
                {new Date(row.created_at).toLocaleString("da-DK")}
              </p>
              {row.state === "attached" && latest.get(row.evidence_id) === row.version && (
                <EvidenceObservationGaps
                  observation={row.observation_snapshot}
                  onOpenField={writable ? onOpenField : undefined}
                  locked={locked}
                />
              )}
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {row.observation_snapshot.template.fields.map((field) => (
                  <div key={field.key}>
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd>{formatValue(row.observation_snapshot.values[field.key])}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm">
                Optagetid:{" "}
                {row.original_snapshot.capturedAt
                  ? new Date(row.original_snapshot.capturedAt).toLocaleString("da-DK")
                  : "Ukendt"}
              </p>
              <p className="text-sm">{row.reason}</p>
              {row.execution_revision_id ? (
                <WorkOrderExecutionReference
                  key={`${actorId}:${row.execution_revision_id}`}
                  scope={task}
                  actorId={actorId}
                  revisionId={row.execution_revision_id}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ikke knyttet til en bestemt udførelse.
                </p>
              )}
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm">
                  Filens kontroloplysninger
                </summary>
                <p className="text-xs">SHA-256: {row.original_snapshot.sha256}</p>
                <p className="text-xs">
                  {row.original_snapshot.sizeBytes} bytes · verificeret original ved tilknytning
                </p>
              </details>
              <div className="flex flex-wrap gap-2">
                {row.state === "attached" && (
                  <button
                    type="button"
                    className={button}
                    disabled={busy || opening}
                    onClick={() => void openOriginal(row)}
                  >
                    Åbn originalfoto
                  </button>
                )}
                {writable && latest.get(row.evidence_id) === row.version && (
                  <>
                    <button
                      type="button"
                      className={button}
                      disabled={locked}
                      onClick={() => edit(row)}
                    >
                      Ret kobling
                    </button>
                    {row.state === "attached" && (
                      <button
                        type="button"
                        className={button}
                        disabled={locked}
                        onClick={() => edit(row, true)}
                      >
                        Træk kobling tilbage
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
          {history.hasNextPage && (
            <button
              type="button"
              className={button}
              disabled={busy || history.isFetching}
              onClick={() => void history.fetchNextPage()}
            >
              Vis mere historik
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={busy || opening || history.isFetching}
            onClick={() => void history.refetch()}
          >
            Genindlæs historik
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
function EvidenceObservationGaps({
  observation,
  onOpenField,
  locked,
}: {
  onOpenField?: () => void;
  locked: boolean;
  observation: EvidenceVersion["observation_snapshot"];
}) {
  let gaps: string[];
  try {
    gaps = fieldJobGaps(observation.template, observation.values);
  } catch {
    gaps = ["Svarene skal passe til skabelonen."];
  }
  if (observation.status === "needs_review") gaps.unshift("Registreringen kræver gennemgang.");
  if (gaps.length === 0) return null;
  return (
    <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-medium">Afklar denne registrering før aflevering</p>
      <ul className="list-disc pl-5">
        {gaps.map((gap, index) => (
          <li key={index}>{gap}</li>
        ))}
      </ul>
      <p>Gem en rettelse under Feltregistrering, og vælg den nye version via Ret kobling.</p>
      {onOpenField && (
        <button type="button" className={button} disabled={locked} onClick={onOpenField}>
          Åbn Feltregistrering
        </button>
      )}
    </div>
  );
}

function formatValue(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "Ukendt"
    : typeof value === "boolean"
      ? value
        ? "Ja"
        : "Nej"
      : String(value);
}
