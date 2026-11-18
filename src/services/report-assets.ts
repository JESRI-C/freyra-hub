import {
  isOnReportMap,
  placeReportMapLabels,
  reportMapGeometry,
  reportMapPlan,
  REPORT_MAP_WIDTH,
  REPORT_MAP_HEIGHT,
} from "@/lib/report-map";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasConfirmedReportPhoto,
  reportPhotoMapNumbers,
  type ReportRevision,
} from "@/lib/report-document";
import { atlasPhotoMapPoints } from "@/lib/photo-atlas";
import { comparisonCaptureLabel } from "@/lib/photo-comparison";
export interface ReportImage {
  id: string;
  caption: string;
  sourceUrl?: string;
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
  const mapNumbers = reportPhotoMapNumbers(revision.content);
  const bridges = revision.content.bridgeObservations ?? [];
  const bridgeMap = bridges.length > 0;
  const areas = revision.content.natureSurvey?.areas ?? [];
  const surveyMap = areas.length > 0;
  const { rings, points } = reportMapGeometry(revision.content);
  const positionLabel = surveyMap
    ? "undersøgelsesområder"
    : bridgeMap
      ? "objektpositioner"
      : "fotopositioner";
  let atlasImages: ReportImage[] = [];
  const manifest = revision.content.photoAtlas;
  if (
    manifest &&
    !revision.content.sources.some((source) => source.id === `evidence:${manifest.evidenceId}`)
  )
    throw new Error("Fotoatlasset mangler i rapportens kilderegister.");
  let reportScope: { projectId: string; organizationId: string } | undefined;
  if (
    manifest ||
    revision.content.sources.some((s) => s.storageBucket === "monitoring-uploads" && s.checksum)
  ) {
    const report = await (supabase as unknown as SupabaseClient)
      .from("report_documents")
      .select("organization_id,project_id")
      .eq("id", revision.report_id)
      .single();
    if (report.error || !report.data)
      throw new Error("Rapportens projektadgang kunne ikke bekræftes.");
    reportScope = {
      projectId: report.data.project_id,
      organizationId: report.data.organization_id,
    };
  }
  if (manifest && reportScope) {
    const { loadPhotoAtlas } = await import("./photo-atlas-service");
    const { atlasReportImages } = await import("@/lib/photo-atlas-export");
    const hasFrozenSpatialMatch = manifest.mapPoints?.some(
      (p) => p.nearestWatercourse !== undefined,
    );
    const atlas = await loadPhotoAtlas(
      reportScope,
      manifest.evidenceId,
      hasFrozenSpatialMatch ?? false,
    );
    if (
      atlas.checksum !== manifest.checksum ||
      new Set(manifest.photoIds).size !== manifest.photoIds.length
    )
      throw new Error("Fotoatlassets kilde eller checksum er ændret. Eksporten er stoppet.");
    const atlasById = new Map(atlas.photos.map((p) => [p.id, p]));
    const selected = manifest.photoIds.map((id) => {
      const photo = atlasById.get(id);
      if (!photo) throw new Error("Et foto mangler i det gemte atlas. Eksporten er stoppet.");
      return photo;
    });
    const atlasPoints = atlasPhotoMapPoints(selected);
    if (
      manifest.illustratedPhotoCount !== undefined &&
      manifest.illustratedPhotoCount !== selected.filter((photo) => photo.image).length
    )
      throw new Error("Antallet af illustrationer matcher ikke det gemte fotoatlas.");
    if (
      manifest.mapPoints &&
      (manifest.mapPoints.length !== atlasPoints.length ||
        manifest.mapPoints.some(
          (point, i) =>
            point.id !== atlasPoints[i].id ||
            point.position[0] !== atlasPoints[i].position[0] ||
            point.position[1] !== atlasPoints[i].position[1] ||
            (point.nearestWatercourse !== undefined &&
              point.nearestWatercourse !== atlasPoints[i].nearestWatercourse) ||
            (point.positionFlag !== undefined &&
              point.positionFlag !== atlasPoints[i].positionFlag) ||
            (point.distanceToLineM !== undefined &&
              point.distanceToLineM !== atlasPoints[i].distanceToLineM),
        ))
    )
      throw new Error("Fotoatlassets gemte kortpunkter matcher ikke kilden.");
    atlasImages = await atlasReportImages(atlas, selected, manifest.captions);
    for (const image of atlasImages) {
      const number = mapNumbers.get(image.id);
      if (number) image.caption = `Kortpunkt ${number} · ${image.caption}`;
    }
    if (!bridgeMap && !surveyMap) points.push(...atlasPoints.map((point) => point.position));
  }
  const viewport = revision.content.mapViewport;
  if (points.length || viewport) {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 850;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Kortoversigten kunne ikke tegnes.");
    ctx.fillStyle = "#f4f7f4";
    ctx.fillRect(0, 0, 1400, 850);
    const plan = reportMapPlan(
      [...points, ...rings.flat(2)],
      REPORT_MAP_WIDTH,
      REPORT_MAP_HEIGHT,
      viewport,
    );
    const markers = plan.points.slice(0, points.length);
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
    let vertex = points.length;
    for (const polygon of rings) {
      ctx.beginPath();
      for (const ring of polygon) {
        for (let index = 0; index < ring.length; index++) {
          const [x, y] = plan.points[vertex++];
          if (index === 0) ctx.moveTo(x + 70, y + 100);
          else ctx.lineTo(x + 70, y + 100);
        }
        ctx.closePath();
      }
      ctx.fillStyle = "rgba(24, 128, 78, 0.25)";
      ctx.strokeStyle = "#157448";
      ctx.lineWidth = 3;
      ctx.fill("evenodd");
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.restore();
    ctx.fillStyle = "#193c2f";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(
      !points.length
        ? basemap
          ? "Valgt kortudsnit"
          : "Valgt kortudsnit uden baggrundskort"
        : basemap
          ? `Oversigtskort og ${positionLabel}`
          : `Baggrundskort utilgængeligt - kun ${positionLabel}`,
      45,
      50,
    );
    ctx.strokeStyle = "#adbab2";
    ctx.strokeRect(70, 100, 1250, 620);
    ctx.font = "18px sans-serif";
    ctx.fillText("↑ N", 1250, 50);
    const cameraMarker = (x: number, y: number) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "#a82f26";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    };
    if (points.length) cameraMarker(75, 73);
    ctx.fillStyle = "#182b20";
    ctx.fillText(
      !points.length
        ? "Ingen stedfæstede kilder"
        : surveyMap
          ? "Nummereret undersøgelsesområde"
          : bridgeMap
            ? "Nummereret broregistrering"
            : "Nummereret kameraposition",
      88,
      79,
    );
    const visibleMarkers = viewport ? markers.filter((point) => isOnReportMap(point)) : markers;
    const labels = placeReportMapLabels(markers, REPORT_MAP_WIDTH, REPORT_MAP_HEIGHT, !!viewport);
    if (viewport) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(70, 100, REPORT_MAP_WIDTH, REPORT_MAP_HEIGHT);
      ctx.clip();
    }
    ctx.strokeStyle = "#42554a";
    for (const { index, left, top, width, height } of labels) {
      const [x, y] = markers[index];
      ctx.beginPath();
      ctx.moveTo(70 + x, 100 + y);
      ctx.lineTo(
        70 + Math.max(left, Math.min(left + width, x)),
        100 + Math.max(top, Math.min(top + height, y)),
      );
      ctx.stroke();
    }
    visibleMarkers.forEach(([x, y]) => cameraMarker(70 + x, 100 + y));
    for (const { index, left, top, width, height } of labels) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(70 + left, 100 + top, width, height);
      ctx.fillStyle = "#182b20";
      ctx.fillText(String(index + 1), 74 + left, 118 + top);
    }
    if (viewport) ctx.restore();
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#182b20";
    ctx.fillText(
      basemap
        ? "© OpenStreetMap contributors | openstreetmap.org/copyright"
        : surveyMap
          ? "Baggrundskort kunne ikke hentes. Skitsen viser de registrerede områdegrænser."
          : "Baggrundskort kunne ikke hentes. Denne skitse viser kun registrerede GPS-punkter.",
      70,
      765,
    );
    ctx.fillText(
      surveyMap
        ? "Web Mercator (EPSG:3857). Arealgrænser fra sagens feltregistrering."
        : bridgeMap
          ? "Web Mercator (EPSG:3857). Punkterne viser objekternes registrerede positioner."
          : "Web Mercator (EPSG:3857). Punkterne viser kameraernes registrerede positioner.",
      70,
      802,
    );
    const scale = plan.scale;
    const scaleLabel = scale.meters >= 1000 ? `${scale.meters / 1000} km` : `${scale.meters} m`;
    ctx.fillRect(1110, 782, scale.pixels, 3);
    ctx.fillRect(1110, 776, 2, 9);
    ctx.fillRect(1110 + scale.pixels - 2, 776, 2, 9);
    ctx.fillText(`${scaleLabel} ved kortets midte`, 1060, 811);
    images.push({
      id: "gps-overview",
      caption: `${basemap ? "Baggrund: OpenStreetMap, hentet " + new Date().toISOString() : "Baggrundskort utilgængeligt"}. ${surveyMap ? "Områdegrænser og numre fra rapportens undersøgelsesområder." : bridgeMap ? "Objektpositioner i samme rækkefølge som den nummererede objektliste." : "Fotopositioner i kilderegisterets rækkefølge (kun kilder med GPS)."}${viewport ? ` Valgt kortudsnit. ${visibleMarkers.length} af ${markers.length} positioner er inden for rammen.` : ""}${labels.length < visibleMarkers.length ? ` ${visibleMarkers.length - labels.length} numre er udeladt ved tætte punkter.` : ""} Officielle naturbindinger og faktisk fotodækning fremgår ikke af dette kort.`,
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
    let signedUrl: string;
    if (source.storageBucket === "monitoring-uploads") {
      if (!reportScope || !source.id.startsWith("media:") || !hasConfirmedReportPhoto(source))
        throw new Error("Dronefotoets faglige gennemgang matcher ikke den gemte kilde.");
      const { getCanonicalDroneMediaUrl } = await import("@/lib/canonical-drone-media.functions");
      const mediaId = source.id.slice("media:".length);
      const original = await getCanonicalDroneMediaUrl({
        data: { projectId: reportScope.projectId, mediaId },
      });
      if (
        original.projectId !== reportScope.projectId ||
        original.mediaId !== mediaId ||
        original.originalSha256 !== source.checksum
      )
        throw new Error("Droneoriginalen matcher ikke rapportversionens kilde.");
      signedUrl = original.signedUrl;
    } else {
      if (!["project-originals", "project-media"].includes(source.storageBucket))
        throw new Error("Ukendt kildebucket.");
      const { data, error } = await supabase.storage
        .from(source.storageBucket)
        .createSignedUrl(source.filePath, 300);
      if (error || !data?.signedUrl)
        throw new Error(`Adgang til foto ${source.title} kunne ikke bekræftes.`);
      signedUrl = data.signedUrl;
    }
    const response = await fetch(signedUrl);
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
    const pointNumber = mapNumbers.get(source.id);
    const date = source.localCaptureDate
      ? comparisonCaptureLabel(source)
      : (source.capturedAt ?? "Fotodato ukendt");
    images.push({
      id: source.id,
      caption: pointNumber
        ? `Kortpunkt ${pointNumber} · ${source.title} · ${date}. Originalens SHA-256 er kontrolleret. Koordinater og kilde-id står i kilderegisteret.`
        : `${source.title} | ${source.id} | ${date} | GPS ${source.position?.join(", ") ?? "mangler"}. Originalens SHA-256 er kontrolleret. Visningskopi nedskaleret.`,
      bytes,
      format: "jpeg",
      width: canvas.width,
      height: canvas.height,
    });
  }
  return images;
}
