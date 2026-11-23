import { z } from "zod";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import type { BaselineJson, PublicBaselineSource } from "@/services/baseline/public-baseline-types";
import { buildRasterQueryProjection } from "@/services/baseline/raster-query-projection";
import {
  WATER_PLAN_NATURE_ADAPTER,
  WATER_PLAN_NATURE_SCHEMA,
  WATER_PLAN_NATURE_PRODUCTS,
  MAX_NATURE_REQUESTS,
  MAX_NATURE_PAGES_PER_PRODUCT,
  NATURE_PAGE_COUNT,
  MAX_NATURE_FEATURES,
  MAX_NATURE_PAGE_BYTES,
  MAX_NATURE_TOTAL_BYTES,
  MAX_NATURE_TIMEOUT_MS,
  MAX_NATURE_GEOMETRY_POSITIONS,
  WaterPlanNatureError,
  buildWaterPlanNatureUrl,
  parseWaterPlanNaturePage,
  type WaterPlanNatureInput,
  type WaterPlanNaturePayload,
  type WaterPlanNatureCandidate,
} from "./water-plan-nature-source";

export interface WaterPlanNatureOptions {
  fetchImpl?: typeof fetch;
  now?: () => string;
  /** Tests may shorten the total deadline, never widen the production bound. */
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
      reject(
        new WaterPlanNatureError(
          "SOURCE_TIMEOUT",
          "Natur- og vandplankilden overskred tidsgrænsen.",
        ),
      );
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
  queryUrl: string,
  fetchImpl: typeof fetch,
  controller: AbortController,
  byteBudget: { used: number },
): Promise<{ value: unknown; bytes: number; sha256: string }> {
  const url = new URL(queryUrl);
  if (
    !WATER_PLAN_NATURE_PRODUCTS.some(
      (product) => `${url.origin}${url.pathname}` === product.endpoint,
    ) ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.has("apiKey")
  )
    throw new WaterPlanNatureError("UNSAFE_QUERY", "Natur- og vandplankildens adresse er ugyldig.");
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let completed = false;
  try {
    const fetching = fetchImpl(queryUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
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
    if (
      !response.ok ||
      response.redirected ||
      !/^application\/json\b/i.test(response.headers.get("content-type") ?? "")
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new WaterPlanNatureError(
        "SOURCE_HTTP_ERROR",
        "Natur- og vandplankilden returnerede ikke gyldige offentlige JSON-data.",
      );
    }
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) ||
        Number(declared) > MAX_NATURE_PAGE_BYTES ||
        byteBudget.used + Number(declared) > MAX_NATURE_TOTAL_BYTES)
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new WaterPlanNatureError(
        "SOURCE_SIZE_LIMIT",
        "Natur- og vandplankildens svar overskrider størrelsesgrænsen.",
      );
    }
    if (!response.body)
      throw new WaterPlanNatureError(
        "SOURCE_EMPTY_BODY",
        "Natur- og vandplankildens svar mangler.",
      );
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await abortable(reader.read(), controller.signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      byteBudget.used += chunk.value.byteLength;
      if (bytes > MAX_NATURE_PAGE_BYTES || byteBudget.used > MAX_NATURE_TOTAL_BYTES)
        throw new WaterPlanNatureError(
          "SOURCE_SIZE_LIMIT",
          "Natur- og vandplankildens svar overskrider størrelsesgrænsen.",
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
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new WaterPlanNatureError(
        "INVALID_JSON",
        "Natur- og vandplankilden returnerede ugyldig JSON.",
      );
    }
    const digest = await crypto.subtle.digest("SHA-256", body);
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    completed = true;
    return { value, bytes, sha256 };
  } finally {
    if (reader && !completed) void reader.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}
function identity(candidate: WaterPlanNatureCandidate): string {
  return candidate.kind === "vp3-watercourses" ? candidate.waterbodyId : candidate.objectId;
}

/** Invoke only after project authorization and canonical saved AOI loading. Never fetch on saved-baseline reads. */
export async function fetchWaterPlanNatureSource(
  input: WaterPlanNatureInput,
  options: WaterPlanNatureOptions = {},
): Promise<PublicBaselineSource> {
  const startedAt = Date.now();
  if (!validDate(input.dateFrom) || !validDate(input.dateTo) || input.dateFrom > input.dateTo)
    throw new Error("Natur- og vandplankilden kræver en gyldig undersøgelsesperiode.");
  const timeout = options.totalTimeoutMs ?? MAX_NATURE_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_NATURE_TIMEOUT_MS)
    throw new Error("Natur- og vandplankildens tidsgrænse er ugyldig.");
  // The shared helper creates a buffered metadata-query envelope only, not a raster or survey analysis.
  const projection = buildRasterQueryProjection(input.polygon);
  const geometrySha256 = await baselineSha256(input.polygon);
  if (input.geometrySha256 !== undefined && input.geometrySha256 !== geometrySha256)
    throw new Error("Natur- og vandplankildens område matcher ikke det gemte datagrundlag.");
  const fetchedAt = (options.now ?? (() => new Date().toISOString()))();
  if (!z.string().datetime({ offset: true }).safeParse(fetchedAt).success)
    throw new Error("Natur- og vandplankildens hentetid er ugyldig.");
  const longitudes = input.polygon.coordinates.flat().map((point) => point[0]);
  const latitudes = input.polygon.coordinates.flat().map((point) => point[1]);
  const source: PublicBaselineSource = {
    id: "water-plan-nature",
    provider: "Danmarks Miljøportal / Kommunerne / SGAV",
    dataset: "Naturregistreringer og VP3G-vandløbsafgrænsning, miljømål og tilstand",
    datasetVersion: null,
    licence: "CC0 1.0 (natur); CC BY 4.0 (VP3G)",
    attribution:
      "Danmarks Miljøportal / Kommunerne; Styrelsen for Grøn Arealomlægning og Vandmiljø (SGAV)",
    sourceUrl: "https://datakatalog.miljoeportal.dk/api/swagger/index.html",
    sourceModifiedAt: null,
    fetchedAt,
    adapterVersion: WATER_PLAN_NATURE_ADAPTER,
    mode: "live",
    status: "partial",
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
      method: "bounded_native_wfs_received_inventory_only",
      warnings: [
        "Kun modtagne registreringer og vandplanoplysninger er gemt. Der er ikke foretaget faglig eller juridisk godkendelse.",
        "Bbox-kandidater er ikke en godkendt kommunal delstrækning eller en beregnet polygonoverlapning.",
        "Siderne er ikke en transaktionssikker kildesnapshot. Antal og ID-kontrol kan ikke udelukke ændringer i kildens øvrige indhold mellem hentninger.",
        "Registrerings-, system-, plan- og hentetid er ikke måletid i undersøgelsesperioden. Manglende data betyder ikke ubeskyttet natur eller god tilstand.",
        "Miljømål, økologisk tilstand og kemisk tilstand er bevaret hver for sig. Ingen arealer, længder, scorer eller indsatsprioriteter er beregnet.",
        "Det bufferede forespørgselsområde anvender den erklærede datum-/epochantagelse. Native EPSG:25832-geometri bevares; ingen opmålingsnøjagtighed eller højder er verificeret.",
      ],
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  const failed = (error: WaterPlanNatureError): PublicBaselineSource => ({
    ...source,
    mode: "error",
    status: error.code === "SOURCE_TIMEOUT" ? "timeout" : "failed",
    payload: null,
    payloadSha256: null,
    coverage: { ...source.coverage, paginationComplete: false, returnedCount: null },
    error: { code: error.code, message: error.message },
  });
  const controller = new AbortController();
  const remaining = timeout - (Date.now() - startedAt);
  if (remaining <= 0)
    return failed(
      new WaterPlanNatureError("SOURCE_TIMEOUT", "Natur- og vandplankilden overskred tidsgrænsen."),
    );
  const timer = setTimeout(() => controller.abort(), remaining);
  const byteBudget = { used: 0 };
  let requestCount = 0,
    receivedCount = 0,
    receivedPositions = 0;
  try {
    const payload: WaterPlanNaturePayload = {
      schema: WATER_PLAN_NATURE_SCHEMA,
      wfsVersion: "2.0.0",
      inventoryOnly: true,
      legalAssessmentPerformed: false,
      metricsCalculated: false,
      municipalReachMapped: false,
      upstreamTransactionalSnapshot: false,
      queryProjection: projection,
      geometrySha256,
      requestedPeriod: { from: input.dateFrom, to: input.dateTo },
      products: [],
      pages: [],
    };
    const globalIds = new Set<string>();
    for (const product of WATER_PLAN_NATURE_PRODUCTS) {
      // No data request may retrieve beyond the remaining global feature budget.
      const count = Math.min(NATURE_PAGE_COUNT, MAX_NATURE_FEATURES - receivedCount);
      if (count < 1)
        throw new WaterPlanNatureError(
          "FEATURE_LIMIT",
          "Natur- og vandplankildens samlede inventargrænse er opbrugt.",
        );
      const candidates: WaterPlanNatureCandidate[] = [];
      const objects = new Set<string>();
      let firstMatched: number | undefined;
      let previousSortValue: string | undefined;
      for (let pageIndex = 0; ; pageIndex++) {
        if (pageIndex >= MAX_NATURE_PAGES_PER_PRODUCT || ++requestCount > MAX_NATURE_REQUESTS)
          throw new WaterPlanNatureError(
            "REQUEST_LIMIT",
            "Natur- og vandplankilden overskrider forespørgselsgrænsen.",
          );
        const startIndex = pageIndex * count;
        const queryUrl = buildWaterPlanNatureUrl(product.id, projection.bbox, startIndex, count);
        const raw = await readPage(queryUrl, options.fetchImpl ?? fetch, controller, byteBudget);
        const parsed = parseWaterPlanNaturePage(
          raw.value,
          product.id,
          projection.bbox,
          startIndex,
          count,
          MAX_NATURE_GEOMETRY_POSITIONS - receivedPositions,
        );
        if (firstMatched !== undefined && firstMatched !== parsed.numberMatched)
          throw new WaterPlanNatureError(
            "PAGINATION_CHANGED",
            "Natur- og vandplankildens antal ændrede sig mellem siderne.",
          );
        firstMatched ??= parsed.numberMatched;
        if (receivedCount + firstMatched > MAX_NATURE_FEATURES)
          throw new WaterPlanNatureError(
            "FEATURE_LIMIT",
            "Natur- og vandplankilden overskrider den samlede inventargrænse.",
          );
        receivedPositions += parsed.positionCount;
        for (const candidate of parsed.candidates) {
          const objectId = identity(candidate);
          if (globalIds.has(candidate.featureId) || objects.has(objectId))
            throw new WaterPlanNatureError(
              "CONFLICTING_ID",
              "Natur- og vandplankilden gentog et objekt eller en version.",
            );
          if (previousSortValue !== undefined && previousSortValue >= objectId)
            throw new WaterPlanNatureError(
              "SORT_CHANGED",
              "Natur- og vandplankildens sorteringsrækkefølge er inkonsistent.",
            );
          previousSortValue = objectId;
          objects.add(objectId);
          globalIds.add(candidate.featureId);
          candidates.push(candidate);
        }
        payload.pages.push({
          productId: product.id,
          queryUrl,
          responseSha256: raw.sha256,
          responseBytes: raw.bytes,
          startIndex,
          requestedCount: count,
          sortKey: product.sortKey,
          numberMatched: parsed.numberMatched,
          numberReturned: parsed.numberReturned,
          totalFeatures: parsed.totalFeatures,
          serverTimestamp: parsed.serverTimestamp,
        });
        if (startIndex + parsed.numberReturned >= parsed.numberMatched) break;
      }
      if (candidates.length !== firstMatched)
        throw new WaterPlanNatureError(
          "INCOMPLETE_INVENTORY",
          "Natur- og vandplankildens modtagne inventar er ufuldstændigt.",
        );
      receivedCount += candidates.length;
      payload.products.push({
        id: product.id,
        layer: product.layer,
        endpoint: product.endpoint,
        geometryName: product.geometryName,
        sortKey: product.sortKey,
        datasetVersion: product.datasetVersion,
        versionBasis:
          product.id === "vp3-watercourses"
            ? "published_plan_release"
            : "per_feature_registration_version",
        planPublishedDate: product.id === "vp3-watercourses" ? "2025-12-18" : null,
        planEffectiveFrom: product.id === "vp3-watercourses" ? "2026-01-01" : null,
        licence: product.licence,
        licenceUrl: product.licenceUrl,
        attribution: product.attribution,
        catalogueIds: product.catalogueIds,
        receivedInventoryComplete: true,
        pagingIsTransactionSafe: false,
        matchedCount: firstMatched,
        candidates,
      });
    }
    source.payload = JSON.parse(JSON.stringify(payload)) as BaselineJson;
    source.payloadSha256 = await baselineSha256(source.payload);
    if (controller.signal.aborted || Date.now() - startedAt >= timeout)
      throw new WaterPlanNatureError(
        "SOURCE_TIMEOUT",
        "Natur- og vandplankilden overskred tidsgrænsen.",
      );
    source.coverage.paginationComplete = true;
    source.coverage.returnedCount = receivedCount;
    return source;
  } catch (error) {
    if (error instanceof WaterPlanNatureError) return failed(error);
    return failed(
      new WaterPlanNatureError(
        controller.signal.aborted ? "SOURCE_TIMEOUT" : "SOURCE_FAILED",
        controller.signal.aborted
          ? "Natur- og vandplankilden overskred tidsgrænsen."
          : "Natur- og vandplankilden kunne ikke hentes eller valideres.",
      ),
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
