import type { ProjectMediaItem } from "@/lib/platform/media-types";
import { extractDroneImageMetadata } from "./monitoring/drone-image-metadata";
import { parsePhotoAtlas, ATLAS_METHOD, type PhotoAtlas } from "@/lib/photo-atlas";

/** Read the authorized original, never its thumbnail or a signed URL as provenance. */
export async function atlasFromProjectOriginals(
  media: ProjectMediaItem[],
  projectId: string,
  projectName: string,
  progress: (done: number, total: number) => void,
): Promise<PhotoAtlas> {
  const items = media.filter(
    (m) =>
      m.projectId === projectId &&
      [
        "field_photo",
        "drone_image",
        "biodiversity_observation",
        "water_observation",
        "soil_observation",
      ].includes(m.category),
  );
  if (!items.length)
    throw new Error("Projektet har endnu ingen originalfotos. Upload billeder nedenfor først.");
  const photos = [];
  for (const item of items) {
    const response = await fetch(item.url, {
      credentials: "omit",
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok)
      throw new Error(`Originalen ${item.title} kunne ikke hentes. Genindlæs sagen og prøv igen.`);
    const blob = await response.blob();
    if (blob.size > 100 * 1024 * 1024) throw new Error("En original overstiger 100 MB.");
    const filename =
      typeof item.metadata?.original_name === "string" ? item.metadata.original_name : item.title;
    const original = new File([blob], filename, { type: blob.type, lastModified: 0 });
    const metadata = await extractDroneImageMetadata(original);
    if (item.sha256 && item.sha256.toLowerCase() !== metadata.file.sha256)
      throw new Error(`Originalens kontrolsum stemmer ikke: ${filename}. Atlas blev ikke gemt.`);
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error("Browseren kunne ikke danne en visningskopi.");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const time = metadata.capture.localTimestamp
      ? metadata.capture.localTimestamp + (metadata.capture.offset ?? "")
      : (metadata.capture.capturedAtUtc ?? null);
    photos.push({
      id: item.id,
      filename,
      date: time?.slice(0, 10) ?? null,
      time,
      lat: metadata.position?.latitude ?? null,
      lon: metadata.position?.longitude ?? null,
      observation: item.description ?? "",
      vegetation: "",
      species: [],
      watercourse: "",
      watercourse_id: "",
      section_id: "",
      match_status: "Tilknytning kræver gennemgang",
      visibility: "",
      species_status: "Ikke vurderet",
      species_evidence: "",
      date_status: time
        ? "Optagetid fra originalens metadata; arbejdsdato er ikke dokumenteret."
        : "Optagetid mangler i originalens metadata. Uploadtid bruges ikke som optagetid.",
      source: `${location.origin}/app/projects/${encodeURIComponent(projectId)}?media=${encodeURIComponent(item.id)}`,
      sha256: metadata.file.sha256,
      camera: [metadata.camera.make, metadata.camera.model].filter(Boolean).join(" "),
      yaw: metadata.orientation.viewDirectionDeg ?? null,
      image: canvas.toDataURL("image/jpeg", 0.82),
    });
    progress(photos.length, items.length);
  }
  return parsePhotoAtlas(
    JSON.stringify({
      title: `${projectName} · originalfotos`,
      version: "Freyra originalimport 1",
      method: `${ATLAS_METHOD} Visningskopier er dannet fra hentede originaler; SHA-256 er beregnet fra originalens bytes. Metadata er genlæst fra filen, og manglende oplysninger er bevaret som ukendte.`,
      photos,
    }),
  );
}
