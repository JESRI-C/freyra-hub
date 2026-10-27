import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ from: vi.fn(), createSignedUrl: vi.fn() }));
const atlasMocks = vi.hoisted(() => ({ from: vi.fn(), load: vi.fn(), images: vi.fn() }));
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
    expect(atlasMocks.images).toHaveBeenCalledWith(atlas, [first]);
  });
  it("requires the atlas's existing evidence reference in the source register", async () => {
    const revision = frozen();
    revision.content.sources = [];
    await expect(buildReportImages(revision)).rejects.toThrow("kilderegister");
    expect(atlasMocks.load).not.toHaveBeenCalled();
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
});

describe("visible basemap composition", () => {
  it("labels a failed basemap explicitly and does not misrepresent GPS as coverage", async () => {
    const ctx = {
      fillRect: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      strokeRect: vi.fn(),
      arc: vi.fn(),
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
  });
});
