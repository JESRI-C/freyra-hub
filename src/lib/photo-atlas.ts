import { z } from "zod";

const text = z.string().max(10000);
const optionalText = text.nullish().transform((v) => v ?? "");
const coordinate = (limit: number) => z.number().finite().min(-limit).max(limit).nullish();
const PhotoSchema = z.object({
  id: z.string().min(1).max(120),
  filename: z.string().min(1).max(255),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  time: z.string().max(80).nullish(),
  lat: coordinate(90),
  lon: coordinate(180),
  watercourse: optionalText,
  watercourse_id: optionalText,
  section_id: optionalText,
  match_status: optionalText,
  distance_m: z.number().finite().nonnegative().nullish(),
  observation: optionalText,
  vegetation: optionalText,
  visibility: optionalText,
  species: z
    .array(z.union([z.string(), z.record(z.string(), z.unknown())]))
    .max(100)
    .default([]),
  species_status: optionalText,
  species_evidence: optionalText,
  date_status: optionalText,
  source: optionalText,
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .nullish(),
  camera: optionalText,
  yaw: z.number().finite().nullish(),
  image: z
    .string()
    .max(32 * 1024 * 1024)
    .optional(),
});
export type AtlasPhoto = z.infer<typeof PhotoSchema>;
export type PhotoAtlas = {
  title: string;
  version: string;
  method: string;
  photos: AtlasPhoto[];
};
export function photoAtlasError(error: unknown) {
  if (error instanceof z.ZodError) {
    const custom = error.issues.find((issue) => issue.code === "custom");
    return (
      custom?.message ??
      "Oplysningerne har et ugyldigt format. Kontrollér foto-ID, dato, position og filtype."
    );
  }
  return error instanceof Error ? error.message : "Handlingen kunne ikke gennemføres.";
}
export const ATLAS_EVIDENCE_TYPE = "freyra_photo_atlas_v1";
export const BASELINE_EVIDENCE_TYPE = "freyra_photo_baseline_v1";
export const ATLAS_METHOD =
  "Fotobaseret registrering. Kamera-GPS er ikke nødvendigvis motivposition. Artsbud er foreløbige. Optagedato er ikke arbejdsdato; før/efter kræver dokumenteret indsats. Dronefotos dokumenterer ikke alene økologisk tilstand, biomasse eller hydraulisk kapacitet.";

/** Extract data only. Uploaded HTML/scripts are never inserted or executed. */
export function parsePhotoAtlas(source: string, title = "Fotoatlas"): PhotoAtlas {
  if (source.length > 100 * 1024 * 1024) throw new Error("Fotoatlasset overstiger 100 MB.");
  const match = source.match(
    /<script\b(?=[^>]*\bid\s*=\s*["']photo-data["'])(?=[^>]*\btype\s*=\s*["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i,
  );
  let input: unknown;
  try {
    input = JSON.parse(match ? match[1] : source);
  } catch {
    throw new Error("Filen skal indeholde fotoatlasets photo-data eller et baseline-JSON-datasæt.");
  }
  const wrapper = z.object({
    title: text.optional(),
    version: text.optional(),
    method: text.optional(),
    image_count: z.number().int().nonnegative().optional(),
    observations: z.array(z.unknown()).optional(),
    photos: z.array(z.unknown()).optional(),
  });
  const metadata = Array.isArray(input) ? null : wrapper.parse(input);
  const rawPhotos = Array.isArray(input) ? input : (metadata?.observations ?? metadata?.photos);
  const photos = z
    .array(PhotoSchema)
    .min(1, "Datasættet indeholder ingen fotos.")
    .max(10000)
    .parse(rawPhotos);
  if (metadata?.image_count !== undefined && metadata.image_count !== photos.length)
    throw new Error("Det angivne fotoantal stemmer ikke med datasættet.");
  const ids = new Set<string>();
  for (const photo of photos) {
    if (ids.has(photo.id)) throw new Error("Foto-ID forekommer flere gange: " + photo.id);
    ids.add(photo.id);
    if ((photo.lat == null) !== (photo.lon == null))
      throw new Error("Fotoets kameraposition skal have både bredde- og længdegrad.");
    if (photo.source && !safeSourceUrl(photo.source))
      throw new Error("Fotoets kilde skal være en gyldig HTTPS-adresse.");
    if (photo.image && !/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=\r\n]+$/.test(photo.image))
      throw new Error("Indlejrede illustrationer skal være JPEG eller PNG.");
    if (photo.date && !isCalendarDate(photo.date))
      throw new Error("Ugyldig optagedato ved " + photo.id);
    if (
      photo.time &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(photo.time)
    )
      throw new Error("Ugyldigt optagetidspunkt ved " + photo.id);
    if (photo.time && photo.date && photo.time.slice(0, 10) !== photo.date)
      throw new Error("Optagedato og tidspunkt er uenige ved " + photo.id);
    if (
      photo.time &&
      (!isCalendarDate(photo.time.slice(0, 10)) ||
        Number(photo.time.slice(11, 13)) > 23 ||
        Number(photo.time.slice(14, 16)) > 59 ||
        Number(photo.time.slice(17, 19)) > 59)
    )
      throw new Error("Ugyldigt optagetidspunkt ved " + photo.id);
  }
  return {
    title: metadata?.title ?? title,
    version: metadata?.version ?? "Version ikke oplyst",
    method: metadata?.method || ATLAS_METHOD,
    photos,
  };
}
function isCalendarDate(date: string) {
  const value = new Date(date + "T00:00:00Z");
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}
export function safeSourceUrl(source: string): string | null {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export function photoDateLabel(photo: AtlasPhoto) {
  if (!photo.date) return "Optagedato mangler";
  const date = photo.date.split("-").reverse().join(".");
  if (!photo.time) return date + " · klokkeslæt mangler";
  const zoneKnown = /(?:Z|[+-]\d{2}:\d{2})$/.test(photo.time);
  return (
    date +
    " kl. " +
    photo.time.slice(11, 19) +
    (zoneKnown ? " · tidszone angivet i kilden" : " · lokal tid, tidszone ukendt")
  );
}
export function speciesText(photo: AtlasPhoto) {
  return photo.species
    .map((s) =>
      typeof s === "string"
        ? s
        : typeof s.name === "string"
          ? s.name
          : typeof s.candidate === "string"
            ? s.candidate
            : typeof s.danish === "string"
              ? s.danish
              : JSON.stringify(s),
    )
    .join("; ");
}
export const AtlasReviewSchema = z
  .object({
    observation: text.default(""),
    vegetation: text.default(""),
    species: text.default(""),
    speciesStatus: z
      .enum(["not_assessed", "suggestion", "field_confirmed"])
      .default("not_assessed"),
    confirmationEvidence: text.default(""),
    reach: text.default(""),
    subjectPosition: text.default(""),
    closePhotoIds: text.default(""),
    access: text.default(""),
    natureConcerns: text.default(""),
    workDate: z.string().default(""),
    workEvidence: text.default(""),
    workPhotoIds: text.default(""),
    planting: text.default(""),
    plantingStatus: z.enum(["proposal", "documented_execution"]).default("proposal"),
    plantingDate: z.string().default(""),
    plantingEvidence: text.default(""),
    followup: text.default(""),
    comparisonPhotoId: text.default(""),
    samePlaceEvidence: text.default(""),
    reviewer: text.default(""),
  })
  .superRefine((review, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (
      review.speciesStatus === "field_confirmed" &&
      (!review.species.trim() || !review.confirmationEvidence.trim() || !review.reviewer.trim())
    )
      issue(
        "confirmationEvidence",
        "Bekræftet art kræver artsnavn, fagperson og dokumentation for relevant kontrol.",
      );
    for (const field of ["workDate", "plantingDate"] as const)
      if (review[field] && !isCalendarDate(review[field]))
        issue(field, "Angiv en gyldig kalenderdato.");
    if (review.workDate && !review.workEvidence.trim())
      issue("workEvidence", "En arbejdsdato kræver en dateret arbejdsreference.");
    if (
      review.plantingStatus === "documented_execution" &&
      (!review.planting.trim() || !review.plantingDate || !review.plantingEvidence.trim())
    )
      issue("plantingEvidence", "Udført plantning kræver beskrivelse, dato og dokumentation.");
  });
export type AtlasReview = z.infer<typeof AtlasReviewSchema>;
export function initialAtlasReview(photo: AtlasPhoto): AtlasReview {
  return AtlasReviewSchema.parse({
    observation: photo.observation,
    vegetation: photo.vegetation,
    species: speciesText(photo),
    speciesStatus: photo.species.length ? "suggestion" : "not_assessed",
  });
}
export function documentedPhotoComparison(a: AtlasPhoto, b: AtlasPhoto, review: AtlasReview) {
  if (!AtlasReviewSchema.safeParse(review).success)
    return { documented: false, reason: "Registreringen mangler gyldig dato eller dokumentation." };
  if (a.sha256 && b.sha256 && a.sha256.toLowerCase() === b.sha256.toLowerCase())
    return {
      documented: false,
      reason: "Samme originalfil må ikke fremstilles som to optagelser før og efter en indsats.",
    };
  if (
    a.id === b.id ||
    !a.date ||
    !b.date ||
    !review.workDate ||
    !review.workEvidence.trim() ||
    !review.samePlaceEvidence.trim()
  )
    return {
      documented: false,
      reason:
        "Optagedatoer, samme sted og dateret arbejdsdokumentation skal være registreret før før/efter kan vises.",
    };
  const dates = [a.date, b.date].sort();
  if (dates[0] === dates[1] || review.workDate <= dates[0] || review.workDate >= dates[1])
    return {
      documented: false,
      reason: "Arbejdsdatoen ligger ikke mellem to forskellige optagedage.",
    };
  return {
    documented: true,
    reason:
      "Brugerregistreret sammenhæng med dateret arbejdsreference; øvrige billedforskelle skal stadig vurderes.",
    beforeId: a.date < b.date ? a.id : b.id,
    afterId: a.date < b.date ? b.id : a.id,
  };
}
export function filterAtlasPhotos(
  photos: AtlasPhoto[],
  filters: { search?: string; watercourse?: string; date?: string; section?: string },
) {
  const query = (filters.search ?? "").trim().toLocaleLowerCase("da-DK");
  return photos.filter(
    (p) =>
      (!filters.watercourse || p.watercourse === filters.watercourse) &&
      (!filters.date || p.date === filters.date) &&
      (!filters.section || p.section_id === filters.section) &&
      (!query ||
        [p.id, p.filename, p.observation, p.vegetation, p.watercourse, speciesText(p)]
          .join(" ")
          .toLocaleLowerCase("da-DK")
          .includes(query)),
  );
}
