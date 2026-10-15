import type { MunicipalReportVersion } from "@/services/monitoring/municipal-report-persistence";
import { municipalReportCanonicalText } from "@/services/monitoring/municipal-report";
const utf8 = new TextEncoder();
function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[-=+@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function municipalReportPhotoCsv(report: MunicipalReportVersion): string {
  const rows: unknown[][] = [
    [
      "foto_id",
      "original_sha256",
      "optaget_utc",
      "lokalt_tidspunkt",
      "tidszone_kendt",
      "kamera_breddegrad",
      "kamera_laengdegrad",
      "geometrirolle",
      "billedvurderinger",
      "gemte_svar",
      "rapportversion",
      "rapport_sha256",
    ],
  ];
  for (const p of report.manifest.photos)
    rows.push([
      p.mediaId,
      p.originalSha256,
      p.capturedAtUtc,
      p.localTimestamp,
      p.timezoneKnown,
      p.cameraPosition?.latitude,
      p.cameraPosition?.longitude,
      "camera_position_only",
      p.inspections.length,
      p.inspections.reduce(
        (n, i) => n + i.questions.filter((q) => q.answerVersionId !== null).length,
        0,
      ),
      report.id,
      report.manifestSha256,
    ]);
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
export function municipalReportCameraGeoJson(report: MunicipalReportVersion): string {
  return (
    JSON.stringify(
      {
        type: "FeatureCollection",
        name: "Kamerapositioner - ikke fund eller billedfootprint",
        features: report.manifest.photos.flatMap((p) =>
          p.cameraPosition
            ? [
                {
                  type: "Feature",
                  id: p.mediaId,
                  geometry: {
                    type: "Point",
                    coordinates: [p.cameraPosition.longitude, p.cameraPosition.latitude],
                  },
                  properties: {
                    mediaId: p.mediaId,
                    originalSha256: p.originalSha256,
                    capturedAtUtc: p.capturedAtUtc,
                    geometryRole: "camera_position_only",
                    objectLocationVerified: false,
                    footprintVerified: false,
                    municipalScopeApproved: false,
                    reportVersionId: report.id,
                    reportManifestSha256: report.manifestSha256,
                  },
                },
              ]
            : [],
        ),
      },
      null,
      2,
    ) + "\n"
  );
}
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let n = value;
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
/** Small interoperable ZIP with stored entries. No dependency or compression worker. */
export function municipalReportZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  if (files.length > 20 || new Set(files.map((f) => f.name)).size !== files.length)
    throw new Error("Ugyldig afleveringspakke.");
  const parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0,
    centralSize = 0;
  for (const f of files) {
    if (!/^[a-zA-Z0-9._-]+$/.test(f.name) || f.bytes.length > 30_000_000)
      throw new Error("Afleveringsfilen er ugyldig eller for stor.");
    const name = utf8.encode(f.name),
      crc = crc32(f.bytes),
      header = new Uint8Array(30 + name.length),
      view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(12, 33, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, f.bytes.length, true);
    view.setUint32(22, f.bytes.length, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    const c = new Uint8Array(46 + name.length),
      cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.bytes.length, true);
    cv.setUint32(24, f.bytes.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    c.set(name, 46);
    parts.push(header, f.bytes);
    central.push(c);
    offset += header.length + f.bytes.length;
    centralSize += c.length;
  }
  if (offset + centralSize > 35_000_000) throw new Error("Afleveringspakken er for stor.");
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  for (const bytes of [...parts, ...central, end]) {
    out.set(bytes, position);
    position += bytes.length;
  }
  return out;
}
export async function buildMunicipalReportPackage(
  report: MunicipalReportVersion,
  pdf: Uint8Array,
): Promise<Uint8Array> {
  const hash = async (bytes: Uint8Array) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  const canonical = municipalReportCanonicalText(report.manifest);
  if ((await hash(utf8.encode(canonical))) !== report.manifestSha256)
    throw new Error("Rapportens indhold matcher ikke den gemte version.");
  const files = [
    { name: "rapport.pdf", bytes: pdf },
    { name: "rapportgrundlag.json", bytes: utf8.encode(JSON.stringify(report, null, 2) + "\n") },
    { name: "fotoregister.csv", bytes: utf8.encode(municipalReportPhotoCsv(report)) },
    { name: "kamerapositioner.geojson", bytes: utf8.encode(municipalReportCameraGeoJson(report)) },
  ];
  const manifest = {
    schema: "gofreyra.municipal-report-package/v1",
    pdfRendererVersion: "municipal-evidence-pdf/v1",
    reportVersionId: report.id,
    reportManifestSha256: report.manifestSha256,
    status: "draft_unreviewed",
    professionallyReviewed: false,
    municipalScopeApproved: false,
    files: await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        sizeBytes: f.bytes.length,
        sha256: await hash(f.bytes),
      })),
    ),
    limitations: [
      "PDF-illustrationer er afledninger af de præcise originaler og erstatter ikke originalfilerne.",
      "Originalfotos opbevares i det adgangsbeskyttede evidensarkiv. De er ikke kopieret ind i denne pakke.",
      "GeoJSON viser kamerapositioner, ikke georefererede fund eller billedfootprints.",
    ],
  };
  return municipalReportZip([
    ...files,
    { name: "manifest.json", bytes: utf8.encode(JSON.stringify(manifest, null, 2) + "\n") },
  ]);
}
