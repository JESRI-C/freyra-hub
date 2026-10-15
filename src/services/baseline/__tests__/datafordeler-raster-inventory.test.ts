import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { baselineSha256 } from "../public-baseline-service";
import { buildRasterQueryProjection } from "../raster-query-projection";
import {
  buildRasterInventoryUrl,
  parseRasterInventoryPage,
  RASTER_PRODUCTS,
  DATAFORDELER_RASTER_METADATA_ENDPOINT,
  type RasterDataset,
  type RasterInventoryPayload,
} from "../datafordeler-raster-inventory";
import { fetchDatafordelerRasterInventorySource } from "../datafordeler-raster-inventory.server";

const KEY = "SYNTHETIC-SERVER-ONLY-RASTER-KEY-999";
const POLYGON: GeoJSONPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [9.26, 55.363],
      [9.27, 55.363],
      [9.27, 55.367],
      [9.26, 55.367],
      [9.26, 55.363],
    ],
  ],
};
const INPUT = { polygon: POLYGON, dateFrom: "2026-08-24", dateTo: "2026-09-07" };
const BBOX = buildRasterQueryProjection(POLYGON).bbox;
function file(dataset: RasterDataset, index = 1) {
  const product = RASTER_PRODUCTS.find((item) => item.dataset === dataset)!;
  const productIndex = RASTER_PRODUCTS.indexOf(product) + 1;
  return {
    fileFormat: "tif",
    id: `${productIndex}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    dataSetName: dataset,
    register: product.register,
    version: "1",
    dataDeliveryNumber: product.register === "dhm" ? 3 : 4,
    fileName: `fixture_${productIndex}_${index}.tif`,
    generationTime: "2026-06-20T06:52:21.537761Z",
    boundingBox: { minX: 516000, maxX: 517000, minY: 6135000, maxY: 6136000 },
    fileSizeInBytes: 18995667,
  };
}
function page(dataset: RasterDataset, totalCount = 1, currentPage = 1) {
  const start = (currentPage - 1) * 100;
  return {
    paginationMetadata: {
      currentPage,
      pageSize: 100,
      totalCount,
      totalPages: Math.ceil(totalCount / 100),
    },
    availableFileDownloads: Array.from(
      { length: Math.max(0, Math.min(100, totalCount - start)) },
      (_, index) => file(dataset, start + index + 1),
    ),
  };
}
function jsonResponse(value: unknown, whitespace = 0) {
  return new Response(" ".repeat(whitespace) + JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}
function inventoryFetch(totals: Partial<Record<RasterDataset, number>> = {}) {
  return vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input));
    const dataset = url.searchParams.get("DataSetName") as RasterDataset;
    return jsonResponse(
      page(dataset, totals[dataset] ?? 1, Number(url.searchParams.get("Pagenumber"))),
    );
  });
}
let previousKey: string | undefined;
beforeEach(() => {
  previousKey = process.env.DATAFORDELER_API_KEY;
  process.env.DATAFORDELER_API_KEY = KEY;
});
afterEach(() => {
  if (previousKey === undefined) delete process.env.DATAFORDELER_API_KEY;
  else process.env.DATAFORDELER_API_KEY = previousKey;
});

describe("observed modern raster metadata DTO", () => {
  it.each([
    {
      dataset: "GeoDKO10cm" as const,
      id: "0ca55649-1a5b-4673-89f9-bcba95f91d08",
      fileName: "2025_1km_6132_516.tif",
      generationTime: "2026-01-12T16:14:25.678682Z",
      minX: 516000,
      minY: 6132000,
      fileSizeInBytes: 86039890,
      delivery: 4,
    },
    {
      dataset: "GeoDKO12,5cm" as const,
      id: "079a5592-0d91-481b-93d0-845a4bb103f2",
      fileName: "2025_1km_6136_515.tif",
      generationTime: "2026-01-12T16:15:18.979681Z",
      minX: 515000,
      minY: 6136000,
      fileSizeInBytes: 85960383,
      delivery: 4,
    },
    {
      dataset: "Terraen" as const,
      id: "0e7dbcd8-ee69-41ff-aa7b-f17d6df3604e",
      fileName: "DHM_TERRAEN_1km_6136_517.tif",
      generationTime: "2026-06-20T06:52:45.93688Z",
      minX: 517000,
      minY: 6136000,
      fileSizeInBytes: 19524996,
      delivery: 3,
    },
  ])(
    "parses the actual first $dataset candidate without converting generation into capture",
    (sample) => {
      // Curated single-record pages: file fields are exact first candidates from
      // root's public 13Oct2026 synthetic-AOI HTTP200 probe. The actual complete
      // pages contained15 records each; pagination below is reduced to one for
      // this DTO regression, so these are not raw response/hash fixtures.
      const value = page(sample.dataset);
      Object.assign(value.availableFileDownloads[0], {
        id: sample.id,
        fileName: sample.fileName,
        generationTime: sample.generationTime,
        fileSizeInBytes: sample.fileSizeInBytes,
        dataDeliveryNumber: sample.delivery,
        boundingBox: {
          minX: sample.minX,
          maxX: sample.minX + 1000,
          minY: sample.minY,
          maxY: sample.minY + 1000,
        },
      });
      const bbox: [number, number, number, number] = [515756, 6132196, 517345, 6136401];
      const parsed = parseRasterInventoryPage(value, sample.dataset, bbox, 1);
      expect(parsed.delivery).toBe(sample.delivery);
      expect(parsed.files[0]).toMatchObject({
        id: sample.id,
        fileGeneratedAt: sample.generationTime,
        nativeBBox: [sample.minX, sample.minY, sample.minX + 1000, sample.minY + 1000],
        capturedFrom: null,
        capturedTo: null,
        actualPixelSizeM: null,
        pixelCoverage: "unknown",
        rasterBytesFetched: false,
      });
      const query = new URL(buildRasterInventoryUrl(sample.dataset, bbox, 1));
      expect(query.searchParams.get("MinX")).toBe("515756");
      expect(query.searchParams.get("MaxY")).toBe("6136401");
      expect(query.searchParams.get("DataSetName")).toBe(sample.dataset);
    },
  );
  it("retains UUID/nativebbox/model/delivery/generatedtime without claiming raster verification", () => {
    const parsed = parseRasterInventoryPage(page("Terraen"), "Terraen", BBOX, 1);
    expect(parsed.delivery).toBe(3);
    expect(parsed.files[0]).toMatchObject({
      modelVersion: 1,
      fileGeneratedAt: "2026-06-20T06:52:21.537761Z",
      catalogBBoxCrs: "EPSG:25832",
      capturedFrom: null,
      capturedTo: null,
      verifiedRasterCrs: null,
      verifiedVerticalCrs: null,
      actualPixelSizeM: null,
      nodata: "not_checked",
      pixelCoverage: "unknown",
      rasterBytesFetched: false,
    });
    expect(parsed.files[0].nativeBBox).toEqual([516000, 6135000, 517000, 6136000]);
  });
  it("builds only allowlisted fixed-host keyfree bbox queries, preserving comma dataset spelling", () => {
    const url = new URL(buildRasterInventoryUrl("GeoDKO12,5cm", BBOX, 2, 4));
    expect(url.origin + url.pathname).toBe(DATAFORDELER_RASTER_METADATA_ENDPOINT);
    expect(url.searchParams.get("DataSetName")).toBe("GeoDKO12,5cm");
    expect(url.searchParams.get("DataDeliveryNumber")).toBe("4");
    expect(url.searchParams.has("apiKey")).toBe(false);
    expect(() => buildRasterInventoryUrl("unknown" as never, BBOX, 1)).toThrow();
    expect(() => buildRasterInventoryUrl("Terraen", BBOX, 3)).toThrow();
  });
  it.each([
    "wrong-dataset",
    "wrong-register",
    "wrong-id",
    "wrong-version",
    "wrong-delivery",
    "outside-bbox",
    "reversed-bbox",
    "unbounded-bbox",
    "invalid-date",
    "unsafe-name",
    "unknown-field",
  ])("rejects %s", (change) => {
    const value = page("Terraen");
    const record = value.availableFileDownloads[0];
    if (change === "wrong-dataset") record.dataSetName = "GeoDKO10cm";
    if (change === "wrong-register") record.register = "geodko";
    if (change === "wrong-id") record.id = "not-uuid";
    if (change === "wrong-version") record.version = "2";
    if (change === "wrong-delivery") record.dataDeliveryNumber = 9;
    if (change === "outside-bbox")
      Object.assign(record.boundingBox, { minX: 600000, maxX: 601000 });
    if (change === "reversed-bbox") record.boundingBox.minX = record.boundingBox.maxX;
    if (change === "unbounded-bbox") record.boundingBox.maxY = 1e50;
    if (change === "invalid-date") record.generationTime = "2026-02-30T10:00:00Z";
    if (change === "unsafe-name") record.fileName = "../../private.tif?apiKey=hidden";
    if (change === "unknown-field") Object.assign(record, { accessToken: "unexpected" });
    expect(() => parseRasterInventoryPage(value, "Terraen", BBOX, 1, 3)).toThrow();
  });
  it.each(["current-page", "total-pages", "missing-file", "extra-field", "duplicate-id"])(
    "rejects inconsistent pagination %s",
    (change) => {
      const value = page("Terraen", 2);
      if (change === "current-page") value.paginationMetadata.currentPage = 2;
      if (change === "total-pages") value.paginationMetadata.totalPages = 2;
      if (change === "missing-file") value.availableFileDownloads.pop();
      if (change === "extra-field") Object.assign(value, { next: "https://example.invalid" });
      if (change === "duplicate-id")
        value.availableFileDownloads[1].id = value.availableFileDownloads[0].id;
      expect(() => parseRasterInventoryPage(value, "Terraen", BBOX, 1)).toThrow();
    },
  );
  it("accepts an empty complete catalogue without inventing a capture date or delivery", () => {
    const parsed = parseRasterInventoryPage(page("GeoDKO10cm", 0), "GeoDKO10cm", BBOX, 1);
    expect(parsed.files).toEqual([]);
    expect(parsed.delivery).toBeNull();
  });
});

describe("bounded server-only raster catalogue collection", () => {
  it("collects3 inventories as partial context with keyfree page hashes and no rasterrequests", async () => {
    const fetchImpl = inventoryFetch();
    const source = await fetchDatafordelerRasterInventorySource(
      { ...INPUT, geometrySha256: await baselineSha256(POLYGON) },
      { fetchImpl, now: () => "2026-10-13T20:00:00Z" },
    );
    expect(source).toMatchObject({
      id: "orthophoto-terrain",
      mode: "live",
      status: "partial",
      sourceModifiedAt: null,
      coverage: {
        spatial: "unknown",
        temporal: "unknown",
        observedFrom: null,
        observedTo: null,
        paginationComplete: true,
        returnedCount: 3,
      },
      error: null,
    });
    expect(source.payloadSha256).toBe(await baselineSha256(source.payload));
    const payload = source.payload as unknown as RasterInventoryPayload;
    expect(payload).toMatchObject({
      inventoryOnly: true,
      pixelDataNotFetched: true,
      rasterAnalysisStatus: "not_started",
      generationDatesAreNotCaptureDates: true,
    });
    expect(payload.products.map((product) => product.files[0].capturedFrom)).toEqual([
      null,
      null,
      null,
    ]);
    expect(payload.products[2].expectedVerticalCrs).toBe("EPSG:5799");
    expect(
      payload.pages.every(
        (item) =>
          /^[0-9a-f]{64}$/.test(item.responseSha256) &&
          !new URL(item.queryUrl).searchParams.has("apiKey"),
      ),
    ).toBe(true);
    expect(JSON.stringify(source)).not.toContain(KEY);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const call of fetchImpl.mock.calls) {
      expect(new URL(String(call[0])).pathname).toBe(
        "/FileDownloads/v1.0/GetAvailableRasterFileDownloads",
      );
      expect(new URL(String(call[0])).searchParams.get("apiKey")).toBe(KEY);
      expect(call[1]?.redirect).toBe("manual");
    }
  });
  it("pins a page1 delivery on page2 and completes within the6-request/200-file ceiling", async () => {
    const fetchImpl = inventoryFetch({ GeoDKO10cm: 101, "GeoDKO12,5cm": 0, Terraen: 0 });
    const source = await fetchDatafordelerRasterInventorySource(INPUT, { fetchImpl });
    expect(source.status).toBe("partial");
    expect(source.coverage.returnedCount).toBe(101);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const second = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(second.searchParams.get("DataDeliveryNumber")).toBe("4");
  });
  it("keeps an all-empty catalogue partial and unmeasured", async () => {
    const fetchImpl = inventoryFetch({ GeoDKO10cm: 0, "GeoDKO12,5cm": 0, Terraen: 0 });
    fetchImpl.mockImplementation(async (input) => {
      const dataset = new URL(String(input)).searchParams.get("DataSetName") as RasterDataset;
      const value = page(dataset, 0);
      // Both empty forms are accepted and retained without a coverage claim.
      if (dataset === "GeoDKO12,5cm") value.paginationMetadata.totalPages = 1;
      return jsonResponse(value);
    });
    const source = await fetchDatafordelerRasterInventorySource(INPUT, {
      fetchImpl,
    });
    expect(source.status).toBe("partial");
    expect(source.coverage.returnedCount).toBe(0);
    expect(source.coverage.spatial).toBe("unknown");
    expect(source.coverage.observedFrom).toBeNull();
    const payload = source.payload as unknown as RasterInventoryPayload;
    expect(payload.products.every((product) => product.dataDeliveryNumber === null)).toBe(true);
    expect(payload.products.every((product) => product.files.length === 0)).toBe(true);
    expect(payload.pages.map((item) => item.pagination.totalPages)).toEqual([0, 1, 0]);
    expect(payload.pages.every((item) => item.pagination.totalCount === 0)).toBe(true);
  });
  it("reports missing serveraccess without a fetch", async () => {
    delete process.env.DATAFORDELER_API_KEY;
    const fetchImpl = inventoryFetch();
    const source = await fetchDatafordelerRasterInventorySource(INPUT, { fetchImpl });
    expect(source).toMatchObject({
      mode: "error",
      status: "not_configured",
      payload: null,
      payloadSha256: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    "changed-pagination",
    "changed-delivery",
    "cross-page-duplicate",
    "request-bound",
    "file-bound",
  ])("fails closed for %s", async (change) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const dataset = url.searchParams.get("DataSetName") as RasterDataset;
      const number = Number(url.searchParams.get("Pagenumber"));
      const value = page(
        dataset,
        change === "request-bound" ? 201 : change === "file-bound" ? 150 : 101,
        number,
      );
      if (change === "changed-pagination" && number === 2) {
        value.paginationMetadata.totalCount = 102;
        value.availableFileDownloads.push(file(dataset, 102));
      }
      if (change === "changed-delivery" && number === 2)
        value.availableFileDownloads[0].dataDeliveryNumber = 5;
      if (change === "cross-page-duplicate" && number === 2)
        value.availableFileDownloads[0].id = file(dataset, 1).id;
      return jsonResponse(value);
    });
    const source = await fetchDatafordelerRasterInventorySource(INPUT, { fetchImpl });
    expect(source).toMatchObject({
      mode: "error",
      status: "failed",
      payload: null,
      payloadSha256: null,
    });
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(6);
  });
  it.each([301, 401, 403, 500])(
    "rejects HTTP%s without leaking the private URL",
    async (status) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("private", {
          status,
          headers: { location: "https://example.invalid/?apiKey=" + KEY },
        }),
      );
      const source = await fetchDatafordelerRasterInventorySource(INPUT, { fetchImpl });
      expect(source.status).toBe("failed");
      expect(source.payload).toBeNull();
      expect(JSON.stringify(source)).not.toContain(KEY);
    },
  );
  it("redacts transport errors and a credential echo in metadata", async () => {
    for (const fetchImpl of [
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("https://api.datafordeler.dk/?apiKey=" + KEY)),
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ...page("GeoDKO10cm"), debug: KEY })),
    ]) {
      const source = await fetchDatafordelerRasterInventorySource(INPUT, { fetchImpl });
      expect(source.payload).toBeNull();
      expect(JSON.stringify(source)).not.toContain(KEY);
    }
  });

  it("rejects a JSON-escaped credential echoed in an otherwise valid filename", async () => {
    const metadata = page("GeoDKO10cm");
    metadata.availableFileDownloads[0].fileName = KEY + ".tif";
    const encodedBody = JSON.stringify(metadata).replace(KEY, "\\u0053" + KEY.slice(1));
    expect(encodedBody).not.toContain(KEY);
    expect(JSON.parse(encodedBody).availableFileDownloads[0].fileName).toContain(KEY);
    const source = await fetchDatafordelerRasterInventorySource(INPUT, {
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(encodedBody, { headers: { "content-type": "application/json" } }),
        ),
    });
    expect(source).toMatchObject({
      status: "failed",
      payload: null,
      payloadSha256: null,
      error: { code: "CREDENTIAL_ECHO" },
    });
    expect(JSON.stringify(source)).not.toContain(KEY);
  });

  it.each(["text/html", "image/tiff"])(
    "rejects a200 %s response as non-metadata",
    async (contentType) => {
      const source = await fetchDatafordelerRasterInventorySource(INPUT, {
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response("not metadata", { headers: { "content-type": contentType } }),
          ),
      });
      expect(source).toMatchObject({
        status: "failed",
        payload: null,
        error: { code: "INVALID_CONTENT_TYPE" },
      });
    },
  );

  it("uses one total deadline across multiple pages rather than resetting each request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const url = new URL(String(input));
      return jsonResponse(page(url.searchParams.get("DataSetName") as RasterDataset));
    });
    const source = await fetchDatafordelerRasterInventorySource(INPUT, {
      fetchImpl,
      totalTimeoutMs: 50,
    });
    expect(source).toMatchObject({
      status: "timeout",
      payload: null,
      error: { code: "CATALOG_TIMEOUT" },
    });
    expect(fetchImpl.mock.calls.length).toBeLessThan(3);
  });
  it.each(["header", "body", "total"])("bounds %s bytes", async (limit) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const dataset = new URL(String(input)).searchParams.get("DataSetName") as RasterDataset;
      if (limit === "header")
        return new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-length": String(1024 * 1024 + 1),
          },
        });
      return jsonResponse(page(dataset), limit === "body" ? 1024 * 1024 : 750 * 1024);
    });
    const source = await fetchDatafordelerRasterInventorySource(INPUT, { fetchImpl });
    expect(source).toMatchObject({
      status: "failed",
      payload: null,
      error: { code: "METADATA_SIZE_LIMIT" },
    });
  });
  it.each(["headers", "body"])("bounds stalled %s by the same total deadline", async (phase) => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() =>
      phase === "headers"
        ? new Promise<Response>(() => {})
        : Promise.resolve(
            new Response(new ReadableStream({ start() {} }), {
              headers: { "content-type": "application/json" },
            }),
          ),
    );
    const source = await fetchDatafordelerRasterInventorySource(INPUT, {
      fetchImpl,
      totalTimeoutMs: 20,
    });
    expect(source).toMatchObject({
      status: "timeout",
      payload: null,
      error: { code: "CATALOG_TIMEOUT" },
    });
  });
  it("rejects invalid inputs before any fetch or secret-bearing request", async () => {
    const fetchImpl = inventoryFetch();
    await expect(
      fetchDatafordelerRasterInventorySource({ ...INPUT, dateFrom: "2026-02-30" }, { fetchImpl }),
    ).rejects.toThrow();
    await expect(
      fetchDatafordelerRasterInventorySource(
        { ...INPUT, geometrySha256: "a".repeat(64) },
        { fetchImpl },
      ),
    ).rejects.toThrow();
    await expect(
      fetchDatafordelerRasterInventorySource(INPUT, { fetchImpl, totalTimeoutMs: 20001 }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
