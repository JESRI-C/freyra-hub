import { beforeEach, describe, expect, it, vi } from "vitest";
import { newReportContent, ReportContentSchema, reportIssueDetails } from "@/lib/report-document";
import { buildDocx, buildReportGeoJSON, reportLines } from "@/lib/report-export";
import { methodReferenceText, OPEN_HABITAT_METHODS } from "@/lib/report-methods";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock }));
import {
  getReportRevisions,
  loadBridgeReport,
  loadNatureSurveyReport,
  loadReportSources,
  loadReviewedReportObservations,
  saveReportDocument,
} from "../report-document-service";
const content = newReportContent("Bykær", "Haderslev", "Scope", "Kunde");
const registration = (id: string) => ({
  source: {
    id,
    title: id,
    kind: "Feltregistrering",
    capturedAt: "2026-11-17T10:00:00Z",
    checksum: "b".repeat(64),
    position: null,
    method: "Gemte feltoplysninger",
    version: "b".repeat(64),
  },
});
const input = {
  organizationId: "org-a",
  projectId: "project-a",
  reportId: null,
  expectedVersion: 0,
  status: "draft" as const,
  content,
};
describe("report persistence", () => {
  beforeEach(() => vi.resetAllMocks());
  it("freezes the chosen reach and line method, preserving single-source lighting and explicit paired roles", async () => {
    const row = {
      id: "obs-1",
      centerline_version_id: "line-2",
      segment_id: "s2",
      feature_key: "kant-1",
      kind: "vegetation",
      determination_level: "observed",
      quality_flags: [],
      text: "Synlig vegetation.",
      source_ids: ["first"],
      watercourse_observation_reviews: {
        approved_at: "2026-11-17T10:00:00Z",
        approved_by: "reviewer",
      },
      watercourse_versions: {
        id: "line-2",
        version: 2,
        source: "Gemt centerlinje",
        method: "gemt-geodaetisk-v2",
        segments: [{ id: "s2", name: "Bykær Bæk, øst", fromM: 100, toM: 250 }],
      },
      comparison: { beforeId: "first", afterId: null, beforeLight: "Sol", afterLight: null },
    };
    const paired = {
      ...row,
      id: "obs-2",
      source_ids: ["second", "first"],
      comparison: { ...row.comparison, afterId: "second", afterLight: "Skygge" },
      kind: "species",
      determination_level: "species_suggestion",
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [
          row,
          paired,
          { ...row, comparison: null },
          { ...row, watercourse_observation_reviews: null },
        ],
        error: null,
      }),
    };
    mock.from.mockReturnValue(query);
    const observations = await loadReviewedReportObservations("project-a", "org-a");
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("watercourse_versions(id,version,method,source,segments)"),
    );
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(query.eq).toHaveBeenCalledWith("project_id", "project-a");
    expect(observations).toHaveLength(3);
    expect(observations[0]).toMatchObject({
      sourceIds: ["media:first"],
      comparison: null,
      screening: false,
    });
    for (const value of [
      "Bykær Bæk, øst",
      "100–250 m",
      "kant-1",
      "Gemt centerlinje",
      "gemt-geodaetisk-v2",
      "line-2",
      "Kildefoto: media:first (Sol)",
    ])
      expect(observations[0].text).toContain(value);
    expect(observations[0].text).not.toMatch(/Førfoto|Efterfoto/);
    expect(observations[1].text).toContain(
      "Førfoto: media:first (Sol). Efterfoto: media:second (Skygge).",
    );
    expect(observations[1].screening).toBe(true);
    expect(observations[2].text).toContain("Kildefoto: media:first.");
    query.range.mockResolvedValueOnce({
      data: [{ ...row, centerline_version_id: "other" }],
      error: null,
    });
    await expect(loadReviewedReportObservations("project-a", "org-a")).rejects.toThrow(
      "gemte delstrækning",
    );
  });
  it("imports survey boundaries and method and preserves an uncertain determination in the report", async () => {
    const areaId = "f5762790-40cf-492b-a5eb-33502405b392";
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [9, 55],
          [9.01, 55],
          [9.01, 55.01],
          [9, 55],
        ],
      ],
    };
    const row = {
      id: "caa9831c-8e00-46a7-bcff-b792a8af09c3",
      zone_id: areaId,
      observed_at: "2026-11-17T10:00:00Z",
      notes: "Ingen blomst synlig",
      metadata: { kind: "species", label: "Star", method: "Visuel", determination: "uncertain" },
    };
    const query = (data: unknown[]) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data, error: null }),
    });
    const areas = query([
      { id: areaId, name: "Eng", geometry, area_hectares: 2, description: "Transekter" },
    ]);
    const observations = query([row]);
    const registrations = query([
      registration(`survey-area:${areaId}`),
      registration(`field:${row.id}`),
    ]);
    mock.from.mockImplementation((table: string) =>
      table === "monitoring_zones"
        ? areas
        : table === "report_registration_sources"
          ? registrations
          : observations,
    );
    const base = newReportContent("Bykær", "Haderslev", "Scope", "Kunde", "nature_baseline");
    const reference = methodReferenceText(OPEN_HABITAT_METHODS[0]);
    base.sections[2].text = "Afventer artsliste.\n\n" + reference;
    const draft = await loadNatureSurveyReport("project-a", base);
    expect(areas.eq.mock.calls).toEqual([
      ["project_id", "project-a"],
      ["zone_type", "nature_survey"],
    ]);
    expect(observations.eq.mock.calls).toEqual([
      ["project_id", "project-a"],
      ["observation_type", "nature_survey"],
    ]);
    expect(ReportContentSchema.parse(draft).natureSurvey?.areas[0].geometry).toEqual(geometry);
    expect(draft.sections.find(({ id }) => id === "section-3")?.text).toContain("Transekter");
    expect(draft.sections.find(({ id }) => id === "section-3")?.sourceIds).toEqual([
      `survey-area:${areaId}`,
      `field:${row.id}`,
    ]);
    expect(
      reportIssueDetails(draft).filter(({ message }) =>
        /kildereference mangler|mangler en gyldig SHA-256/.test(message),
      ),
    ).toEqual([]);
    expect(draft.sections.find(({ id }) => id === "section-4")?.text).toContain(
      "Star (uafklaret bestemmelse)",
    );
    expect(
      buildReportGeoJSON({
        id: "revision",
        report_id: "report",
        version: 1,
        content: draft,
        status: "draft",
        created_at: row.observed_at,
        created_by: "user",
      }).features,
    ).toMatchObject([{ geometry, properties: { zone_id: areaId, map_number: 1 } }]);
    areas.range.mockResolvedValueOnce({
      data: [{ id: areaId, name: "Eng", geometry, area_hectares: 2, description: "Feltbesøg 2" }],
      error: null,
    });
    const refreshed = await loadNatureSurveyReport("project-a", draft);
    const methods = refreshed.sections[2];
    expect(methods.text).toBe("1. Eng\nFeltbesøg 2\n\nAfventer artsliste.\n\n" + reference);
    expect(methods.reviewed).toBe(false);
    const revision = {
      id: "revision",
      report_id: "report",
      version: 2,
      content: refreshed,
      status: "draft" as const,
      created_at: row.observed_at,
      created_by: "user",
    };
    expect(reportLines(revision)).toContain(methods.text);
    const docx = new TextDecoder().decode(buildDocx(revision));
    expect(docx).toContain("TA N03, version 1");
    expect(docx).toContain(OPEN_HABITAT_METHODS[0].url);
    expect(docx).toContain("Afventer artsliste.");
    observations.range.mockResolvedValueOnce({
      data: [{ ...row, zone_id: "foreign" }],
      error: null,
    });
    await expect(loadNatureSurveyReport("project-a", base)).rejects.toThrow("undersøgelsesområde");
  });
  it("imports the selected project's bridge objects with their GPS and verified photo references", async () => {
    const photoId = "d71745ef-79f0-43fb-aa69-d78737c203d0";
    const bridge = {
      id: "3324171a-5f64-4bbc-a2ee-20c8419190ee",
      observed_at: "2026-11-17T10:00:00+00:00",
      latitude: 55.25,
      longitude: 9.5,
      accuracy_m: 4,
      notes: "Synlig erosion ved indløb",
      metadata: {
        objectId: "BR-2",
        structureType: "culvert",
        materials: "Beton",
        dimensions: "Ø 50 cm",
        photoSourceIds: [`media:${photoId}`],
      },
    };
    const queries = Object.fromEntries(
      Object.entries({
        field_observations: [bridge],
        report_registration_sources: [registration(`field:${bridge.id}`)],
        reviewed_report_media_sources: [
          {
            id: photoId,
            title: "Indløb",
            sha256: "a".repeat(64),
            mime_type: "image/jpeg",
            lat: null,
            lng: null,
            category: "field_photo",
            captured_at: null,
            uploaded_at: "2026-11-17T10:00:00Z",
          },
        ],
        evidence_files: [],
      }).map(([table, data]) => [
        table,
        {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data, error: null }),
        },
      ]),
    );
    mock.from.mockImplementation((table: string) => queries[table]);
    const draft = await loadBridgeReport(
      "project-a",
      newReportContent("Bykær", "Haderslev", "Scope", "Kunde", "bridge_registration"),
    );
    expect(queries.field_observations.eq.mock.calls).toEqual([
      ["project_id", "project-a"],
      ["observation_type", "bridge_visual"],
    ]);
    expect(ReportContentSchema.parse(draft).bridgeObservations).toMatchObject([
      { id: bridge.id, latitude: 55.25, longitude: 9.5 },
    ]);
    expect(draft.sources.map(({ id }) => id)).toEqual([`media:${photoId}`, `field:${bridge.id}`]);
    expect(
      buildReportGeoJSON({
        id: "revision",
        report_id: "report",
        version: 1,
        content: draft,
        status: "draft",
        created_at: bridge.observed_at,
        created_by: "user",
      }).features,
    ).toMatchObject([
      {
        geometry: { coordinates: [9.5, 55.25] },
        properties: { object_id: "BR-2", map_number: 1 },
      },
    ]);
    expect(draft.sections.find(({ id }) => id === "section-4")).toMatchObject({
      text: expect.stringContaining(bridge.notes),
      basis: "observed",
      reviewed: false,
      sourceIds: [`media:${photoId}`, `field:${bridge.id}`],
    });
  });
  it("uses the receipt-backed media register in the selected project", async () => {
    const makeQuery = (data: unknown[]) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data, error: null }),
    });
    const checksum = "a".repeat(64);
    const photoPointReview = {
      id: crypto.randomUUID(),
      bindingId: crypto.randomUUID(),
      sha256: "b".repeat(64),
      bindingSha256: "c".repeat(64),
      originalSha256: checksum,
      originalValidationSha256: "d".repeat(64),
    };
    const media = makeQuery([
      {
        id: "field-id",
        title: "Feltfoto",
        category: "field_photo",
        file_path: "project-a/photo.jpg",
        storage_bucket: "project-media",
        mime_type: "image/jpeg",
        uploaded_at: "2026-11-17T12:00:00Z",
        lat: null,
        lng: null,
        captured_at: null,
        sha256: checksum,
      },
      {
        id: "drone-id",
        title: "Dronefoto",
        category: "drone_image",
        storage_bucket: "monitoring-uploads",
        file_path: "staging/drone.jpg",
        mime_type: "image/jpeg",
        captured_at: null,
        capture_date: "2026-08-24",
        uploaded_at: "2026-11-17T12:00:00Z",
        lat: 55.2,
        lng: 9.43,
        sha256: checksum,
        photo_point_review: photoPointReview,
        method: "Fagligt bekræftet fotopunkt",
        version: photoPointReview.sha256,
      },
    ]);
    const files = makeQuery([]);
    mock.from.mockImplementation((table: string) =>
      table === "reviewed_report_media_sources" ? media : files,
    );
    expect(await loadReportSources("project-a")).toMatchObject([
      { id: "media:field-id", checksum },
      {
        id: "media:drone-id",
        checksum,
        photoPointReview,
        version: photoPointReview.sha256,
        method: "Fagligt bekræftet fotopunkt",
        capturedAt: null,
        localCaptureDate: "2026-08-24",
        position: [9.43, 55.2],
      },
    ]);
    expect(media.eq).toHaveBeenCalledWith("project_id", "project-a");
  });
  it("saves exact scope and content and requires a returned persistent id", async () => {
    mock.rpc.mockResolvedValue({
      data: { id: "revision", report_id: "report", version: 1, status: "draft", content },
      error: null,
    });
    const result = await saveReportDocument(input);
    expect(result.report_id).toBe("report");
    expect(mock.rpc).toHaveBeenCalledWith(
      "save_report_revision",
      expect.objectContaining({
        _organization_id: "org-a",
        _project_id: "project-a",
        _expected_version: 0,
        _content: { ...content, photoLayoutVersion: 2 },
      }),
    );
  });
  it("does not synthesize a saved id when the database fails", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(saveReportDocument(input)).rejects.toThrow("permission denied");
    mock.rpc.mockResolvedValue({ data: {}, error: null });
    await expect(saveReportDocument(input)).rejects.toThrow("ingen gemt rapportversion");
  });
  it("rejects a report outside the active project before fetching its content", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mock.from.mockReturnValue(query);
    await expect(getReportRevisions("org-b", "project-b", "report-a")).rejects.toThrow(
      "tilhører ikke",
    );
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-b");
    expect(query.eq).toHaveBeenCalledWith("project_id", "project-b");
  });
  it("reads persisted versions on a new request rather than browser storage", async () => {
    const stored = { id: "rev", report_id: "r", version: 2, status: "draft", content };
    const scope = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "r" }, error: null }),
    };
    const revisions = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [stored], error: null }),
    };
    mock.from.mockImplementation((table: string) =>
      table === "report_documents" ? scope : revisions,
    );
    expect((await getReportRevisions("o", "p", "r"))[0].content).toEqual(content);
    expect((await getReportRevisions("o", "p", "r"))[0].version).toBe(2);
    expect(revisions.order).toHaveBeenCalledTimes(2);
  });
});
