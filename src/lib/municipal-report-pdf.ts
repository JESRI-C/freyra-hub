import { z } from "zod";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  MunicipalReportManifestSchema,
  municipalReportCanonicalText,
  type MunicipalReportPdfVersion,
} from "@/services/monitoring/municipal-report";

/** Transient, locally supplied JPEGs. Nothing is fetched or persisted by this renderer. */
export interface MunicipalReportPdfImage {
  mediaId: string;
  originalSha256: string;
  dataUrl: string;
}
const imageSchema = z
  .object({
    mediaId: z.string().uuid(),
    originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
    dataUrl: z
      .string()
      .max(3_000_000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
const statusLabels = {
  complete: "Komplet kildeindhentning",
  partial: "Delvist datagrundlag",
  no_coverage: "Ingen dokumenteret dækning",
  not_configured: "Adgang ikke konfigureret",
  not_implemented: "Kilden er ikke implementeret",
  timeout: "Tidsgrænse nået",
  failed: "Indhentning mislykkedes",
};
const roundLabels = {
  before: "Før-registrering",
  after: "Efter-registrering",
  control: "Kontrolregistrering",
};
const priorityLabels = {
  before_delivery: "Afklar før aflevering",
  field_review: "Faglig kontrol og opfølgning",
  supplementary: "Supplerende dokumentation",
};
const answerLabels = {
  confirmed: "Bekræftet ved egen gennemgang",
  not_confirmed: "Ikke bekræftet ved egen gennemgang",
  uncertain: "Kan ikke afgøres endnu",
};
const noteLabels = {
  supports_reference: "Understøtter referencen efter egen vurdering",
  does_not_support_reference: "Understøtter ikke referencen efter egen vurdering",
  inconclusive: "Kan ikke afgøres efter egen vurdering",
};
const qualityLabels = {
  usable: "Fotoet kan gennemgås",
  limited: "Begrænset udsyn eller kvalitet",
  unusable: "Kræver et bedre foto",
};
const visibilityLabels = {
  visible: "vandløbet er synligt",
  partly_visible: "vandløbet ses delvist",
  not_visible: "vandløbet ses ikke",
  uncertain: "vandløbets synlighed er usikker",
};
const modeLabels = {
  live: "hentede data",
  import: "importerede data",
  preview: "forhåndsvisning",
  error: "kilden er ikke tilgængelig",
};
/** jsPDF's built-in Helvetica supports Danish Latin characters. Normalize common
 * typographic punctuation; retain source text as plain text, never HTML. */
const printable = (text: string) =>
  text
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "-");

export function buildMunicipalReportPdf(
  version: MunicipalReportPdfVersion,
  assets: MunicipalReportPdfImage[] = [],
): Promise<Uint8Array> {
  return renderMunicipalReportPdf(version, { images: assets });
}

export async function renderMunicipalReportPdf(
  version: MunicipalReportPdfVersion,
  options: { images?: MunicipalReportPdfImage[] } = {},
): Promise<Uint8Array> {
  z.string().uuid().parse(version.id);
  z.number().int().positive().parse(version.version);
  z.string().datetime({ offset: true }).parse(version.createdAt);
  const report = MunicipalReportManifestSchema.parse(version.manifest);
  municipalReportCanonicalText(report);
  if ((await baselineSha256(report)) !== version.manifestSha256)
    throw new Error("Den gemte rapport matcher ikke sin checksum. PDF blev ikke dannet.");
  const images = z
    .array(imageSchema)
    .max(12)
    .parse(options.images ?? []);
  function sourceTitle(source: (typeof report.sources)[number]) {
    return source.id === "dmi-historical" &&
      source.dataset === "climateData/stationValue_acc_precip_daily"
      ? "DMI - nedbør fra målestation"
      : source.dataset;
  }
  function sourceGapTitle(code: string, title: string) {
    const source = report.sources.find((item) => code === `source:${item.id}`);
    return source && title === `Afklar datakilden: ${source.dataset}`
      ? `Afklar datakilden: ${sourceTitle(source)}`
      : title;
  }
  function followupText(item: (typeof report.prioritizedFollowup)[number]) {
    if (item.proposedBy !== "system") return item;
    const source = report.sources.find(
      (source) =>
        item.id === `source:${source.id}` &&
        item.sourceIds.length === 1 &&
        item.sourceIds[0] === source.id,
    );
    if (!source) return item;
    const rationale = `Gemt status: ${source.status}. Afklar om kilden kan suppleres, eller dokumentér hvorfor den ikke er nødvendig for den aftalte opgave.`;
    return {
      ...item,
      title: sourceGapTitle(item.id, item.title),
      action: sourceGapTitle(item.id, item.action),
      rationale:
        item.rationale === rationale
          ? `Gemt status: ${statusLabels[source.status].toLowerCase()}. Afklar om kilden kan suppleres, eller dokumentér hvorfor den ikke er nødvendig for den aftalte opgave.`
          : item.rationale,
    };
  }
  if (
    new Set(images.map((image) => image.mediaId)).size !== images.length ||
    images.some(
      (image) =>
        !report.photos.some(
          (photo) =>
            photo.mediaId === image.mediaId && photo.originalSha256 === image.originalSha256,
        ),
    )
  )
    throw new Error("Et PDF-billede matcher ikke rapportens valgte originalfoto.");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  // Stable metadata: the same saved version and illustration bytes regenerate
  // the same PDF, independent of the current clock or local time zone.
  pdf.setFileId(version.manifestSha256.slice(0, 32).toUpperCase());
  const utc = new Date(version.createdAt).toISOString().slice(0, 19).replace(/[-:T]/g, "");
  pdf.setCreationDate(`D:${utc}+00'00'`);
  pdf.setProperties({
    title: `${report.projectName} - rapportgrundlag`,
    subject: "Kladde til faglig gennemgang og kommunal dialog",
    author: "Freyra",
    creator: report.planting ? "Freyra kommunal rapport v2" : "Freyra kommunal rapport v1",
  });
  const left = 17,
    width = 176,
    bottom = 271;
  let y = 27;
  function header() {
    pdf.setDrawColor(16, 104, 108);
    pdf.setLineWidth(0.7);
    pdf.line(left, 17, left + width, 17);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(16, 84, 88);
    pdf.text("FREYRA | RAPPORTGRUNDLAG TIL HADERSLEV KOMMUNE", left, 13);
    pdf.setTextColor(25, 35, 45);
  }
  function nextPage() {
    pdf.addPage();
    y = 27;
    header();
  }
  function ensure(height: number) {
    if (y + height > bottom) nextPage();
  }
  function keepTogether(height: number) {
    // Very long text may still span pages; a short label or photo group may not.
    if (height <= bottom - 27) ensure(height);
  }
  function textLayout(
    value: string,
    options: { size?: number; bold?: boolean; space?: number } = {},
  ) {
    const size = options.size ?? 10;
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(printable(value), width) as string[];
    const lineHeight = size * 0.43;
    const space = options.space ?? 2;
    return { size, lines, lineHeight, space, height: lines.length * lineHeight + space };
  }
  function block(value: string, options: { size?: number; bold?: boolean; space?: number } = {}) {
    const { size, lines, lineHeight, space } = textLayout(value, options);
    for (const line of lines) {
      ensure(lineHeight);
      pdf.setFont("helvetica", options.bold ? "bold" : "normal");
      pdf.setFontSize(size);
      pdf.setTextColor(25, 35, 45);
      pdf.text(line, left, y);
      y += lineHeight;
    }
    y += space;
  }
  function heading(value: string) {
    ensure(23);
    y += 4;
    block(value, { size: 14, bold: true, space: 3 });
  }
  function label(name: string, value: string | number | null | undefined) {
    const text = `${name}: ${value ?? "Ikke dokumenteret"}`;
    keepTogether(textLayout(text, { size: 9 }).height);
    block(text, { size: 9 });
  }
  function brief(value: string, maximum = 230) {
    if (value.length <= maximum) return value;
    const start = value.slice(0, maximum);
    return start.slice(0, Math.max(start.lastIndexOf(" "), maximum - 25)) + "...";
  }
  const date = (value: string | null) => (value ? value.slice(0, 10) : "ikke dokumenteret");
  const missingImageText =
    "Originalfoto ikke indlejret - se bilagets reference og den private fotogennemgang.";
  const imageCaption =
    "Illustration af det refererede originalfoto; ikke et georefereret kort eller en fagligt godkendt observation.";
  function imageLayout(mediaId: string) {
    const asset = images.find((image) => image.mediaId === mediaId);
    if (!asset) return null;
    const info = pdf.getImageProperties(asset.dataUrl),
      scale = Math.min(150 / info.width, 82 / info.height);
    const w = info.width * scale,
      h = info.height * scale;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
      throw new Error("Et valgt PDF-billede kunne ikke afkodes.");
    return { asset, w, h };
  }
  function imageFor(image: ReturnType<typeof imageLayout>) {
    if (!image) {
      block(missingImageText, { size: 9 });
      return;
    }
    const { asset, w, h } = image;
    ensure(h + 8);
    pdf.addImage(asset.dataUrl, "JPEG", left, y, w, h, undefined, "FAST");
    y += h + 4;
    block(imageCaption, { size: 8 });
  }
  header();
  block(report.projectName, { size: 21, bold: true, space: 3 });
  block("Samlet vandløbsregistrering", { size: 15, bold: true });
  block(`Haderslev Kommune | Version ${version.version} | ${date(version.createdAt)}`, {
    size: 10,
  });
  block("KLADDE - AFVENTER FAGLIG GENNEMGANG", { size: 10, bold: true, space: 3 });
  heading("1. Formål og overblik");
  block(report.purpose, { size: 9 });
  for (const text of report.executiveSummary) block(text, { size: 9, space: 1.5 });
  block(
    `${report.photos.length} valgte fotos er gennemgået nedenfor; ${images.length} er illustreret. Alle valgte fotos, billedspørgsmål og gemte svar er med.`,
    { size: 9, bold: true },
  );
  block("De tre første handlinger", { size: 11, bold: true, space: 3 });
  for (const [index, rawItem] of report.prioritizedFollowup.slice(0, 3).entries()) {
    const item = followupText(rawItem);
    block(`${index + 1}. ${brief(item.title, 190)}`, { size: 10, bold: true, space: 1 });
    block(`Hvorfor: ${brief(item.rationale, 260)}`, { size: 9, space: 3 });
  }
  if (!report.prioritizedFollowup.length) block("Ingen opfølgning er valgt i rapportgrundlaget.");
  heading("2. Afgrænsning og periode");
  label("Vandløbsreference", `${report.scope.referenceName} (${report.scope.referenceNameStatus})`);
  label("Undersøgelse", `${roundLabels[report.scope.roundKind]} | ${report.scope.roundTitle}`);
  label(
    "Planlagt optageperiode",
    `${report.scope.recordingWindow.dateFrom} til ${report.scope.recordingWindow.dateTo} (dansk tid)`,
  );
  label("Kildeperiode", `${report.scope.period.from} til ${report.scope.period.to}`);
  block(
    "Delstrækning og faktisk optagedækning skal aftales og kontrolleres. Rapporten dokumenterer hverken en godkendt kommunal strækning eller ændringer før/efter.",
    { size: 9 },
  );
  nextPage();
  heading("3. Dateret kildeoversigt");
  block(
    "Status og datoer nedenfor viser, hvad den gemte kildeversion indeholder. Delvis eller manglende dækning er ikke et negativt fund. Alle kildeforbehold og kontrolsummer findes uafkortet i rapportgrundlag.json i afleveringspakken.",
    { size: 9 },
  );
  for (const [index, source] of report.sources.entries()) {
    ensure(25);
    block(`K${index + 1}. ${sourceTitle(source)}`, { size: 10, bold: true, space: 1 });
    block(
      `${statusLabels[source.status]} | ${modeLabels[source.mode]} | ${source.provider} | hentet ${date(source.fetchedAt)}`,
      { size: 8.5, space: 1 },
    );
    block(
      `Kildedato: ${date(source.sourceModifiedAt)}. Observationer: ${date(source.observedFrom)} til ${date(source.observedTo)}.`,
      { size: 8.5, space: 1 },
    );
    block(
      `Dækning: sted ${source.spatialCoverage}, tid ${source.temporalCoverage}; alle sider: ${source.paginationComplete ? "ja" : "nej"}${source.returnedCount === null ? "" : `; ${source.returnedCount} poster`}.`,
      { size: 8.5, space: 1 },
    );
    const concreteFacts = source.facts.filter((fact) => !fact.startsWith("Kilden returnerede "));
    for (const fact of concreteFacts) block(fact, { size: 9, space: 1 });
    if (source.limitations.length)
      block(
        `${source.limitations.length} dokumenterede forbehold; se den fulde kildetekst i manifestet.`,
        { size: 8.5, space: 1 },
      );
    y += 3;
  }
  heading("4. Fotos, billedforslag og gemte egne svar");
  if (!report.photos.length) block("Ingen originale fotos er valgt til denne rapportversion.");
  for (const [index, photo] of report.photos.entries()) {
    const title = `Foto ${index + 1} af ${report.photos.length}`;
    const labels: Array<[string, string]> = [
      [
        "Optagetid",
        photo.capturedAtUtc
          ? `${photo.capturedAtUtc} (UTC)`
          : photo.localTimestamp
            ? `${photo.localTimestamp} (tidszone ikke dokumenteret)`
            : "Ikke dokumenteret",
      ],
    ];
    if (photo.cameraPosition)
      labels.push([
        "Kun kameraposition",
        `${photo.cameraPosition.latitude}, ${photo.cameraPosition.longitude} (ikke objektposition)`,
      ]);
    const image = imageLayout(photo.mediaId);
    keepTogether(
      textLayout(title, { size: 13, bold: true }).height +
        labels.reduce(
          (height, [name, value]) => height + textLayout(`${name}: ${value}`, { size: 9 }).height,
          0,
        ) +
        (image
          ? image.h + 4 + textLayout(imageCaption, { size: 8 }).height
          : textLayout(missingImageText, { size: 9 }).height),
    );
    block(title, { size: 13, bold: true });
    for (const [name, value] of labels) label(name, value);
    imageFor(image);
    if (report.photoPointReviews) {
      const record = report.photoPointReviews.find((entry) => entry.bindingId === photo.bindingId);
      block(
        record
          ? record.review.decision === "confirmed"
            ? "Fotopunkt fagligt bekræftet"
            : "Fotopunkt fagligt afvist"
          : "Fotopunkt afventer faglig gennemgang",
        { size: 10, bold: true },
      );
      if (record) {
        label("Faglig gennemgang", `${record.review.reviewerName} | ${date(record.createdAt)}`);
        block(record.review.note, { size: 9 });
        label("Revisionsreference", `${record.id} | SHA-256 ${record.reviewSha256}`);
        block(
          "Beslutningen gælder dette foto og den gemte kildeversion. Den godkender ikke rapporten eller et fysisk indgreb.",
          { size: 8 },
        );
      }
    }
    for (const note of photo.manualNotes) {
      block(`Gemt manuel note | ${date(note.createdAt)}`, { size: 10, bold: true });
      block(note.question);
      label("Egen vurdering", noteLabels[note.qualitativeAnswer]);
      block(note.statement);
      label("Usikkerhed", note.uncertainty);
      label("Foreslået opfølgning", note.proposedFollowup);
      if (note.proposedPriority !== "not_assessed")
        label("Egen foreslået prioritet", note.proposedPriority);
    }
    if (!photo.inspections.length) block("Ingen billed-AI-vurdering er valgt for dette foto.");
    for (const inspection of photo.inspections) {
      block("Billed-AI - forslag til faglig gennemgang", { size: 11, bold: true });
      label("AI-vurdering dannet", date(inspection.generatedAt));
      block(
        `${qualityLabels[inspection.quality]}; ${visibilityLabels[inspection.watercourseVisibility]}.`,
        { size: 9 },
      );
      block(inspection.qualityLimitation);
      label("Samlet usikkerhed", inspection.uncertainty);
      if (!inspection.features.length)
        block(
          "Ingen synlige featureforslag er registreret. Det dokumenterer ikke fravær af problemer.",
        );
      for (const feature of inspection.features) {
        block(`Muligt synligt træk: ${feature.description}`);
        label("Usikkerhed", feature.uncertainty);
        label("Modellens ukalibrerede egenvurdering (0-1)", feature.confidence);
      }
      for (const question of inspection.questions) {
        block(question.question, { bold: true });
        label(
          "Gemt eget svar",
          question.assessment ? answerLabels[question.assessment] : "Ubesvaret",
        );
        if (question.note) label("Begrundelse", question.note);
        if (question.followup) label("Egen opfølgning", question.followup);
      }
    }
    y += 4;
  }
  ensure(70);
  if (report.planting) {
    heading("5. Beplantningsegnethed");
    block(report.planting.notice, { size: 11, bold: true });
    block(
      "10 m og 20 m er alternative buffere fra den officielle vandløbslinje. §3-natur og eksisterende skov/trædække er udeladt; markblokke er kandidater og lavbund/kulstofrig jord kræver særskilt vurdering. Arealerne er kortskitser, ikke tilladelser.",
      { size: 9 },
    );
    for (const width of [10, 20]) {
      block(`Afstand ${width} m | areal i ha`, { size: 10, bold: true });
      for (const reach of report.planting.reaches.filter((entry) => entry.bufferM === width)) {
        const ha = (value: number | null) =>
          value === null
            ? "ukendt"
            : value.toLocaleString("da-DK", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        block(
          `${reach.reach}: egnet ${ha(reach.suitableHa)} | betinget ${ha(reach.conditionalHa)} | uegnet ${ha(reach.unsuitableHa)}`,
          { size: 9, space: 1 },
        );
        if (reach.reason) block(reach.reason, { size: 8, space: 1 });
      }
    }
    for (const warning of report.planting.warnings) block(warning, { size: 8 });
    const coverage = { complete: "hentet", partial: "delvist", unavailable: "ikke tilgængelig" };
    for (const source of report.planting.sources) {
      block(`${source.label}: ${coverage[source.coverage]} | hentet ${date(source.fetchedAt)}`, {
        size: 9,
      });
      if (source.sourceUrl) block(source.sourceUrl, { size: 8 });
    }
    block("Litteraturintervaller - ingen beregnet lokal effekt", { size: 10, bold: true });
    for (const entry of report.planting.literature) {
      block(`${entry.effect.replace("₂", "2")}: ${entry.interval ?? "Ikke opgjort"}`, {
        size: 9,
        bold: true,
      });
      block(entry.context.replaceAll("₂", "2"), { size: 8 });
      block(`${entry.citation} | ${entry.sourceUrl} | kontrolleret ${entry.checkedAt}`, {
        size: 8,
      });
    }
  }
  const sectionOffset = report.planting ? 1 : 0;
  heading(`${5 + sectionOffset}. Begrundet prioriteret opfølgning`);
  block(
    "Prioriteten angår dokumentation og faglig afklaring. Den er ikke en godkendelse af vedligeholdelse eller et fysisk indgreb.",
  );
  block(
    `Her vises ${Math.min(10, report.prioritizedFollowup.length)} af ${report.prioritizedFollowup.length} opgaver. Den fulde prioriterede liste med evidensreferencer findes i rapportgrundlag.json; ingen opgaver er fjernet fra det gemte grundlag.`,
    { size: 9 },
  );
  for (const [index, rawItem] of report.prioritizedFollowup.slice(0, 10).entries()) {
    const item = followupText(rawItem);
    ensure(20);
    block(`${index + 1}. ${item.title}`, { size: 10, bold: true, space: 1 });
    block(
      `${priorityLabels[item.priority]}${item.proposedBy === "user" ? " | eget forslag" : ""}. ${brief(item.rationale, 240)}`,
      { size: 9, space: 1 },
    );
    if (item.action !== item.title)
      block(`Næste skridt: ${brief(item.action, 220)}`, { size: 9, space: 1 });
    y += 2;
  }
  heading(`${6 + sectionOffset}. Mangler før kommunal aflevering`);
  block(
    "Følgende skal afklares eller begrundet afgrænses før aflevering. Begrundelserne er samlet ovenfor og står uafkortet i manifestet.",
    { size: 9 },
  );
  block(
    report.deliveryGaps.map((gap) => sourceGapTitle(gap.code, gap.title)).join("; ") +
      (report.deliveryGaps.length ? "." : "Ingen yderligere afleveringsmangler er valgt."),
    { size: 9 },
  );
  heading(`${7 + sectionOffset}. Metode og begrænsninger`);
  block(
    "Kun valgte, gemte versioner indgår; senere ændringer ændrer ikke denne rapport. AI og egne registreringer er udkast, og en bekræftelse er ikke en faglig godkendelse. Modellens sikkerhedstal er ukalibrerede egenvurderinger. Kamera-GPS er ikke et objekts position eller billedets footprint. Rundetype og planlagte datoer beviser ikke faktisk optagedækning eller en ændring før/efter.",
    { size: 9 },
  );
  block(
    "Stationsnedbør dokumenterer ikke lokal vandføring. Satellit- og rasterinventarer er ikke pixelanalyse, og produktdato er ikke nødvendigvis optagedato. Et stationsinventar indeholder ikke automatisk lokale måleserier eller en oplandskobling. Der er ikke beregnet lokal hydraulik eller miljøeffekt. Samtlige kildespecifikke forbehold og metodebegrænsninger står uafkortet i rapportgrundlag.json.",
    { size: 9 },
  );
  heading(`${8 + sectionOffset}. Versions- og evidensregister`);
  label("Rapportversion", `${version.version} | ${version.id}`);
  label("Sag", report.projectId);
  label("Genereret", report.generatedAt);
  label("Rapportskema", report.schema);
  label("Generator", report.generatorVersion);
  label(
    "Offentlig reference",
    `${report.scope.referenceId} | ${report.scope.referenceSourceUrl ?? "link ikke dokumenteret"}`,
  );
  for (const kind of ["baseline", "plan", "round"] as const)
    label(kind, `${report.pins[kind].id} | SHA-256 ${report.pins[kind].sha256}`);
  for (const [kind, pins] of Object.entries(report.pins))
    if (Array.isArray(pins))
      for (const pin of pins) label(kind, `${pin.id} | SHA-256 ${pin.sha256}`);
  for (const [index, photo] of report.photos.entries()) {
    label(`Foto ${index + 1}`, photo.mediaId);
    label("Original SHA-256", photo.originalSha256);
    label("Originalvalidering SHA-256", photo.originalValidationSha256);
    for (const inspection of photo.inspections)
      label("Billedmodel", `${inspection.id} | ${inspection.model}`);
  }
  for (const [index, source] of report.sources.entries())
    label(
      `K${index + 1}`,
      `${source.id} | ${source.sourceUrl ?? "intet kildelink"} | indhold SHA-256 ${source.payloadSha256 ?? "ikke dokumenteret"}`,
    );
  const count = pdf.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(200, 210, 215);
    pdf.setLineWidth(0.2);
    pdf.line(left, 279, left + width, 279);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(70, 80, 90);
    pdf.text(`Version ${version.version} | Kladde - ikke fagligt godkendt`, left, 284);
    pdf.text(`Side ${page} af ${count}`, left + width, 284, { align: "right" });
    pdf.setFontSize(6.5);
    pdf.text(`Rapport SHA-256: ${version.manifestSha256}`, left, 289);
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}
