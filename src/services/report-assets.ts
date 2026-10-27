import { reportMapPlan } from "@/lib/report-map";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportRevision } from "@/lib/report-document";
export interface ReportImage {
  id: string;
  caption: string;
  bytes: Uint8Array;
  format: "jpeg" | "png";
  width: number;
  height: number;
}
function canvasBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      async (blob) =>
        blob
          ? resolve(new Uint8Array(await blob.arrayBuffer()))
          : reject(new Error("Billedrendering mislykkedes")),
      "image/jpeg",
      0.85,
    ),
  );
}
export async function buildReportImages(revision: ReportRevision): Promise<ReportImage[]> {
  const images: ReportImage[] = [];
  const points = revision.content.sources.filter((s) => s.position);
  let atlasImages: ReportImage[] = [];
  const manifest = revision.content.photoAtlas;
  if (manifest) {
    if (!revision.content.sources.some((source) => source.id === `evidence:${manifest.evidenceId}`))
      throw new Error("Fotoatlasset mangler i rapportens kilderegister.");
    const report = await (supabase as unknown as SupabaseClient)
      .from("report_documents")
      .select("organization_id,project_id")
      .eq("id", revision.report_id)
      .single();
    if (report.error || !report.data)
      throw new Error("Rapportens projektadgang kunne ikke bekræftes.");
    const { loadPhotoAtlas } = await import("./photo-atlas-service");
    const { atlasReportImages } = await import("@/lib/photo-atlas-export");
    const atlas = await loadPhotoAtlas(
      { organizationId: report.data.organization_id, projectId: report.data.project_id },
      manifest.evidenceId,
    );
    if (
      atlas.checksum !== manifest.checksum ||
      new Set(manifest.photoIds).size !== manifest.photoIds.length
    )
      throw new Error("Fotoatlassets kilde eller checksum er ændret. Eksporten er stoppet.");
    const selected = manifest.photoIds.map((id) => {
      const photo = atlas.photos.find((p) => p.id === id);
      if (!photo) throw new Error("Et foto mangler i det gemte atlas. Eksporten er stoppet.");
      return photo;
    });
    atlasImages = await atlasReportImages(atlas, selected);
    for (const photo of selected)
      if (photo.lat != null && photo.lon != null)
        points.push({
          id: photo.id,
          title: photo.filename,
          kind: "atlas_illustration",
          capturedAt: photo.time ?? null,
          checksum: null,
          position: [photo.lon, photo.lat],
          method: "Kamera-GPS fra fotoatlas; motivplacering uafklaret",
          version: atlas.checksum,
        });
  }
  if (points.length) {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 850;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Kortoversigten kunne ikke tegnes.");
    ctx.fillStyle = "#f4f7f4";
    ctx.fillRect(0, 0, 1400, 850);
    const plan = reportMapPlan(points.map((s) => s.position!));
    let basemap = true;
    ctx.save();
    ctx.beginPath();
    ctx.rect(70, 100, 1250, 620);
    ctx.clip();
    try {
      const signal = AbortSignal.timeout(15000);
      for (const tile of plan.tiles) {
        const response = await fetch(tile.url, { credentials: "omit", signal });
        if (!response.ok) throw new Error("Kortfelt utilgængeligt");
        const bitmap = await createImageBitmap(await response.blob());
        ctx.drawImage(bitmap, 70 + tile.left, 100 + tile.top, 256, 256);
        bitmap.close();
      }
    } catch {
      basemap = false;
      ctx.fillStyle = "#edf1ed";
      ctx.fillRect(70, 100, 1250, 620);
    }
    ctx.restore();
    ctx.fillStyle = "#193c2f";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(
      basemap
        ? "Oversigtskort og fotopositioner"
        : "Baggrundskort utilgængeligt - kun fotopositioner",
      45,
      50,
    );
    ctx.strokeStyle = "#adbab2";
    ctx.strokeRect(70, 100, 1250, 620);
    ctx.font = "18px sans-serif";
    plan.points.forEach(([x, y], i) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(70 + x, 100 + y, 9, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "#a82f26";
      ctx.beginPath();
      ctx.arc(70 + x, 100 + y, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "#182b20";
      ctx.fillText(String(i + 1), 82 + x, 93 + y);
    });
    ctx.font = "18px sans-serif";
    ctx.fillText(
      basemap
        ? "© OpenStreetMap contributors | openstreetmap.org/copyright"
        : "Baggrundskort kunne ikke hentes. Denne skitse viser kun registrerede GPS-punkter.",
      70,
      765,
    );
    ctx.fillText(
      "Nord op. Fotopunkter dokumenterer ikke fotodækning eller målfast ortofoto.",
      70,
      802,
    );
    images.push({
      id: "gps-overview",
      caption: `${basemap ? "Baggrund: OpenStreetMap, hentet " + new Date().toISOString() : "Baggrundskort utilgængeligt"}. Fotopositioner i kilderegisterets rækkefølge (kun kilder med GPS). Officielle naturbindinger og faktisk fotodækning fremgår ikke af dette kort.`,
      bytes: await canvasBytes(canvas),
      format: "jpeg",
      width: 1400,
      height: 850,
    });
  }
  let totalBytes = 0;
  for (const image of atlasImages) {
    totalBytes += image.bytes.length;
    if (totalBytes > 100 * 1024 * 1024)
      throw new Error("Fotoatlas overstiger 100 MB. Afgræns rapporten.");
    images.push(image);
  }
  for (const source of revision.content.sources) {
    if (
      !source.filePath ||
      !source.storageBucket ||
      !source.checksum ||
      !source.mimeType?.match(/^image\/(jpeg|png)$/)
    )
      continue;
    if (!["project-originals", "project-media"].includes(source.storageBucket))
      throw new Error("Ukendt kildebucket.");
    const { data, error } = await supabase.storage
      .from(source.storageBucket)
      .createSignedUrl(source.filePath, 300);
    if (error || !data?.signedUrl)
      throw new Error(`Adgang til foto ${source.title} kunne ikke bekræftes.`);
    const response = await fetch(data.signedUrl);
    if (!response.ok) throw new Error(`Foto ${source.title} kunne ikke hentes.`);
    const original = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", original)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== source.checksum)
      throw new Error(`Checksum afviger for ${source.title}. Eksporten er stoppet.`);
    const bitmap = await createImageBitmap(new Blob([original], { type: source.mimeType }));
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Foto kunne ikke renderes.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const bytes = await canvasBytes(canvas);
    totalBytes += bytes.length;
    if (totalBytes > 100 * 1024 * 1024)
      throw new Error("Fotoatlas overstiger 100 MB. Afgræns rapportens kilder.");
    images.push({
      id: source.id,
      caption: `${source.title} | ${source.id} | ${source.capturedAt ?? "Fotodato ukendt"} | GPS ${source.position?.join(", ") ?? "mangler"}. Originalens SHA-256 er kontrolleret. Visningskopi nedskaleret.`,
      bytes,
      format: "jpeg",
      width: canvas.width,
      height: canvas.height,
    });
  }
  return images;
}
