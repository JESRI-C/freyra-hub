import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui-bits";
import {
  getProjectMedia,
  listWatercoursePhotos,
  type WatercoursePhoto,
} from "@/services/project-media-service";
import type { LineString } from "geojson";
import { WatercoursePanel } from "./WatercoursePanel";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import { getWatercourseVersions } from "@/services/watercourse-service";
import { photoPairFlags } from "@/services/watercourse-geometry";
import {
  listWatercourseObservations,
  comparisonSelection,
  createWatercourseObservation,
  approveWatercourseObservation,
  OBSERVATION_KIND_LABELS,
  observationQualityLabel,
  type ObservationKind,
} from "@/services/watercourse-observations";
interface Props {
  projectId: string;
  organizationId: string;
  actorId: string;
  canEdit: boolean;
}

export function WatercourseObservationPanel(props: Props) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="rounded-xl border bg-card p-4"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="cursor-pointer font-semibold">
        Vandløbsstrækninger og fotoobservationer
      </summary>
      {opened && <WatercourseRegistration {...props} />}
    </details>
  );
}

function useSelectedPhoto(
  projectId: string,
  actorId: string,
  id: string,
  candidate?: WatercoursePhoto,
) {
  const query = useQuery({
    queryKey: ["watercourse-original", actorId, projectId, id],
    enabled: Boolean(id),
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const result = await getProjectMedia(projectId, id);
      if (!result.data) throw new Error(result.error ?? "Originalfotoet kunne ikke åbnes.");
      return result.data;
    },
  });
  const data = query.error || query.isFetching ? undefined : query.data;
  const photo =
    data && candidate
      ? {
          ...data,
          coordinates: candidate.coordinates,
          capturedAt: candidate.capturedAt,
          localCaptureDate: candidate.localCaptureDate,
        }
      : data;
  return { photo, error: query.error, reload: query.refetch };
}

function WatercourseRegistration({ projectId, organizationId, actorId, canEdit }: Props) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<LineString | null>(null);
  const media = useQuery({
    queryKey: ["observation-photos", actorId, projectId],
    queryFn: () => listWatercoursePhotos(projectId),
  });
  const versions = useQuery({
    queryKey: ["watercourse-versions", organizationId, projectId, actorId],
    queryFn: () => getWatercourseVersions(projectId, organizationId),
  });
  const observations = useQuery({
    queryKey: ["watercourse-observations", organizationId, projectId, actorId],
    queryFn: () => listWatercourseObservations(projectId, organizationId),
  });
  const [beforeId, setBeforeId] = useState(""),
    [afterId, setAfterId] = useState(""),
    [segmentId, setSegmentId] = useState("");
  const [kind, setKind] = useState<ObservationKind>("vegetation"),
    [text, setText] = useState(""),
    [featureKey, setFeatureKey] = useState("");
  const [beforeLight, setBeforeLight] = useState(""),
    [afterLight, setAfterLight] = useState("");
  const latest = versions.data?.[0];
  const primary = useSelectedPhoto(
    projectId,
    actorId,
    beforeId,
    media.data?.find((m) => m.id === beforeId),
  );
  const secondary = useSelectedPhoto(
    projectId,
    actorId,
    afterId,
    media.data?.find((m) => m.id === afterId),
  );
  const before = primary.photo,
    after = secondary.photo;
  const photoData = (m: ProjectMediaItem, light: string) => ({
    id: m.id,
    lat: m.coordinates?.lat ?? null,
    lng: m.coordinates?.lng ?? null,
    heading: m.direction ?? null,
    light: light || null,
    qualityFlags: [
      ...(Array.isArray(m.metadata?.qualityFlags) ? (m.metadata.qualityFlags as string[]) : []),
      ...(m.coordinates ? [] : ["missing_gps"]),
    ],
  });
  const flags =
    before && after
      ? photoPairFlags(photoData(before, beforeLight), photoData(after, afterLight))
      : ["comparison_not_selected"];
  const add = useMutation({
    mutationFn: () => {
      if (
        !canEdit ||
        !latest ||
        !latest.segments.some((s) => s.id === segmentId) ||
        !before ||
        (afterId && !after)
      )
        throw new Error("Vælg kildefoto og delstrækning i seneste linjeversion.");
      return createWatercourseObservation({
        project_id: projectId,
        organization_id: organizationId,
        centerline_version_id: latest.id,
        segment_id: segmentId,
        kind,
        text,
        feature_key: featureKey,
        source_ids: [before.id, ...(after ? [after.id] : [])],
        determination_level:
          kind === "species"
            ? "species_suggestion"
            : kind === "recommendation"
              ? "screening"
              : "observed",
        quality_flags: flags,
        comparison:
          after || beforeLight
            ? {
                beforeId: before.id,
                afterId: after?.id ?? null,
                beforeLight: beforeLight || null,
                afterLight: after ? afterLight || null : null,
              }
            : null,
      });
    },
    onSuccess: () => {
      setText("");
      setFeatureKey("");
      void client.invalidateQueries({
        queryKey: ["watercourse-observations", organizationId, projectId],
      });
    },
  });
  const approve = useMutation({
    mutationFn: (id: string) => {
      if (!canEdit) throw new Error("Redigeringsadgang er påkrævet.");
      return approveWatercourseObservation(id);
    },
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: ["watercourse-observations", organizationId, projectId],
      }),
  });
  const photoSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <label className="block text-sm">
      {label}
      <select
        className="block border rounded p-2 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Vælg foto</option>
        {(media.data ?? []).map((m) => (
          <option key={m.id} value={m.id}>
            {m.title} ·{" "}
            {m.capturedAt ??
              (m.localCaptureDate
                ? `${m.localCaptureDate} (lokal dato, tidszone ukendt)`
                : "Optagedato ukendt")}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="mt-4 space-y-4">
      {canEdit ? (
        <WatercoursePanel
          projectId={projectId}
          organizationId={organizationId}
          draft={draft}
          onDraftChange={setDraft}
        />
      ) : (
        latest && (
          <section className="rounded-lg border p-3" aria-label="Gemte vandløbsstrækninger">
            <h3 className="font-medium">Centerlinjeversion {latest.version}</h3>
            <p>
              {latest.source} · {latest.method}
            </p>
            <ul>
              {latest.segments.map((s) => (
                <li key={s.id}>
                  {s.name} · {s.fromM.toFixed(0)}–{s.toM.toFixed(0)} m
                </li>
              ))}
            </ul>
          </section>
        )
      )}
      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Fotoobservationer på delstrækninger</h2>
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "Vælg et kildefoto og en delstrækning. Vælg et ekstra foto ved en før/efter-sammenligning. Brug samme objektmærke for det samme træ eller den samme vegetation."
            : "Åbn kildefotos ved projektets gemte observationer."}{" "}
          En droneoriginal verificeres særskilt under undersøgelsens fotopunkter, før den kan bruges
          som bekræftet fotokilde i en godkendt rapport.
        </p>
        {(media.error ||
          versions.error ||
          observations.error ||
          primary.error ||
          secondary.error) && (
          <p role="alert" className="text-destructive text-sm">
            {media.error?.message ??
              versions.error?.message ??
              observations.error?.message ??
              primary.error?.message ??
              secondary.error?.message}
          </p>
        )}
        {canEdit ? (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                {photoSelect(beforeId, setBeforeId, afterId ? "Førfoto" : "Primært kildefoto")}
                <PhotoEvidence photo={before} />
                {beforeId && (
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => void primary.reload()}
                  >
                    Forny adgang til primært kildefoto
                  </button>
                )}
                <label className="block text-xs">
                  Lysforhold
                  <select
                    className="block border rounded p-2 w-full"
                    value={beforeLight}
                    onChange={(e) => setBeforeLight(e.target.value)}
                  >
                    <option value="">Ukendt</option>
                    <option>Overskyet</option>
                    <option>Sol</option>
                    <option>Skygge</option>
                  </select>
                </label>
              </div>
              <div className="space-y-2">
                {photoSelect(afterId, setAfterId, "Efterfoto ved sammenligning (valgfrit)")}
                <PhotoEvidence photo={after} />
                {afterId && (
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => void secondary.reload()}
                  >
                    Forny adgang til efterfoto
                  </button>
                )}
                <label className="block text-xs">
                  Lysforhold
                  <select
                    className="block border rounded p-2 w-full"
                    value={afterLight}
                    onChange={(e) => setAfterLight(e.target.value)}
                  >
                    <option value="">Ukendt</option>
                    <option>Overskyet</option>
                    <option>Sol</option>
                    <option>Skygge</option>
                  </select>
                </label>
              </div>
            </div>
            <p className="text-xs">
              Sammenlignelighed:{" "}
              {flags.length
                ? flags.map(observationQualityLabel).join(", ")
                : "Ingen automatiske flag. Faglig gennemgang er stadig nødvendig."}
            </p>
            <div className="grid md:grid-cols-3 gap-3">
              <label className="text-sm">
                Delstrækning
                <select
                  className="block border rounded p-2 w-full"
                  value={segmentId}
                  onChange={(e) => setSegmentId(e.target.value)}
                >
                  <option value="">Vælg delstrækning</option>
                  {latest?.segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.fromM.toFixed(0)}-{s.toM.toFixed(0)} m
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Type
                <select
                  className="block border rounded p-2 w-full"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ObservationKind)}
                >
                  {Object.entries(OBSERVATION_KIND_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Entydigt objektmærke
                <input
                  placeholder="Fx trægruppe-01"
                  className="block border rounded p-2 w-full"
                  value={featureKey}
                  onChange={(e) => setFeatureKey(e.target.value)}
                />
              </label>
            </div>
            <label className="block text-sm">
              Observation / anbefaling
              <textarea
                className="block border rounded p-2 w-full"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Beskriv det synlige og bestemmelsesniveau. Angiv usikkerhed. Anbefalinger om fx rødel eller eg kræver vurdering af lokale forhold og bindinger."
              />
            </label>
            <button
              disabled={add.isPending || !latest || !before || Boolean(afterId && !after)}
              className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => add.mutate()}
            >
              {add.isPending ? "Gemmer…" : "Gem observation til gennemgang"}
            </button>
          </>
        ) : (
          <div aria-label="Gemte kildefotos">
            {before && <PhotoEvidence photo={before} />}
            {after && <PhotoEvidence photo={after} />}
          </div>
        )}
        {(add.error || approve.error) && (
          <p role="alert" className="text-sm text-destructive">
            {add.error?.message ?? approve.error?.message}
          </p>
        )}
        <div className="space-y-3">
          {observations.isSuccess && !observations.data.length && (
            <p className="text-sm">Der er endnu ingen gemte fotoobservationer.</p>
          )}
          {observations.data?.map((o) => (
            <article key={o.id} className="border rounded p-3 text-sm space-y-2">
              <strong>
                {OBSERVATION_KIND_LABELS[o.kind]} · {o.feature_key}
              </strong>
              <p>{o.text}</p>
              {(o.comparison || o.source_ids.length === 1) && (
                <button
                  className="border rounded px-3 py-2"
                  onClick={() => {
                    const selection = comparisonSelection(
                      o.comparison ?? {
                        beforeId: o.source_ids[0],
                        afterId: null,
                        beforeLight: null,
                        afterLight: null,
                      },
                    );
                    if (selection.beforeId && selection.beforeId === beforeId)
                      void primary.reload();
                    if (selection.afterId && selection.afterId === afterId) void secondary.reload();
                    setBeforeId(selection.beforeId);
                    setAfterId(selection.afterId);
                    setBeforeLight(selection.beforeLight);
                    setAfterLight(selection.afterLight);
                  }}
                >
                  {o.comparison?.afterId ? "Åbn fotopar" : "Åbn kildefoto"}
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                Kilder: {o.source_ids.join(", ")} · Linjeversion: {o.centerline_version_id} ·{" "}
                {o.determination_level === "species_suggestion"
                  ? "Artsforslag"
                  : o.determination_level === "screening"
                    ? "Screening"
                    : "Fotoobservation"}
              </p>
              {o.quality_flags.length > 0 && (
                <p className="text-xs">
                  Forbehold: {o.quality_flags.map(observationQualityLabel).join(", ")}
                </p>
              )}
              {o.watercourse_observation_reviews ? (
                <p className="text-xs">
                  Fagligt godkendt{" "}
                  {new Date(o.watercourse_observation_reviews.approved_at).toLocaleString("da-DK")}{" "}
                  · {o.watercourse_observation_reviews.approved_by}
                </p>
              ) : (
                canEdit && (
                  <button
                    disabled={approve.isPending}
                    className="border rounded px-3 py-2"
                    onClick={() => approve.mutate(o.id)}
                  >
                    Jeg har gennemgået kilder og forbehold - godkend
                  </button>
                )
              )}
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
function PhotoEvidence({ photo }: { photo?: ProjectMediaItem & { localCaptureDate?: string } }) {
  if (!photo)
    return (
      <div className="h-48 border rounded grid place-items-center text-sm text-muted-foreground">
        Intet foto valgt
      </div>
    );
  return (
    <div className="space-y-1">
      <img
        src={photo.url}
        alt={photo.title}
        className="w-full h-64 object-contain bg-muted rounded"
      />
      <p className="text-xs">
        {photo.coordinates
          ? `${photo.coordinates.lat.toFixed(6)}, ${photo.coordinates.lng.toFixed(6)}`
          : "GPS mangler"}{" "}
        · Retning: {photo.direction == null ? "Ukendt" : `${photo.direction}°`} ·{" "}
        {photo.capturedAt ??
          (photo.localCaptureDate
            ? `${photo.localCaptureDate} (lokal kameradato, tidszone ukendt)`
            : "Optagetid ukendt")}
      </p>
    </div>
  );
}
