import { useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { getFieldJobAccess } from "@/lib/field-job-access.functions";
import {
  PhotoPointSchema,
  photoPositionAssessment,
  PHOTO_POSITION_LABELS,
} from "@/lib/field-photo-position";
import {
  listFieldPhotos,
  getFieldPhotoPolicy,
  listFieldPhotoPositions,
  saveFieldPhotoPosition,
  saveFieldPhotoPolicy,
} from "@/services/field-photo-position-service";
import type { ProjectScope } from "@/services/project-workspace-service";
import { Button } from "@/components/ui/button";
import { FieldPhotoReceiptPanel } from "./FieldPhotoReceiptPanel";
const control = "mt-1 block w-full rounded border bg-background p-2";
export function FieldPhotoPositionsPanel({ scope }: { scope: ProjectScope }) {
  const { user } = useAuth();
  return (
    <Positions
      key={`${scope.projectId}:${scope.organizationId}:${user?.id}`}
      scope={scope}
      actorId={user?.id}
    />
  );
}
function Positions({ scope, actorId }: { scope: ProjectScope; actorId?: string }) {
  const accessFn = useServerFn(getFieldJobAccess),
    cache = useQueryClient();
  const access = useQuery({
    queryKey: ["photo-position-access", scope, actorId],
    queryFn: () => accessFn({ data: { projectId: scope.projectId } }),
    enabled: !!actorId,
    retry: false,
  });
  const allowed =
    !!actorId &&
    access.data?.userId === actorId &&
    access.data.projectId === scope.projectId &&
    !access.isError;
  const key = ["field-photo-positions", scope, actorId];
  const photos = useQuery({
    queryKey: [...key, "photos"],
    queryFn: () => listFieldPhotos(scope),
    enabled: allowed,
    retry: false,
  });
  const policy = useQuery({
    queryKey: [...key, "policy"],
    queryFn: () => getFieldPhotoPolicy(scope),
    enabled: allowed,
    retry: false,
  });
  const [photoId, setPhotoId] = useState(""),
    [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [reason, setReason] = useState(""),
    [radius, setRadius] = useState("50"),
    [policyReason, setPolicyReason] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const retry = useRef({ payload: "", id: "" });
  const policyBase = useRef<number | null>(null);
  const photoBase = useRef<{
    photoId: string;
    version: number;
    policyVersion: number;
    radius: number;
  } | null>(null);
  function requestId(input: unknown) {
    const payload = JSON.stringify(input);
    if (payload !== retry.current.payload) retry.current = { payload, id: crypto.randomUUID() };
    return retry.current.id;
  }
  const history = useQuery({
    queryKey: [...key, photoId],
    queryFn: () => listFieldPhotoPositions(scope, photoId),
    enabled: allowed && !!photoId,
    retry: false,
  });
  const photo = photos.data?.find((p) => p.id === photoId);
  useEffect(() => {
    if (
      allowed &&
      !policy.isPending &&
      !policy.isFetching &&
      !policy.error &&
      policyBase.current === null
    ) {
      policyBase.current = policy.data?.version ?? 0;
      setRadius(String(policy.data?.radius_m ?? 50));
    }
    if (
      photoId &&
      history.data &&
      !history.isFetching &&
      !policy.isPending &&
      !policy.isFetching &&
      !policy.error &&
      photoBase.current?.photoId !== photoId
    ) {
      photoBase.current = {
        photoId,
        version: history.data[0]?.version ?? 0,
        policyVersion: policy.data?.version ?? 0,
        radius: policy.data?.radius_m ?? 50,
      };
    }
  }, [
    allowed,
    photoId,
    history.data,
    history.isFetching,
    policy.data,
    policy.isPending,
    policy.isFetching,
    policy.error,
  ]);
  const raw = photo?.metadata.field_photo_capture as Record<string, unknown> | undefined;
  const parsedOriginal = PhotoPointSchema.safeParse(raw?.originalPosition);
  const original = parsedOriginal.success ? parsedOriginal.data : null;
  const point =
    lat.trim() && lng.trim()
      ? PhotoPointSchema.safeParse({ lat: Number(lat), lng: Number(lng) })
      : null;
  const assessment = point?.success
    ? photoPositionAssessment(
        original,
        point.data,
        photoBase.current?.radius ?? policy.data?.radius_m ?? 50,
      )
    : null;
  const loading = access.isFetching || photos.isFetching || policy.isFetching || history.isFetching;
  const readError = access.error || photos.error || policy.error || history.error;
  async function save(changePolicy = false) {
    if (busy || loading || readError || !allowed) return;
    if (changePolicy ? !access.data?.canConfigure : !access.data?.canContribute) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (changePolicy) {
        if (!radius.trim()) throw new Error("Angiv en afstand i meter.");
        const input = {
          radiusM: Number(radius),
          reason: policyReason,
          expectedVersion: policyBase.current ?? 0,
        };
        const saved = await saveFieldPhotoPolicy(scope, { ...input, requestId: requestId(input) });
        if (alive.current) policyBase.current = saved.version;
      } else {
        if (!point?.success || !photo) throw new Error("Angiv en gyldig breddegrad og længdegrad.");
        const input = {
          mediaId: photoId,
          point: point.data,
          reason,
          expectedVersion: photoBase.current?.version ?? 0,
          expectedPolicyVersion: photoBase.current?.policyVersion ?? 0,
        };
        const saved = await saveFieldPhotoPosition(scope, {
          ...input,
          requestId: requestId(input),
        });
        if (alive.current)
          photoBase.current = {
            photoId,
            version: saved.version,
            policyVersion: saved.policy_version,
            radius: saved.radius_m,
          };
      }
      await cache.invalidateQueries({ queryKey: key });
      if (alive.current) {
        setMessage(
          changePolicy
            ? "Ny afstandsregel gemt. Tidligere rettelser bevarer deres regelversion."
            : "Placeringen er gemt som en ny version. Originalens GPS er bevaret.",
        );
        setReason("");
        setPolicyReason("");
        retry.current = { payload: "", id: "" };
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Kunne ikke gemme.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function reload() {
    const [freshPolicy, freshHistory] = await Promise.all([
      policy.refetch(),
      photoId ? history.refetch() : Promise.resolve(null),
      photos.refetch(),
    ]);
    if (!alive.current || freshPolicy.error || freshHistory?.error) return;
    policyBase.current = freshPolicy.data?.version ?? 0;
    setRadius(String(freshPolicy.data?.radius_m ?? 50));
    if (photoId) {
      const latest = freshHistory?.data?.[0];
      photoBase.current = {
        photoId,
        version: latest?.version ?? 0,
        policyVersion: policyBase.current,
        radius: freshPolicy.data?.radius_m ?? 50,
      };
      setLat(String(latest?.lat ?? photo?.lat ?? ""));
      setLng(String(latest?.lng ?? photo?.lng ?? ""));
      setReason("");
    }
    setMessage("Historikken er genindlæst. Gennemgå placering og regel før du gemmer.");
  }
  return (
    <section
      className="space-y-3 rounded border p-4"
      aria-label="Feltfotoets placering og historik"
    >
      <h3 className="font-semibold">Feltfotoets placering og historik</h3>
      <p className="text-sm">
        Her vises de seneste 50 feltfotos med bevaret optagegrundlag. Ældre fotos får ikke opfundet
        originalhistorik. Eksisterende kort viser stadig kamerapunktet; observationsstedet vises
        særskilt her.
      </p>
      <Button variant="outline" disabled={busy || loading} onClick={() => void reload()}>
        Opdater fotos og historik
      </Button>
      {loading && <p role="status">Henter fotohistorik…</p>}
      {readError && <p role="alert">{readError.message}</p>}
      {allowed && !photos.isPending && (
        <>
          <p>
            Afstandsregel: {policy.data?.radius_m ?? 50} meter · version {policy.data?.version ?? 0}{" "}
            (0 er Freyras standard).
          </p>
          <label>
            Foto
            <select
              className={control}
              value={photoId}
              disabled={busy}
              onChange={(e) => {
                const p = photos.data?.find((p) => p.id === e.target.value);
                setPhotoId(e.target.value);
                photoBase.current = null;
                setLat(p?.lat == null ? "" : String(p.lat));
                setLng(p?.lng == null ? "" : String(p.lng));
                setReason("");
                setMessage("");
                setError("");
              }}
            >
              <option value="">Vælg feltfoto</option>
              {photos.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          {!photos.data?.length && (
            <p>Ingen nye feltfotos med bevaret optagegrundlag på denne sag endnu.</p>
          )}
          {photo && (
            <>
              <p>Original GPS: {original ? `${original.lat}, ${original.lng}` : "mangler"}.</p>
              {photo.metadata.field_upload_id === photo.id && actorId ? (
                <FieldPhotoReceiptPanel
                  key={`${photo.id}:${actorId}`}
                  projectId={scope.projectId}
                  uploadId={photo.id}
                  actorId={actorId}
                  canContribute={!!access.data?.canContribute}
                />
              ) : (
                <p>Filhash er angivet af uploaderen og endnu ikke serververificeret.</p>
              )}
              {history.data?.[0] && (
                <p>
                  Seneste observationssted: {history.data[0].lat}, {history.data[0].lng} ·{" "}
                  {PHOTO_POSITION_LABELS[history.data[0].status]}
                </p>
              )}
              <label>
                Observationssted – breddegrad
                <input
                  className={control}
                  value={lat}
                  disabled={!access.data?.canContribute || busy}
                  onChange={(e) => setLat(e.target.value)}
                />
              </label>
              <label>
                Observationssted – længdegrad
                <input
                  className={control}
                  value={lng}
                  disabled={!access.data?.canContribute || busy}
                  onChange={(e) => setLng(e.target.value)}
                />
              </label>
              {assessment && (
                <p>
                  {assessment.distanceM === null
                    ? "Afstand kan ikke bestemmes uden originalposition."
                    : `Afstand fra original GPS: ${assessment.distanceM.toFixed(1)} meter.`}{" "}
                  {PHOTO_POSITION_LABELS[assessment.status]}. En overskridelse kan gemmes til
                  afklaring.
                </p>
              )}
              <label>
                Begrundelse
                <textarea
                  className={control}
                  maxLength={2000}
                  value={reason}
                  disabled={!access.data?.canContribute || busy}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {access.data?.canContribute && (
                <Button disabled={busy || loading || !!readError} onClick={() => void save()}>
                  Gem observationssted som ny version
                </Button>
              )}
              <details>
                <summary>Seneste {history.data?.length ?? 0} placeringsversioner</summary>
                <ol>
                  {history.data?.map((h) => (
                    <li key={h.id} className="border-b py-2">
                      Version {h.version} · {h.lat}, {h.lng} · {PHOTO_POSITION_LABELS[h.status]}
                      <p>{h.reason}</p>
                      <p>
                        Regelversion {h.policy_version} · {h.radius_m} m ·{" "}
                        {new Date(h.created_at).toLocaleString("da-DK")} · registreret af{" "}
                        {h.created_by}
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
          {access.data?.canConfigure && (
            <details>
              <summary>Ændr afstandsregel for projektet</summary>
              <label>
                Meter
                <input
                  className={control}
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                />
              </label>
              <label>
                Begrundelse
                <textarea
                  className={control}
                  value={policyReason}
                  maxLength={2000}
                  onChange={(e) => setPolicyReason(e.target.value)}
                />
              </label>
              <Button disabled={busy || loading || !!readError} onClick={() => void save(true)}>
                Gem ny regelversion
              </Button>
            </details>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
