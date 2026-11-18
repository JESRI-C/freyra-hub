import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ from: vi.fn(), createSignedUrl: vi.fn() }));
const atlasMocks = vi.hoisted(() => ({ from: vi.fn(), load: vi.fn(), images: vi.fn() }));
const canonicalRead = vi.hoisted(() => vi.fn());
vi.mock("@/lib/canonical-drone-media.functions", () => ({
  getCanonicalDroneMediaUrl: canonicalRead,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage, from: atlasMocks.from } }));
vi.mock("../photo-atlas-service", () => ({ loadPhotoAtlas: atlasMocks.load }));
vi.mock("@/lib/photo-atlas-export", () => ({ atlasReportImages: atlasMocks.images }));
import { buildReportImages } from "../report-assets";
import { newReportContent, type ReportRevision } from "@/lib/report-document";
describe("frozen atlas evidence authorization", () => {
  const frozen = () => {
    const revision = fixture();
    revision.content.sources = [
      {
        ...revision.content.sources[0],
        id: "evidence:atlas-file",
        kind: "freyra_photo_atlas_v1",
        checksum: null,
        filePath: undefined,
        storageBucket: undefined,
      },
    ];
    revision.content.photoAtlas = {
      evidenceId: "atlas-file",
      checksum: "c".repeat(64),
      photoIds: ["PHOTO-1"],
    };
    return revision;
  };
  const authorize = (result: unknown) => {
    const query = { select: () => query, eq: () => query, single: async () => result };
    atlasMocks.from.mockReturnValue(query);
  };
  beforeEach(() => vi.resetAllMocks());
  it("stops before downloading an atlas when the report row is inaccessible", async () => {
    authorize({ data: null, error: { message: "RLS" } });
    await expect(buildReportImages(frozen())).rejects.toThrow("projektadgang");
    expect(atlasMocks.load).not.toHaveBeenCalled();
  });
  it("rejects an atlas whose exact file bytes changed after the report was saved", async () => {
    authorize({ data: { organization_id: "own-org", project_id: "own-project" }, error: null });
    atlasMocks.load.mockResolvedValue({ checksum: "d".repeat(64), photos: [] });
    await expect(buildReportImages(frozen())).rejects.toThrow("checksum er ændret");
    expect(atlasMocks.load).toHaveBeenCalledWith(
      { organizationId: "own-org", projectId: "own-project" },
      "atlas-file",
      false,
    );
    expect(atlasMocks.images).not.toHaveBeenCalled();
  });
  it("only renders the selected photos from the authorized frozen atlas", async () => {
    authorize({ data: { organization_id: "own-org", project_id: "own-project" }, error: null });
    const first = { id: "PHOTO-1", lat: null, lon: null },
      second = { id: "PHOTO-2", lat: null, lon: null };
    const atlas = { checksum: "c".repeat(64), photos: [first, second] };
    atlasMocks.load.mockResolvedValue(atlas);
    atlasMocks.images.mockResolvedValue([]);
    expect(await buildReportImages(frozen())).toEqual([]);
    expect(atlasMocks.images).toHaveBeenCalledWith(atlas, [first], undefined);
  });
  it("requires the atlas's existing evidence reference in the source register", async () => {
    const revision = frozen();
    revision.content.sources = [];
    await expect(buildReportImages(revision)).rejects.toThrow("kilderegister");
    expect(atlasMocks.load).not.toHaveBeenCalled();
  });
  it("refuses coordinates that disagree with the exact atlas file before rendering", async () => {
    const revision = frozen();
    revision.content.photoLayoutVersion = 2;
    revision.content.photoAtlas!.mapPoints = [{ id: "PHOTO-1", position: [9, 55] }];
    authorize({ data: { organization_id: "own-org", project_id: "own-project" }, error: null });
    atlasMocks.load.mockResolvedValue({
      checksum: "c".repeat(64),
      photos: [{ id: "PHOTO-1", lon: 9.1, lat: 55 }],
    });
    await expect(buildReportImages(revision)).rejects.toThrow("kortpunkter matcher ikke kilden");
    expect(atlasMocks.images).not.toHaveBeenCalled();
  });
});
function fixture(): ReportRevision {
  const content = newReportContent("P", "O", "S", "A");
  content.sources = [
    {
      id: "media:1",
      title: "Photo",
      kind: "drone",
      capturedAt: null,
      checksum: "a".repeat(64),
      position: null,
      method: "RGB",
      version: "1",
      filePath: "p/photo.jpg",
      storageBucket: "project-originals",
      mimeType: "image/jpeg",
    },
  ];
  return {
    id: "v",
    report_id: "r",
    version: 1,
    status: "draft",
    created_at: "now",
    created_by: "u",
    content,
  };
}
describe("report asset integrity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storage.from.mockReturnValue(storage);
  });
  it("stops export when source bytes do not match frozen checksum", async () => {
    storage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.invalid/photo" },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("changed bytes")));
    await expect(buildReportImages(fixture())).rejects.toThrow("Checksum afviger");
  });
  it("does not fetch from unrecognized storage buckets", async () => {
    const r = fixture();
    r.content.sources[0].storageBucket = "other-tenant";
    await expect(buildReportImages(r)).rejects.toThrow("Ukendt kildebucket");
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });
  it("does not invent an atlas photo when its checksum is missing", async () => {
    const r = fixture();
    r.content.sources[0].checksum = null;
    expect(await buildReportImages(r)).toEqual([]);
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });
  it("opens only the reviewed original from the saved report's project and verifies the downloaded bytes", async () => {
    const revision = fixture();
    const photo = revision.content.sources[0];
    const originalBytes = new TextEncoder().encode("historical photo bytes");
    const digest = await crypto.subtle.digest("SHA-256", originalBytes);
    photo.storageBucket = "monitoring-uploads";
    photo.checksum = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    photo.localCaptureDate = "2026-08-24";
    photo.version = "b".repeat(64);
    const review = {
      id: crypto.randomUUID(),
      bindingId: crypto.randomUUID(),
      sha256: photo.version,
      bindingSha256: "c".repeat(64),
      originalSha256: photo.checksum,
      originalValidationSha256: "d".repeat(64),
    };
    const projectId = crypto.randomUUID(),
      mediaId = crypto.randomUUID();
    photo.id = `media:${mediaId}`;
    const query = {
      select: () => query,
      eq: vi.fn(() => query),
      single: async () => ({
        data: { project_id: projectId, organization_id: "org" },
        error: null,
      }),
    };
    atlasMocks.from.mockReturnValue(query);
    await expect(buildReportImages(revision)).rejects.toThrow("gennemgang");
    expect(canonicalRead).not.toHaveBeenCalled();
    photo.photoPointReview = review;
    const signed = {
      projectId,
      mediaId,
      originalSha256: photo.checksum,
      signedUrl: "https://example.invalid/verified-photo",
    };
    canonicalRead
      .mockResolvedValueOnce({ ...signed, mediaId: crypto.randomUUID() })
      .mockResolvedValue(signed);
    await expect(buildReportImages(revision)).rejects.toThrow("matcher ikke");
    const fetchOriginal = vi
      .fn()
      .mockResolvedValueOnce(new Response("changed"))
      .mockResolvedValueOnce(new Response(originalBytes));
    vi.stubGlobal("fetch", fetchOriginal);
    try {
      await expect(buildReportImages(revision)).rejects.toThrow("Checksum afviger");
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => ({ width: 1600, height: 900, close: vi.fn() })),
      );
      vi.stubGlobal("document", {
        createElement: () => ({
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (cb: (blob: Blob) => void) => cb(new Blob(["preview"])),
        }),
      });
      const [image] = await buildReportImages(revision);
      expect(image).toMatchObject({ id: photo.id, width: 1600 });
      expect(image.caption).toContain("lokal kameradato uden dokumenteret tidszone");
      expect(query.eq).toHaveBeenCalledWith("id", revision.report_id);
      expect(canonicalRead).toHaveBeenCalledWith({ data: { projectId, mediaId } });
      expect(fetchOriginal).toHaveBeenCalledWith(signed.signedUrl);
      expect(storage.createSignedUrl).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("visible basemap composition", () => {
  it("labels a failed basemap explicitly and does not misrepresent GPS as coverage", async () => {
    const ctx = {
      fillRect: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      strokeRect: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ctx,
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob(["rendered fixture"])),
      }),
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = fixture();
    r.content.sources[0].position = [9.4, 55.2];
    r.content.sources[0].checksum = null;
    const result = await buildReportImages(r);
    expect(result).toHaveLength(1);
    expect(result[0].caption).toContain("Baggrundskort utilgængeligt");
    expect(result[0].caption).toContain("faktisk fotodækning fremgår ikke");
    expect(ctx.fillText).toHaveBeenCalledWith("↑ N", 1250, 50);
    expect(ctx.fillText).toHaveBeenCalledWith("50 m ved kortets midte", 1060, 811);
    expect(ctx.fillText).toHaveBeenCalledWith("Nummereret kameraposition", 88, 79);
    expect(ctx.arc).toHaveBeenCalledWith(75, 73, 5, 0, 2 * Math.PI);

    r.content.sources = [];
    r.content.natureSurvey = {
      observations: [],
      areas: [
        {
          id: "550224ca-2766-4bb9-9f1b-98a7b77ad365",
          name: "Eng",
          method: "Visuel gennemgang",
          hectares: 2,
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [9.4, 55.2],
                [9.402, 55.2],
                [9.4, 55.203],
                [9.4, 55.2],
              ],
            ],
          },
        },
      ],
    };
    const surveyImages = await buildReportImages(r);
    expect(surveyImages).toHaveLength(1);
    expect(surveyImages[0].caption).toContain("Områdegrænser og numre");
    expect(ctx.fillText).toHaveBeenCalledWith("Nummereret undersøgelsesområde", 88, 79);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.fill).toHaveBeenCalledWith("evenodd");
    r.content.natureSurvey = undefined;
    const source = { ...fixture().content.sources[0], checksum: null };
    r.content.sources = [
      { ...source, id: "media:outside", position: [12, 57] },
      { ...source, id: "media:inside", position: [9.4, 55.2] },
    ];
    r.content.mapViewport = { center: [9.4, 55.2], zoom: 18 };
    ctx.fillText.mockClear();
    const [crop] = await buildReportImages(r);
    expect(crop.caption).toContain("Valgt kortudsnit. 1 af 2 positioner er inden for rammen.");
    expect(crop.caption).not.toContain("tætte punkter");
    expect(ctx.fillText).toHaveBeenCalledWith("2", expect.any(Number), expect.any(Number));
    expect(ctx.fillText).not.toHaveBeenCalledWith("1", expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenCalledWith("50 m ved kortets midte", 1060, 811);
  });
});
