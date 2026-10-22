import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Camera, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Project } from "@/lib/supabase/types";
import { Card } from "@/components/ui-bits";
import {
  DroneBeforeBatchWizard,
  type CanonicalDroneBatch,
} from "@/components/monitoring/DroneBeforeBatchWizard";
import { DroneIntakeAssistant } from "./DroneIntakeAssistant";
import { DroneImageInspectionPanel } from "./DroneImageInspectionPanel";
import { PhotoPointVerificationPanel } from "./PhotoPointVerificationPanel";
import { SeededOriginalsPanel } from "./SeededOriginalsPanel";
import { readPendingDroneBatch, savePendingDroneBatch } from "./drone-intake-batch-receipt";
import { LiveProjectMap } from "@/components/maps/LiveProjectMap";
import { createProjectBaseline, getProjectBaseline } from "@/lib/public-baseline.functions";
import { getVerificationPlan, saveVerificationPlan } from "@/lib/verification-plan.functions";
import {
  getSurveyRound,
  getSurveyRoundAccess,
  listSurveyRounds,
  saveSurveyRound,
} from "@/lib/survey-round.functions";
import { getSurveyRoundMediaAccess } from "@/lib/survey-round-media.functions";
import { getSavedOfficialWatercourseReach } from "@/lib/watercourse-reach.functions";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { resolveProjectGeometry, validateProjectPolygon } from "@/services/geo-service";
import { SurveyRoundMediaPanel } from "./SurveyRoundMediaPanel";
import { InspectionPhotoBatch } from "./InspectionPhotoBatch";
import {
  resumeCompletedStreamInspection,
  startStreamInspection,
  type StreamInspectionResult,
  type StreamInspectionProgress,
} from "./stream-inspection-start";

interface Props {
  phase?: "billeder" | "datagrundlag" | "gennemgang";
  project: Project;
  selectedRoundId?: string;
  onSelectRound: (id: string | undefined) => void;
  onOpenDelivery: () => void;
  photoCount?: number;
  onPhotosChanged: () => void | Promise<unknown>;
}

function todayInDenmark() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function daysBefore(day: string, count: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
}
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    value >= "0001-01-01" &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
function initialDates(actor: string, project: string) {
  const date = todayInDenmark();
  const fallback = { recordingDate: date, dateFrom: daysBefore(date, 29), dateTo: date };
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`gofreyra.inspection-period:${actor}:${project}`) ?? "null",
    );
    if (
      value &&
      typeof value === "object" &&
      ["recordingDate", "dateFrom", "dateTo"].every((key) =>
        isCalendarDate((value as Record<string, unknown>)[key]),
      )
    )
      return value as typeof fallback;
  } catch {
    /* The explicit prepare action reports unavailable durable storage. */
  }
  return fallback;
}
const progressLabels: Record<StreamInspectionProgress, string> = {
  baseline: "Henter offentligt datagrundlag …",
  plan: "Forbereder spørgsmål fra datagrundlaget …",
  round: "Gemmer undersøgelsen …",
  complete: "Undersøgelsen er gemt",
};

export function DroneSurveyWorkspace(props: Props) {
  const { user } = useAuth();
  if (!user) return <p>Log ind for at åbne undersøgelsen.</p>;
  return <Workspace key={`${user.id}:${props.project.id}`} {...props} actorId={user.id} />;
}

function Workspace({
  phase,
  project,
  actorId,
  selectedRoundId,
  onSelectRound,
  onOpenDelivery,
  photoCount,
  onPhotosChanged,
}: Props & { actorId: string }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [intakeBatch, setIntakeBatch] = useState<CanonicalDroneBatch>();
  const [pendingBatch, setPendingBatch] = useState<CanonicalDroneBatch>();
  const [batchReceiptError, setBatchReceiptError] = useState<string | null>(null);
  const [inspectionRefresh, setInspectionRefresh] = useState(0);
  useEffect(() => {
    try {
      setPendingBatch(readPendingDroneBatch(localStorage, actorId, project.id));
    } catch {
      setBatchReceiptError(
        "Den seneste billedserie kunne ikke genåbnes fra denne browser. De uploadede originaler er bevaret i sagen.",
      );
    }
  }, [actorId, project.id]);
  const [dates, setDates] = useState(() => initialDates(actorId, project.id));
  const [progress, setProgress] = useState<StreamInspectionProgress | null>(null);
  const busy = useRef(false);
  const client = useQueryClient();
  const getAccess = useServerFn(getSurveyRoundAccess);
  const getPhotoAccess = useServerFn(getSurveyRoundMediaAccess);
  const createBaseline = useServerFn(createProjectBaseline);
  const getBaseline = useServerFn(getProjectBaseline);
  const savePlan = useServerFn(saveVerificationPlan);
  const getPlan = useServerFn(getVerificationPlan);
  const saveRound = useServerFn(saveSurveyRound);
  const getRound = useServerFn(getSurveyRound);
  const listRounds = useServerFn(listSurveyRounds);
  const getReference = useServerFn(getSavedOfficialWatercourseReach);
  const polygon = validateProjectPolygon(project.geometry_polygon);
  const reference = useQuery({
    queryKey: ["official-watercourse-reach", actorId, project.id],
    queryFn: () => getReference({ data: { projectId: project.id } }),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const access = useQuery({
    queryKey: ["inspection-access", actorId, project.id],
    queryFn: async () => {
      const value = await getAccess({ data: { projectId: project.id } });
      if (value.userId !== actorId || value.projectId !== project.id)
        throw new Error("Adgangen matcher ikke den aktuelle bruger og sag.");
      return value;
    },
    retry: false,
  });
  const photoAccess = useQuery({
    queryKey: ["inspection-photo-access", actorId, project.id],
    queryFn: async () => {
      const value = await getPhotoAccess({ data: { projectId: project.id } });
      if (value.userId !== actorId || value.projectId !== project.id)
        throw new Error("Billedadgangen matcher ikke den aktuelle bruger og sag.");
      return value;
    },
    retry: false,
  });
  const key = JSON.stringify([
    actorId,
    project.id,
    project.name,
    project.geometry_polygon,
    reference.data?.id,
    reference.data?.zoneId,
    reference.data?.sourceProvider,
    reference.data?.geometry,
    dates,
    selectedRoundId,
  ]);
  const execution = useRef({ key, generation: 0, alive: true });
  if (execution.current.key !== key) {
    execution.current.key = key;
    execution.current.generation++;
  }
  useEffect(() => {
    const value = execution.current;
    value.alive = true;
    return () => {
      value.alive = false;
    };
  }, []);
  const current = () => {
    const generation = execution.current.generation;
    return () =>
      execution.current.alive &&
      execution.current.key === key &&
      execution.current.generation === generation;
  };
  const dependencies = {
    getAccess,
    createBaseline,
    getBaseline,
    savePlan,
    getPlan,
    saveRound,
    getRound,
  };
  const scope = useQuery({
    queryKey: ["inspection-scope", key],
    enabled: polygon.valid && !!reference.data && !reference.error,
    retry: false,
    queryFn: async () => {
      const selected = reference.data!;
      const isCurrent = current();
      const [geometrySha256, referenceSha] = await Promise.all([
        baselineSha256(project.geometry_polygon),
        baselineSha256(selected.geometry),
      ]);
      if (!isCurrent()) throw new Error("Området eller perioden er ændret.");
      return {
        actorId,
        projectId: project.id,
        projectName: project.name,
        geometrySha256,
        reference: {
          id: selected.id,
          zoneId: selected.zoneId,
          geometrySha256: referenceSha,
          ...(selected.sourceProvider ? { sourceProvider: selected.sourceProvider } : {}),
        },
        baselinePeriod: { dateFrom: dates.dateFrom, dateTo: dates.dateTo },
        recordingPeriod: { dateFrom: dates.recordingDate, dateTo: dates.recordingDate },
      };
    },
  });
  const completed = useQuery({
    queryKey: ["inspection-completed", key],
    enabled: !!scope.data && !scope.error && !selectedRoundId,
    retry: false,
    queryFn: () =>
      resumeCompletedStreamInspection(scope.data!, dependencies, {
        storage: localStorage,
        isCurrent: current(),
      }),
  });
  const rounds = useInfiniteQuery({
    queryKey: ["inspection-rounds", actorId, project.id],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      listRounds({ data: { projectId: project.id, beforeVersion: pageParam, limit: 30 } }),
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    enabled: !!access.data && !access.error,
    retry: false,
  });
  const roundOptions = rounds.error ? [] : (rounds.data?.pages.flatMap((page) => page.items) ?? []);
  const selected = useQuery({
    queryKey: ["inspection-selection", actorId, project.id, selectedRoundId],
    enabled: !!selectedRoundId && !!access.data && !access.error,
    retry: false,
    queryFn: async (): Promise<StreamInspectionResult> => {
      const isCurrent = current();
      const fresh = await getAccess({ data: { projectId: project.id } });
      if (!isCurrent() || fresh.userId !== actorId || fresh.projectId !== project.id)
        throw new Error("Brugeren eller sagen er ændret. Genåbn undersøgelsen.");
      const round = await getRound({
        data: { projectId: project.id, roundVersionId: selectedRoundId! },
      });
      if (!isCurrent() || !round || round.id !== selectedRoundId || round.projectId !== project.id)
        throw new Error("Undersøgelsen kunne ikke genåbnes i denne sag.");
      const [snapshot, plan] = await Promise.all([
        getBaseline({ data: { projectId: project.id, snapshotId: round.baselineId } }),
        getPlan({ data: { projectId: project.id, planId: round.planId } }),
      ]);
      if (
        !isCurrent() ||
        !snapshot ||
        !plan ||
        snapshot.id !== round.baselineId ||
        plan.id !== round.planId ||
        snapshot.projectId !== project.id ||
        plan.projectId !== project.id ||
        snapshot.manifestSha256 !== round.baselineSha256 ||
        plan.manifestSha256 !== round.planSha256 ||
        plan.baselineId !== snapshot.id ||
        plan.baselineSha256 !== snapshot.manifestSha256
      )
        throw new Error("Undersøgelsens gemte datagrundlag og spørgsmål stemmer ikke overens.");
      return { snapshot, plan, round };
    },
  });
  const prepare = useMutation({
    mutationFn: async () => {
      if (
        busy.current ||
        !scope.data ||
        !polygon.valid ||
        !reference.isSuccess ||
        reference.isFetching ||
        !access.isSuccess ||
        access.isFetching ||
        !access.data.canPersist
      )
        throw new Error("Vent, indtil område, periode og adgang er bekræftet.");
      busy.current = true;
      const isCurrent = current();
      try {
        localStorage.setItem(
          `gofreyra.inspection-period:${actorId}:${project.id}`,
          JSON.stringify(dates),
        );
        const value = await startStreamInspection(scope.data, dependencies, {
          storage: localStorage,
          isCurrent,
          onProgress: (state) => {
            if (isCurrent()) setProgress(state);
          },
        });
        if (!isCurrent())
          throw new Error(
            "Sagen eller perioden blev ændret under forberedelsen. Dit genforsøg er bevaret.",
          );
        client.setQueryData(["inspection-selection", actorId, project.id, value.round.id], value);
        await client.invalidateQueries({ queryKey: ["inspection-rounds", actorId, project.id] });
        if (isCurrent()) onSelectRound(value.round.id);
        return value;
      } finally {
        busy.current = false;
      }
    },
    retry: false,
  });
  const result =
    selectedRoundId &&
    !access.error &&
    !selected.error &&
    selected.data?.round.id === selectedRoundId
      ? selected.data
      : undefined;
  const geometry = useMemo(
    () =>
      resolveProjectGeometry(
        result
          ? {
              ...project,
              geometry_polygon: result.snapshot.manifest.project.polygon as unknown as Record<
                string,
                unknown
              >,
            }
          : project,
      ),
    [project, result],
  );
  const mapReference = result?.snapshot.manifest.reference ?? reference.data;
  const watercourses = useMemo(
    () =>
      mapReference
        ? {
            type: "FeatureCollection" as const,
            features: [
              {
                type: "Feature" as const,
                properties: { name: mapReference.name },
                geometry: mapReference.geometry,
              },
            ],
          }
        : null,
    [mapReference],
  );
  const failure = [
    reference.error,
    access.error,
    photoAccess.error,
    scope.error,
    completed.error,
    rounds.error,
    selected.error,
    prepare.error,
  ].find(Boolean);
  const error = failure
    ? "Undersøgelsen kunne ikke åbnes eller gemmes. Kontrollér din adgang og det valgte område, og prøv igen."
    : null;
  const canStart =
    polygon.valid &&
    reference.isSuccess &&
    !reference.isFetching &&
    access.isSuccess &&
    !access.isFetching &&
    access.data.canPersist === true &&
    !!scope.data &&
    !scope.error &&
    [dates.recordingDate, dates.dateFrom, dates.dateTo].every(isCalendarDate) &&
    dates.dateFrom <= dates.dateTo;
  const canUpload =
    photoAccess.isSuccess && !photoAccess.isFetching && photoAccess.data.canAssign === true;
  const updateDate = (recordingDate: string) => {
    if (!isCalendarDate(recordingDate)) return;
    setDates({ recordingDate, dateFrom: daysBefore(recordingDate, 29), dateTo: recordingDate });
    setProgress(null);
  };
  const receiveCanonicalBatch = (batch: CanonicalDroneBatch) => {
    if (batch.projectId !== project.id) return;
    const next = {
      ...batch,
      mediaIds:
        intakeBatch?.batchId === batch.batchId
          ? [...new Set([...intakeBatch.mediaIds, ...batch.mediaIds])]
          : batch.mediaIds,
    };
    try {
      savePendingDroneBatch(localStorage, actorId, next);
      setBatchReceiptError(null);
    } catch {
      setBatchReceiptError(
        "Billedserien kan behandles her, men genoptagelse efter navigation kunne ikke gemmes i browseren.",
      );
    }
    setPendingBatch(next);
    setIntakeBatch(next);
    setUploadOpen(false);
  };
  return (
    <div className="space-y-5">
      {(!phase || phase === "billeder") && (
        <Card className="p-5 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Vandløbsundersøgelse
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Fra dronebilleder til gennemgang</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload originalbillederne. Programmet foreslår stedet og spørgsmål fra billederne.
              Bekræft stedet og optagedatoen for at hente offentlige data og samle undersøgelsen.
            </p>
          </div>
          {!phase && (
            <ol aria-label="Undersøgelsens forløb" className="grid gap-2 text-sm sm:grid-cols-4">
              {[
                "1. Tilføj billeder",
                "2. Sted og offentlige data",
                "3. Billeder og spørgsmål",
                "4. Rapportgrundlag",
              ].map((label) => (
                <li key={label} className="rounded-lg border bg-muted/20 p-3">
                  {label}
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              disabled={!canUpload}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              Tilføj dronebilleder
            </button>
            <p className="text-sm text-muted-foreground">
              {photoCount === undefined
                ? "Billedoversigten hentes særskilt."
                : `${photoCount} dronefotos modtaget i sagen`}
            </p>
          </div>
          {photoAccess.isSuccess &&
            !photoAccess.isFetching &&
            photoAccess.data.canAssign === false && (
              <p className="text-sm">
                Du har læseadgang. En projektmedarbejder skal tilføje billederne.
              </p>
            )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </Card>
      )}
      {phase && phase !== "billeder" && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {(!phase || phase === "datagrundlag") && !intakeBatch && pendingBatch && (
        <button
          type="button"
          className="rounded-lg border px-4 py-2 text-sm"
          onClick={() => setIntakeBatch(pendingBatch)}
        >
          Fortsæt med seneste billedserie · {pendingBatch.mediaIds.length} originaler
        </button>
      )}
      {batchReceiptError && (
        <p role="status" className="text-sm text-amber-700">
          {batchReceiptError}
        </p>
      )}
      {(!phase || phase === "billeder") && (
        <SeededOriginalsPanel
          projectId={project.id}
          actorId={actorId}
          canPrepare={canUpload}
          onCanonicalBatch={receiveCanonicalBatch}
        />
      )}
      <DroneBeforeBatchWizard
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        projectId={project.id}
        onImported={() => {
          void onPhotosChanged();
        }}
        onCanonicalBatch={receiveCanonicalBatch}
      />
      {(!phase || phase === "datagrundlag") && (
        <DroneIntakeAssistant
          project={project}
          actorId={actorId}
          batch={intakeBatch}
          onPrepared={(value) => {
            client.setQueryData(
              ["inspection-selection", actorId, project.id, value.round.id],
              value,
            );
            void client.invalidateQueries({ queryKey: ["inspection-rounds", actorId, project.id] });
            void client.invalidateQueries({
              queryKey: ["official-watercourse-reach", actorId, project.id],
            });
            onSelectRound(value.round.id);
          }}
          onPhotosChanged={async () => {
            setInspectionRefresh((value) => value + 1);
            await onPhotosChanged();
          }}
        />
      )}
      {!phase && (
        <DroneImageInspectionPanel
          projectId={project.id}
          actorId={actorId}
          refreshToken={inspectionRefresh}
        />
      )}
      {(!phase || phase === "gennemgang") && result && (
        <PhotoPointVerificationPanel
          key={`${actorId}:${result.round.id}`}
          projectId={project.id}
          actorId={actorId}
          snapshot={result.snapshot}
          roundId={result.round.id}
          canReview={!!access.data?.canPersist && !access.isFetching && !access.error}
          refreshToken={inspectionRefresh}
        />
      )}
      {phase === "gennemgang" && !result && (
        <p className="rounded-lg border p-5">
          Vælg eller forbered en undersøgelse under Datagrundlag for at gennemgå fotopunkterne.
        </p>
      )}
      {(!phase || phase === "datagrundlag") && (
        <details open={!intakeBatch || !!phase}>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Manuel forberedelse og tidligere undersøgelser
          </summary>
          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Sted og periode</h3>
                <p className="text-sm text-muted-foreground">
                  {polygon.valid && reference.data
                    ? `Gemt område · ${reference.data.name}`
                    : "Bekræft den del af vandløbet, undersøgelsen handler om."}
                </p>
              </div>
              <Link
                to="/app/projects/geometry/$slug"
                params={{ slug: project.slug || project.id }}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <MapPin className="h-4 w-4" />
                {polygon.valid && reference.data ? "Se eller ret område" : "Vælg område og vandløb"}
              </Link>
            </div>
            {!selectedRoundId && (
              <>
                <div className="flex flex-wrap items-end gap-4">
                  <label className="text-sm space-y-1">
                    <span className="block font-medium">Undersøgelsens dato</span>
                    <input
                      aria-label="Undersøgelsens dato"
                      type="date"
                      value={dates.recordingDate}
                      onChange={(e) => updateDate(e.target.value)}
                      disabled={prepare.isPending}
                      className="rounded border bg-background p-2"
                    />
                  </label>
                  <p className="text-sm text-muted-foreground">
                    FØR-dokumentation · datagrundlag {dates.dateFrom}–{dates.dateTo}
                  </p>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm underline">
                    Tilpas dataperioden
                  </summary>
                  <p className="my-2 text-sm text-muted-foreground">
                    Forslaget er 30 dage op til undersøgelsesdatoen. Det ændrer ikke billedfilerne
                    eller deres faktiske optagetider.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {(["dateFrom", "dateTo"] as const).map((field) => (
                      <label className="text-sm" key={field}>
                        {field === "dateFrom" ? "Fra" : "Til"}
                        <input
                          type="date"
                          aria-label={
                            field === "dateFrom" ? "Datagrundlag fra" : "Datagrundlag til"
                          }
                          value={dates[field]}
                          onChange={(e) =>
                            setDates((previous) => ({ ...previous, [field]: e.target.value }))
                          }
                          disabled={prepare.isPending}
                          className="ml-2 rounded border bg-background p-2"
                        />
                      </label>
                    ))}
                  </div>
                </details>
                <button
                  type="button"
                  onClick={() => prepare.mutate()}
                  disabled={!canStart || prepare.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {prepare.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {prepare.isPending
                    ? progressLabels[progress ?? "baseline"]
                    : "Hent data og forbered undersøgelse"}
                </button>
                <p className="text-xs text-muted-foreground">
                  Henter kilder, gemmer spørgsmål og opretter en FØR-runde. Ingen billedfortolkning
                  eller faglig godkendelse udføres ved dette trin.
                </p>
                {access.data && !access.data.canPersist && (
                  <p className="text-sm">
                    En projektansvarlig skal forberede en ny undersøgelse. Du kan fortsætte en
                    eksisterende nedenfor.
                  </p>
                )}
              </>
            )}
            {!!completed.data && !selectedRoundId && (
              <button
                type="button"
                className="flex items-center gap-2 text-sm underline"
                onClick={() => onSelectRound(completed.data!.round.id)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Fortsæt den gemte undersøgelse fra denne periode
              </button>
            )}
            {(!!roundOptions.length || !!result) && (
              <label className="block text-sm">
                <span className="block mb-1 font-medium">Fortsæt en gemt undersøgelse</span>
                <select
                  aria-label="Gemt undersøgelse"
                  value={selectedRoundId ?? ""}
                  onChange={(e) => onSelectRound(e.target.value || undefined)}
                  className="w-full rounded border bg-background p-2"
                >
                  <option value="">Ny undersøgelse …</option>
                  {result && !roundOptions.some((round) => round.id === result.round.id) && (
                    <option value={result.round.id}>
                      {result.round.manifest.title} ·{" "}
                      {result.round.manifest.recordingWindow.dateFrom}–
                      {result.round.manifest.recordingWindow.dateTo}
                    </option>
                  )}
                  {roundOptions.map((round) => (
                    <option key={round.id} value={round.id}>
                      {round.title} · {round.recordingWindow.dateFrom}–
                      {round.recordingWindow.dateTo}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {rounds.hasNextPage && (
              <button
                className="text-sm underline"
                disabled={rounds.isFetchingNextPage}
                onClick={() => void rounds.fetchNextPage()}
              >
                Vis ældre undersøgelser
              </button>
            )}
            {selectedRoundId && (
              <button
                type="button"
                className="text-sm underline"
                onClick={() => onSelectRound(undefined)}
              >
                Forbered en ny undersøgelse
              </button>
            )}
          </Card>
        </details>
      )}
      {selected.isFetching && <p role="status">Åbner den valgte undersøgelse …</p>}
      {(!phase || phase === "datagrundlag") && result && (
        <>
          <Card className="p-5 space-y-3">
            <h3 className="text-lg font-semibold">{result.round.manifest.title}</h3>
            <p className="text-sm">
              {result.snapshot.manifest.reference.name} ·{" "}
              {result.round.manifest.recordingWindow.dateFrom}–
              {result.round.manifest.recordingWindow.dateTo}
            </p>
            <p className="text-sm">
              {result.plan.manifest.questions.length} spørgsmål fra datagrundlaget er forberedt.
              {intakeBatch
                ? " Den bekræftede billedserie tilknyttes ovenfor. Se kilder og billedreferencer nedenfor."
                : " Vælg billederne samlet nedenfor, og gennemgå derefter foto og spørgsmål."}
            </p>
            <details>
              <summary className="cursor-pointer text-sm underline">
                Se datagrundlag og mangler
              </summary>
              <ul className="mt-3 space-y-2 text-sm">
                {result.snapshot.manifest.sources.map((source) => (
                  <li key={source.id} className="rounded border p-3">
                    <strong>
                      {source.provider} · {source.dataset}
                    </strong>
                    <p>
                      {source.status === "complete"
                        ? "Kildesvar modtaget — faglig anvendelighed skal vurderes"
                        : "Datagrundlaget er ufuldstændigt"}
                    </p>
                    {source.quality.warnings.map((warning, index) => (
                      <p key={index} className="text-muted-foreground">
                        {warning}
                      </p>
                    ))}
                    {source.error && (
                      <p>
                        Kilden kunne ikke hentes fuldstændigt. Den gemte status bevarer datamanglen.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </Card>
          <InspectionPhotoBatch
            key={`batch:${result.round.id}`}
            round={result.round}
            onAssigned={async () => {
              await client.invalidateQueries({ queryKey: ["survey-round-media"] });
            }}
          />
          {!phase && (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="space-y-2 xl:sticky xl:top-4">
                <h3 className="font-semibold">Stedet, du gennemgår</h3>
                <LiveProjectMap
                  key={result.round.id}
                  geometry={geometry}
                  projectName={project.name}
                  projectId={project.id}
                  watercoursesGeoJSON={watercourses}
                  height={400}
                />
                <p className="text-xs text-muted-foreground">
                  Kortet viser det gemte undersøgelsesområde og den officielle reference. Kameraets
                  GPS fastslår ikke i sig selv placeringen af et synligt fund.
                </p>
              </div>
              <SurveyRoundMediaPanel
                key={result.round.id}
                round={result.round}
                plan={result.plan}
                guided
              />
            </div>
          )}
        </>
      )}
      {!phase && (
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold">Rapport og aflevering</h3>
          <p className="text-sm text-muted-foreground">
            Under Rapport og levering kan du gemme en samlet rapportversion med kilder, fotos og
            svar. Faglig godkendelse og kommunal afgrænsning skal fortsat afklares.
          </p>
          <button
            type="button"
            onClick={onOpenDelivery}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            Saml rapport og se mangler
            <ArrowRight className="h-4 w-4" />
          </button>
        </Card>
      )}
    </div>
  );
}
