// Shared GoFreyra A4 layout for project reports (status, indicator, authority).
// All brand assets and fonts are bundled locally and inlined at build time,
// so generating a PDF never makes a network request.
import jsPDF from "jspdf";
import type { Project, Action, Indicator, Site } from "@/lib/supabase/types";
import logoUrl from "@/assets/pdf/gofreyra-logo-vandret.png?inline";
import landscapeUrl from "@/assets/pdf/landskab.png?inline";
import interRegularUrl from "@/assets/pdf/Inter-Regular.ttf?inline";
import interBoldUrl from "@/assets/pdf/Inter-Bold.ttf?inline";

export type ReportType = "status" | "indicator" | "authority";

// Brand palette (gofreyra.com)
const GREEN: RGB = [0x24, 0x5a, 0x38];
const TINT: RGB = [0xe2, 0xef, 0xe4];
const INK: RGB = [0x24, 0x27, 0x2b];
const MUTED: RGB = [0x5b, 0x61, 0x68]; // >= 4.5:1 on white
const RULE: RGB = [0xd4, 0xd9, 0xd5];
type RGB = [number, number, number];

// Asset intrinsic sizes (px) — used to preserve proportions.
const LOGO_RATIO = 1800 / 590;
const LANDSCAPE_RATIO = 1800 / 871;

// A4 geometry (mm)
const PAGE_W = 210;
const PAGE_H = 297;
const M = 18; // side margin
const CONTENT_W = PAGE_W - M * 2;
const HEADER_H = 22; // logo header band on every page
const CONTENT_TOP = HEADER_H + 8;
const FOOTER_Y = PAGE_H - 12;
const CONTENT_BOTTOM = FOOTER_Y - 8;

// Type rhythm (pt font sizes, mm line heights)
const T = {
  title: { size: 22, lh: 9 },
  h2: { size: 13, lh: 6 },
  body: { size: 10, lh: 4.8 },
  small: { size: 8.5, lh: 4 },
};

const TYPE_LABEL: Record<ReportType, string> = {
  status: "Projektstatusrapport",
  indicator: "Indikatorrapport",
  authority: "Myndighedsrapport",
};

const INDICATOR_STATUS: Record<string, string> = { ok: "OK", warning: "Advarsel", critical: "Kritisk" };

export interface ProjectReportPdfInput {
  project: Project;
  sites: Site[];
  actions: Action[];
  indicators: Indicator[];
  reportType: ReportType;
  title: string;
  generatedAt: Date;
}

function b64(dataUrl: string) {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("da-DK");
}

function ellipsize(pdf: jsPDF, text: string, width: number) {
  if (pdf.getTextWidth(text) <= width) return text;
  let t = text;
  while (t.length > 1 && pdf.getTextWidth(t + "…") > width) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

const num = (n: number) => n.toLocaleString("da-DK");

class Layout {
  pdf: jsPDF;
  y = CONTENT_TOP;
  constructor(private reportLabel: string) {
    this.pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    this.pdf.addFileToVFS("Inter-Regular.ttf", b64(interRegularUrl));
    this.pdf.addFont("Inter-Regular.ttf", "Inter", "normal");
    this.pdf.addFileToVFS("Inter-Bold.ttf", b64(interBoldUrl));
    this.pdf.addFont("Inter-Bold.ttf", "Inter", "bold");
    this.header();
  }

  font(style: "normal" | "bold", size: number, color: RGB = INK) {
    this.pdf.setFont("Inter", style);
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...color);
  }

  header() {
    const h = 9;
    this.pdf.addImage(logoUrl, "PNG", M, 8, h * LOGO_RATIO, h, "logo", "FAST");
    this.font("normal", T.small.size, MUTED);
    this.pdf.text(this.reportLabel, PAGE_W - M, 13.5, { align: "right" });
    this.pdf.setDrawColor(...RULE);
    this.pdf.setLineWidth(0.3);
    this.pdf.line(M, HEADER_H, PAGE_W - M, HEADER_H);
  }

  newPage() {
    this.pdf.addPage();
    this.header();
    this.y = CONTENT_TOP;
  }

  /** Ensure `h` mm fits on the current page; otherwise break. */
  need(h: number) {
    if (this.y + h > CONTENT_BOTTOM) this.newPage();
  }

  lines(text: string, width: number, size: number): string[] {
    this.pdf.setFontSize(size);
    return this.pdf.splitTextToSize(text, width) as string[];
  }

  /** Title band, page 1 only: tinted area with cropped landscape at right. */
  titleArea(title: string, context: [string, string][]) {
    const top = HEADER_H + 4;
    const textW = 112; // text column, kept clear of the landscape
    this.font("bold", T.title.size);
    const titleLines = this.lines(title, textW, T.title.size);
    const colW = textW / 2;
    this.font("bold", T.body.size);
    const ctxLines = context.map(([, v]) => Math.min(2, this.lines(v, colW - 4, T.body.size).length));
    const rowH: number[] = [];
    for (let r = 0; r * 2 < context.length; r++) rowH.push(5.6 + Math.max(ctxLines[r * 2] ?? 1, ctxLines[r * 2 + 1] ?? 1) * T.body.lh);
    const rowY = rowH.map((_, r) => rowH.slice(0, r).reduce((a, b) => a + b, 0));
    const ctxH = rowH.reduce((a, b) => a + b, 0);
    this.font("bold", T.title.size);
    const bandH = Math.max(58, 12 + titleLines.length * T.title.lh + 6 + ctxH + 6);

    this.pdf.setFillColor(...TINT);
    this.pdf.rect(0, top, PAGE_W, bandH, "F");

    // Landscape mark: anchored to the right edge, cropped by the page edge and band bottom.
    const imgH = bandH * 0.92;
    const imgW = imgH * LANDSCAPE_RATIO;
    const gs = new (this.pdf as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.22 });
    this.pdf.saveGraphicsState();
    (this.pdf as unknown as { setGState: (g: unknown) => void }).setGState(gs);
    // Starts right of the text column; the page edge crops it on the right.
    this.pdf.addImage(landscapeUrl, "PNG", M + textW + 8, top + bandH - imgH, imgW, imgH, "landscape", "FAST");
    this.pdf.restoreGraphicsState();

    let y = top + 12;
    this.font("bold", T.title.size, GREEN);
    for (const l of titleLines) { this.pdf.text(l, M, y + 5); y += T.title.lh; }
    y += 6;

    context.forEach(([k, v], i) => {
      const x = M + (i % 2) * colW;
      const ry = y + rowY[Math.floor(i / 2)];
      this.font("normal", T.small.size, MUTED);
      this.pdf.text(k.toUpperCase(), x, ry);
      this.font("bold", T.body.size);
      // Up to two lines; never silently drop the end of a value.
      const vl = this.lines(v, colW - 4, T.body.size);
      const shown = vl.length > 2 ? [vl[0], ellipsize(this.pdf, vl.slice(1).join(" "), colW - 4)] : vl;
      shown.forEach((l, li) => this.pdf.text(l, x, ry + 4.6 + li * T.body.lh));
    });

    this.y = top + bandH + 10;
  }

  /** Section heading; kept with at least `keep` mm of following content. */
  heading(text: string, keep = 18) {
    this.need(T.h2.lh + 6 + keep);
    if (this.y > CONTENT_TOP) this.y += 3;
    this.font("bold", T.h2.size, GREEN);
    this.pdf.text(text, M, this.y + 4);
    this.y += T.h2.lh + 1;
    this.pdf.setDrawColor(...GREEN);
    this.pdf.setLineWidth(0.4);
    this.pdf.line(M, this.y, M + 14, this.y);
    this.y += 5;
  }

  paragraph(text: string, color: RGB = INK) {
    this.font("normal", T.body.size, color);
    for (const l of this.lines(text, CONTENT_W, T.body.size)) {
      this.need(T.body.lh);
      this.pdf.text(l, M, this.y + 3.4);
      this.y += T.body.lh;
    }
    this.y += 2;
  }

  /** Key/value list with wrapped values. */
  kv(rows: [string, string][]) {
    const kw = 42;
    for (const [k, v] of rows) {
      const vl = this.lines(v, CONTENT_W - kw, T.body.size);
      this.need(vl.length * T.body.lh + 1.5);
      this.font("normal", T.body.size, MUTED);
      this.pdf.text(k, M, this.y + 3.4);
      this.font("normal", T.body.size);
      vl.forEach((l, i) => this.pdf.text(l, M + kw, this.y + 3.4 + i * T.body.lh));
      this.y += vl.length * T.body.lh + 1.5;
    }
    this.y += 2;
  }

  /** Table with wrapped cells; header row repeats after page breaks. */
  table(cols: { label: string; w: number; align?: "right" }[], rows: string[][]) {
    const pad = 2;
    const total = cols.reduce((s, c) => s + c.w, 0);
    const widths = cols.map((c) => (c.w / total) * CONTENT_W);
    const drawHead = () => {
      this.pdf.setFillColor(...TINT);
      this.pdf.rect(M, this.y, CONTENT_W, 7, "F");
      this.font("bold", T.small.size, GREEN);
      let x = M;
      cols.forEach((c, i) => {
        const tx = c.align === "right" ? x + widths[i] - pad : x + pad;
        this.pdf.text(c.label, tx, this.y + 4.7, { align: c.align ?? "left" });
        x += widths[i];
      });
      this.y += 7;
    };
    this.need(7 + 8);
    drawHead();
    for (const r of rows) {
      const cells = r.map((v, i) => this.lines(v || "—", widths[i] - pad * 2, T.body.size));
      const h = Math.max(...cells.map((c) => c.length)) * T.body.lh + 3;
      if (this.y + h > CONTENT_BOTTOM) { this.newPage(); drawHead(); }
      this.font("normal", T.body.size);
      let x = M;
      cells.forEach((c, i) => {
        const col = cols[i];
        const tx = col.align === "right" ? x + widths[i] - pad : x + pad;
        c.forEach((l, li) => this.pdf.text(l, tx, this.y + 4.6 + li * T.body.lh, { align: col.align ?? "left" }));
        x += widths[i];
      });
      this.y += h;
      this.pdf.setDrawColor(...RULE);
      this.pdf.setLineWidth(0.2);
      this.pdf.line(M, this.y, PAGE_W - M, this.y);
    }
    this.y += 4;
  }

  footers(left: string) {
    const n = this.pdf.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      this.pdf.setPage(p);
      this.pdf.setDrawColor(...RULE);
      this.pdf.setLineWidth(0.3);
      this.pdf.line(M, FOOTER_Y - 4, PAGE_W - M, FOOTER_Y - 4);
      this.font("normal", T.small.size, MUTED);
      const l = ellipsize(this.pdf, left, CONTENT_W - 30);
      this.pdf.text(l, M, FOOTER_Y);
      this.pdf.text(`Side ${p} af ${n}`, PAGE_W - M, FOOTER_Y, { align: "right" });
    }
  }
}

function groupByStatus(actions: Action[]): Record<string, Action[]> {
  const g: Record<string, Action[]> = {};
  for (const a of actions) (g[a.status || "Ukendt"] ||= []).push(a);
  return g;
}

const SITE_LIMIT = 15;
const ACTION_LIMIT = 20;

export function renderProjectReportPdf(input: ProjectReportPdfInput): jsPDF {
  const { project, sites, actions, indicators, reportType, title, generatedAt } = input;
  const L = new Layout(TYPE_LABEL[reportType]);
  const generated = generatedAt.toLocaleString("da-DK");

  L.titleArea(title, [
    ["Projekt", project.name],
    ["Rapporttype", TYPE_LABEL[reportType]],
    ["Lokation", project.location_name || project.municipality || "—"],
    ["Genereret", generated],
  ]);

  const projectSection = () => {
    L.heading("Projekt");
    L.kv([
      ["Navn", project.name],
      ["Type", project.project_type || "—"],
      ["Status", project.status || "—"],
      ["Areal", project.geometry_area_ha ? `${num(project.geometry_area_ha)} ha` : "Ikke angivet"],
      ["Lokation", project.location_name || project.municipality || "—"],
      ["Periode", project.start_date || project.end_date ? `${fmtDate(project.start_date)} – ${fmtDate(project.end_date)}` : "Ikke angivet"],
    ]);
    if (project.description) L.paragraph(project.description);
  };

  const sitesSection = () => {
    L.heading(`Sites (${sites.length})`);
    if (sites.length === 0) return L.paragraph("Ingen sites registreret.", MUTED);
    L.table(
      [{ label: "Navn", w: 50 }, { label: "Type", w: 30 }, { label: "Areal (ha)", w: 20, align: "right" }],
      sites.slice(0, SITE_LIMIT).map((s) => [s.name, s.site_type || "—", s.area_ha != null ? num(s.area_ha) : "—"]),
    );
    if (sites.length > SITE_LIMIT) L.paragraph(`${sites.length - SITE_LIMIT} yderligere sites er ikke vist i rapporten.`, MUTED);
  };

  const indicatorsSection = () => {
    L.heading(`Indikatorer (${indicators.length})`);
    if (indicators.length === 0) return L.paragraph("Ingen indikatorer defineret.", MUTED);
    L.table(
      [{ label: "Indikator", w: 44 }, { label: "Værdi", w: 22, align: "right" }, { label: "Status", w: 16 }, { label: "Opdateret", w: 18 }],
      indicators.map((i) => [
        i.label,
        i.value != null ? `${num(i.value)}${i.unit ? ` ${i.unit}` : ""}` : "Ingen værdi",
        i.status ? INDICATOR_STATUS[i.status] ?? i.status : "Ukendt",
        fmtDate(i.updated_at),
      ]),
    );
  };

  const actionsSection = () => {
    L.heading(`Handlinger (${actions.length})`);
    if (actions.length === 0) return L.paragraph("Ingen handlinger registreret.", MUTED);
    for (const [status, items] of Object.entries(groupByStatus(actions))) {
      L.need(5 + 7 + 8);
      L.font("bold", T.body.size);
      L.pdf.text(`${status} (${items.length})`, M, L.y + 3.4);
      L.y += 6;
      L.table(
        [{ label: "Handling", w: 50 }, { label: "Prioritet", w: 14 }, { label: "Ansvarlig", w: 18 }, { label: "Frist", w: 16 }],
        items.slice(0, ACTION_LIMIT).map((a) => [a.title, a.priority || "—", a.owner || "—", a.due_date ? fmtDate(a.due_date) : "—"]),
      );
      if (items.length > ACTION_LIMIT) L.paragraph(`${items.length - ACTION_LIMIT} yderligere handlinger er ikke vist.`, MUTED);
    }
  };

  const traceSection = () => {
    L.heading("Sporbarhed");
    L.kv([
      ["Projekt-ID", project.id],
      ["Genereret", generated],
      ["Datagrundlag", `${sites.length} sites, ${indicators.length} indikatorer, ${actions.length} handlinger`],
      ["Geometrikilde", project.geometry_source || "Ikke angivet"],
    ]);
    L.paragraph(
      "Rapporten er genereret automatisk ud fra de data, der var registreret på projektet på genereringstidspunktet. Den er ikke fagligt godkendt.",
      MUTED,
    );
  };

  if (reportType === "indicator") {
    projectSection(); indicatorsSection(); sitesSection(); actionsSection();
  } else if (reportType === "authority") {
    projectSection(); sitesSection(); indicatorsSection(); actionsSection(); traceSection();
  } else {
    projectSection(); sitesSection(); indicatorsSection(); actionsSection();
  }

  L.footers(`GoFreyra · ${title}`);
  return L.pdf;
}
