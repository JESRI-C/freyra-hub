import type { ObservationDraftSource } from "@/lib/work-order-observation-drafts";
import {
  observationPosition,
  observationSourceName,
  observationTime,
  observationTypeLabel,
  observationStatusLabel,
} from "./work-order-observation-presentation";

export function WorkOrderObservationSourceDetails({ source }: { source: ObservationDraftSource }) {
  const row = source.snapshot;
  return (
    <article className="min-w-0 space-y-2 rounded-xl border bg-card p-3 text-sm [overflow-wrap:anywhere]">
      <h4 className="font-semibold">{observationSourceName(source)}</h4>
      <p className="text-xs text-muted-foreground">
        {observationTypeLabel(row.observation_type)} · Registreret observationstid:{" "}
        {observationTime(row.observed_at)} · Registreringsstatus:{" "}
        {observationStatusLabel(row.status)}
      </p>
      <p className="text-xs text-muted-foreground">
        {observationPosition(source)}
        {row.visibility === "precise" &&
        typeof row.accuracy_m === "number" &&
        Number.isFinite(row.accuracy_m)
          ? ` · Registreret nøjagtighed: ${row.accuracy_m} m`
          : ""}
      </p>
      {row.count_value !== null && <p>Registreret antal: {row.count_value}</p>}
      <p className="whitespace-pre-wrap">{row.notes || "Ingen note registreret."}</p>
      <p className="text-xs text-muted-foreground">
        {source.media_refs.length} filreferencer. Originalfiler og deres indhold er ikke
        kontrolleret her.
      </p>
      {source.media_refs.length > 0 && (
        <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {source.media_refs.map((media) => (
            <li key={media.id}>
              {media.media_type || "Filreference"} · {media.mime_type || "Filtype ukendt"}
              {typeof media.file_size_bytes === "number" && Number.isFinite(media.file_size_bytes)
                ? ` · ${media.file_size_bytes} bytes`
                : ""}{" "}
              · Registreret {observationTime(media.created_at)}
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="min-h-9 cursor-pointer py-2">
          Kildeidentitet og fastholdt aftryk
        </summary>
        <p>Observation: {source.observation_id}</p>
        <p className="break-all">Kildeaftryk: {source.source_hash}</p>
      </details>
    </article>
  );
}

export function ObservationSourceBoundary() {
  return (
    <p className="rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
      Registreringsstatus og eventuelle AI-forslag er ikke en faglig godkendelse. Observationstid er
      den registrerede tid, og filreferencer dokumenterer ikke verificerede originalfiler. Kilderne
      beskriver arbejdsordrens observationsgrundlag.
    </p>
  );
}
