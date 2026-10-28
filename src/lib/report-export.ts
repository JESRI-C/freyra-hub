import { jsPDF } from "jspdf";
import { REPORT_FONT } from "./fonts/report-font";
import type { ReportImage } from "@/services/report-assets";
import { BASIS_LABELS, type ReportRevision } from "./report-document";

export type ReportFormat = "pdf" | "docx" | "csv" | "geojson";
const encoder = new TextEncoder();
function xml(s: string) {
  return s.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Standards-compliant uncompressed ZIP, sufficient for a small editable OOXML document. */
export function zipFiles(files: Record<string, string | Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = encoder.encode(path),
      data = typeof text === "string" ? encoder.encode(text) : text,
      crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length),
      c = new DataView(cd.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    cd.set(name, 46);
    chunks.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let pos = 0;
  for (const chunk of [...chunks, ...central, end]) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
export function reportLines(revision: ReportRevision): string[] {
  const c = revision.content;
  return [
    "FREYRA",
    c.title,
    `Modtager: ${c.organizationName}`,
    `Version ${revision.version} | ${revision.status === "approved" ? "Godkendt" : "KLADDE - ikke godkendt"}`,
    `Rapport: ${revision.report_id}`,
    `Gemte kilder pr. ${revision.created_at}`,
    `Scope: ${c.scope}`,
    `Målgruppe: ${c.audience}`,
    "",
    ...c.sections.flatMap((s) => [
      s.title,
      `Grundlag: ${BASIS_LABELS[s.basis]}`,
      s.text || "Grundlaget er ikke dokumenteret.",
      `Kilder: ${s.sourceIds.join(", ") || "Ingen"}`,
      "",
    ]),
    ...(c.workflowSnapshot
      ? [
          "Dokumentationsreview (ingen automatisk effektgodkendelse)",
          c.workflowSnapshot.review
            ? c.workflowSnapshot.review.decision +
              ": " +
              c.workflowSnapshot.review.reason +
              " · inputversioner: " +
              c.workflowSnapshot.review.inputIds.join(", ")
            : "Afventer versionsafgrænset dokumentationsreview.",
        ]
      : []),
    "Kilderegister",
    ...(c.sources.length ? [] : ["Ingen registrerede kilder."]),
    c.photoAtlas
      ? "Fotobilaget indeholder visningskopier fra den registrerede atlasfil. Originalreferencer og registrerede originalchecksums fremgår ved fotoerne; de erstatter ikke verificerede originalfiler."
      : "Fotoatlas medtager kun JPEG/PNG-kilder med gemt filsti og originalchecksum. Øvrige kilder er kun medtaget som referencer.",
    ...c.sources.flatMap((s) => [
      `${s.id}: ${s.title}`,
      `Metode: ${s.method}; version: ${s.version}`,
      `Dato: ${s.capturedAt ?? "Ukendt"}; GPS: ${s.position?.join(", ") ?? "Mangler"}`,
      `Original SHA-256: ${s.checksum ?? "Ikke dokumenteret"}`,
    ]),
  ];
}
export function buildDocx(revision: ReportRevision, images: ReportImage[] = []): Uint8Array {
  const headings = new Set([
    revision.content.title,
    ...revision.content.sections.map((s) => s.title),
    "Kilderegister",
  ]);
  const paragraphs = reportLines(revision)
    .map(
      (line) =>
        `<w:p><w:pPr><w:spacing w:after="80"/>${headings.has(line) ? "<w:keepNext/>" : ""}</w:pPr><w:r><w:rPr>${headings.has(line) ? '<w:b/><w:sz w:val="28"/>' : '<w:sz w:val="20"/>'}</w:rPr><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`,
    )
    .join("");
  const files: Record<string, string | Uint8Array> = {};
  const imageParagraphs = images
    .map((image, i) => {
      files[`word/media/image${i}.${image.format}`] = image.bytes;
      const scale = Math.min(5943600 / image.width, 7315200 / image.height),
        width = Math.round(image.width * scale),
        height = Math.round(image.height * scale);
      return `<w:p><w:pPr><w:pageBreakBefore/><w:keepNext/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${i === 0 && image.id === "gps-overview" ? "Fotopositioner" : "Fotoatlas"}</w:t></w:r></w:p><w:p><w:r><w:drawing><wp:inline><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${i + 1}" name="${xml(image.id)}" descr="${xml(image.caption)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${i + 1}" name="Image ${i + 1}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image${i}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:r><w:t>${xml(image.caption)}</w:t></w:r></w:p>`;
    })
    .join("");
  files["[Content_Types].xml"] =
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  files["_rels/.rels"] =
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  files["word/_rels/document.xml.rels"] =
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${images.map((image, i) => `<Relationship Id="image${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i}.${image.format}"/>`).join("")}</Relationships>`;
  files["word/document.xml"] =
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${paragraphs}${imageParagraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  return zipFiles(files);
}
export function buildReportCsv(revision: ReportRevision): string {
  const cell = (v: unknown) =>
    `"${String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replace(/"/g, '""')}"`;
  const rows: unknown[][] = [
    [
      "report_id",
      "revision",
      "source_id",
      "title",
      "kind",
      "captured_at",
      "longitude",
      "latitude",
      "method",
      "source_version",
      "original_sha256",
    ],
  ];
  for (const s of revision.content.sources)
    rows.push([
      revision.report_id,
      revision.version,
      s.id,
      s.title,
      s.kind,
      s.capturedAt,
      s.position?.[0],
      s.position?.[1],
      s.method,
      s.version,
      s.checksum,
    ]);
  return "\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
export function buildReportGeoJSON(revision: ReportRevision) {
  return {
    type: "FeatureCollection",
    report_id: revision.report_id,
    version: revision.version,
    features: revision.content.sources
      .filter((s) => s.position)
      .map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: s.position },
        properties: {
          source_id: s.id,
          title: s.title,
          method: s.method,
          version: s.version,
          checksum: s.checksum,
        },
      })),
  };
}
export async function generateReportFile(
  revision: ReportRevision,
  format: ReportFormat,
  images: ReportImage[] = [],
): Promise<{ bytes: Uint8Array; checksum: string; filename: string; mime: string }> {
  let bytes: Uint8Array;
  let mime: string;
  if (format === "pdf") {
    const pdf = new jsPDF();
    if (revision.content.workflowSnapshot) {
      // Stable exports from the frozen revision; historical generators are untouched.
      pdf.setCreationDate(new Date(revision.created_at));
      pdf.setFileId(revision.id.replaceAll("-", "").toUpperCase());
    }
    pdf.addFileToVFS("FreyraReport.ttf", REPORT_FONT);
    pdf.addFont("FreyraReport.ttf", "FreyraReport", "normal");
    pdf.setFont("FreyraReport");
    let y = 20;
    const headings = new Set([
      revision.content.title,
      ...revision.content.sections.map((s) => s.title),
      "Kilderegister",
    ]);
    for (const paragraph of reportLines(revision)) {
      const heading = headings.has(paragraph);
      if (heading && y > 245) {
        pdf.addPage();
        y = 20;
      }
      pdf.setFontSize(paragraph === revision.content.title ? 16 : heading ? 12 : 10);
      for (const line of pdf.splitTextToSize(paragraph, 170) as string[]) {
        if (y > 275) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(line, 20, y);
        y += heading ? 7 : 5;
      }
    }
    let atlasY: number | null = null;
    for (const image of images) {
      if (revision.content.photoAtlas && image.id.startsWith("atlas:")) {
        pdf.setFontSize(7);
        const lines = pdf.splitTextToSize(image.caption, 94) as string[];
        const scale = Math.min(74 / image.width, 50 / image.height);
        const rowHeight =
          Math.max(image.height * scale, lines.length * 2.9 + (image.sourceUrl ? 5 : 0)) + 9;
        if (rowHeight <= 242) {
          if (atlasY === null || atlasY + rowHeight > 278) {
            pdf.addPage();
            pdf.setFontSize(14);
            pdf.setTextColor(25, 60, 47);
            pdf.text("Freyra · fotobilag", 20, 20);
            pdf.setTextColor(25, 35, 29);
            pdf.setFontSize(7);
            pdf.text(
              "Rapportillustrationer · kamera-GPS er ikke motivposition · artsbud kræver kontrol",
              20,
              26,
            );
            atlasY = 33;
          }
          pdf.addImage(
            image.bytes,
            image.format.toUpperCase(),
            20,
            atlasY,
            image.width * scale,
            image.height * scale,
          );
          pdf.setFontSize(7);
          lines.forEach((line, index) => pdf.text(line, 98, atlasY! + 3 + index * 2.9));
          if (image.sourceUrl)
            pdf.textWithLink(
              "Originalens kildehenvisning (klik)",
              98,
              atlasY + 6 + lines.length * 2.9,
              { url: image.sourceUrl },
            );
          atlasY += rowHeight;
          continue;
        }
      }
      atlasY = null;
      pdf.addPage();
      pdf.setFontSize(16);
      pdf.text(image.id === "gps-overview" ? "Fotopositioner" : "Fotoatlas", 20, 22);
      pdf.setFontSize(9);
      const caption = pdf.splitTextToSize(image.caption, 170) as string[];
      const maxHeight = Math.max(60, 230 - Math.min(caption.length * 4, 80));
      const scale = Math.min(170 / image.width, maxHeight / image.height),
        width = image.width * scale,
        height = image.height * scale;
      pdf.addImage(image.bytes, image.format.toUpperCase(), 20, 35, width, height);
      let captionY = 45 + height;
      for (const line of caption) {
        if (captionY > 275) {
          pdf.addPage();
          captionY = 20;
        }
        pdf.text(line, 20, captionY);
        captionY += 4;
      }
    }
    for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.text(`Freyra | v${revision.version} | ${page}/${pdf.getNumberOfPages()}`, 20, 290);
    }
    bytes = new Uint8Array(pdf.output("arraybuffer"));
    mime = "application/pdf";
  } else if (format === "docx") {
    bytes = buildDocx(revision, images);
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (format === "csv") {
    bytes = encoder.encode(buildReportCsv(revision));
    mime = "text/csv;charset=utf-8";
  } else {
    bytes = encoder.encode(JSON.stringify(buildReportGeoJSON(revision), null, 2));
    mime = "application/geo+json";
  }
  if (!bytes.length) throw new Error("Eksporten gav en tom fil.");
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return {
    bytes,
    checksum: Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
    filename: `Freyra-${revision.report_id}-v${revision.version}.${format}`,
    mime,
  };
}
export async function downloadReportFile(
  revision: ReportRevision,
  format: ReportFormat,
  images: ReportImage[] = [],
) {
  const file = await generateReportFile(revision, format, images);
  const url = URL.createObjectURL(new Blob([file.bytes.slice().buffer], { type: file.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return file;
}
