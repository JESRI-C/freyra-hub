import { z } from "zod";
import { booleanIntersects, feature, polygon } from "@turf/turf";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import { validateProjectPolygon } from "@/services/geo-service";
import { baselineSha256, canonicalBaselineJson } from "./public-baseline-service";
import type { BaselineJson, PublicBaselineSource } from "./public-baseline-types";

/** Official current CDSE endpoint; the legacy catalogue endpoint is deprecated. */
export const SENTINEL_STAC_SEARCH = "https://stac.dataspace.copernicus.eu/v1/search";
export const SENTINEL_L2A_COLLECTION = "sentinel-2-l2a";
export const SENTINEL_STAC_DOCS = "https://documentation.dataspace.copernicus.eu/APIs/STAC.html";
const MAX_PAGES = 3;
const PAGE_SIZE = 50;
const MAX_SCENES = MAX_PAGES * PAGE_SIZE;
const MAX_PAGE_BYTES = 768 * 1024;
const MAX_PAYLOAD_BYTES = 768 * 1024;
const TOTAL_TIMEOUT_MS = 12_000;
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_SCENE_VERTICES = 500;

const Position = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const Ring = z.array(Position).min(4);
const PolygonCoordinates = z.array(Ring).min(1);
const Footprint = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: PolygonCoordinates }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(PolygonCoordinates).min(1) }),
]);
const Bbox = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const Properties = z.object({
  datetime: z.string().datetime({ offset: true }),
  platform: z.string().max(100).optional(),
  "eo:cloud_cover": z.number().finite().min(0).max(100).nullable().optional(),
  "product:type": z.string().max(100).optional(),
  "product:identifier": z.string().max(300).optional(),
  "s2:product_uri": z.string().max(300).optional(),
  "s2:product_id": z.string().max(300).optional(),
});
const ItemSchema = z.object({
  type: z.literal("Feature"),
  id: z.string().min(1).max(300),
  collection: z.literal(SENTINEL_L2A_COLLECTION),
  bbox: Bbox,
  geometry: Footprint,
  properties: Properties,
});
const LinkSchema = z.object({
  rel: z.string(),
  href: z.string().max(20_000),
  method: z.enum(["GET", "POST"]).optional(),
  body: z.record(z.string(), z.json()).optional(),
  merge: z.boolean().optional(),
});
const PageSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()).max(PAGE_SIZE),
  links: z.array(LinkSchema).max(100).default([]),
  numberMatched: z.number().int().nonnegative().optional(),
  context: z.object({ matched: z.number().int().nonnegative().optional() }).optional(),
});

export interface SentinelSceneCandidate {
  id: string;
  productId: string | null;
  productType: string | null;
  datetime: string;
  platform: string | null;
  bbox: [number, number, number, number];
  footprint: z.infer<typeof Footprint>;
  globalCloudCoverPct: number | null;
  sourceUrl: string;
  localQuality: { cloud: "pending"; shadow: "pending"; nodata: "pending"; usable: null };
}

export interface SentinelSceneInput {
  polygon: GeoJSONPolygon;
  dateFrom: string;
  dateTo: string;
  geometrySha256?: string;
}

export interface SentinelSceneOptions {
  fetchImpl?: typeof fetch;
  now?: () => string;
  clockMs?: () => number;
  /** Test hooks can reduce these limits, but cannot increase production bounds. */
  requestTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxPages?: number;
}

class CatalogError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
interface PageRequest {
  url: string;
  method: "GET" | "POST";
  body?: Record<string, BaselineJson>;
}

function dateStart(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ugyldig Sentinel-dato.");
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value)
    throw new Error("Ugyldig Sentinel-dato.");
  return timestamp;
}

function fixedNextRequest(
  link: z.infer<typeof LinkSchema>,
  canonical: Record<string, BaselineJson>,
  previous: PageRequest,
): PageRequest {
  const url = new URL(link.href, SENTINEL_STAC_SEARCH);
  if (
    url.origin !== new URL(SENTINEL_STAC_SEARCH).origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/v1/search"
  )
    throw new CatalogError(
      "UNSAFE_PAGINATION",
      "Katalogets næste side peger ikke på den tilladte søge-API.",
    );
  if (link.method === "POST") {
    const body = { ...(link.merge ? previous.body : {}), ...link.body, ...canonical };
    return { url: url.toString(), method: "POST", body };
  }
  // Preserve the server's opaque cursor, but bind every page to the original
  // collection, AOI and period. Never use upstream headers or arbitrary hosts.
  for (const [key, value] of Object.entries(canonical)) {
    if (key === "fields") continue;
    url.searchParams.set(
      key,
      typeof value === "string" || typeof value === "number"
        ? String(value)
        : JSON.stringify(value),
    );
  }
  url.searchParams.set("collections", SENTINEL_L2A_COLLECTION);
  const fields = canonical["fields"] as { include: string[] };
  url.searchParams.set("fields", fields.include.join(","));
  for (const key of ["bbox", "filter", "filter-lang", "query", "ids"]) url.searchParams.delete(key);
  return { url: url.toString(), method: "GET" };
}

/** Bound even a stalled response stream; aborting fetch alone is not enough for test doubles. */
function withAbort<T>(operation: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Catalog deadline exceeded", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    Promise.resolve(operation).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (failure: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(failure);
      },
    );
  });
}

async function readBoundedPage(
  request: PageRequest,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await withAbort(
      fetchImpl(request.url, {
        method: request.method,
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "application/geo+json, application/json",
          ...(request.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      }),
      controller.signal,
    );
    if (!response.ok)
      throw new CatalogError(
        `HTTP_${response.status}`,
        `Copernicus STAC svarede med HTTP ${response.status}.`,
      );
    const size = Number(response.headers.get("content-length"));
    if (Number.isFinite(size) && size > MAX_PAGE_BYTES)
      throw new CatalogError(
        "RESPONSE_TOO_LARGE",
        "STAC-svaret overskrider den tilladte størrelse.",
      );
    if (!response.body) throw new CatalogError("EMPTY_RESPONSE", "STAC returnerede et tomt svar.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (true) {
        const chunk = await withAbort(reader.read(), controller.signal);
        if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > MAX_PAGE_BYTES)
          throw new CatalogError(
            "RESPONSE_TOO_LARGE",
            "STAC-svaret overskrider den tilladte størrelse.",
          );
        chunks.push(chunk.value);
      }
    } finally {
      // Cancellation is best effort; a stalled upstream cancel callback must
      // not extend the collection deadline after the reader has been rejected.
      void reader.cancel().catch(() => undefined);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (failure) {
    if (controller.signal.aborted)
      throw new CatalogError("TIMEOUT", "Copernicus-kataloget nåede tidsgrænsen.");
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

function candidateFromItem(
  raw: unknown,
  aoi: GeoJSONPolygon,
  fromMs: number,
  toMs: number,
): SentinelSceneCandidate {
  const item = ItemSchema.parse(raw);
  const timestamp = Date.parse(item.properties.datetime);
  const coordinates =
    item.geometry.type === "Polygon" ? [item.geometry.coordinates] : item.geometry.coordinates;
  if (
    coordinates.flat(2).length > MAX_SCENE_VERTICES ||
    coordinates.some((rings) =>
      rings.some(
        (ring) =>
          ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1],
      ),
    )
  ) {
    throw new CatalogError(
      "INVALID_FOOTPRINT",
      "En scene har en ugyldig eller for omfattende footprintgeometri.",
    );
  }
  if (
    timestamp < fromMs ||
    timestamp >= toMs ||
    !booleanIntersects(polygon(aoi.coordinates), feature(item.geometry))
  ) {
    throw new CatalogError(
      "OUT_OF_SCOPE_ITEM",
      "Kataloget returnerede en scene uden for den valgte geometri eller periode.",
    );
  }
  const [west, south, east, north] = item.bbox;
  if (west > east || south > north || west < -180 || east > 180 || south < -90 || north > 90)
    throw new CatalogError("INVALID_BBOX", "En scene har en ugyldig geografisk afgrænsning.");
  return {
    id: item.id,
    productId:
      item.properties["product:identifier"] ??
      item.properties["s2:product_uri"] ??
      item.properties["s2:product_id"] ??
      null,
    productType: item.properties["product:type"] ?? null,
    datetime: new Date(timestamp).toISOString(),
    platform: item.properties.platform ?? null,
    bbox: item.bbox,
    footprint: item.geometry,
    globalCloudCoverPct: item.properties["eo:cloud_cover"] ?? null,
    sourceUrl: `https://stac.dataspace.copernicus.eu/v1/collections/${SENTINEL_L2A_COLLECTION}/items/${encodeURIComponent(item.id)}`,
    localQuality: { cloud: "pending", shadow: "pending", nodata: "pending", usable: null },
  };
}

/** Public metadata only. Candidate footprints are not local pixel coverage or NDVI. */
export async function fetchSentinelSceneSource(
  input: SentinelSceneInput,
  options: SentinelSceneOptions = {},
): Promise<PublicBaselineSource> {
  const validation = validateProjectPolygon(input.polygon);
  if (!validation.valid) throw new Error(`Ugyldig Sentinel-AOI: ${validation.error}`);
  const fromMs = dateStart(input.dateFrom);
  const toMs = dateStart(input.dateTo) + 86_400_000;
  if (fromMs >= toMs || toMs - fromMs > 366 * 86_400_000)
    throw new Error("Sentinel-perioden skal være højst 366 dage og i korrekt rækkefølge.");
  const geometrySha256 = await baselineSha256(validation.polygon);
  if (input.geometrySha256 && input.geometrySha256 !== geometrySha256)
    throw new Error("Sentinel-AOI matcher ikke den gemte geometriversion.");
  const positions = validation.polygon.coordinates.flat();
  const bbox: [number, number, number, number] = [
    Math.min(...positions.map((p) => p[0])),
    Math.min(...positions.map((p) => p[1])),
    Math.max(...positions.map((p) => p[0])),
    Math.max(...positions.map((p) => p[1])),
  ];
  const now = options.now ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? Date.now;
  const totalMs = Math.max(
    1,
    Math.min(TOTAL_TIMEOUT_MS, options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS),
  );
  const requestMs = Math.max(
    1,
    Math.min(REQUEST_TIMEOUT_MS, options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS),
  );
  const maxPages = Math.max(1, Math.min(MAX_PAGES, Math.floor(options.maxPages ?? MAX_PAGES)));
  const base: PublicBaselineSource = {
    id: "sentinel-2-scenes",
    mode: "live",
    status: "partial",
    provider: "Copernicus Data Space Ecosystem / ESA",
    dataset: "Sentinel-2 Level-2A — scenekatalog",
    datasetVersion: null,
    licence: "Copernicus Sentinel Data Legal Notice (collection licence: other)",
    attribution: "Contains modified Copernicus Sentinel data; ESA / European Commission",
    sourceUrl: SENTINEL_STAC_SEARCH,
    sourceModifiedAt: null,
    fetchedAt: now(),
    adapterVersion: "sentinel-2-l2a-catalog/v1",
    query: { geometrySha256, bbox, requestedFrom: input.dateFrom, requestedTo: input.dateTo },
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
      method: "sentinel-2-l2a-catalog/v1",
      warnings: [
        "Dette er et katalog over mulige scener. Lokale skyer, skygger, nodata og faktisk brugbar pixelopløsning er endnu ikke kontrolleret.",
        "Global scene-skydækning beskriver hele scenen og må ikke læses som lokal skydækning i projektet.",
        "Footprintoverlap dokumenterer en geografisk kandidat. Det er ikke en godkendt lokal måling eller NDVI.",
      ],
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  const canonical: Record<string, BaselineJson> = {
    collections: [SENTINEL_L2A_COLLECTION],
    intersects: z.json().parse(validation.polygon),
    datetime: `${input.dateFrom}T00:00:00Z/${input.dateTo}T23:59:59.999Z`,
    limit: PAGE_SIZE,
    fields: {
      include: [
        "id",
        "type",
        "collection",
        "geometry",
        "bbox",
        "properties.datetime",
        "properties.platform",
        "properties.eo:cloud_cover",
        "properties.product:type",
        "properties.product:identifier",
        "properties.s2:product_uri",
        "properties.s2:product_id",
        "links",
      ],
    },
  };
  let request: PageRequest | null = { url: SENTINEL_STAC_SEARCH, method: "POST", body: canonical };
  const deadline = clockMs() + totalMs;
  const seen = new Set<string>();
  const candidates = new Map<string, SentinelSceneCandidate>();
  const responseHashes: string[] = [];
  let pagesFetched = 0;
  let matched: number | null = null;
  try {
    while (request && pagesFetched < maxPages) {
      const fingerprint = `${request.method}:${request.url}:${canonicalBaselineJson(request.body ?? null)}`;
      if (seen.has(fingerprint))
        throw new CatalogError(
          "PAGINATION_LOOP",
          "Katalogets næste side gentager en allerede hentet side.",
        );
      seen.add(fingerprint);
      const remaining = deadline - clockMs();
      if (remaining <= 0)
        throw new CatalogError("TIMEOUT", "Copernicus-kataloget nåede den samlede tidsgrænse.");
      const raw = await readBoundedPage(
        request,
        options.fetchImpl ?? fetch,
        Math.min(requestMs, remaining),
      );
      const page = PageSchema.parse(raw);
      responseHashes.push(await baselineSha256(raw));
      pagesFetched += 1;
      matched = page.numberMatched ?? page.context?.matched ?? matched;
      for (const rawItem of page.features) {
        const candidate = candidateFromItem(rawItem, validation.polygon, fromMs, toMs);
        const previous = candidates.get(candidate.id);
        if (previous && canonicalBaselineJson(previous) !== canonicalBaselineJson(candidate))
          throw new CatalogError(
            "CONFLICTING_ITEM",
            "En scene-ID har modstridende metadata i kataloget.",
          );
        candidates.set(candidate.id, candidate);
        if (candidates.size > MAX_SCENES)
          throw new CatalogError(
            "TOO_MANY_ITEMS",
            "Scenekataloget overskrider det tilladte antal kandidater.",
          );
      }
      const next = page.links.filter((link) => link.rel === "next");
      if (next.length > 1)
        throw new CatalogError(
          "AMBIGUOUS_PAGINATION",
          "Kataloget returnerede flere forskellige næste sider.",
        );
      request = next[0] ? fixedNextRequest(next[0], canonical, request) : null;
    }
    const catalogComplete = request === null && (matched === null || matched <= candidates.size);
    if (!catalogComplete)
      base.quality.warnings.push(
        "Kataloget er kun delvist hentet. Flere scener kan findes i den valgte periode.",
      );
    const scenes = [...candidates.values()].sort(
      (a, b) => a.datetime.localeCompare(b.datetime) || a.id.localeCompare(b.id),
    );
    const payload = {
      schema: "gofreyra.sentinel-scene-catalog/v1",
      collection: SENTINEL_L2A_COLLECTION,
      scenes,
      pagesFetched,
      catalogComplete,
      localQualityStatus: "pending",
      responseHashes,
      documentationUrl: SENTINEL_STAC_DOCS,
      licenceUrl:
        "https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice",
    };
    if (new TextEncoder().encode(canonicalBaselineJson(payload)).byteLength > MAX_PAYLOAD_BYTES)
      throw new CatalogError(
        "PAYLOAD_TOO_LARGE",
        "Scenekataloget overskrider den tilladte snapshotstørrelse.",
      );
    return {
      ...base,
      status: scenes.length === 0 && catalogComplete ? "no_coverage" : "partial",
      fetchedAt: now(),
      coverage: {
        ...base.coverage,
        observedFrom: scenes[0]?.datetime ?? null,
        observedTo: scenes[scenes.length - 1]?.datetime ?? null,
        paginationComplete: catalogComplete,
        returnedCount: scenes.length,
      },
      payload: z.json().parse(payload),
      payloadSha256: await baselineSha256(payload),
    };
  } catch (failure) {
    const error =
      failure instanceof CatalogError
        ? failure
        : new CatalogError(
            "INVALID_OR_UNAVAILABLE_CATALOG",
            "Copernicus-kataloget kunne ikke hentes eller valideres.",
          );
    return {
      ...base,
      mode: "error",
      status: error.code === "TIMEOUT" ? "timeout" : "failed",
      fetchedAt: now(),
      payload: null,
      payloadSha256: null,
      error: { code: error.code, message: error.message },
    };
  }
}
