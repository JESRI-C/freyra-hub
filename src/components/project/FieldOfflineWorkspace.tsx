import { WorkspaceGuide } from "@/components/WorkspaceGuide";
import { programPageGuide } from "@/lib/program-map";
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { Camera, CloudUpload, Download, LockKeyhole, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import {
  lockOfflineActor,
  readOfflineActor,
  unlockOfflineActor,
  type FieldWorkPack,
  type OfflineItem,
} from "@/lib/field-offline";
import { FieldJobVersionSchema, type FieldJobValues } from "@/lib/field-job-cards";
import { RequiredFieldJobProgress } from "./RequiredFieldJobProgress";
import { RequiredJobCards } from "./RequiredJobCards";
import { WorkOrderPlanSummary } from "./WorkOrderPlanSummary";
import { openFieldOfflineStore, type FieldOfflineStore } from "@/services/field-offline-store";
import { drainFieldOfflineQueue } from "@/services/field-offline-sync";
import {
  downloadFieldWorkPack,
  offlineSyncDependencies,
  prepareOfflineJob,
  prepareOfflinePhoto,
  requireOfflineOnlineActor,
} from "@/services/field-offline-service";
import { checkFieldOfflineShell, prepareFieldOfflineShell } from "@/services/field-offline-shell";

const control = "block min-h-11 w-full min-w-0 rounded-xl border bg-card px-3 py-2 text-base";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium disabled:opacity-50";
const primary = button + " border-primary bg-primary text-primary-foreground";
const card = "min-w-0 space-y-3 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]";
const labels: Record<OfflineItem["state"], string> = {
  queued: "Gemt på telefonen",
  sending: "Sender og kontrollerer",
  retry: "Bevaret – venter på nyt forsøg",
  blocked: "Bevaret – kræver afklaring",
  conflict: "Bevaret – serveren har en nyere version",
  complete: "Modtaget og kontrolleret på serveren",
};
function bytes(size: number) {
  return size >= 1024 ** 3
    ? `${(size / 1024 ** 3).toFixed(1)} GB`
    : `${(size / 1024 ** 2).toFixed(1)} MB`;
}
function retainedAfterCorrection(item: OfflineItem) {
  return item.kind === "job" && !!item.supersededBy;
}
function localSaveError(error: unknown) {
  if (error && typeof error === "object" && "name" in error && error.name === "QuotaExceededError")
    return "Telefonens lager er fuldt. Registreringen blev ikke gemt.";
  return error instanceof Error ? error.message : "Registreringen kunne ikke gemmes.";
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FieldOfflineWorkspace({
  requestedProject,
  requestedRound,
  requestedActionId,
}: {
  requestedProject?: string;
  requestedRound?: string;
  requestedActionId?: string;
}) {
  const [store, setStore] = useState<FieldOfflineStore>();
  const [actor, setActor] = useState<string | null>(null);
  const [packs, setPacks] = useState<FieldWorkPack[]>([]);
  const [projectId, setProject] = useState(requestedProject ?? "");
  const [queue, setQueue] = useState<{ actor: string; projectId: string; items: OfflineItem[] }>();
  const [online, setOnline] = useState(true);
  const [shellReady, setShellReady] = useState(false);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [space, setSpace] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false),
    [jobDirty, setJobDirty] = useState(false);
  const dirty = photoBusy || jobDirty;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<{ id: string; percent: number } | null>(null);
  const [auto, setAuto] = useState(true);
  const [visibleCount, setVisibleCount] = useState(40);
  const actorRef = useRef<string | null>(null),
    alive = useRef(false),
    transfer = useRef<AbortController | null>(null),
    sending = useRef(false);
  const projectRef = useRef(projectId);
  projectRef.current = projectId;
  const pack = packs.find((p) => p.projectId === projectId);
  const canOpenWorkOrderEvidence =
    online &&
    projectId === requestedProject &&
    !!requestedActionId &&
    !!actor &&
    pack?.actorId === actor &&
    pack.jobs.some((job) => job.actionId === requestedActionId);
  const queueReady = !!queue && queue.actor === actor && queue.projectId === projectId;
  const items = queueReady ? queue.items : [];
  const cancelledCount = items.filter((item) => item.lastError === "cancelled").length;
  const correctedCount = items.filter(retainedAfterCorrection).length;
  const pendingCount = items.filter(
    (item) =>
      item.state !== "complete" && item.lastError !== "cancelled" && !retainedAfterCorrection(item),
  ).length;

  function guardDraftNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (!dirty) return;
    event.preventDefault();
    setError("Gem eller fortryd ændringerne, før du forlader feltsiden.");
  }

  useBlocker({
    shouldBlockFn: () => {
      if (dirty) setError("Gem eller fortryd ændringerne, før du forlader feltsiden.");
      return dirty;
    },
    enableBeforeUnload: dirty,
  });

  useEffect(() => {
    alive.current = true;
    setOnline(navigator.onLine);
    const read = () => {
      const id = readOfflineActor();
      if (id !== actorRef.current) {
        actorRef.current = id;
        setActor(id);
        transfer.current?.abort();
        setPhotoBusy(false);
        setJobDirty(false);
      }
    };
    read();
    let opened: FieldOfflineStore | undefined;
    void openFieldOfflineStore()
      .then((db) => {
        opened = db;
        if (alive.current) setStore(db);
        else db.close();
      })
      .catch(() =>
        setError("Telefonens lokale lager er ikke tilgængeligt. Ingen original er gemt endnu."),
      );
    void checkFieldOfflineShell()
      .then(setShellReady)
      .catch(() => setShellReady(false));
    void navigator.storage
      ?.persisted?.()
      .then(setPersistent)
      .catch(() => setPersistent(null));
    window.addEventListener("storage", read);
    window.addEventListener("freyra-field-locked", read);
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (
        (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session &&
        actorRef.current &&
        session.user.id !== actorRef.current
      )
        lockOfflineActor();
    });
    return () => {
      alive.current = false;
      transfer.current?.abort();
      opened?.close();
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener("storage", read);
      window.removeEventListener("freyra-field-locked", read);
    };
  }, []);
  useEffect(() => {
    if (!store || !actor) {
      setPacks([]);
      setQueue(undefined);
      return;
    }
    let current = true;
    void store
      .packs(actor)
      .then((rows) => {
        if (current) {
          setPacks(rows);
          if (!requestedProject && !projectId) setProject(rows[0]?.projectId ?? "");
        }
      })
      .catch(() => setError("Opgavepakkerne kunne ikke læses."));
    return () => {
      current = false;
    };
  }, [store, actor, requestedProject, projectId]);
  const refresh = useCallback(async () => {
    if (!store || !actor) return;
    const rows = await store.items(actor, projectId || undefined);
    if (alive.current && actorRef.current === actor && projectRef.current === projectId)
      setQueue({ actor, projectId, items: rows });
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    if (alive.current)
      setSpace(
        estimate?.quota !== undefined && estimate.usage !== undefined
          ? Math.max(0, estimate.quota - estimate.usage)
          : null,
      );
  }, [store, actor, projectId]);
  useEffect(() => {
    if (!store || !actor) return;
    let stopped = false;
    const reload = () => {
      if (!stopped)
        void refresh().catch(() =>
          setError("Køen kunne ikke læses. Originalerne er ikke slettet."),
        );
    };
    const run = async () => {
      if (
        stopped ||
        sending.current ||
        !auto ||
        !navigator.onLine ||
        document.visibilityState === "hidden"
      )
        return;
      sending.current = true;
      const controller = new AbortController();
      transfer.current = controller;
      try {
        await drainFieldOfflineQueue(
          store,
          actor,
          offlineSyncDependencies(
            () => !stopped && actorRef.current === actor,
            (id, percent) => {
              if (!stopped) setProgress({ id, percent });
            },
          ),
          controller.signal,
        );
      } catch {
        if (!stopped) setError("Synkroniseringen afventer. De lokale originaler bevares.");
      } finally {
        sending.current = false;
        if (!stopped) {
          setProgress(null);
          reload();
        }
      }
    };
    const connection = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine || document.visibilityState === "hidden") transfer.current?.abort();
      else void run();
    };
    reload();
    void run();
    const timer = setInterval(() => {
      reload();
      void run();
    }, 5000);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    document.addEventListener("visibilitychange", connection);
    return () => {
      stopped = true;
      transfer.current?.abort();
      clearInterval(timer);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      document.removeEventListener("visibilitychange", connection);
    };
  }, [store, actor, projectId, auto, refresh]);

  async function prepare() {
    if (!store || busy || dirty) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const id = await requireOfflineOnlineActor(actor ?? undefined);
      if (!alive.current) return;
      unlockOfflineActor(id);
      actorRef.current = id;
      setActor(id);
      if (!projectId)
        throw new Error("Åbn feltadgangen fra den sag, du vil have med på telefonen.");
      const downloaded = await downloadFieldWorkPack(id, projectId);
      if (actorRef.current !== id || !alive.current) return;
      await store.putPack(downloaded);
      setPacks(await store.packs(id));
      setPersistent((await navigator.storage?.persist?.().catch(() => false)) ?? false);
      await prepareFieldOfflineShell();
      if (actorRef.current !== id || !alive.current) return;
      setShellReady(true);
      setNotice(
        "Sagen og programfilerne er gemt til feltbrug. Bogmærk denne side, før du tager afsted.",
      );
    } catch (e) {
      setError(
        e instanceof Error && e.message !== "retry" && e.message !== "blocked"
          ? e.message
          : "Klargøring kræver net og samme brugers aktive login. Gå til dashboardet og log ind.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-4 bg-background p-3 pb-10 text-foreground sm:p-6">
      <WorkspaceGuide {...programPageGuide("/felt")!} />
      <header className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Freyra i felten</h1>
          <span className="inline-flex items-center gap-2 text-sm">
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {online ? "Netforbindelse" : "Arbejder lokalt"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Originalfotos og jobkort gemmes på denne telefon. Send dem med samme login, når der igen
          er net.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/select" className={button} onClick={guardDraftNavigation}>
            Dashboard og login
          </Link>
          {actor && (
            <button className={button} disabled={dirty} onClick={() => lockOfflineActor()}>
              <LockKeyhole className="h-4 w-4" />
              Lås feltadgang
            </button>
          )}
        </div>
        {projectId && (
          <Link
            to="/app/projects/$slug"
            params={{ slug: projectId }}
            search={{
              tab: projectId === requestedProject && requestedActionId ? "handlinger" : "medier",
              round: projectId === requestedProject ? requestedRound : undefined,
              task: projectId === requestedProject ? requestedActionId : undefined,
              work: projectId === requestedProject && requestedActionId ? "field" : undefined,
            }}
            className="inline-block min-h-11 py-2 text-sm underline"
            onClick={guardDraftNavigation}
          >
            Tilbage til sagen med net
          </Link>
        )}
        {canOpenWorkOrderEvidence && (
          <Link
            to="/app/projects/$slug"
            params={{ slug: projectId }}
            search={{
              tab: "handlinger",
              round: requestedRound,
              task: requestedActionId,
              work: "evidence",
            }}
            className={button}
            onClick={guardDraftNavigation}
          >
            Knyt dokumentation til opgaven
          </Link>
        )}
      </header>
      {error && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-primary p-3 text-sm">
          {notice}
        </p>
      )}
      <section className={card} aria-label="Klargør feltarbejde">
        <h2 className="font-semibold">Sagen på telefonen</h2>
        {packs.length > 0 && (
          <label className="block space-y-2 text-sm">
            Gemt sag
            <select
              className={control}
              value={projectId}
              disabled={dirty || busy}
              onChange={(e) => {
                setProject(e.target.value);
                setVisibleCount(40);
                setNotice("");
              }}
            >
              {!packs.some((p) => p.projectId === projectId) && (
                <option value={projectId}>Ny sag – skal klargøres</option>
              )}
              {packs.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectName}
                </option>
              ))}
            </select>
          </label>
        )}
        {pack && (
          <p className="text-sm">
            {pack.projectName} · gemt {new Date(pack.savedAt).toLocaleString("da-DK")}. Adgangen
            kontrolleres igen ved afsendelse.
          </p>
        )}
        <button
          className={primary}
          disabled={!store || !online || busy || dirty}
          onClick={() => void prepare()}
        >
          {busy
            ? "Gemmer sag og programfiler…"
            : pack
              ? "Opdater sagen til offlinebrug"
              : "Klargør sagen til offlinebrug"}
        </button>
        <p className="text-sm text-muted-foreground">
          {shellReady
            ? "Programfiler til offlinebrug er gemt."
            : "Klargør med net, før du lukker siden eller tager telefonen offline."}
        </p>
        {persistent === false && (
          <p className="text-sm">
            Browseren garanterer ikke bevaring af lageret. Behold dine originaler, og undgå at rydde
            browserdata, før serveren har kvitteret.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {space === null
            ? "Browseren har ikke oplyst ledig plads."
            : `Browseren oplyser ${bytes(space)} ledig plads.`}{" "}
          Feltkøen bruger højst 2 GB til usendte originaler.
        </p>
        {dirty && (
          <p className="text-sm">
            Gem registreringen lokalt, før du skifter eller opdaterer sagen.
          </p>
        )}
      </section>
      {store && actor && pack && (
        <>
          <OfflinePhotos
            key={actor + projectId}
            actorId={actor}
            pack={pack}
            store={store}
            ready={shellReady}
            onSaved={() =>
              void refresh().catch(() => setError("Den gemte kø kunne ikke genlæses."))
            }
            onBusy={(value) => {
              if (actorRef.current === actor && projectRef.current === projectId)
                setPhotoBusy(value);
            }}
          />
          {queueReady ? (
            <OfflineJobs
              disabled={busy}
              key={actor + projectId + pack.savedAt}
              pack={pack}
              store={store}
              items={items}
              requestedActionId={projectId === requestedProject ? requestedActionId : undefined}
              onSaved={() =>
                void refresh().catch(() => setError("Den gemte kø kunne ikke genlæses."))
              }
              onDirty={(value) => {
                if (actorRef.current === actor && projectRef.current === projectId)
                  setJobDirty(value);
              }}
            />
          ) : (
            <p role="status">Henter gemte feltkladder…</p>
          )}
          <section className={card} aria-label="Telefonens feltkø">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                Telefonens kø · {pendingCount} afventer på denne sag
              </h2>
              <button className={button} onClick={() => void refresh()}>
                Opdater kø
              </button>
            </div>
            {cancelledCount > 0 && (
              <p className="text-sm">
                {cancelledCount === 1
                  ? "1 registrering er bevaret på telefonen efter aflysning."
                  : `${cancelledCount} registreringer er bevaret på telefonen efter aflysning.`}
              </p>
            )}
            {correctedCount > 0 && (
              <p className="text-sm">
                {correctedCount} tidligere kladder er bevaret efter en modtaget rettelse. De tæller
                ikke som afventende.
              </p>
            )}
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  if (!e.target.checked) transfer.current?.abort();
                }}
              />
              Send automatisk for mine gemte sager, mens feltsiden er åben
            </label>
            <p className="text-sm text-muted-foreground">
              Når telefonen lukker eller suspenderer siden, bevares køen. Åbn feltsiden igen med net
              for at fortsætte. For jobkort viser kvitteringen den gemte version. For fotos
              bekræfter den, at originalfilen er kontrolleret. Faglig gennemgang sker i opgaven.
            </p>
            <ul className="space-y-3">
              {items.slice(0, visibleCount).map((item) => (
                <li
                  key={item.id}
                  className="space-y-2 rounded-xl border p-3 [overflow-wrap:anywhere]"
                >
                  <p className="font-medium">
                    {item.kind === "photo"
                      ? item.payload.title
                      : (pack.jobs.find((j) => j.actionId === item.payload.actionId)?.title ??
                        "Jobkortregistrering")}
                  </p>
                  <p className="text-sm">
                    {retainedAfterCorrection(item)
                      ? "Bevaret – rettet i nyere registrering"
                      : item.lastError === "cancelled"
                        ? "Bevaret på telefonen – opgaven er aflyst"
                        : labels[item.state]}
                    {item.dependsOn && item.state === "queued"
                      ? " · afventer tidligere registrering"
                      : ""}
                    {progress?.id === item.id ? ` · ${Math.round(progress.percent)} %` : ""}
                  </p>
                  {item.kind === "job" && item.state === "complete" && (
                    <JobReceipt receipt={item.receipt} />
                  )}
                  {item.kind === "photo" && (
                    <p className="text-xs text-muted-foreground">
                      {bytes(item.originalBytes)} ·{" "}
                      {item.payload.capture.originalPosition
                        ? "Original GPS er bevaret"
                        : "Original GPS mangler"}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {item.kind === "photo" && item.state !== "complete" && (
                      <button
                        className={button}
                        onClick={() =>
                          void store
                            .original(actor, item.id)
                            .then((blob) => {
                              if (blob) download(blob, item.payload.originalName);
                            })
                            .catch(() => setError("Originalen kunne ikke åbnes."))
                        }
                      >
                        <Download className="h-4 w-4" />
                        Hent original
                      </button>
                    )}
                    {item.kind === "job" && (
                      <button
                        className={button}
                        onClick={() =>
                          download(
                            new Blob([JSON.stringify(item, null, 2)], { type: "application/json" }),
                            `feltregistrering-${item.id}.json`,
                          )
                        }
                      >
                        Hent registrering
                      </button>
                    )}
                    {(item.state === "retry" ||
                      (item.state === "blocked" && item.lastError !== "cancelled")) && (
                      <button
                        className={button}
                        onClick={() =>
                          void store
                            .retry(actor, item.id)
                            .then(refresh)
                            .catch(() =>
                              setError("Registreringen kunne ikke sættes til nyt forsøg."),
                            )
                        }
                      >
                        Prøv samme registrering igen
                      </button>
                    )}
                  </div>
                  {item.state === "conflict" && !retainedAfterCorrection(item) && (
                    <p className="text-sm">
                      Din registrering er bevaret. Opdater sagen med net, gennemgå serverens jobkort
                      og den gemte registrering, og gem en ny version med en begrundelse. Den gamle
                      version overskrives ikke.
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {items.length > visibleCount && (
              <button className={button} onClick={() => setVisibleCount((n) => n + 40)}>
                Vis flere ({items.length - visibleCount})
              </button>
            )}
            {!items.length && (
              <p className="text-sm text-muted-foreground">
                Ingen lokale registreringer på denne sag endnu.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function OfflinePhotos({
  actorId,
  pack,
  store,
  ready,
  onSaved,
  onBusy,
}: {
  actorId: string;
  pack: FieldWorkPack;
  store: FieldOfflineStore;
  ready: boolean;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [unsaved, setUnsaved] = useState<File[]>([]);
  const camera = useRef<HTMLInputElement>(null),
    library = useRef<HTMLInputElement>(null),
    captureBusy = useRef(false);
  function capture(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void saveFiles(files);
  }
  async function saveFiles(files: File[]) {
    if (!files.length || captureBusy.current) return;
    captureBusy.current = true;
    setBusy(true);
    onBusy(true);
    setUnsaved(files);
    setMessage("");
    let count = 0;
    try {
      for (const file of files) {
        if (readOfflineActor() !== actorId)
          throw new Error("Feltadgangen er låst. Originalen er ikke bekræftet gemt.");
        if (file.size > 50 * 1024 * 1024 || !file.type.startsWith("image/"))
          throw new Error("Vælg et originalfoto på højst 50 MB.");
        const estimate = await navigator.storage?.estimate?.();
        if (
          estimate?.quota !== undefined &&
          estimate.usage !== undefined &&
          estimate.quota - estimate.usage < file.size + 32 * 1024 * 1024
        )
          throw new Error(
            "Telefonen har for lidt ledig plads. Behold originalen uden for browseren.",
          );
        const item = await prepareOfflinePhoto(
          actorId,
          pack.projectId,
          file,
          title.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 160) || "Feltfoto",
          description,
        );
        if (readOfflineActor() !== actorId)
          throw new Error("Brugeren er skiftet. Filen er ikke bekræftet gemt.");
        await store.enqueue(item, file);
        count++;
        setMessage(`${count} af ${files.length} originaler er gemt på telefonen.`);
        onSaved();
      }
    } catch (e) {
      setMessage(
        `${count} af ${files.length} blev gemt. ${localSaveError(e)} Behold eller vælg de resterende originaler igen.`,
      );
    } finally {
      const remaining = files.slice(count);
      setUnsaved(remaining);
      captureBusy.current = false;
      setBusy(false);
      onBusy(remaining.length > 0);
    }
  }
  return (
    <section className={card} aria-label="Feltfotos på telefonen">
      <h2 className="font-semibold">Tag fotos i felten</h2>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm">
          Titel og note (valgfrit, før foto)
        </summary>
        <label className="block space-y-2 text-sm">
          Titel
          <input
            className={control}
            maxLength={160}
            value={title}
            disabled={busy || unsaved.length > 0}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm">
          Note
          <textarea
            className={control}
            maxLength={4000}
            value={description}
            disabled={busy || unsaved.length > 0}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </details>
      <input
        ref={camera}
        className="hidden"
        aria-label="Tag originalfoto til feltkøen"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={busy || unsaved.length > 0}
        onChange={capture}
      />
      <input
        ref={library}
        className="hidden"
        aria-label="Vælg originalfotos til feltkøen"
        type="file"
        accept="image/*"
        multiple
        disabled={busy || unsaved.length > 0}
        onChange={capture}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          className={primary}
          disabled={!ready || busy || unsaved.length > 0}
          onClick={() => camera.current?.click()}
        >
          <Camera className="h-5 w-5" />
          Tag foto
        </button>
        <button
          className={button}
          disabled={!ready || busy || unsaved.length > 0}
          onClick={() => library.current?.click()}
        >
          Vælg fotos
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Fotoet gemmes automatisk lokalt efter valg. Vent på bekræftelsen, før du lukker siden.
        Originalen ændres ikke.
      </p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {!busy && unsaved.length > 0 && (
        <div className="space-y-3 rounded-xl border border-destructive p-3">
          <p role="alert" className="text-sm">
            {unsaved.length} originaler er endnu ikke gemt. De findes kun i den åbne side. Hent dem,
            eller prøv igen, før du lukker.
          </p>
          <button className={button} onClick={() => void saveFiles(unsaved)}>
            Prøv at gemme de resterende fotos igen
          </button>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm">
              Hent originaler, som endnu ikke er gemt
            </summary>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {unsaved.map((file, index) => (
                <li key={index}>
                  <button className={button} onClick={() => download(file, file.name)}>
                    Hent ikke-gemt original: {file.name}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <button
            className={button}
            onClick={() => {
              setUnsaved([]);
              onBusy(false);
              setMessage(
                "Det ikke-gemte valg er ryddet. Tidligere gemte registreringer ligger fortsat i køen.",
              );
            }}
          >
            Jeg har gemt originalerne andetsteds – ryd valget
          </button>
        </div>
      )}
    </section>
  );
}
function OfflineJobs({
  disabled,
  pack,
  store,
  items,
  onSaved,
  onDirty,
  requestedActionId,
}: {
  disabled: boolean;
  pack: FieldWorkPack;
  store: FieldOfflineStore;
  items: OfflineItem[];
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
  requestedActionId?: string;
}) {
  const [actionId, setAction] = useState(requestedActionId ?? ""),
    [dirty, setDirty] = useState(false),
    [reset, setReset] = useState(0);
  const changeDirty = (value: boolean) => {
    setDirty(value);
    onDirty(value);
  };
  return (
    <section className={card} aria-label="Jobkort på telefonen">
      <h2 className="font-semibold">Jobkort i felten</h2>
      <fieldset disabled={disabled} className="min-w-0 space-y-3 border-0 p-0">
        {actionId && !pack.jobs.some((job) => job.actionId === actionId) && (
          <p role="alert">
            Den valgte opgave findes ikke i projektets gemte arbejdspakke. Opdatér pakken med net,
            eller vælg en tilgængelig opgave. Der er ikke valgt en erstatningsopgave.
          </p>
        )}
        {requestedActionId && (
          <p className="text-sm text-muted-foreground">
            Opgavevalget gælder jobkortet. Fotos i feltkøen er fortsat knyttet til projektet; de er
            ikke automatisk opgavedokumentation.
          </p>
        )}
        <label className="block space-y-2 text-sm">
          Opgave
          <select
            className={control}
            value={actionId}
            disabled={dirty}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">Vælg opgave</option>
            {pack.jobs.map((job) => (
              <option key={job.actionId} value={job.actionId}>
                {job.title}
              </option>
            ))}
          </select>
        </label>
        {dirty && (
          <button
            className={button}
            onClick={() => {
              changeDirty(false);
              setReset((n) => n + 1);
            }}
          >
            Fortryd ikke-gemte ændringer
          </button>
        )}
        {actionId && pack.jobs.some((job) => job.actionId === actionId) && (
          <OfflineJobEditor
            key={`${actionId}:${reset}:${pack.savedAt}`}
            pack={pack}
            actionId={actionId}
            store={store}
            items={items}
            onSaved={onSaved}
            onDirty={changeDirty}
          />
        )}
      </fieldset>
    </section>
  );
}
function OfflineJobEditor({
  pack,
  actionId,
  store,
  items,
  onSaved,
  onDirty,
}: {
  pack: FieldWorkPack;
  actionId: string;
  store: FieldOfflineStore;
  items: OfflineItem[];
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const job = pack.jobs.find((j) => j.actionId === actionId)!;
  const serverVersion = job.latest?.version ?? 0;
  const taskItems = items.filter(
    (item): item is Extract<OfflineItem, { kind: "job" }> =>
      item.kind === "job" && item.payload.actionId === actionId,
  );
  const templates = [
    ...(job.template ? [job.template] : []),
    ...(job.requirements?.cards ?? []),
    ...taskItems.map((item) => item.template),
  ].filter((template, index, all) => all.findIndex((other) => other.id === template.id) === index);
  const initialTemplateId =
    job.requirements?.cards[0]?.id ?? job.template?.id ?? templates[0]?.id ?? "";
  function readTemplate(id: string) {
    const latest =
      job.registrations?.find((row) => row.template_version_id === id) ??
      (job.latest?.template_version_id === id ? job.latest : null);
    const local = taskItems
      .filter((item) => item.template.id === id && !item.supersededBy)
      .sort(
        (a, b) =>
          b.payload.expectedVersion - a.payload.expectedVersion || b.createdAt - a.createdAt,
      )[0];
    const planId = job.requirements?.cards.some((card) => card.id === id)
      ? job.requirements.planVersionId
      : undefined;
    const reuse =
      local &&
      !["conflict", "blocked"].includes(local.state) &&
      (local.payload.requiredPlanVersionId ?? null) === (planId ?? null) &&
      local.payload.expectedVersion + 1 >= serverVersion;
    return {
      latest,
      local,
      planId,
      values: reuse ? local.payload.values : (latest?.values ?? {}),
      status: reuse ? (local.payload.status ?? "draft") : (latest?.status ?? "draft"),
    };
  }
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const template = templates.find((card) => card.id === templateId);
  const { latest, local, planId } = readTemplate(templateId);
  const planChanged =
    !!local?.payload.requiredPlanVersionId && local.payload.requiredPlanVersionId !== planId;
  const writable = job.requirements?.cards.some((card) => card.id === templateId)
    ? job.requirements.canRecord
    : job.template?.id === templateId;
  const [values, setValues] = useState<FieldJobValues>(
    () => readTemplate(initialTemplateId).values,
  );
  const [dirty, setDirty] = useState(false);
  const markDirty = (value: boolean) => {
    setDirty(value);
    onDirty(value);
  };
  const [reason, setReason] = useState("");
  const [supersedesId, setSupersedesId] = useState<string>();
  const [status, setStatus] = useState<"draft" | "recorded" | "needs_review">(
    () => readTemplate(initialTemplateId).status,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const inputPrefix = useId();
  if (!template)
    return (
      <p className="text-sm">
        En redaktør skal først tilknytte en skabelon i dashboardet. Opdater derefter opgavepakken.
      </p>
    );
  const setValue = (key: string, value: string | boolean | number | null) => {
    setValues((old) => ({ ...old, [key]: value }));
    markDirty(true);
  };
  async function save() {
    if (saving.current || !writable) return;
    saving.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (readOfflineActor() !== pack.actorId) throw new Error("Feltadgangen er låst.");
      const current = await store.items(pack.actorId, pack.projectId);
      const item = prepareOfflineJob(
        pack,
        actionId,
        { values, status, correctionReason: reason, templateVersionId: template!.id, supersedesId },
        current,
      );
      await store.enqueue(item);
      setMessage("Registreringen er gemt på telefonen. Serverkvittering afventer synkronisering.");
      markDirty(false);
      setReason("");
      setSupersedesId(undefined);
      onSaved();
    } catch (e) {
      setMessage(localSaveError(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {job.plan ? (
        <WorkOrderPlanSummary row={job.plan} />
      ) : (
        job.requirements && (
          <>
            <p className="text-sm">
              Dokumentationskrav fra planversion {job.requirements.planVersion}. Opgavepakken er
              gemt {new Date(pack.savedAt).toLocaleString("da-DK")}.
            </p>
            <RequiredJobCards
              cards={job.requirements.cards.map((card) => ({
                templateVersionId: card.id,
                templateId: card.template_id,
                version: card.version,
                definition: card.definition,
              }))}
            />
          </>
        )
      )}
      <label className="block space-y-2 text-sm">
        Jobkort i opgavepakken
        <select
          aria-label="Jobkort i opgavepakken"
          className={control}
          value={templateId}
          disabled={busy || dirty}
          onChange={(event) => {
            const id = event.target.value,
              draft = readTemplate(id);
            setTemplateId(id);
            setValues(draft.values);
            setStatus(draft.status);
            setReason("");
            setSupersedesId(undefined);
            setMessage("");
          }}
        >
          {templates.map((card) => (
            <option key={card.id} value={card.id}>
              {card.definition.title} · version {card.version}
            </option>
          ))}
        </select>
      </label>
      {dirty && <p className="text-sm">Gem på telefonen eller fortryd, før du skifter jobkort.</p>}
      {!writable && (
        <p className="text-sm">
          Denne version kan læses, men ikke gemmes fra den aktuelle opgavepakke. Opdatér pakken med
          net, eller vælg et jobkort med udførelsesadgang.
        </p>
      )}
      {!latest && writable && (
        <p className="text-sm">
          Der er endnu ingen serverregistrering til dette jobkort i opgavepakken. Den første
          registrering kan gemmes på telefonen.
        </p>
      )}
      {planChanged && (
        <p className="text-sm">
          Den bevarede registrering bygger på en anden planversion. Gennemgå den aktuelle plan, og
          vælg udtrykkeligt, hvilke svar der skal bruges i en ny kladde.
        </p>
      )}
      <p className="text-sm">
        Skabelonversion {template.version}. Manglende svar kan gemmes som synlige mangler.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm">
          Serverversion i opgavepakken: {latest?.version ?? "Ingen gemt"}
        </summary>
        <dl className="space-y-2 text-sm">
          {Object.entries(latest?.values ?? {}).map(([key, value]) => (
            <div key={key}>
              <dt className="font-medium">
                {template!.definition.fields.find((f) => f.key === key)?.label ?? key}
              </dt>
              <dd>{offlineJobAnswer(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
      {local?.kind === "job" && (local.state === "conflict" || planChanged) && (
        <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
          <h3 className="font-medium">Sammenlign den lokale registrering med opgavepakken</h3>
          {local.template.id !== template.id ? (
            <p>
              Skabelonen er ændret. Brug de bevarede svar nedenfor til at udfylde den nye skabelon.
            </p>
          ) : serverVersion <= local.payload.expectedVersion && !planChanged ? (
            <p>Opdater sagen med net, så opgavepakken indeholder den nyere serverversion.</p>
          ) : (
            <p>
              Vælg, hvilke svar du vil gemme som en ny version. Angiv en begrundelse, før du gemmer.
            </p>
          )}
          <ul className="space-y-2">
            {local.template.definition.fields.map((field) => {
              const savedAnswer = offlineJobAnswer(latest?.values[field.key]);
              const localAnswer = offlineJobAnswer(local.payload.values[field.key]);
              return (
                <li
                  key={field.key}
                  className="rounded-lg border bg-background p-2 [overflow-wrap:anywhere]"
                >
                  <p className="font-medium">
                    {field.label}
                    {field.unit ? ` (${field.unit})` : ""}
                  </p>
                  <dl className="grid gap-1 sm:grid-cols-2">
                    {local.template.id === template?.id && (
                      <div>
                        <dt className="text-muted-foreground">I opgavepakken</dt>
                        <dd className="whitespace-pre-wrap">{savedAnswer}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-muted-foreground">På telefonen</dt>
                      <dd className="whitespace-pre-wrap">{localAnswer}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          {local.template.id === template.id &&
            (serverVersion > local.payload.expectedVersion || planChanged) &&
            !taskItems.some(
              (item) =>
                item.supersedesId === local.id && !["blocked", "conflict"].includes(item.state),
            ) &&
            writable && (
              <button
                type="button"
                className={button}
                disabled={busy || !writable}
                onClick={() => {
                  setValues(local.payload.values);
                  setStatus(local.payload.status);
                  setSupersedesId(local.id);
                  markDirty(true);
                }}
              >
                Brug den bevarede registrering som ny kladde
              </button>
            )}
        </div>
      )}
      <RequiredFieldJobProgress
        definition={template.definition}
        values={values}
        inputPrefix={inputPrefix}
        disabled={busy || !writable}
      />
      {template.definition.fields.map((field) => (
        <label className="block space-y-2 text-sm" key={field.key}>
          {field.label}
          {field.unit ? ` (${field.unit})` : ""}
          {field.required ? " · nødvendigt" : ""}
          {field.helpText && (
            <span className="block text-xs text-muted-foreground">{field.helpText}</span>
          )}
          {field.type === "boolean" || field.type === "select" ? (
            <select
              id={inputPrefix + field.key}
              className={control}
              disabled={busy || !writable}
              value={
                values[field.key] === null || values[field.key] === undefined
                  ? ""
                  : String(values[field.key])
              }
              onChange={(e) =>
                setValue(
                  field.key,
                  e.target.value === ""
                    ? null
                    : field.type === "boolean"
                      ? e.target.value === "true"
                      : e.target.value,
                )
              }
            >
              <option value="">Ikke registreret</option>
              {(field.type === "boolean" ? ["true", "false"] : (field.options ?? [])).map(
                (value) => (
                  <option key={value} value={value}>
                    {field.type === "boolean" ? (value === "true" ? "Ja" : "Nej") : value}
                  </option>
                ),
              )}
            </select>
          ) : field.type === "textarea" ? (
            <textarea
              id={inputPrefix + field.key}
              className={control}
              disabled={busy || !writable}
              maxLength={4000}
              value={String(values[field.key] ?? "")}
              onChange={(e) => setValue(field.key, e.target.value)}
            />
          ) : (
            <input
              id={inputPrefix + field.key}
              className={control}
              disabled={busy || !writable}
              type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
              step={field.type === "number" ? "any" : undefined}
              value={String(values[field.key] ?? "")}
              onChange={(e) =>
                setValue(
                  field.key,
                  field.type === "number"
                    ? e.target.value === "" || !Number.isFinite(Number(e.target.value))
                      ? null
                      : Number(e.target.value)
                    : e.target.value,
                )
              }
            />
          )}
        </label>
      ))}
      <label className="block space-y-2 text-sm">
        Status
        <select
          className={control}
          value={status}
          disabled={busy || !writable}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            markDirty(true);
          }}
        >
          <option value="draft">Kladde</option>
          <option value="recorded">Registreret af medarbejder</option>
          <option value="needs_review">Send til ekstra gennemgang</option>
        </select>
      </label>
      <label className="block space-y-2 text-sm">
        Begrundelse for registreringen
        <input
          className={control}
          value={reason}
          disabled={busy || !writable}
          maxLength={2000}
          onChange={(e) => {
            setReason(e.target.value);
            markDirty(true);
          }}
        />
      </label>
      <button
        className={primary}
        disabled={busy || !writable || !reason.trim()}
        onClick={() => void save()}
      >
        <CloudUpload className="h-4 w-4" />
        {busy ? "Gemmer lokalt…" : "Gem registrering på telefonen"}
      </button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

function offlineJobAnswer(value: FieldJobValues[string] | undefined) {
  if (value == null || value === "") return "Ikke registreret";
  if (typeof value === "boolean") return value ? "Ja" : "Nej";
  return String(value);
}

function JobReceipt({ receipt }: { receipt: unknown }) {
  const result = FieldJobVersionSchema.safeParse(receipt);
  if (!result.success) return null;
  const status = {
    draft: "Kladde",
    recorded: "Registreret af medarbejder",
    needs_review: "Til ekstra gennemgang",
  }[result.data.status];
  return (
    <p className="text-sm text-muted-foreground">
      Gemt som version {result.data.version} · {status}
    </p>
  );
}
