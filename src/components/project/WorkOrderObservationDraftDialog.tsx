import { useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  CreateWorkOrderObservationDraftInputSchema,
  type CreateWorkOrderObservationDraftInput,
  type ObservationDraftSource,
  type WorkOrderObservationOrigin,
} from "@/lib/work-order-observation-drafts";
import {
  createWorkOrderObservationDraft,
  getWorkOrderObservationDraft,
  listWorkOrderObservationSources,
} from "@/lib/work-order-observation-drafts.functions";
import {
  ObservationSourceBoundary,
  WorkOrderObservationSourceDetails,
} from "./WorkOrderObservationSourceDetails";
import { observationSourceName, observationTime } from "./work-order-observation-presentation";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-50";
const control = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background p-3 text-base";
type Props = {
  organizationId: string;
  projects: Array<{ id: string; name: string }>;
  initialProjectId?: string | null;
  onCreated?: (origin: WorkOrderObservationOrigin) => void;
};
function pendingKey(actorId: string, organizationId: string) {
  return `freyra-observation-draft-attempt/v1:${actorId}:${organizationId}`;
}
function readPending(actorId: string, organizationId: string) {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(pendingKey(actorId, organizationId));
  } catch {
    return {
      input: null,
      warning:
        "Browserens genforsøgslager kunne ikke læses. Hold dette vindue åbent, hvis oprettelsen ikke kan bekræftes.",
      blocked: false,
    };
  }
  if (!raw) return { input: null, warning: "", blocked: false };
  try {
    const parsed = CreateWorkOrderObservationDraftInputSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      parsed.data.expectedActorId !== actorId ||
      parsed.data.organizationId !== organizationId
    )
      return {
        input: null,
        warning:
          "Et gemt genforsøg kunne ikke kontrolleres. Den tidligere oprettelse skal afklares, før en ny kladde oprettes.",
        blocked: true,
      };
    return {
      input: parsed.data,
      warning:
        "Et tidligere genforsøg er genfundet. Felterne er låst, indtil oprettelsen er afklaret.",
      blocked: false,
    };
  } catch {
    return {
      input: null,
      warning:
        "Et gemt genforsøg kunne ikke læses. Den tidligere oprettelse skal afklares, før en ny kladde oprettes.",
      blocked: true,
    };
  }
}
function failureKind(error: unknown) {
  if (typeof error !== "object" || error === null) return "uncertain";
  const code = "code" in error ? error.code : undefined;
  const status = "statusCode" in error ? error.statusCode : undefined;
  const message = "message" in error ? error.message : undefined;
  if (
    code === "conflict" ||
    status === 409 ||
    message === "Opgaven er ændret. Genindlæs før du gemmer."
  )
    return "conflict";
  if (code === "access" || status === 403 || message === "Arbejdsopgaven er ikke tilgængelig.")
    return "access";
  if (
    code === "validation" ||
    status === 422 ||
    message === "Kontrollér opgavens felter, modtager og begrundelse."
  )
    return "validation";
  return "uncertain";
}

function matchesAttempt(
  origin: WorkOrderObservationOrigin,
  input: CreateWorkOrderObservationDraftInput,
) {
  if (
    origin.action_id !== input.actionId ||
    origin.request_id !== input.requestId ||
    origin.created_by !== input.expectedActorId ||
    origin.user_id !== input.expectedActorId ||
    origin.organization_id !== input.organizationId ||
    origin.project_id !== input.projectId ||
    origin.title !== input.title ||
    origin.description !== input.description
  )
    return false;
  const expected = input.sources
    .map((source) => `${source.observationId.toLowerCase()}:${source.sourceHash.toLowerCase()}`)
    .sort();
  const actual = origin.sources
    .map((source) => `${source.observation_id.toLowerCase()}:${source.source_hash.toLowerCase()}`)
    .sort();
  return JSON.stringify(expected) === JSON.stringify(actual);
}

export function WorkOrderObservationDraftDialog(props: Props) {
  const { user, loading, authError } = useAuth();
  if (!user || loading || authError) return null;
  return <DraftDialog key={`${user.id}:${props.organizationId}`} {...props} actorId={user.id} />;
}

function DraftDialog({
  organizationId,
  projects,
  initialProjectId,
  onCreated,
  actorId,
}: Props & { actorId: string }) {
  const list = useServerFn(listWorkOrderObservationSources),
    create = useServerFn(createWorkOrderObservationDraft),
    get = useServerFn(getWorkOrderObservationDraft);
  const [restored] = useState(() => readPending(actorId, organizationId));
  const [storageWarning, setStorageWarning] = useState(restored.warning),
    [persisted, setPersisted] = useState(!!restored.input);
  const [open, setOpen] = useState(false),
    [projectId, setProject] = useState(
      restored.input?.projectId ??
        (projects.some((project) => project.id === initialProjectId) ? initialProjectId! : ""),
    );
  const [title, setTitle] = useState(restored.input?.title ?? ""),
    [description, setDescription] = useState(restored.input?.description ?? ""),
    [searchInput, setSearchInput] = useState(""),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ObservationDraftSource[]>([]),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(!!restored.input),
    [conflict, setConflict] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [fresh, setFresh] = useState<string[]>([]),
    [denied, setDenied] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [discard, setDiscard] = useState(false),
    [receipt, setReceipt] = useState<WorkOrderObservationOrigin | null>(null);
  const [hasRefreshed, setHasRefreshed] = useState(false);
  const attempt = useRef<CreateWorkOrderObservationDraftInput | null>(restored.input),
    inFlight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const authorizedProject = projects.some((project) => project.id === projectId);
  const locked = busy || uncertain;
  const dirty =
    !receipt &&
    (!!title ||
      !!description ||
      selected.length > 0 ||
      (!!projectId && projectId !== initialProjectId));
  useBlocker({
    shouldBlockFn: () => open && (dirty || locked),
    enableBeforeUnload: open && (dirty || locked),
  });
  const sources = useInfiniteQuery({
    queryKey: ["work-order-observation-sources", actorId, organizationId, projectId, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      list({
        data: {
          expectedActorId: actorId,
          organizationId,
          projectId,
          cursor: pageParam,
          pageSize: 30,
          search,
        },
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: open && authorizedProject && !uncertain,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const accessLost = denied || (sources.isError && failureKind(sources.error) === "access");
  const rows =
    !authorizedProject || sources.isError || accessLost
      ? []
      : (sources.data?.pages.flatMap((page) => page.items) ?? []);
  const allFresh =
    selected.length > 0 && selected.every((source) => fresh.includes(source.observation_id));
  const canCreate =
    !restored.blocked &&
    authorizedProject &&
    !accessLost &&
    !sources.isPending &&
    !sources.isError &&
    !sources.isFetching &&
    selected.length > 0 &&
    title.trim().length > 0 &&
    (!conflict || (allFresh && reviewed));
  function clearPending() {
    try {
      sessionStorage.removeItem(pendingKey(actorId, organizationId));
      setPersisted(false);
      setStorageWarning("");
    } catch {
      setStorageWarning(
        "Kvitteringen er afklaret. Browserens tidligere genforsøg kunne ikke fjernes; et senere genforsøg bruger fortsat samme identiteter.",
      );
    }
  }

  function reset() {
    setProject(
      projects.some((project) => project.id === initialProjectId) ? initialProjectId! : "",
    );
    setSearch("");
    setSearchInput("");
    setHasRefreshed(false);
    setTitle("");
    setDescription("");
    setSelected([]);
    setError("");
    setNotice("");
    setConflict(false);
    setReviewed(false);
    setFresh([]);
    setUncertain(false);
    setReceipt(null);
    setDiscard(false);
    setDenied(false);
    attempt.current = null;
  }
  function close() {
    if (uncertain && persisted && !busy) {
      setOpen(false);
      return;
    }
    if (locked) {
      setNotice(
        "Oprettelsen skal afklares, før du lukker. Genprøv samme oprettelse eller kontrollér kvitteringen.",
      );
      return;
    }
    if (dirty) {
      setDiscard(true);
      return;
    }
    setOpen(false);
  }
  function chooseProject(value: string) {
    if (locked) return;
    if (selected.length > 0 && value !== projectId) {
      setError(
        "Fjern de valgte observationer, før du skifter projekt. Titel og beskrivelse bevares.",
      );
      return;
    }
    setProject(value);
    setSearch("");
    setSearchInput("");
    setDenied(false);
    setError("");
    setConflict(false);
    setFresh([]);
    setReviewed(false);
    setReceipt(null);
  }
  function toggle(source: ObservationDraftSource) {
    if (locked) return;
    setSelected((old) =>
      old.some((item) => item.observation_id === source.observation_id)
        ? old.filter((item) => item.observation_id !== source.observation_id)
        : old.length < 20
          ? [...old, source]
          : old,
    );
    setReviewed(false);
  }
  async function refreshSources() {
    if (locked || !authorizedProject) return;
    setBusy(true);
    setError("");
    setReviewed(false);
    try {
      const result = await sources.refetch();
      if (!alive.current) return;
      if (result.isError) throw result.error;
      const current = result.data?.pages.flatMap((page) => page.items) ?? [];
      setSelected((old) =>
        old.map(
          (source) =>
            current.find((item) => item.observation_id === source.observation_id) ?? source,
        ),
      );
      setFresh(current.map((source) => source.observation_id));
      setHasRefreshed(true);
      setNotice(
        "Kilderne i det indlæste udvalg er genindlæst. Gennemgå de valgte kilder igen, før du opretter.",
      );
    } catch {
      if (alive.current)
        setError("Kilderne kunne ikke genindlæses. Udvalget og kladden er bevaret.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function succeeded(origin: WorkOrderObservationOrigin) {
    clearPending();
    setDenied(false);
    setReceipt(origin);
    setUncertain(false);
    setConflict(false);
    setError("");
    setNotice("");
    attempt.current = null;
    onCreated?.(origin);
  }
  async function save() {
    if (inFlight.current || (!uncertain && !canCreate)) return;
    if (!attempt.current) {
      const parsed = CreateWorkOrderObservationDraftInputSchema.safeParse({
        expectedActorId: actorId,
        organizationId,
        projectId,
        actionId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        title,
        description,
        sources: selected
          .map((source) => ({
            observationId: source.observation_id,
            sourceHash: source.source_hash,
          }))
          .sort((a, b) => a.observationId.localeCompare(b.observationId)),
      });
      if (!parsed.success) {
        setError("Angiv titel og 1–20 forskellige kilder. Kontrollér tekstlængderne.");
        return;
      }
      attempt.current = parsed.data;
      try {
        sessionStorage.setItem(pendingKey(actorId, organizationId), JSON.stringify(parsed.data));
        setPersisted(true);
      } catch {
        setPersisted(false);
        setStorageWarning(
          "Genforsøget kunne ikke gemmes i browseren. Hold dette vindue åbent, indtil kvitteringen er afklaret; de samme identiteter bevares i vinduet.",
        );
      }
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const origin = await create({ data: attempt.current });
      if (alive.current) succeeded(origin);
    } catch (failure) {
      if (!alive.current) return;
      const kind = failureKind(failure);
      if (kind === "conflict") {
        clearPending();
        setConflict(true);
        setHasRefreshed(false);
        setReviewed(false);
        setFresh([]);
        setUncertain(false);
        attempt.current = null;
        setError(
          "Kildegrundlaget er ændret. Titel og udvalg er bevaret. Genindlæs kilderne og gennemgå dem igen.",
        );
      } else if (kind === "access") {
        setDenied(true);
        setUncertain(true);
        setError(
          "Projektadgangen kunne ikke bekræftes. Kildeoplysningerne er skjult, og samme genforsøg er bevaret.",
        );
      } else if (kind === "validation") {
        clearPending();
        attempt.current = null;
        setUncertain(false);
        setError("Oprettelsen blev afvist. Kontrollér titel, beskrivelse og kilder.");
      } else {
        setUncertain(true);
        setError(
          "Svaret på oprettelsen kunne ikke bekræftes. Felterne er låst. Genprøv med samme opgave- og anmodningsidentitet, så der ikke oprettes en ny kladde.",
        );
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function checkAttempt() {
    const input = attempt.current;
    if (!input || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const origin = await get({
        data: {
          expectedActorId: actorId,
          organizationId,
          projectId: input.projectId,
          actionId: input.actionId,
        },
      });
      if (!alive.current) return;
      if (origin && matchesAttempt(origin, input)) succeeded(origin);
      else
        setNotice(
          "Der er endnu ingen bekræftet kvittering for denne oprettelse. Genprøv samme oprettelse; identiteter og felter bevares.",
        );
    } catch (failure) {
      if (alive.current) {
        if (failureKind(failure) === "access") setDenied(true);
        setError(
          "Kvitteringen kunne ikke kontrolleres. Genprøv samme oprettelse, når adgangen og forbindelsen er tilbage.",
        );
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) {
          if (receipt) reset();
          setOpen(true);
        } else close();
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className={button}>
          <Plus className="size-4" aria-hidden="true" />
          Opret fra feltobservationer
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[92dvh] max-w-4xl overflow-y-auto p-4 sm:p-6"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          close();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <DialogTitle>Arbejdsordre fra feltobservationer</DialogTitle>
        <DialogDescription>
          Vælg eksisterende registreringer og gennemgå kildegrundlaget. Oprettelsen gemmer én
          almindelig kladde, som bagefter kan planlægges og tildeles.
        </DialogDescription>
        {storageWarning && (
          <p role="status" className="rounded-xl border p-3 text-sm">
            {storageWarning}
          </p>
        )}
        {receipt && authorizedProject && !accessLost ? (
          <section aria-label="Oprettet arbejdsordrekladde" className="space-y-3">
            <p role="status" className="font-semibold">
              Arbejdsordrekladden er oprettet.
            </p>
            <p>{receipt.title}</p>
            <p className="text-sm">
              {receipt.sources.length} kilder er fastholdt. Kladden er endnu ikke tildelt.
            </p>
            <Link
              to="/app/projects/$slug"
              params={{ slug: receipt.project_id }}
              search={{ tab: "handlinger", task: receipt.action_id, work: "plan" }}
              className={button}
            >
              Åbn arbejdsgrundlaget
            </Link>
            <button type="button" className={button} onClick={() => setOpen(false)}>
              Luk
            </button>
          </section>
        ) : (
          <>
            <ObservationSourceBoundary />
            {uncertain && attempt.current && (
              <p className="text-sm">
                Genforsøget bevarer den samme kladde og {attempt.current.sources.length}{" "}
                kildehenvisninger.
              </p>
            )}
            <label className="block text-sm font-medium">
              Projekt
              <select
                className={control}
                value={authorizedProject ? projectId : ""}
                disabled={locked}
                onChange={(event) => chooseProject(event.target.value)}
              >
                <option value="">Vælg projekt</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            {!authorizedProject ? (
              <p className="text-sm text-muted-foreground">
                Vælg et projekt for at hente dets feltobservationer.
              </p>
            ) : (
              !accessLost &&
              !uncertain && (
                <>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!locked) setSearch(searchInput.trim());
                    }}
                  >
                    <label className="min-w-0 flex-1 text-sm font-medium">
                      Find feltobservation
                      <input
                        type="search"
                        className={control}
                        maxLength={200}
                        value={searchInput}
                        disabled={locked}
                        onChange={(event) => setSearchInput(event.target.value)}
                      />
                    </label>
                    <button type="submit" className={button} disabled={locked}>
                      <Search className="size-4" aria-hidden="true" />
                      Søg
                    </button>
                  </form>
                  {sources.isPending && <p role="status">Henter feltobservationer…</p>}
                  {sources.isError && (
                    <div role="alert" className="space-y-2 text-sm">
                      <p>Feltobservationerne kunne ikke hentes. Dit udvalg er bevaret.</p>
                      <button
                        type="button"
                        className={button}
                        disabled={locked || sources.isFetching}
                        onClick={() => void sources.refetch()}
                      >
                        Hent feltobservationer igen
                      </button>
                    </div>
                  )}
                  {!sources.isPending && !sources.isError && rows.length === 0 && (
                    <p className="text-sm">Ingen feltobservationer i dette udvalg.</p>
                  )}
                  <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
                    {rows.map((source) => (
                      <li key={source.observation_id} className="p-3">
                        <label className="flex min-h-11 items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1 size-5"
                            checked={selected.some(
                              (item) => item.observation_id === source.observation_id,
                            )}
                            disabled={
                              locked ||
                              (selected.length >= 20 &&
                                !selected.some(
                                  (item) => item.observation_id === source.observation_id,
                                ))
                            }
                            onChange={() => toggle(source)}
                          />
                          <span>
                            <span className="block font-medium">
                              {observationSourceName(source)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {observationTime(source.snapshot.observed_at)} ·{" "}
                              {source.snapshot.status}
                            </span>
                            <span className="block line-clamp-2">
                              {source.snapshot.notes || "Ingen note"}
                            </span>
                          </span>
                        </label>
                        {conflict &&
                          selected.some(
                            (item) => item.observation_id === source.observation_id,
                          ) && (
                            <button
                              type="button"
                              className={button}
                              disabled={locked || !hasRefreshed || sources.isFetching}
                              onClick={() => {
                                setSelected((old) =>
                                  old.map((item) =>
                                    item.observation_id === source.observation_id ? source : item,
                                  ),
                                );
                                setFresh((old) => [...old, source.observation_id]);
                                setReviewed(false);
                              }}
                            >
                              Brug genindlæst kilde
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                  {sources.hasNextPage && (
                    <button
                      type="button"
                      className={button}
                      disabled={locked || sources.isFetching}
                      onClick={() => void sources.fetchNextPage()}
                    >
                      Hent flere observationer
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {rows.length} observationer indlæst · {selected.length} valgt (højst 20).
                  </p>
                </>
              )
            )}
            {authorizedProject && accessLost && (
              <div role="alert" className="space-y-2 rounded-xl border p-3 text-sm">
                <p>Kildeoplysningerne er skjult, mens projektadgangen er uafklaret.</p>
                <button
                  type="button"
                  className={button}
                  disabled={locked || sources.isFetching}
                  onClick={() => void sources.refetch()}
                >
                  Kontrollér kildernes adgang igen
                </button>
              </div>
            )}
            {authorizedProject && !accessLost && !uncertain && selected.length > 0 && (
              <section aria-label="Valgte kilder" className="space-y-3">
                <h3 className="font-semibold">Gennemgå {selected.length} valgte kilder</h3>
                {selected.map((source) => (
                  <div key={source.observation_id} className="space-y-1">
                    <WorkOrderObservationSourceDetails source={source} />
                    <button
                      type="button"
                      className="min-h-11 text-sm underline"
                      disabled={locked}
                      onClick={() => {
                        setSelected((old) =>
                          old.filter((item) => item.observation_id !== source.observation_id),
                        );
                        setReviewed(false);
                      }}
                    >
                      Fjern {observationSourceName(source)}
                    </button>
                    {conflict && !fresh.includes(source.observation_id) && (
                      <p className="text-xs text-muted-foreground">
                        Denne kilde afventer genindlæsning. Find den i listen, eller fjern den fra
                        udvalget.
                      </p>
                    )}
                  </div>
                ))}
              </section>
            )}
            {conflict && !accessLost && (
              <section className="space-y-2 rounded-xl border p-3">
                <button
                  type="button"
                  className={button}
                  disabled={locked || sources.isFetching}
                  onClick={() => void refreshSources()}
                >
                  Genindlæs kilder til ny gennemgang
                </button>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={locked || !allFresh}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  Jeg har gennemgået de genindlæste kilder
                </label>
              </section>
            )}
            <label className="block text-sm font-medium">
              Titel på arbejdsordren
              <input
                className={control}
                maxLength={200}
                value={title}
                disabled={locked}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Beskrivelse
              <textarea
                className={control}
                rows={4}
                maxLength={10000}
                value={description}
                disabled={locked}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button + " bg-primary text-primary-foreground"}
                disabled={busy || (!uncertain && !canCreate)}
                onClick={() => void save()}
              >
                {busy
                  ? "Kontrollerer…"
                  : uncertain
                    ? "Genprøv samme oprettelse"
                    : "Opret arbejdsordrekladde"}
              </button>
              {uncertain && (
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => void checkAttempt()}
                >
                  Kontrollér oprettelsen
                </button>
              )}
              <button type="button" className={button} disabled={busy} onClick={close}>
                Luk
              </button>
            </div>
            {discard && (
              <div
                role="alertdialog"
                aria-label="Kassér den åbne kladde?"
                className="space-y-2 rounded-xl border p-3"
              >
                <p className="text-sm">Kassér formularens ugemte titel og kildevalg?</p>
                <button type="button" className={button} onClick={() => setDiscard(false)}>
                  Behold kladden
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                >
                  Kassér kladde og luk
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
