import { describe, expect, it, vi } from "vitest";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { isBaselineMeasuredEvidence } from "../public-baseline-types";
import { baselineSha256 } from "../public-baseline-service";
import {
  fetchSentinelSceneSource,
  SENTINEL_STAC_SEARCH,
  SENTINEL_L2A_COLLECTION,
} from "../sentinel-scene-source";

const AOI: GeoJSONPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [9, 55],
      [9.1, 55],
      [9.1, 55.1],
      [9, 55.1],
      [9, 55],
    ],
  ],
};
const INPUT = { polygon: AOI, dateFrom: "2026-09-01", dateTo: "2026-09-30" };
const NOW = () => "2026-10-13T12:00:00.000Z";
function item(id = "S2A_MSIL2A_TEST", overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    id,
    collection: SENTINEL_L2A_COLLECTION,
    bbox: [9, 55, 9.2, 55.2],
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [9, 55],
          [9.2, 55],
          [9.2, 55.2],
          [9, 55.2],
          [9, 55],
        ],
      ],
    },
    properties: {
      datetime: "2026-09-12T10:30:00Z",
      platform: "sentinel-2a",
      "eo:cloud_cover": 2.3,
      "product:type": "S2MSI2A",
      "product:identifier": "S2A_MSIL2A_PRODUCT_TEST",
    },
    ...overrides,
  };
}
function response(features: unknown[], links: unknown[] = [], extra: Record<string, unknown> = {}) {
  return Response.json({ type: "FeatureCollection", features, links, ...extra });
}
function scenes(
  source: Awaited<ReturnType<typeof fetchSentinelSceneSource>>,
): Array<Record<string, unknown>> {
  return (source.payload as { scenes: Array<Record<string, unknown>> }).scenes;
}

describe("official Sentinel-2 L2A candidate catalogue", () => {
  it("retains only a genuine public thumbnail asset and declares the neighbouring flight-day search window", async () => {
    const thumbnail =
      "https://datahub.creodias.eu/odata/v1/Assets(98eacd8c-8c85-4888-895a-a45544410c46)/$value";
    const candidate = item("scene-preview", {
      assets: { thumbnail: { href: thumbnail, type: "image/jpeg", roles: ["thumbnail"] } },
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response([candidate]));
    const source = await fetchSentinelSceneSource(
      { ...INPUT, dateFrom: "2026-09-10", dateTo: "2026-09-10" },
      { fetchImpl, now: NOW },
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).toMatchObject({
      datetime: "2026-08-11T00:00:00Z/2026-10-10T23:59:59.999Z",
    });
    expect(source.query).toMatchObject({ requestedFrom: "2026-09-10", requestedTo: "2026-09-10" });
    expect(scenes(source)[0]).toMatchObject({
      thumbnail: { href: thumbnail, mediaType: "image/jpeg" },
    });
    expect(source.payload).toMatchObject({ previewSceneId: "scene-preview" });
    expect(source.quality.warnings.join(" ")).toContain("30 dage før og efter");
  });
  it("uses only the fixed current endpoint and canonical AOI/period, with local quality pending", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response([item()]));
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(SENTINEL_STAC_SEARCH);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      collections: [SENTINEL_L2A_COLLECTION],
      intersects: AOI,
      datetime: "2026-09-01T00:00:00Z/2026-09-30T23:59:59.999Z",
      limit: 50,
    });
    expect(init!.headers).not.toHaveProperty("Authorization");
    expect(source).toMatchObject({
      id: "sentinel-2-scenes",
      mode: "live",
      status: "partial",
      quality: { evidenceKind: "official_registration" },
      coverage: {
        spatial: "unknown",
        temporal: "unknown",
        paginationComplete: true,
        returnedCount: 1,
      },
    });
    expect(scenes(source)[0]).toMatchObject({
      id: "S2A_MSIL2A_TEST",
      productId: "S2A_MSIL2A_PRODUCT_TEST",
      productType: "S2MSI2A",
      globalCloudCoverPct: 2.3,
      localQuality: { cloud: "pending", shadow: "pending", nodata: "pending", usable: null },
    });
    expect(isBaselineMeasuredEvidence(source)).toBe(false);
    expect(source.payload).not.toHaveProperty("ndvi");
    expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
  });

  it("preserves missing global cloud metadata as unknown instead of zero", async () => {
    const feature = item();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([{ ...feature, properties: { datetime: "2026-09-12T10:30:00Z" } }]),
      );
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    expect(scenes(source)[0].globalCloudCoverPct).toBeNull();
    expect(scenes(source)[0].productId).toBeNull();
    expect(scenes(source)[0].localQuality).toMatchObject({ usable: null });
  });

  it("normalizes timestamps without changing their actual acquisition instant", async () => {
    const feature = item();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response([
        {
          ...feature,
          properties: { ...feature.properties, datetime: "2026-09-12T12:30:00+02:00" },
        },
      ]),
    );
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    expect(scenes(source)[0].datetime).toBe("2026-09-12T10:30:00.000Z");
  });

  it("follows bounded GET pagination while keeping the canonical search scope", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          [item("scene1")],
          [
            {
              rel: "next",
              href: `${SENTINEL_STAC_SEARCH}?token=next-page&collections=sentinel-1-grd&bbox=0,0,1,1`,
            },
          ],
        ),
      )
      .mockResolvedValueOnce(response([item("scene2")], [], { numberMatched: 2 }));
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const nextUrl = new URL(fetchImpl.mock.calls[1][0] as string);
    expect(nextUrl.searchParams.get("collections")).toBe(SENTINEL_L2A_COLLECTION);
    expect(JSON.parse(nextUrl.searchParams.get("intersects")!)).toEqual(AOI);
    expect(nextUrl.searchParams.get("bbox")).toBeNull();
    expect(nextUrl.searchParams.get("token")).toBe("next-page");
    expect(nextUrl.searchParams.get("fields")).toContain("properties.eo:cloud_cover");
    expect(nextUrl.searchParams.get("fields")?.startsWith("{")).toBe(false);
    expect(source.coverage.paginationComplete).toBe(true);
    expect(scenes(source)).toHaveLength(2);
  });

  it("handles STAC POST merge links without accepting a different AOI or collection", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          [item("scene1")],
          [
            {
              rel: "next",
              href: SENTINEL_STAC_SEARCH,
              method: "POST",
              merge: true,
              body: {
                token: "cursor",
                collections: ["bad-collection"],
                intersects: { type: "Point", coordinates: [0, 0] },
              },
            },
          ],
        ),
      )
      .mockResolvedValueOnce(response([item("scene2")]));
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    const nextBody = JSON.parse(fetchImpl.mock.calls[1][1]!.body as string);
    expect(nextBody).toMatchObject({
      token: "cursor",
      collections: [SENTINEL_L2A_COLLECTION],
      intersects: AOI,
    });
    expect(source.coverage.returnedCount).toBe(2);
  });

  it("marks a page-limit result as incomplete even though candidate metadata were fetched", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([item()], [{ rel: "next", href: `${SENTINEL_STAC_SEARCH}?token=more` }]),
      );
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW, maxPages: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(source.status).toBe("partial");
    expect(source.coverage.paginationComplete).toBe(false);
    expect(source.quality.warnings).toContainEqual(expect.stringContaining("delvist hentet"));
  });

  it("reports no_coverage only for a valid, fully paginated empty catalogue", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([], [], { numberMatched: 0 }));
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    expect(source).toMatchObject({
      mode: "live",
      status: "no_coverage",
      coverage: { returnedCount: 0, paginationComplete: true },
    });
    expect(scenes(source)).toEqual([]);
    expect(isBaselineMeasuredEvidence(source)).toBe(false);
  });

  it("does not claim a complete catalogue when the upstream matched count exceeds returned items", async () => {
    const source = await fetchSentinelSceneSource(INPUT, {
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(response([item()], [], { numberMatched: 20 })),
      now: NOW,
    });
    expect(source.coverage.paginationComplete).toBe(false);
    expect(source.status).toBe("partial");
  });

  it("rejects unsafe pagination before any request leaves the official host", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([item()], [{ rel: "next", href: "https://example.invalid/private" }]),
      );
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(source).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      error: { code: "UNSAFE_PAGINATION" },
    });
  });

  it("rejects repeated pages and conflicting metadata without inventing usable scenes", async () => {
    const loop = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([item()], [{ rel: "next", href: SENTINEL_STAC_SEARCH, method: "POST" }]),
      );
    expect((await fetchSentinelSceneSource(INPUT, { fetchImpl: loop, now: NOW })).error?.code).toBe(
      "PAGINATION_LOOP",
    );
    expect(loop).toHaveBeenCalledTimes(1);
    const first = item();
    const conflict = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([first], [{ rel: "next", href: `${SENTINEL_STAC_SEARCH}?token=2` }]),
      )
      .mockResolvedValueOnce(
        response([{ ...first, properties: { ...first.properties, "eo:cloud_cover": 90 } }]),
      );
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl: conflict, now: NOW });
    expect(source.error?.code).toBe("CONFLICTING_ITEM");
    expect(source.payload).toBeNull();
  });

  it.each([
    item("out-of-period", { properties: { datetime: "2026-10-01T00:00:00Z" } }),
    item("out-of-collection", { collection: "sentinel-2-l1c" }),
    item("out-of-AOI", {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [10, 56],
            [10.1, 56],
            [10.1, 56.1],
            [10, 56.1],
            [10, 56],
          ],
        ],
      },
    }),
    item("invalid-cloud", {
      properties: { datetime: "2026-09-12T00:00:00Z", "eo:cloud_cover": 101 },
    }),
  ])(
    "rejects malformed or out-of-scope scene $id rather than silently accepting it",
    async (feature) => {
      const source = await fetchSentinelSceneSource(INPUT, {
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response([feature])),
        now: NOW,
      });
      expect(source.mode).toBe("error");
      expect(source.payload).toBeNull();
      expect(source.coverage.returnedCount).toBeNull();
    },
  );

  it("returns an explicit error for upstream failure without previews, thumbnails or zeros", async () => {
    const source = await fetchSentinelSceneSource(INPUT, {
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("Unavailable", { status: 503 })),
      now: NOW,
    });
    expect(source).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
      coverage: { returnedCount: null },
      error: { code: "HTTP_503" },
    });
  });

  it.each([301, 302, 307, 308])(
    "rejects HTTP %s redirects without following a new source",
    async (status) => {
      const cancel = vi.fn();
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          status,
          headers: { location: "https://foreign.invalid/scene" },
        }),
      );
      const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
      expect(source).toMatchObject({
        status: "failed",
        payload: null,
        error: { code: `HTTP_${status}` },
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl.mock.calls[0][1]?.redirect).toBe("manual");
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("bounds a stalled fetch and a stalled body stream with the same deadline", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const fetchFailure = await fetchSentinelSceneSource(INPUT, {
      fetchImpl,
      now: NOW,
      requestTimeoutMs: 5,
    });
    expect(fetchFailure).toMatchObject({
      mode: "error",
      status: "timeout",
      error: { code: "TIMEOUT" },
    });
    const bodyFailure = await fetchSentinelSceneSource(INPUT, {
      fetchImpl: vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              cancel: () => new Promise<void>(() => undefined),
            }),
          ),
      ),
      now: NOW,
      requestTimeoutMs: 5,
    });
    expect(bodyFailure.status).toBe("timeout");
  });

  it("enforces the total multi-page deadline", async () => {
    const clockMs = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(13_000);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([item()], [{ rel: "next", href: `${SENTINEL_STAC_SEARCH}?token=2` }]),
      );
    const source = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW, clockMs });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(source).toMatchObject({
      status: "partial",
      mode: "live",
      error: { code: "TIMEOUT" },
      coverage: { paginationComplete: false, returnedCount: 1 },
    });
    expect(scenes(source)).toHaveLength(1);
    expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
  });

  it("checks declared and actual response-byte limits", async () => {
    const declared = await fetchSentinelSceneSource(INPUT, {
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("{}", { headers: { "content-length": "9999999" } })),
      now: NOW,
    });
    expect(declared.error?.code).toBe("RESPONSE_TOO_LARGE");
    const actual = await fetchSentinelSceneSource(INPUT, {
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(768 * 1024 + 1))),
      now: NOW,
    });
    expect(actual.error?.code).toBe("RESPONSE_TOO_LARGE");
  });

  it("rejects invalid input geometry/hash/date before contacting the catalogue", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchSentinelSceneSource({ ...INPUT, geometrySha256: "0".repeat(64) }, { fetchImpl }),
    ).rejects.toThrow("geometriversion");
    await expect(
      fetchSentinelSceneSource({ ...INPUT, dateFrom: "2026-02-30" }, { fetchImpl }),
    ).rejects.toThrow("dato");
    await expect(
      fetchSentinelSceneSource({ ...INPUT, dateFrom: "2024-01-01" }, { fetchImpl }),
    ).rejects.toThrow("366 dage");
    await expect(
      fetchSentinelSceneSource(
        { ...INPUT, polygon: { type: "Polygon", coordinates: [] } },
        { fetchImpl },
      ),
    ).rejects.toThrow("AOI");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("bounded Sentinel catalogue recovery", () => {
  it("recovers one first-page timeout using the exact same canonical query", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise<Response>(() => undefined))
      .mockResolvedValueOnce(response([item()]));
    const result = await fetchSentinelSceneSource(INPUT, {
      fetchImpl,
      now: NOW,
      requestTimeoutMs: 5,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe(fetchImpl.mock.calls[0][0]);
    expect(fetchImpl.mock.calls[1][1]?.body).toBe(fetchImpl.mock.calls[0][1]?.body);
    expect(result).toMatchObject({
      status: "partial",
      mode: "live",
      error: null,
      coverage: { paginationComplete: true, returnedCount: 1 },
    });
    expect(result.payload).toMatchObject({
      requestAttemptCount: 2,
      transientRetryCount: 1,
      pagesFetched: 1,
      collectionError: null,
    });
  });
  it("keeps validated earlier scenes with exact dates after later transient failures", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([item()], [{ rel: "next", href: `${SENTINEL_STAC_SEARCH}?token=2` }]),
      )
      .mockImplementation(async () => new Response("Unavailable", { status: 503 }));
    const result = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      status: "partial",
      mode: "live",
      error: { code: "HTTP_503" },
      coverage: {
        paginationComplete: false,
        returnedCount: 1,
        observedFrom: "2026-09-12T10:30:00.000Z",
        observedTo: "2026-09-12T10:30:00.000Z",
      },
    });
    expect(result.payload).toMatchObject({
      catalogComplete: false,
      requestAttemptCount: 3,
      transientRetryCount: 1,
      pagesFetched: 1,
      collectionError: { code: "HTTP_503" },
    });
    expect(scenes(result)[0].localQuality).toMatchObject({ usable: null });
    expect(result.payloadSha256).toBe(await baselineSha256(result.payload));
    expect(isBaselineMeasuredEvidence(result)).toBe(false);
  });
  it("shares the single retry across all pages and never keeps an incomplete empty result as no coverage", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Unavailable", { status: 502 }))
      .mockResolvedValueOnce(
        response([item()], [{ rel: "next", href: `${SENTINEL_STAC_SEARCH}?token=2` }]),
      )
      .mockResolvedValueOnce(new Response("Unavailable", { status: 504 }));
    const result = await fetchSentinelSceneSource(INPUT, { fetchImpl, now: NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.payload).toMatchObject({
      transientRetryCount: 1,
      pagesFetched: 1,
      catalogComplete: false,
    });
    const emptyFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([], [{ rel: "next", href: `${SENTINEL_STAC_SEARCH}?token=2` }]),
      )
      .mockImplementation(async () => new Response("Unavailable", { status: 503 }));
    const empty = await fetchSentinelSceneSource(INPUT, { fetchImpl: emptyFetch, now: NOW });
    expect(empty).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
    });
  });
});
