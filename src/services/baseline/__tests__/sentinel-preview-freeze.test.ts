import { describe, expect, it, vi } from "vitest";
import { freezeSentinelPreview } from "../sentinel-preview.server";
import { baselineSha256, baselineSnapshotFromRow } from "../public-baseline-service";
import {
  makeManifest,
  COLLECTED_AT,
  PROJECT_ID,
  SNAPSHOT_ID,
  ACTOR_ID,
  REQUEST_ID,
} from "./public-baseline.fixtures";

const thumbnail = {
  href: "https://datahub.creodias.eu/odata/v1/Assets(00000000-0000-4000-8000-000000000001)/$value",
  mediaType: "image/jpeg",
};
async function fixture(cloud = 0) {
  const manifest = await makeManifest();
  const initial = manifest.sources.find((source) => source.id === "sentinel-2-scenes")!;
  const payload = {
    schema: "gofreyra.sentinel-scene-catalog/v1",
    scenes: [
      {
        id: "lowcloud-nearest",
        datetime: "2026-09-01T12:00:00Z",
        globalCloudCoverPct: 5,
        thumbnail: { ...thumbnail, href: thumbnail.href.replace(/001\)/, "002)") },
      },
      {
        id: "clear-further",
        datetime: "2026-09-03T12:00:00Z",
        globalCloudCoverPct: cloud,
        thumbnail,
      },
    ],
  };
  return {
    manifest,
    source: {
      ...initial,
      mode: "live" as const,
      status: "partial" as const,
      error: null,
      payload,
      payloadSha256: await baselineSha256(payload),
    },
  };
}

describe("frozen Sentinel thumbnails", () => {
  it("selects the nearest zero-cloud scene to the explicit period end used by flight intake", async () => {
    const { source } = await fixture();
    source.payload.scenes[0].globalCloudCoverPct = 0;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([255, 216, 1, 2, 255, 217]), {
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const result = await freezeSentinelPreview(source, { fetchImpl });
    expect(result.payload).toMatchObject({
      previewReferenceDate: source.query.requestedTo,
      previewSceneId: "clear-further",
      frozenPreview: { sceneId: "clear-further" },
    });
  });
  it("allows only one provider redirect retaining the exact asset path", async () => {
    const { source } = await fixture();
    const target = thumbnail.href.replace("datahub.creodias.eu", "zipper.creodias.eu");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: target } }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([255, 216, 1, 2, 255, 217]), {
          headers: { "content-type": "application/octet-stream" },
        }),
      );
    expect((await freezeSentinelPreview(source, { fetchImpl })).payload).toHaveProperty(
      "frozenPreview.sceneId",
      "clear-further",
    );
    expect(String(fetchImpl.mock.calls[1][0])).toBe(target);
    const differentAsset = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 301, headers: { location: target.replace(/001\)/, "002)") } }),
      );
    expect(
      (await freezeSentinelPreview(source, { fetchImpl: differentAsset })).payload,
    ).toHaveProperty("frozenPreview", null);
    expect(differentAsset).toHaveBeenCalledTimes(1);
  });
  it("pins zero-cloud candidate pixels and hash; saved baseline replay needs no image request", async () => {
    const { manifest, source } = await fixture();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([255, 216, 1, 2, 255, 217]), {
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const frozen = await freezeSentinelPreview(source, { fetchImpl, now: () => COLLECTED_AT });
    expect(String(fetchImpl.mock.calls[0][0])).toBe(thumbnail.href);
    expect(frozen.payload).toMatchObject({
      frozenPreview: {
        sceneId: "clear-further",
        dataUrl: "data:image/jpeg;base64,/9gBAv/Z",
        imageFetchedAt: COLLECTED_AT,
      },
    });
    expect(frozen.payloadSha256).toBe(await baselineSha256(frozen.payload));
    expect(frozen.payloadSha256).not.toBe(source.payloadSha256);
    const saved = {
      ...manifest,
      sources: manifest.sources.map((item) => (item.id === source.id ? frozen : item)),
    };
    const replay = await baselineSnapshotFromRow({
      id: SNAPSHOT_ID,
      project_id: PROJECT_ID,
      version_no: 1,
      created_by: ACTOR_ID,
      created_at: COLLECTED_AT,
      request_id: REQUEST_ID,
      manifest: saved,
      manifest_sha256: await baselineSha256(saved),
    });
    expect(replay.manifest.sources.find((item) => item.id === source.id)?.payload).toEqual(
      frozen.payload,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(source.payload).not.toHaveProperty("frozenPreview");
  });
  it.each([
    () => new Response("upstream-private-error", { headers: { "content-type": "image/jpeg" } }),
    () => new Response(null, { status: 302, headers: { location: "https://untrusted.test" } }),
    () => new Response(new Uint8Array(300_001), { headers: { "content-type": "image/jpeg" } }),
  ])(
    "preserves real catalogue and an explicit image gap on invalid, redirected or large images",
    async (response) => {
      const { source } = await fixture();
      const result = await freezeSentinelPreview(source, {
        fetchImpl: vi.fn().mockResolvedValue(response()),
      });
      expect(result.payload).toMatchObject({ frozenPreview: null, scenes: source.payload.scenes });
      expect(result.mode).toBe("live");
      expect(result.quality.warnings.join(" ")).toContain("billedpixels mangler");
      expect(JSON.stringify(result)).not.toContain("upstream-private-error");
    },
  );
  it("bounds an unresponsive image independently of catalogue success", async () => {
    const { source } = await fixture();
    const result = await freezeSentinelPreview(source, {
      timeoutMs: 5,
      fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)),
    });
    expect(result.payload).toHaveProperty("frozenPreview", null);
  });
});
