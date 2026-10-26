import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui-bits";
import { listProjectMedia } from "@/services/project-media-service";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import { getWatercourseVersions } from "@/services/watercourse-service";
import { photoPairFlags } from "@/services/watercourse-geometry";
import {
  listWatercourseObservations,
  comparisonSelection,
  createWatercourseObservation,
  approveWatercourseObservation,
  type ObservationKind,
} from "@/services/watercourse-observations";
const KINDS: Record<ObservationKind, string> = {
  vegetation: "Vegetation",
  water: "Synligt vand",
  tree: "Træ / trægruppe",
  species: "Artsforslag",
  recommendation: "Stedbunden anbefaling",
};

const QUALITY_LABELS: Record<string, string> = {
  missing_gps: "GPS mangler",
  missing_heading: "Kameraretning mangler",
  lighting_not_comparable: "Lysforhold er ukendte eller forskellige",
  position_difference_over_20m: "Fotopositioner er over 20 m fra hinanden",
  direction_difference_over_30deg: "Kameraretning afviger over 30 grader",
  same_source: "Samme foto er valgt to gange",
  comparison_not_selected: "Intet før/efter-par valgt",
  missing_capture_time: "Optagetid mangler",
};
function qualityLabel(flag: string) {
  return QUALITY_LABELS[flag] ?? flag;
}

export function WatercourseObservationPanel({
  projectId,
  organizationId,
}: {
  projectId: string;
  organizationId: string;
}) {
  const client = useQueryClient();
  const media = useQuery({
    queryKey: ["observation-photos", projectId],
    queryFn: async () => {
      const result = await listProjectMedia(projectId);
      if (result.error) throw new Error(result.error);
      return result.data ?? [];
    },
  });
  const versions = useQuery({
    queryKey: ["watercourse-versions", organizationId, projectId],
    queryFn: () => getWatercourseVersions(projectId, organizationId),
  });
  const observations = useQuery({
    queryKey: ["watercourse-observations", organizationId, projectId],
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
  const before = media.data?.find((m) => m.id === beforeId),
    after = media.data?.find((m) => m.id === afterId);
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
      if (!latest || !latest.segments.some((s) => s.id === segmentId) || !before)
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
        comparison: {
          beforeId: before.id,
          afterId: after?.id ?? null,
          beforeLight: beforeLight || null,
          afterLight: after ? afterLight || null : null,
        },
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
    mutationFn: approveWatercourseObservation,
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
        {(media.data ?? [])
          .filter((m) => m.category !== "document_scan")
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} · {m.capturedAt ?? "Optagedato ukendt"}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <Card className="p-4 space-y-4">
      <h2 className="font-semibold">Før/efter og faglig gennemgang</h2>
      <p className="text-sm text-muted-foreground">
        Vælg originale kildefotos. Markér samme træ eller vegetation med samme objektmærke, så det
        ikke registreres flere gange i samme delstrækning. Fotoobservationer er kvalitative; ingen
        biomasse, vandføring eller arealer udledes her.
      </p>
      {(media.error || versions.error || observations.error) && (
        <p role="alert" className="text-destructive text-sm">
          {media.error?.message ?? versions.error?.message ?? observations.error?.message}
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {photoSelect(beforeId, setBeforeId, "Før / primært kildefoto")}
          <PhotoEvidence photo={before} />
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
          {photoSelect(afterId, setAfterId, "Efter (valgfrit)")}
          <PhotoEvidence photo={after} />
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
          ? flags.map(qualityLabel).join(", ")
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
            {Object.entries(KINDS).map(([k, v]) => (
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
        disabled={add.isPending || !latest || !before}
        className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
        onClick={() => add.mutate()}
      >
        {add.isPending ? "Gemmer…" : "Gem observation til gennemgang"}
      </button>
      {(add.error || approve.error) && (
        <p role="alert" className="text-sm text-destructive">
          {add.error?.message ?? approve.error?.message}
        </p>
      )}
      <div className="space-y-3">
        {observations.data?.map((o) => (
          <article key={o.id} className="border rounded p-3 text-sm space-y-2">
            <strong>
              {KINDS[o.kind]} · {o.feature_key}
            </strong>
            <p>{o.text}</p>
            {o.comparison && (
              <button
                className="border rounded px-3 py-2"
                onClick={() => {
                  const selection = comparisonSelection(o.comparison!);
                  setBeforeId(selection.beforeId);
                  setAfterId(selection.afterId);
                  setBeforeLight(selection.beforeLight);
                  setAfterLight(selection.afterLight);
                }}
              >
                Åbn fotopar
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
              <p className="text-xs">Forbehold: {o.quality_flags.map(qualityLabel).join(", ")}</p>
            )}
            {o.watercourse_observation_reviews ? (
              <p className="text-xs">
                Fagligt godkendt{" "}
                {new Date(o.watercourse_observation_reviews.approved_at).toLocaleString("da-DK")} ·{" "}
                {o.watercourse_observation_reviews.approved_by}
              </p>
            ) : (
              <button
                disabled={approve.isPending}
                className="border rounded px-3 py-2"
                onClick={() => approve.mutate(o.id)}
              >
                Jeg har gennemgået kilder og forbehold - godkend
              </button>
            )}
          </article>
        ))}
      </div>
    </Card>
  );
}
function PhotoEvidence({ photo }: { photo?: ProjectMediaItem }) {
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
        {photo.capturedAt ?? "Optagetid ukendt"}
      </p>
    </div>
  );
}
