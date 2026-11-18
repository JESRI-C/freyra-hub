import { baselineSha256 } from "./public-baseline-service";
import type { BaselineJson, PublicBaselineSource } from "./public-baseline-types";
import { buildRasterQueryProjection } from "./raster-query-projection";
import {
  DATAFORDELER_RASTER_METADATA_ENDPOINT,
  DATAFORDELER_RASTER_ADAPTER,
  DATAFORDELER_RASTER_INVENTORY_SCHEMA,
  MAX_RASTER_PAGE_BYTES,
  MAX_RASTER_TOTAL_BYTES,
  MAX_RASTER_TIMEOUT_MS,
  MAX_RASTER_INVENTORY_REQUESTS,
  MAX_RASTER_INVENTORY_FILES,
  MAX_RASTER_PAGES_PER_PRODUCT,
  RASTER_PRODUCTS,
  RasterInventoryError,
  buildRasterInventoryUrl,
  parseRasterInventoryPage,
  type RasterInventoryInput,
  type RasterInventoryPayload,
  type RasterProductInventory,
} from "./datafordeler-raster-inventory";

export interface RasterInventoryOptions {
  fetchImpl?: typeof fetch;
  now?: () => string;
  /** Tests may shorten the deadline, never widen the production limit. */
  totalTimeoutMs?: number;
}
function validDate(value: string): boolean {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}
function abortable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () =>
      reject(new RasterInventoryError("CATALOG_TIMEOUT", "Rasterkataloget overskred tidsgrænsen."));
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}

async function readPage(
  canonicalUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  controller: AbortController,
  byteBudget: { used: number },
): Promise<{ value: unknown; bytes: number; sha256: string }> {
  const url = new URL(canonicalUrl);
  const endpoint = new URL(DATAFORDELER_RASTER_METADATA_ENDPOINT);
  if (
    url.origin !== endpoint.origin ||
    url.pathname !== endpoint.pathname ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.has("apiKey")
  )
    throw new RasterInventoryError("UNSAFE_QUERY", "Rasterkatalogets kildeadresse er ugyldig.");
  url.searchParams.set("apiKey", apiKey);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let completed = false;
  try {
    const fetching = fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    void fetching.then(
      (response) => {
        if (controller.signal.aborted) void response.body?.cancel().catch(() => undefined);
      },
      () => undefined,
    );
    const response = await abortable(fetching, controller.signal);
    if (!response.ok || response.redirected) {
      void response.body?.cancel().catch(() => undefined);
      throw new RasterInventoryError(
        response.status === 401 || response.status === 403 ? "ACCESS_DENIED" : "CATALOG_HTTP_ERROR",
        "Rasterkataloget kunne ikke hentes med den nuværende serveradgang.",
      );
    }
    if (!/^application\/json\b/i.test(response.headers.get("content-type") ?? "")) {
      void response.body?.cancel().catch(() => undefined);
      throw new RasterInventoryError(
        "INVALID_CONTENT_TYPE",
        "Rasterkataloget returnerede ikke JSON-metadata.",
      );
    }
    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) > MAX_RASTER_PAGE_BYTES ||
        byteBudget.used + Number(declaredLength) > MAX_RASTER_TOTAL_BYTES)
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new RasterInventoryError(
        "METADATA_SIZE_LIMIT",
        "Rasterkatalogets svar overskrider størrelsesgrænsen.",
      );
    }
    if (!response.body)
      throw new RasterInventoryError("EMPTY_BODY", "Rasterkataloget returnerede et tomt svar.");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await abortable(reader.read(), controller.signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      byteBudget.used += chunk.value.byteLength;
      if (bytes > MAX_RASTER_PAGE_BYTES || byteBudget.used > MAX_RASTER_TOTAL_BYTES)
        throw new RasterInventoryError(
          "METADATA_SIZE_LIMIT",
          "Rasterkatalogets svar overskrider størrelsesgrænsen.",
        );
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    // A transport/debug echo must never become saved provenance, even on a 200.
    if (text.includes(apiKey))
      throw new RasterInventoryError(
        "CREDENTIAL_ECHO",
        "Rasterkataloget returnerede et ugyldigt svar.",
      );
    const digest = await crypto.subtle.digest("SHA-256", body);
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new RasterInventoryError(
        "INVALID_JSON",
        "Rasterkataloget returnerede ugyldige JSON-metadata.",
      );
    }
    // JSON escapes can conceal an echoed credential in the raw body.
    if (JSON.stringify(value).includes(apiKey))
      throw new RasterInventoryError(
        "CREDENTIAL_ECHO",
        "Rasterkataloget returnerede et ugyldigt svar.",
      );
    completed = true;
    return { value, bytes, sha256 };
  } finally {
    if (reader && !completed) void reader.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

/** Called through the collector only after project auth and canonical AOI loading. */
export async function fetchDatafordelerRasterInventorySource(
  input: RasterInventoryInput,
  options: RasterInventoryOptions = {},
): Promise<PublicBaselineSource> {
  const startedAt = Date.now();
  if (!validDate(input.dateFrom) || !validDate(input.dateTo) || input.dateFrom > input.dateTo)
    throw new Error("Rasterkataloget kræver en gyldig undersøgelsesperiode.");
  const projection = buildRasterQueryProjection(input.polygon);
  const geometrySha256 = await baselineSha256(input.polygon);
  if (input.geometrySha256 !== undefined && input.geometrySha256 !== geometrySha256)
    throw new Error("Rasterkatalogets område matcher ikke det gemte datagrundlag.");
  const fetchedAt = (options.now ?? (() => new Date().toISOString()))();
  if (!Number.isFinite(Date.parse(fetchedAt)))
    throw new Error("Rasterkatalogets hentetid er ugyldig.");
  const longitudes = input.polygon.coordinates.flat().map((point) => point[0]);
  const latitudes = input.polygon.coordinates.flat().map((point) => point[1]);
  const source: PublicBaselineSource = {
    id: "orthophoto-terrain",
    provider: "Klimadatastyrelsen / GeoDanmark via Datafordeleren",
    dataset: "Ortofoto- og DHM-filkatalog",
    mode: "live",
    status: "partial",
    datasetVersion: null,
    licence: "CC BY 4.0",
    attribution: "Klimadatastyrelsen og @geodanmark",
    sourceUrl: DATAFORDELER_RASTER_METADATA_ENDPOINT,
    sourceModifiedAt: null,
    fetchedAt,
    adapterVersion: DATAFORDELER_RASTER_ADAPTER,
    query: {
      geometrySha256,
      bbox: [
        Math.min(...longitudes),
        Math.min(...latitudes),
        Math.max(...longitudes),
        Math.max(...latitudes),
      ],
      requestedFrom: input.dateFrom,
      requestedTo: input.dateTo,
    },
    coverage: {
      spatial: "unknown",
      temporal: "unknown",
      observedFrom: null,
      observedTo: null,
      paginationComplete: false,
      returnedCount: null,
    },
    quality: {
      evidenceKind: "official_registration",
      method: "bounded_metadata_catalogue_only",
      warnings: [
        "Kun officielle filmetadata er hentet. Rasterpixels, NoData og faktisk datadækning er ikke kontrolleret.",
        "Filgenerering og dataleverance er ikke optagedato. Forholdene i undersøgelsesperioden er uafklarede.",
        "Det bufferede katalogområde anvender en erklæret datum-/epochantagelse; det er ikke en opmåling eller en godkendt kommunal delstrækning.",
        "Ingen terrænkoter, hældning, vandløbsbund, hydraulik eller vedligeholdelsesbehov er beregnet.",
      ],
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  const failed = (error: RasterInventoryError): PublicBaselineSource => ({
    ...source,
    mode: "error",
    status:
      error.code === "NOT_CONFIGURED"
        ? "not_configured"
        : error.code === "CATALOG_TIMEOUT"
          ? "timeout"
          : "failed",
    payload: null,
    payloadSha256: null,
    error: { code: error.code, message: error.message },
  });
  const apiKey = process.env.DATAFORDELER_API_KEY?.trim();
  if (!apiKey)
    return failed(
      new RasterInventoryError(
        "NOT_CONFIGURED",
        "Serveradgang til Datafordelerens rasterkatalog mangler.",
      ),
    );
  const timeout = options.totalTimeoutMs ?? MAX_RASTER_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_RASTER_TIMEOUT_MS)
    throw new Error("Rasterkatalogets tidsgrænse er ugyldig.");
  const controller = new AbortController();
  const remainingMs = timeout - (Date.now() - startedAt);
  if (remainingMs <= 0)
    return failed(
      new RasterInventoryError("CATALOG_TIMEOUT", "Rasterkataloget overskred tidsgrænsen."),
    );
  const timer = setTimeout(() => controller.abort(), remainingMs);
  const byteBudget = { used: 0 };
  let requestCount = 0;
  let fileCount = 0;
  try {
    const payload: RasterInventoryPayload = {
      schema: DATAFORDELER_RASTER_INVENTORY_SCHEMA,
      apiVersion: "v1.0",
      inventoryOnly: true,
      pixelDataNotFetched: true,
      rasterAnalysisStatus: "not_started",
      generationDatesAreNotCaptureDates: true,
      queryProjection: projection,
      products: [],
      pages: [],
    };
    const globalFileIds = new Set<string>();
    for (const product of RASTER_PRODUCTS) {
      const files: RasterProductInventory["files"] = [];
      let pinnedDelivery: number | undefined;
      let firstMetadata: ReturnType<typeof parseRasterInventoryPage>["pagination"] | undefined;
      for (let page = 1; ; page++) {
        if (++requestCount > MAX_RASTER_INVENTORY_REQUESTS || page > MAX_RASTER_PAGES_PER_PRODUCT)
          throw new RasterInventoryError(
            "CATALOG_REQUEST_LIMIT",
            "Rasterkataloget kræver flere sider end den tilladte forespørgselsgrænse.",
          );
        const queryUrl = buildRasterInventoryUrl(
          product.dataset,
          projection.bbox,
          page,
          pinnedDelivery,
        );
        const raw = await readPage(
          queryUrl,
          apiKey,
          options.fetchImpl ?? fetch,
          controller,
          byteBudget,
        );
        const parsed = parseRasterInventoryPage(
          raw.value,
          product.dataset,
          projection.bbox,
          page,
          pinnedDelivery,
        );
        if (
          firstMetadata &&
          (parsed.pagination.pageSize !== firstMetadata.pageSize ||
            parsed.pagination.totalCount !== firstMetadata.totalCount ||
            parsed.pagination.totalPages !== firstMetadata.totalPages)
        )
          throw new RasterInventoryError(
            "PAGINATION_CHANGED",
            "Rasterkatalogets indhold ændrede sig mellem siderne.",
          );
        firstMetadata ??= parsed.pagination;
        if (
          firstMetadata.totalPages > MAX_RASTER_PAGES_PER_PRODUCT ||
          fileCount + firstMetadata.totalCount > MAX_RASTER_INVENTORY_FILES
        )
          throw new RasterInventoryError(
            "CATALOG_FILE_LIMIT",
            "Rasterkatalogets filer overskrider den afgrænsede inventargrænse.",
          );
        pinnedDelivery ??= parsed.delivery ?? undefined;
        for (const file of parsed.files) {
          if (globalFileIds.has(file.id))
            throw new RasterInventoryError(
              "DUPLICATE_FILE_ID",
              "Rasterkatalogets sidetal gentager et fil-ID.",
            );
          globalFileIds.add(file.id);
          files.push(file);
        }
        payload.pages.push({
          dataset: product.dataset,
          page,
          pagination: { ...parsed.pagination },
          queryUrl,
          responseSha256: raw.sha256,
          responseBytes: raw.bytes,
        });
        if (page >= parsed.pagination.totalPages) break;
      }
      if (files.length !== firstMetadata!.totalCount)
        throw new RasterInventoryError(
          "INCOMPLETE_INVENTORY",
          "Rasterkatalogets inventar er ufuldstændigt.",
        );
      fileCount += files.length;
      payload.products.push({
        register: product.register,
        dataset: product.dataset,
        modelVersion: 1,
        dataDeliveryNumber: pinnedDelivery ?? null,
        catalogueComplete: true,
        files: files.sort((a, b) => a.id.localeCompare(b.id)),
        nominalPixelSizeM: product.nominalPixelSizeM,
        nominalSizeIsNotRasterVerified: true,
        expectedHorizontalCrs: "EPSG:25832",
        expectedVerticalCrs: product.register === "dhm" ? "EPSG:5799" : null,
        licence: product.licence,
        licenceUrl: product.licenceUrl,
        attribution: product.attribution,
      });
    }
    source.payload = JSON.parse(JSON.stringify(payload)) as BaselineJson;
    source.payloadSha256 = await baselineSha256(source.payload);
    if (controller.signal.aborted || Date.now() - startedAt >= timeout)
      throw new RasterInventoryError("CATALOG_TIMEOUT", "Rasterkataloget overskred tidsgrænsen.");
    source.coverage.paginationComplete = true;
    source.coverage.returnedCount = fileCount;
    return source;
  } catch (error) {
    if (error instanceof RasterInventoryError) return failed(error);
    // Fetch errors can contain the private signed URL. Neither text nor cause escapes.
    return failed(
      new RasterInventoryError(
        controller.signal.aborted ? "CATALOG_TIMEOUT" : "CATALOG_FAILED",
        controller.signal.aborted
          ? "Rasterkataloget overskred tidsgrænsen."
          : "Rasterkataloget kunne ikke hentes eller valideres.",
      ),
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
