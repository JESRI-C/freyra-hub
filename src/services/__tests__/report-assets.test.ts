import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ from: vi.fn(), createSignedUrl: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage } }));
import { buildReportImages } from "../report-assets";
import { newReportContent, type ReportRevision } from "@/lib/report-document";
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
