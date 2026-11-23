import { z } from "zod";
import type { ReportContent, ReportSource } from "./report-document";

export const BRIDGE_OBSERVATION_TYPE = "bridge_visual";
export const BRIDGE_TYPES = {
  bridge: "Bro",
  culvert: "Rørunderføring",
  pipe_bridge: "Rørbro",
} as const;

export const BridgeObservationSchema = z.object({
  objectId: z.string().trim().min(1, "Angiv et objekt-ID.").max(100),
  structureType: z.enum(["bridge", "culvert", "pipe_bridge"]),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyM: z.number().finite().nonnegative().nullable(),
  materials: z.string().trim().max(500),
  dimensions: z.string().trim().max(500),
  conditions: z.string().trim().min(1, "Beskriv de synlige forhold.").max(2000),
  photoSourceIds: z
    .array(
      z.string().refine((id) => id.startsWith("media:") && z.uuid().safeParse(id.slice(6)).success),
    )
    .max(12),
});

export const BridgeReportObservationSchema = BridgeObservationSchema.extend({
  id: z.uuid(),
  observedAt: z.iso.datetime({ offset: true }),
});

export type BridgeReportObservation = z.infer<typeof BridgeReportObservationSchema>;

type BridgeOrder = Pick<BridgeReportObservation, "id" | "objectId" | "observedAt">;
export function compareBridgeObservations(a: BridgeOrder, b: BridgeOrder): number {
  return (
    a.objectId.localeCompare(b.objectId, "da", { numeric: true }) ||
    Date.parse(a.observedAt) - Date.parse(b.observedAt) ||
    a.id.localeCompare(b.id)
  );
}

export function includeBridgeObservations(
  report: ReportContent,
  observations: BridgeReportObservation[],
  projectSources: ReportSource[],
): ReportContent {
  const photoIds = [...new Set(observations.flatMap((row) => row.photoSourceIds))];
  const byId = new Map(projectSources.map((source) => [source.id, source]));
  const photos = photoIds.flatMap((id) => {
    const photo = byId.get(id);
    return photo?.checksum && photo.mimeType?.startsWith("image/") ? [photo] : [];
  });
  const sources = new Map(report.sources.map((source) => [source.id, source]));
  for (const photo of photos) sources.set(photo.id, photo);
  const photoRefs = photos.map((photo) => photo.id);
  const available = new Set(photoRefs);
  const entries: Record<string, string> = {
    "section-2": observations
      .map(
        (row, i) =>
          `${i + 1}. ${row.objectId} (${BRIDGE_TYPES[row.structureType]}). GPS: ${row.latitude}, ${row.longitude}. ${row.accuracyM === null ? "Nøjagtighed ukendt." : `Angivet nøjagtighed: ${row.accuracyM} m.`}`,
      )
      .join("\n"),
    "section-3":
      "Visuel feltregistrering med stedfæstelse og eventuelle tilknyttede projektfotos. Dato for hver registrering fremgår af objektlisten.",
    "section-4": observations
      .map((row) => `${row.objectId} · ${row.observedAt}\n${row.conditions}`)
      .join("\n\n"),
    "section-5": observations
      .map(
        (row) =>
          `${row.objectId}: Materialer: ${row.materials || "ikke registreret"}. Dimensioner: ${row.dimensions || "ikke registreret"}.`,
      )
      .join("\n"),
    "section-11": observations
      .map(
        (row) =>
          `${row.objectId} · Feltregistrering ${row.id}\n${
            row.photoSourceIds
              .map((id) =>
                available.has(id)
                  ? `${byId.get(id)?.title} (${id})`
                  : `Fotokilde utilgængelig: ${id}`,
              )
              .join("\n") || "Ingen tilknyttede fotos."
          }`,
      )
      .join("\n\n"),
  };
  return {
    ...report,
    bridgeObservations: observations,
    sources: [...sources.values()],
    sections: report.sections.map((section) =>
      entries[section.id] === undefined
        ? section
        : {
            ...section,
            text: entries[section.id],
            sourceIds: photoRefs,
            reviewed: false,
            basis: "observed",
          },
    ),
  };
}

export function bridgeObservationInsert(
  input: unknown,
  projectId: string,
  actorId: string,
  observationId: string,
) {
  const observation = BridgeObservationSchema.parse(input);
  return {
    id: observationId,
    project_id: projectId,
    observer_id: actorId,
    observation_type: BRIDGE_OBSERVATION_TYPE,
    latitude: observation.latitude,
    longitude: observation.longitude,
    accuracy_m: observation.accuracyM,
    notes: observation.conditions,
    metadata: {
      schema: "freyra.bridge-visual/v1",
      objectId: observation.objectId,
      structureType: observation.structureType,
      materials: observation.materials,
      dimensions: observation.dimensions,
      photoSourceIds: [...new Set(observation.photoSourceIds)],
    },
  };
}
