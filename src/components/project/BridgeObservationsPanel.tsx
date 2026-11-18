import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  BRIDGE_TYPES,
  bridgeObservationInsert,
  compareBridgeObservations,
} from "@/lib/bridge-observation";
import {
  listBridgeObservations,
  saveBridgeObservation,
} from "@/services/bridge-observation-service";
import { loadReportSources } from "@/services/report-document-service";
import { MAX_FIELD_PHOTO_BYTES } from "@/lib/field-photo-upload";
import type { prepareOfflinePhoto } from "@/services/field-offline-service";

const FieldMap = lazy(() =>
  import("@/components/maps/MapEditorMap").then(({ MapEditorMap }) => ({ default: MapEditorMap })),
);
const field = "mt-1 block min-h-11 w-full rounded-md border bg-background px-3 py-2";
type PendingPhoto = {
  file: File;
  prepared?: Awaited<ReturnType<typeof prepareOfflinePhoto>>;
};

export function BridgeObservationsPanel({
  projectId,
  actorId,
  canEdit,
}: {
  projectId: string;
  actorId: string;
  canEdit: boolean;
}) {
  const cache = useQueryClient();
  const key = ["bridge-observations", actorId, projectId];
  const observations = useQuery({
    queryKey: key,
    queryFn: () => listBridgeObservations(projectId, actorId),
  });
  const photoKey = ["bridge-originals", actorId, projectId];
  const photos = useQuery({
    queryKey: photoKey,
    queryFn: () => loadReportSources(projectId),
    enabled: canEdit,
  });
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [positionStatus, setPositionStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [formError, setFormError] = useState("");
  const [observationId, setObservationId] = useState<string>();
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<{ id: string; title: string }[]>([]);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);
  const activeUpload = useRef<AbortController | null>(null);
  const locationRequest = useRef(0);
  useEffect(
    () => () => {
      activeUpload.current?.abort();
      locationRequest.current++;
    },
    [],
  );
  const save = useMutation({
    mutationFn: (input: ReturnType<typeof bridgeObservationInsert>) =>
      saveBridgeObservation(input, actorId),
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
  });
  const originals = [
    ...capturedPhotos,
    ...(photos.data?.filter(
      (s) =>
        s.id.startsWith("media:") &&
        s.checksum &&
        s.mimeType?.startsWith("image/") &&
        !capturedPhotos.some(({ id }) => id === s.id),
    ) ?? []),
  ];
  const points = useMemo(
    () =>
      (observations.data ?? [])
        .flatMap((row) => {
          if (
            row.latitude === null ||
            row.longitude === null ||
            Math.abs(row.latitude) > 90 ||
            Math.abs(row.longitude) > 180
          )
            return [];
          const metadata =
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? row.metadata
              : {};
          return [
            {
              id: row.id,
              objectId: typeof metadata.objectId === "string" ? metadata.objectId : row.id,
              observedAt: row.observed_at,
              notes: row.notes,
              lat: row.latitude,
              lng: row.longitude,
            },
          ];
        })
        .sort(compareBridgeObservations)
        .map((row, index) => ({ ...row, label: row.objectId, visitNumber: index + 1 })),
    [observations.data],
  );

  const bounds = useMemo(
    () => points.map(({ lat, lng }): [number, number] => [lat, lng]),
    [points],
  );

  function locate() {
    if (!navigator.geolocation) {
      setPositionStatus("GPS er utilgængelig. Indtast positionen manuelt.");
      return;
    }
    const request = ++locationRequest.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request !== locationRequest.current) return;
        setLat(String(coords.latitude));
        setLng(String(coords.longitude));
        setAccuracy(coords.accuracy);
        setLocating(false);
        setPositionStatus(
          `Position registreret med cirka ${Math.round(coords.accuracy)} m nøjagtighed.`,
        );
      },
      () => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        setPositionStatus("GPS-positionen kunne ikke hentes. Indtast positionen manuelt.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function sendPhoto(photo: PendingPhoto) {
    if (!canEdit || activeUpload.current || selectedPhotoIds.length >= 12) return;
    const controller = new AbortController();
    activeUpload.current = controller;
    setPendingPhoto(photo);
    setPhotoError("");
    setPhotoProgress(0);
    try {
      const { prepareOfflinePhoto } = await import("@/services/field-offline-service");
      const { uploadQueuedBridgePhoto } = await import("@/services/bridge-photo-queue-service");
      const title =
        photo.file.name
          .replace(/\.[^.]+$/, "")
          .slice(0, 160)
          .trim() || "Brofoto";
      const prepared =
        photo.prepared ?? (await prepareOfflinePhoto(actorId, projectId, photo.file, title, ""));
      if (controller.signal.aborted) return;
      setPendingPhoto({ file: photo.file, prepared });
      const uploaded = await uploadQueuedBridgePhoto(
        prepared,
        photo.file,
        controller.signal,
        setPhotoProgress,
      );
      if (controller.signal.aborted) return;
      const id = `media:${uploaded.id}`;
      setCapturedPhotos((items) => [{ id, title }, ...items]);
      setSelectedPhotoIds((ids) => [...ids, id]);
      setPendingPhoto(null);
      void cache.invalidateQueries({ queryKey: photoKey });
    } catch (err) {
      if (!controller.signal.aborted)
        setPhotoError(err instanceof Error ? err.message : "Fotoet kunne ikke verificeres.");
    } finally {
      activeUpload.current = null;
      if (!controller.signal.aborted) setPhotoProgress(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || save.isPending || locating || pendingPhoto || activeUpload.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setFormError("");
    try {
      if (selectedPhotoIds.some((id) => !originals.some((photo) => photo.id === id)))
        throw new Error("En valgt original er ikke længere tilgængelig.");
      const id = observationId ?? crypto.randomUUID();
      const input = bridgeObservationInsert(
        {
          objectId: data.get("objectId"),
          structureType: data.get("structureType"),
          latitude: lat.trim() ? Number(lat) : NaN,
          longitude: lng.trim() ? Number(lng) : NaN,
          accuracyM: accuracy,
          materials: data.get("materials"),
          dimensions: data.get("dimensions"),
          conditions: data.get("conditions"),
          photoSourceIds: selectedPhotoIds,
        },
        projectId,
        actorId,
        id,
      );
      setObservationId(id);
      await save.mutateAsync(input);
      form.reset();
      setLat("");
      setLng("");
      setAccuracy(null);
      setSelectedPhotoIds([]);
      setPositionStatus("");
      setObservationId(undefined);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Registreringen kunne ikke gemmes. Genindlæs registeret før et nyt forsøg.",
      );
    }
  }

  return (
    <section
      aria-label="Broer og rørunderføringer"
      className="min-w-0 space-y-4 rounded-xl border bg-card p-4"
    >
      <h3 className="font-semibold">Broer og rørunderføringer</h3>
      <p className="text-sm text-muted-foreground">
        Registrér synlige forhold. Bæreevne og konstruktionssikkerhed kræver en særskilt faglig
        vurdering.
      </p>
      {canEdit && (
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={save.isPending} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Objekt-ID
                <input required maxLength={100} name="objectId" className={field} />
              </label>
              <label>
                Type
                <select name="structureType" className={field}>
                  {Object.entries(BRIDGE_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button type="button" variant="outline" disabled={locating} onClick={locate}>
              Brug min GPS-position
            </Button>
            {positionStatus && (
              <p role="status" className="text-sm">
                {positionStatus}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Breddegrad
                <input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  required
                  className={field}
                  value={lat}
                  onChange={(e) => {
                    locationRequest.current++;
                    setLocating(false);
                    setLat(e.target.value);
                    setAccuracy(null);
                    setPositionStatus("");
                  }}
                />
              </label>
              <label>
                Længdegrad
                <input
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  required
                  className={field}
                  value={lng}
                  onChange={(e) => {
                    locationRequest.current++;
                    setLocating(false);
                    setLng(e.target.value);
                    setAccuracy(null);
                    setPositionStatus("");
                  }}
                />
              </label>
              <label>
                Synlige materialer
                <input name="materials" maxLength={500} className={field} />
              </label>
              <label>
                Synlige dimensioner og enhed
                <input name="dimensions" maxLength={500} className={field} />
              </label>
            </div>
            <label className="block">
              Synlige forhold, fx erosion eller tilstopning
              <textarea required name="conditions" maxLength={2000} rows={3} className={field} />
            </label>
            <label className="block">
              Tag eller vælg et foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className={field}
                disabled={pendingPhoto !== null || selectedPhotoIds.length >= 12}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  if (
                    !file.type.startsWith("image/") ||
                    !file.size ||
                    file.size > MAX_FIELD_PHOTO_BYTES
                  ) {
                    setPhotoError("Vælg et originalfoto på højst 50 MB.");
                    return;
                  }
                  void sendPhoto({ file });
                }}
              />
            </label>
            {pendingPhoto && photoProgress !== null && (
              <p role="status">
                {photoProgress >= 100
                  ? "Verificerer originalen…"
                  : `Overfører foto · ${Math.round(photoProgress)} %`}
              </p>
            )}
            {photoError && <p role="alert">{photoError}</p>}
            {photoError && (
              <a
                className="block text-sm underline"
                href={`/felt?project=${encodeURIComponent(projectId)}`}
              >
                Åbn feltfotokøen for sagen
              </a>
            )}
            {pendingPhoto && photoProgress === null && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void sendPhoto(pendingPhoto)}
                >
                  Prøv samme foto igen
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPendingPhoto(null);
                    setPhotoError("");
                  }}
                >
                  Fortsæt uden dette foto
                </Button>
              </div>
            )}
            {originals.length > 0 && (
              <fieldset disabled={pendingPhoto !== null}>
                <legend>Tilknyt verificerede fotos fra sagen (op til 12)</legend>
                <div className="max-h-48 overflow-y-auto rounded-md border px-3">
                  {originals.map((photo) => (
                    <label key={photo.id} className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedPhotoIds.includes(photo.id)}
                        disabled={
                          selectedPhotoIds.length >= 12 && !selectedPhotoIds.includes(photo.id)
                        }
                        onChange={({ target }) =>
                          setSelectedPhotoIds((ids) =>
                            target.checked
                              ? [...ids, photo.id]
                              : ids.filter((id) => id !== photo.id),
                          )
                        }
                      />
                      <span className="break-all">{photo.title}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {photos.isError && (
              <p role="status" className="text-sm">
                Fotoregistret er midlertidigt utilgængeligt.
              </p>
            )}
            <Button type="submit" disabled={pendingPhoto !== null || locating}>
              Gem registrering
            </Button>
          </fieldset>
        </form>
      )}
      {formError && <p role="alert">{formError}</p>}
      {save.isSuccess && !formError && <p role="status">Registreringen er gemt.</p>}
      {observations.isError && <p role="alert">Registreringerne kunne ikke hentes.</p>}
      {points[0] && (
        <Suspense fallback={<p role="status">Henter kort…</p>}>
          <FieldMap
            readOnly
            projectId={projectId}
            projectName="Broregistreringer"
            lat={points[0].lat}
            lng={points[0].lng}
            initialZoom={16}
            initialBaseLayer="osm"
            locationPoints={points}
            locationBounds={bounds}
            height={300}
          />
        </Suspense>
      )}
      {points.length > 0 && (
        <ol aria-label="Broregistreringer på kortet" className="space-y-2 text-sm">
          {points.map(({ id, label, visitNumber, notes }) => (
            <li key={id} className="rounded border p-2">
              <strong>
                {visitNumber}. {label}
              </strong>
              <p className="whitespace-pre-wrap">{notes}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
