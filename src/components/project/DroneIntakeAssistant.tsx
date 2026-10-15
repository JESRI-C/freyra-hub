import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Sparkles } from "lucide-react";
import type { Project } from "@/lib/supabase/types";
import { localizeDroneOriginals } from "@/lib/drone-localization.functions";
import { inspectDroneImage } from "@/lib/drone-image-inspection.functions";
import {
  getSavedOfficialWatercourseReach,
  saveOfficialWatercourseReach,
} from "@/lib/watercourse-reach.functions";
import { createProjectBaseline, getProjectBaseline } from "@/lib/public-baseline.functions";
import { saveVerificationPlan, getVerificationPlan } from "@/lib/verification-plan.functions";
import {
  getSurveyRoundAccess,
  getSurveyRound,
  saveSurveyRound,
} from "@/lib/survey-round.functions";
import {
  getSurveyRoundMediaAccess,
  getSurveyRoundMedia,
  listSurveyRoundMedia,
  saveSurveyRoundMedia,
} from "@/lib/survey-round-media.functions";
import { getProjectById, persistProjectBoundary } from "@/services/projects-service";
import { resolveProjectGeometry, validateProjectPolygon } from "@/services/geo-service";
import {
  isDroneCameraLocationStatus,
  type DroneLocalizationPhoto,
  type DroneLocalizationResult,
} from "@/services/geospatial/drone-localization";
import { Card } from "@/components/ui-bits";
import { LiveProjectMap } from "@/components/maps/LiveProjectMap";
import {
  droneIntakeAiPhotos,
  droneIntakeRecordingDate,
  runDroneIntakeImageChunk,
} from "./drone-intake-run";
import { prepareConfirmedDroneIntake } from "./drone-intake-prepare";
import { bindConfirmedDroneIntakePhotos } from "./drone-intake-binding";
import { droneIntakeAreaAssessment, droneIntakeEffectiveReference } from "./drone-intake-area";
import type { StreamInspectionProgress, StreamInspectionResult } from "./stream-inspection-start";

export interface DroneIntakeBatch {
  projectId: string;
  batchId: string;
  mediaIds: string[];
  receivedCount: number;
}
interface Props {
  project: Project;
  actorId: string;
  batch?: DroneIntakeBatch;
  onPrepared(result: StreamInspectionResult): void;
  onPhotosChanged(): void | Promise<unknown>;
}
const searchLabels: Record<string, string> = {
  truncated: "Kildesøgningen er ufuldstændig; vælg strækningen på kortet.",
  unavailable:
    "Vandløbskilden kunne ikke hentes. Prøv lokalisering igen eller vælg stedet manuelt.",
  isolated: "Dette foto ligger alene et andet sted. Det indgår ikke i hovedområdets forslag.",
  too_broad: "Billederne dækker et stort område. Del dem i mindre strækninger.",
  call_limit:
    "En anden billedgruppe. Vælg dens fotos i en særskilt serie for at hente lokale data.",
};
const stageLabels: Record<StreamInspectionProgress, string> = {
  baseline: "Henter offentlige data …",
  plan: "Forbereder spørgsmål fra datagrundlaget …",
  round: "Gemmer undersøgelsen …",
  complete: "Undersøgelsen er forberedt",
};
function message(error: unknown) {
  return error instanceof Error ? error.message : "Behandlingen blev ikke færdig. Prøv igen.";
}

export function DroneIntakeAssistant(props: Props) {
  if (!props.batch || props.batch.mediaIds.length === 0) return null;
  if (props.batch.projectId !== props.project.id)
    return (
      <p role="alert">
        Billedserien tilhører en anden sag. Åbn den rigtige sag, før du fortsætter.
      </p>
    );
  return (
    <Intake
      key={`${props.actorId}:${props.project.id}:${props.batch.batchId}:${props.batch.mediaIds.join(",")}`}
      {...props}
      batch={props.batch}
    />
  );
}

function Intake({
  project,
  actorId,
  batch,
  onPrepared,
  onPhotosChanged,
}: Props & { batch: DroneIntakeBatch }) {
  const [localization, setLocalization] = useState<DroneLocalizationResult | null>(null);
  const [localizing, setLocalizing] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [nextIndex, setNextIndex] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [skippedPhotos, setSkippedPhotos] = useState<Array<{ mediaId: string; fileName: string }>>(
    [],
  );
  const [clusterId, setClusterId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [useProposedArea, setUseProposedArea] = useState(false);
  const [recordingDate, setRecordingDate] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [includeUnlocated, setIncludeUnlocated] = useState(false);
  const [prepared, setPrepared] = useState<{
    result: StreamInspectionResult;
    photos: DroneLocalizationPhoto[];
  } | null>(null);
  const [bindingsComplete, setBindingsComplete] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const localize = useServerFn(localizeDroneOriginals),
    inspect = useServerFn(inspectDroneImage);
  const getAccess = useServerFn(getSurveyRoundAccess),
    getReference = useServerFn(getSavedOfficialWatercourseReach),
    saveReference = useServerFn(saveOfficialWatercourseReach);
  const createBaseline = useServerFn(createProjectBaseline),
    getBaseline = useServerFn(getProjectBaseline),
    savePlan = useServerFn(saveVerificationPlan),
    getPlan = useServerFn(getVerificationPlan),
    saveRound = useServerFn(saveSurveyRound),
    getRound = useServerFn(getSurveyRound);
  const getMediaAccess = useServerFn(getSurveyRoundMediaAccess),
    getMedia = useServerFn(getSurveyRoundMedia),
    listMedia = useServerFn(listSurveyRoundMedia),
    saveMedia = useServerFn(saveSurveyRoundMedia);
  const identity = `${actorId}:${project.id}:${batch.batchId}:${batch.mediaIds.join(",")}`;
  const lifetime = useRef({ alive: true, generation: 0, identity });
  const imageBusy = useRef(false),
    locationBusy = useRef(false),
    prepareBusy = useRef(false),
    cursor = useRef(0);
  const actions = useRef({ auto: async () => {} });
  const current = () => {
    const generation = lifetime.current.generation;
    return () =>
      lifetime.current.alive &&
      lifetime.current.identity === identity &&
      lifetime.current.generation === generation;
  };
  const savedProject = useQuery({
    queryKey: ["drone-intake-project", actorId, project.id],
    queryFn: () => getProjectById(project.id),
    retry: false,
    staleTime: 0,
  });
  const savedReference = useQuery({
    queryKey: ["official-watercourse-reach", actorId, project.id],
    queryFn: () => getReference({ data: { projectId: project.id } }),
    retry: false,
    staleTime: 0,
  });
  const access = useQuery({
    queryKey: ["inspection-access", actorId, project.id],
    queryFn: async () => {
      const value = await getAccess({ data: { projectId: project.id } });
      if (value.userId !== actorId || value.projectId !== project.id)
        throw new Error("Adgangen matcher ikke denne bruger og sag.");
      return value;
    },
    retry: false,
  });
  const displayedProject = savedProject.data ?? project;
  const hasExistingArea = validateProjectPolygon(displayedProject.geometry_polygon).valid;
  const cluster =
    localization?.clusters.find((item) => item.id === clusterId) ?? localization?.clusters[0];
  const usingProposedArea = !hasExistingArea || useProposedArea;
  const effectiveReferenceId = droneIntakeEffectiveReference({
    explicitReferenceId: referenceId,
    savedReferenceId: savedReference.data?.id,
    suggestedReferenceId: cluster?.suggestedReferenceId,
    useProposedArea: usingProposedArea,
  });
  const selectedReference =
    savedReference.data?.id === effectiveReferenceId
      ? savedReference.data
      : cluster?.candidates.find((candidate) => candidate.reference.id === effectiveReferenceId)
          ?.reference;
  const proposedArea =
    (!hasExistingArea || useProposedArea) && cluster ? cluster.suggestedPolygon : null;
  const selectedPhotos =
    localization?.photos.filter(
      (photo) =>
        cluster?.mediaIds.includes(photo.mediaId) ||
        (includeUnlocated &&
          hasExistingArea &&
          !useProposedArea &&
          !isDroneCameraLocationStatus(photo.status)),
    ) ?? [];
  const dateConfirmationCount = selectedPhotos.filter(
    (photo) => photo.status === "date_confirmation_required",
  ).length;
  const areaAssessment = droneIntakeAreaAssessment(
    usingProposedArea ? cluster?.suggestedPolygon : displayedProject.geometry_polygon,
    selectedPhotos,
  );
  const aiPhotos = prepared ? droneIntakeAiPhotos(prepared.photos) : [];
  const oversizedCount = prepared ? prepared.photos.length - aiPhotos.length : 0;
  const mapGeometry = useMemo(
    () =>
      resolveProjectGeometry({
        ...displayedProject,
        ...(proposedArea ? { geometry_polygon: proposedArea } : {}),
      }),
    [displayedProject, proposedArea],
  );
  const watercourses = useMemo(
    () =>
      selectedReference
        ? {
            type: "FeatureCollection" as const,
            features: [
              {
                type: "Feature" as const,
                properties: { navn: selectedReference.name },
                geometry: selectedReference.geometry,
              },
            ],
          }
        : null,
    [selectedReference],
  );
  const preparationKey = JSON.stringify([
    identity,
    displayedProject.geometry_polygon,
    savedReference.data?.zoneId,
    cluster?.id,
    useProposedArea,
    effectiveReferenceId,
    recordingDate,
    includeUnlocated,
  ]);
  const preparationKeyRef = useRef(preparationKey);
  preparationKeyRef.current = preparationKey;

  async function locate(isCurrent = current()) {
    if (!isCurrent() || locationBusy.current) return;
    locationBusy.current = true;
    setLocalizing(true);
    setLocationError(null);
    try {
      const result = await localize({
        data: { projectId: project.id, mediaIds: batch.mediaIds, expectedCallerUserId: actorId },
      });
      if (!isCurrent()) return;
      if (
        result.actorId !== actorId ||
        result.projectId !== project.id ||
        result.photos.length !== batch.mediaIds.length ||
        result.photos.some((photo) => !batch.mediaIds.includes(photo.mediaId))
      )
        throw new Error("Stedforslaget matcher ikke denne billedserie og bruger.");
      setLocalization(result);
      setClusterId(result.clusters[0]?.id ?? "");
      setReferenceId("");
      setIncludeUnlocated(false);
      setRecordingDate(droneIntakeRecordingDate(result) ?? "");
    } catch (error) {
      if (isCurrent()) setLocationError(message(error));
    } finally {
      locationBusy.current = false;
      if (isCurrent()) setLocalizing(false);
    }
  }
  async function analyze(fixed = prepared, isCurrent = current()) {
    const eligible = fixed ? droneIntakeAiPhotos(fixed.photos) : [];
    if (!fixed || !isCurrent() || imageBusy.current || cursor.current >= eligible.length) return;
    imageBusy.current = true;
    setAnalyzing(true);
    setImageError(null);
    try {
      const result = await runDroneIntakeImageChunk(
        {
          actorId,
          projectId: project.id,
          batchId: batch.batchId,
          mediaIds: eligible.map((photo) => photo.mediaId),
          baselineSnapshotId: fixed.result.snapshot.id,
          baselineSha256: fixed.result.snapshot.manifestSha256,
        },
        inspect,
        {
          storage: localStorage,
          startIndex: cursor.current,
          isCurrent,
          onCompleted: (_mediaId, index) => {
            if (!isCurrent()) return;
            cursor.current = index;
            setNextIndex(index);
            setCompletedCount((count) => count + 1);
            void Promise.resolve()
              .then(onPhotosChanged)
              .catch(() => undefined);
          },
        },
      );
      if (!isCurrent()) return;
      cursor.current = result.nextIndex;
      setNextIndex(result.nextIndex);
      if (result.busyMediaId)
        setImageError(
          "Et foto behandles allerede. Vent et øjeblik og fortsæt samme analyseforsøg.",
        );
    } catch (error) {
      if (isCurrent()) setImageError(message(error));
    } finally {
      imageBusy.current = false;
      if (isCurrent()) setAnalyzing(false);
    }
  }
  function skipFailedPhoto() {
    if (
      !prepared ||
      !bindingsComplete ||
      !imageError ||
      imageBusy.current ||
      cursor.current >= aiPhotos.length
    )
      return;
    const skipped = aiPhotos[cursor.current];
    setSkippedPhotos((previous) => [
      ...previous,
      { mediaId: skipped.mediaId, fileName: skipped.fileName },
    ]);
    cursor.current++;
    setNextIndex(cursor.current);
    setImageError(null);
    if (cursor.current < aiPhotos.length) void analyze(prepared);
  }
  actions.current.auto = async () => {
    const isCurrent = current();
    await locate(isCurrent);
  };
  useEffect(() => {
    const lifecycle = lifetime.current;
    lifecycle.alive = true;
    lifecycle.identity = identity;
    const generation = ++lifecycle.generation;
    // Strict Mode's discarded mount cannot start a provider request.
    queueMicrotask(() => {
      if (lifecycle.alive && lifecycle.generation === generation) void actions.current.auto();
    });
    return () => {
      lifecycle.alive = false;
      lifecycle.generation++;
    };
  }, [identity]);

  async function bindPhotos(
    fixed: { result: StreamInspectionResult; photos: DroneLocalizationPhoto[] },
    isCurrent = current(),
  ) {
    const batchResult = await bindConfirmedDroneIntakePhotos(
      { actorId, round: fixed.result.round, photos: fixed.photos },
      {
        getAccess: getMediaAccess,
        listBindings: listMedia,
        getBinding: getMedia,
        saveBinding: saveMedia,
      },
      {
        storage: localStorage,
        isCurrent,
        onProgress: (confirmed, total) => {
          if (isCurrent()) setStage(`Tilknytter billeder: ${confirmed} af ${total} …`);
        },
      },
    );
    if (!isCurrent()) return;
    if (batchResult.entries.some((entry) => entry.status !== "confirmed"))
      throw new Error(
        "Et foto har allerede en anden tilknytning. Den bevares. Undersøgelsen er gemt; gennemgå konflikten i rundens billedtilknytning.",
      );
    setBindingsComplete(true);
    setStage(
      `${fixed.photos.length} fotos er tilknyttet den gemte undersøgelse. Fortsæt med spørgsmålene nedenfor.`,
    );
    await Promise.resolve()
      .then(onPhotosChanged)
      .catch(() => undefined);
    if (isCurrent() && cursor.current === 0) await analyze(fixed, isCurrent);
  }

  async function prepare() {
    if (prepareBusy.current || prepared) return;
    const alive = current(),
      expectedKey = preparationKey;
    const isCurrent = () => alive() && preparationKeyRef.current === expectedKey;
    prepareBusy.current = true;
    setPreparing(true);
    setPreparationError(null);
    setStage("Bekræfter sted og optagedato …");
    try {
      if (
        !savedProject.data ||
        savedProject.data.id !== project.id ||
        savedProject.error ||
        savedReference.error ||
        savedReference.isPending ||
        !selectedPhotos.length
      )
        throw new Error("Bekræft sagens sted og hvilke billeder, der hører til området.");
      const result = await prepareConfirmedDroneIntake(
        {
          actorId,
          project: savedProject.data,
          savedReference: savedReference.data ?? null,
          proposedPolygon: cluster?.suggestedPolygon ?? null,
          useProposedArea: !hasExistingArea || useProposedArea,
          referenceId: effectiveReferenceId,
          recordingDate,
          photos: selectedPhotos,
        },
        {
          getProject: getProjectById,
          getReference: (projectId) => getReference({ data: { projectId } }),
          persistBoundary: (projectId, polygon) =>
            persistProjectBoundary(projectId, { polygon, source: "drone_camera_search_confirmed" }),
          saveReference: (projectId, watercourseId) =>
            saveReference({ data: { projectId, watercourseId } }),
          inspection: {
            getAccess,
            createBaseline,
            getBaseline,
            savePlan,
            getPlan,
            saveRound,
            getRound,
          },
        },
        {
          storage: localStorage,
          isCurrent,
          onProgress: (value) => {
            if (isCurrent()) setStage(stageLabels[value]);
          },
        },
      );
      if (!isCurrent()) return;
      const fixed = { result, photos: selectedPhotos.map((photo) => ({ ...photo })) };
      setPrepared(fixed);
      onPrepared(result);
      await bindPhotos(fixed, alive);
      if (alive())
        void queryClient.invalidateQueries({
          queryKey: ["official-watercourse-reach", actorId, project.id],
        });
    } catch (error) {
      if (alive()) {
        setPreparationError(message(error));
        void queryClient.invalidateQueries({
          queryKey: ["drone-intake-project", actorId, project.id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["official-watercourse-reach", actorId, project.id],
        });
      }
    } finally {
      prepareBusy.current = false;
      if (alive()) setPreparing(false);
    }
  }
  async function retryBindings() {
    if (!prepared || prepareBusy.current) return;
    const isCurrent = current();
    prepareBusy.current = true;
    setPreparing(true);
    setPreparationError(null);
    try {
      await bindPhotos(prepared, isCurrent);
    } catch (error) {
      if (isCurrent()) setPreparationError(message(error));
    } finally {
      prepareBusy.current = false;
      if (isCurrent()) setPreparing(false);
    }
  }

  return (
    <Card>
      <div className="space-y-5">
        <div className="flex gap-3">
          <Sparkles className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">Billederne er modtaget — vi forbereder næste skridt</h3>
            <p className="text-sm text-muted-foreground">
              {batch.mediaIds.length} kontrollerede originaler i denne serie. Programmet foreslår
              først stedet. Når du har bekræftet det, hentes offentlige data, og billederne bruges
              til at stille konkrete spørgsmål.
            </p>
            {batch.receivedCount > batch.mediaIds.length && (
              <p className="text-sm text-amber-700">
                {batch.receivedCount - batch.mediaIds.length} modtagne filer afventer
                originalkontrol og indgår endnu ikke.
              </p>
            )}
          </div>
        </div>
        <div aria-live="polite" className="rounded-lg border p-3 text-sm">
          <p>
            {localizing
              ? "Finder kamerapositioner og nærliggende vandløb …"
              : `${localization?.photos.filter((photo) => isDroneCameraLocationStatus(photo.status)).length ?? 0} fotos med kameraposition til stedforslag.`}
          </p>
          <p>
            {!prepared || !bindingsComplete
              ? "Billed-AI starter efter bekræftet sted, datagrundlag og billedtilknytning."
              : analyzing
                ? `Billed-AI arbejder: ${completedCount} af ${aiPhotos.length} gennemgået …`
                : `${completedCount} af ${aiPhotos.length} billedudkast gennemgået i denne arbejdsgang.`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            De første 12 tilknyttede fotos gennemgås automatisk efter datagrundlaget. Flere
            fortsættes i hold på 12. Udkast og spørgsmål skal gennemgås fagligt.
          </p>
        </div>
        {locationError && (
          <p role="alert" className="text-sm text-destructive">
            {locationError}
          </p>
        )}
        {imageError && (
          <p role="alert" className="text-sm text-destructive">
            {imageError}
          </p>
        )}
        {oversizedCount > 0 && (
          <p className="text-sm text-amber-700">
            {oversizedCount} originaler afventer billedanalyse på grund af grænsen på 20 MB. De er
            tilknyttet undersøgelsen og bevares til manuel gennemgang.
          </p>
        )}
        {skippedPhotos.length > 0 && (
          <p className="text-sm text-amber-700">
            {skippedPhotos.length} fotos er sprunget over i denne arbejdsgang og afventer
            gennemgang: {skippedPhotos.map((photo) => photo.fileName).join(", ")}.
          </p>
        )}
        {prepared &&
          bindingsComplete &&
          !analyzing &&
          !localizing &&
          nextIndex < aiPhotos.length && (
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() => void analyze()}
            >
              {imageError
                ? "Fortsæt billedanalysen"
                : `Analyser de næste ${Math.min(12, aiPhotos.length - nextIndex)} fotos`}
            </button>
          )}
        {prepared &&
          bindingsComplete &&
          imageError &&
          !analyzing &&
          nextIndex < aiPhotos.length && (
            <button
              type="button"
              className="ml-2 rounded-lg border px-3 py-2 text-sm"
              onClick={skipFailedPhoto}
            >
              Spring dette foto over og fortsæt
            </button>
          )}
        {!localizing && !prepared && (
          <button
            type="button"
            className="ml-2 rounded-lg border px-3 py-2 text-sm"
            disabled={preparing}
            onClick={() => void locate()}
          >
            Prøv lokalisering igen
          </button>
        )}
        {localization?.photos.some((photo) => !isDroneCameraLocationStatus(photo.status)) && (
          <details className="text-sm">
            <summary>Fotos, der kræver hjælp med stedet</summary>
            <ul className="mt-2 space-y-1">
              {localization.photos
                .filter((photo) => !isDroneCameraLocationStatus(photo.status))
                .map((photo) => (
                  <li key={photo.mediaId}>
                    <strong>{photo.fileName}:</strong> {photo.reason}
                  </li>
                ))}
            </ul>
          </details>
        )}
        {localization && !localization.clusters.length && (
          <p className="text-sm">
            Stedet kan ikke udledes sikkert fra denne serie. Brug sagens gemte område, eller{" "}
            <Link
              to="/app/projects/geometry/$slug"
              params={{ slug: project.id }}
              className="underline"
            >
              vælg området og vandløbet på kortet
            </Link>
            .
          </p>
        )}
        {localization && (
          <fieldset disabled={preparing || !!prepared} className="space-y-4">
            <legend className="mb-2 font-medium">
              <MapPin className="mr-1 inline h-4 w-4" />
              Bekræft sted og optagedato
            </legend>
            {localization.clusters.length > 1 && (
              <label className="block text-sm">
                Billedgruppe
                <select
                  className="mt-1 block w-full rounded-md border bg-background p-2"
                  value={cluster?.id ?? ""}
                  onChange={(event) => {
                    setClusterId(event.target.value);
                    setReferenceId("");
                  }}
                >
                  {localization.clusters.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      Område {index + 1} — {item.mediaIds.length} fotos
                      {item.isolated ? " — ligger alene" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {cluster && searchLabels[cluster.searchStatus] && (
              <p className="text-sm text-amber-700">{searchLabels[cluster.searchStatus]}</p>
            )}
            {!!cluster?.excludedCandidateCount && (
              <p className="text-xs text-muted-foreground">
                {cluster.excludedCandidateCount} kildeposter er udeladt fra forslagene, fordi deres
                type, status eller primære navn ikke opfylder kravene til en aktuel officiel
                vandløbsreference.
              </p>
            )}
            {hasExistingArea && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useProposedArea}
                  disabled={!cluster}
                  onChange={(event) => {
                    setUseProposedArea(event.target.checked);
                    setReferenceId("");
                  }}
                />
                <span>
                  Brug kameraernes foreslåede søgeområde i stedet for sagens gemte område. Det gemte
                  område bruges, når feltet ikke er valgt.
                </span>
              </label>
            )}
            {areaAssessment.outsideCount > 0 && (
              <p role="alert" className="text-sm text-amber-700">
                {areaAssessment.outsideCount} af de valgte fotos har kameraposition uden for det
                valgte område. Der hentes ikke data, før du vælger kameraernes foreslåede søgeområde
                eller retter området på kortet. Kamerapositionen er ikke billedets dækningsområde;
                sammenhængen skal stadig gennemgås fagligt.
              </p>
            )}
            {hasExistingArea &&
              !useProposedArea &&
              localization.photos.some((photo) => !isDroneCameraLocationStatus(photo.status)) && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeUnlocated}
                    onChange={(event) => setIncludeUnlocated(event.target.checked)}
                  />
                  <span>
                    Jeg bekræfter, at seriens{" "}
                    {
                      localization.photos.filter(
                        (photo) => !isDroneCameraLocationStatus(photo.status),
                      ).length
                    }{" "}
                    fotos uden sikker position også er fra sagens gemte område og skal tilknyttes.
                  </span>
                </label>
              )}
            {(hasExistingArea || cluster) && (
              <>
                <p className="text-xs text-muted-foreground">
                  Kortet viser{" "}
                  {proposedArea
                    ? "et søgeområde omkring kameraernes positioner"
                    : "sagens gemte område"}
                  . Kamerapositioner og søgeområde er ikke billedets dækningsområde eller en
                  godkendt kommunal delstrækning.
                </p>
                <LiveProjectMap
                  geometry={mapGeometry}
                  projectName={project.name}
                  projectId={project.id}
                  height={240}
                  watercoursesGeoJSON={watercourses}
                />
              </>
            )}
            <label className="block text-sm">
              Vandløb
              <select
                className="mt-1 block w-full rounded-md border bg-background p-2"
                value={effectiveReferenceId}
                onChange={(event) => setReferenceId(event.target.value)}
              >
                <option value="">Vælg vandløb — flere muligheder kræver dit valg</option>
                {savedReference.data && (
                  <option value={savedReference.data.id}>
                    {savedReference.data.name} — sagens gemte reference
                  </option>
                )}
                {cluster?.candidates
                  .filter((candidate) => candidate.reference.id !== savedReference.data?.id)
                  .map((candidate) => (
                    <option key={candidate.reference.id} value={candidate.reference.id}>
                      {candidate.reference.name} — cirka {candidate.distanceM} m fra kameraerne
                      {cluster.suggestedReferenceId === candidate.reference.id
                        ? " — foreslået"
                        : ""}
                    </option>
                  ))}
              </select>
            </label>
            {selectedReference && (
              <p className="text-xs text-muted-foreground">{selectedReference.disclaimer}</p>
            )}
            <Link
              to="/app/projects/geometry/$slug"
              params={{ slug: project.id }}
              className="block text-sm underline"
            >
              Vælg eller ret område og vandløb på kortet
            </Link>
            <label className="block text-sm">
              Optagedato
              <input
                type="date"
                className="mt-1 block rounded-md border bg-background p-2"
                value={recordingDate}
                onChange={(event) => setRecordingDate(event.target.value)}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Datoen foreslås fra originalerne, når billederne har samme kalenderdato. Kontrollér
                datoen, før du bekræfter. Offentlige data hentes for de 30 kalenderdage frem til din
                valgte dato.
              </span>
            </label>
            {dateConfirmationCount > 0 && (
              <p className="text-sm text-amber-700">
                {dateConfirmationCount} fotos har GPS og et lokalt optagetidspunkt uden tidszone.
                GPS bruges kun til stedforslaget. Bekræft den lokale optagedato ovenfor; UTC-tiden
                forbliver ukendt, og originalernes kontrolstatus ændres ikke.
              </p>
            )}
            <p className="text-sm">
              {selectedPhotos.length} af seriens {batch.mediaIds.length} fotos tilknyttes denne
              undersøgelse. Fotos fra andre billedgrupper indgår ikke.
            </p>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              disabled={
                localizing ||
                !effectiveReferenceId ||
                !recordingDate ||
                !selectedPhotos.length ||
                areaAssessment.outsideCount > 0 ||
                (!hasExistingArea && !cluster) ||
                !access.data?.canPersist ||
                savedProject.isPending ||
                savedReference.isPending
              }
              onClick={() => void prepare()}
            >
              {preparing && <Loader2 className="h-4 w-4 animate-spin" />}
              {preparing
                ? stage
                : dateConfirmationCount > 0
                  ? "Bekræft sted og lokal optagedato, hent data og tilknyt billeder"
                  : "Bekræft sted, hent data og tilknyt billeder"}
            </button>
            {access.data && !access.data.canPersist && (
              <p className="text-sm">
                En projektleder eller redaktør skal bekræfte stedet og hente datagrundlaget.
              </p>
            )}
          </fieldset>
        )}
        {preparationError && (
          <p role="alert" className="text-sm text-destructive">
            {preparationError}
          </p>
        )}
        {prepared && !bindingsComplete && !preparing && (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => void retryBindings()}
          >
            Fortsæt billedtilknytningen til den gemte undersøgelse
          </button>
        )}
        {stage && !preparing && !preparationError && (
          <p className="text-sm text-green-700">{stage}</p>
        )}
      </div>
    </Card>
  );
}
