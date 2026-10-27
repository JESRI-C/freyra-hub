import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import { ReportContentSchema, validateReportRevision } from "../report-document";
import {
  AtlasReviewSchema,
  documentedPhotoComparison,
  filterAtlasPhotos,
  initialAtlasReview,
  parsePhotoAtlas,
  photoDateLabel,
} from "../photo-atlas";
import { atlasReportContent, buildPhotoAtlasHtml } from "../photo-atlas-export";
const photo = {
  id: "TEST-001",
  filename: "test.jpg",
  date: "2026-08-24",
  time: "2026-08-24T09:31:01",
  lat: 55,
  lon: 9,
  watercourse: "TEKNISK TEST",
  section_id: "test-series",
  observation: "Visuel testbeskrivelse",
  vegetation: "Testbeskrivelse",
  species: ["Foreløbigt testbud"],
  source: "https://example.test/original",
  sha256: "a".repeat(64),
  image: "data:image/jpeg;base64,/9j/2Q==",
};
const dataset = (photos: unknown[] = [photo]) => ({
  title: "TEKNISK TEST – ingen kundedata",
  version: "test",
  image_count: photos.length,
  observations: photos,
});
const read = (value: unknown) => parsePhotoAtlas(JSON.stringify(value));
describe("photo-atlas data and provenance", () => {
  it("reads the existing baseline contract without inventing intervention status", () => {
    const atlas = read(dataset());
    expect(atlas.photos).toHaveLength(1);
    expect(initialAtlasReview(atlas.photos[0]).speciesStatus).toBe("suggestion");
    expect(initialAtlasReview(atlas.photos[0]).workDate).toBe("");
  });
  it("extracts application/json without executing surrounding scripts", () => {
    const atlas = parsePhotoAtlas(
      `<script>throw new Error('must never execute')</script><script id="photo-data" type="application/json">${JSON.stringify([photo])}</script>`,
    );
    expect(atlas.photos[0].id).toBe("TEST-001");
  });
  it("preserves missing dates and camera positions", () => {
    const atlas = read(dataset([{ ...photo, date: null, time: null, lat: null, lon: null }]));
    expect(photoDateLabel(atlas.photos[0])).toBe("Optagedato mangler");
    expect(atlas.photos[0].lat).toBeNull();
  });
  it("does not turn a local timestamp into a UTC observation", () => {
    const label = photoDateLabel(read(dataset()).photos[0]);
    expect(label).toContain("09:31:01");
    expect(label).toContain("tidszone ukendt");
  });
  it.each([
    ["duplicate IDs", dataset([photo, photo])],
    ["wrong count", { ...dataset(), image_count: 2 }],
    ["invalid date", dataset([{ ...photo, date: "2026-02-31", time: null }])],
    ["partial GPS", dataset([{ ...photo, lon: null }])],
    ["unsafe URL", dataset([{ ...photo, source: "javascript:alert(1)" }])],
    [
      "active image format",
      dataset([{ ...photo, image: 'data:image/svg+xml,<svg onload="alert(1)"/>' }]),
    ],
    ["date disagreement", dataset([{ ...photo, date: "2026-08-25" }])],
    ["invalid clock", dataset([{ ...photo, time: "2026-08-24T29:99:00" }])],
  ])("rejects %s before persistence", (_name, data) => {
    expect(() => read(data)).toThrow();
  });
  it("filters by ID, date, watercourse and imported group", () => {
    const photos = read(dataset()).photos;
    expect(
      filterAtlasPhotos(photos, {
        search: "test-001",
        date: "2026-08-24",
        watercourse: "TEKNISK TEST",
        section: "test-series",
      }),
    ).toHaveLength(1);
    expect(filterAtlasPhotos(photos, { date: "2026-09-01" })).toHaveLength(0);
  });
  it("requires reviewer and evidence for field confirmation", () => {
    const initial = initialAtlasReview(read(dataset()).photos[0]);
    expect(() =>
      AtlasReviewSchema.parse({ ...initial, speciesStatus: "field_confirmed" }),
    ).toThrow();
    expect(
      AtlasReviewSchema.parse({
        ...initial,
        speciesStatus: "field_confirmed",
        confirmationEvidence: "Teknisk kontrolreference",
        reviewer: "TEKNISK TEST",
      }).speciesStatus,
    ).toBe("field_confirmed");
  });
  it("requires documentation for work dates and executed planting", () => {
    const r = initialAtlasReview(read(dataset()).photos[0]);
    expect(() => AtlasReviewSchema.parse({ ...r, workDate: "2026-08-25" })).toThrow();
    expect(() =>
      AtlasReviewSchema.parse({ ...r, plantingStatus: "documented_execution" }),
    ).toThrow();
  });
  it("does not treat two capture dates as intervention evidence", () => {
    const a = read(dataset()).photos[0],
      b = { ...a, id: "TEST-002", date: "2026-09-07", sha256: "b".repeat(64) };
    expect(documentedPhotoComparison(a, b, initialAtlasReview(a)).documented).toBe(false);
  });
  it("requires a valid work date strictly between capture dates and a same-place explanation", () => {
    const a = read(dataset()).photos[0],
      b = { ...a, id: "TEST-002", date: "2026-09-07", sha256: "b".repeat(64) };
    const r = {
      ...initialAtlasReview(a),
      workDate: "2026-08-30",
      workEvidence: "TEKNISK driftsreference",
      samePlaceEvidence: "TEKNISK stedanker",
    };
    expect(documentedPhotoComparison(a, b, r)).toMatchObject({
      documented: true,
      beforeId: a.id,
      afterId: b.id,
    });
    expect(documentedPhotoComparison(a, b, { ...r, workDate: a.date! }).documented).toBe(false);
    expect(documentedPhotoComparison(a, b, { ...r, workDate: "not-a-date" }).documented).toBe(
      false,
    );
  });
  it("builds draft sections from sources without invented measurements or approvals", () => {
    const atlas = {
      ...read(dataset()),
      evidenceId: "00000000-0000-4000-8000-000000000010",
      checksum: "b".repeat(64),
    };
    const content = atlasReportContent({
      atlas,
      photos: atlas.photos,
      reviews: new Map(),
      projectName: "TEKNISK TEST",
      organizationName: "TEKNISK TEST",
      purpose: "",
    });
    expect(content.sections.every((s) => !s.reviewed)).toBe(true);
    expect(content.sections.map((s) => s.text).join(" ")).toContain("ikke målt");
    expect(content.sources[0].id).toBe("evidence:" + atlas.evidenceId);
    expect(content.sources[0].checksum).toBeNull();
    expect(ReportContentSchema.parse(content).photoAtlas?.checksum).toBe(atlas.checksum);
    expect(content.sections.at(-1)?.text).toContain("ikke verificeret ved atlasimport");
    expect(() => validateReportRevision(content, "approved")).toThrow();
  });
  it("does not resurrect a cleared species suggestion in report or atlas exports", () => {
    const atlas = { ...read(dataset()), evidenceId: "test-source", checksum: "b".repeat(64) };
    const review = {
      ...initialAtlasReview(atlas.photos[0]),
      species: "",
      speciesStatus: "not_assessed" as const,
    };
    const reviews = new Map([[atlas.photos[0].id, { review }]]);
    const content = atlasReportContent({
      atlas,
      photos: atlas.photos,
      reviews,
      projectName: "TEKNISK",
      organizationName: "TEKNISK",
      purpose: "",
    });
    expect(content.sections[3].text).toContain("ingen artsregistreringer");
    expect(
      parsePhotoAtlas(buildPhotoAtlasHtml(atlas, reviews, "TEKNISK")).photos[0].species,
    ).toEqual([]);
  });
  it("never treats the same original as a documented before/after pair", () => {
    const a = read(dataset()).photos[0];
    const b = { ...a, id: "TEST-COPY", date: "2026-09-07" };
    const r = {
      ...initialAtlasReview(a),
      workDate: "2026-08-30",
      workEvidence: "TEKNISK reference",
      samePlaceEvidence: "TEKNISK sted",
    };
    expect(documentedPhotoComparison(a, b, r).documented).toBe(false);
  });
  it("escapes hostile text in exported HTML and preserves the data contract", () => {
    const atlas = read(
      dataset([{ ...photo, observation: '</script><img src=x onerror="hostile()">' }]),
    );
    const html = buildPhotoAtlasHtml(atlas, new Map(), "<script>hostile()</script>");
    const program = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
    expect(program).toBeTruthy();
    expect(() => new Script(program!)).not.toThrow();
    expect(html).not.toContain("</script><img src=x");
    expect(html).toContain("\\u003c/script>");
    expect(html).toContain("&lt;script&gt;hostile()");
    expect(parsePhotoAtlas(html).photos[0].observation).toBe(atlas.photos[0].observation);
  });
});
