import { z } from "zod";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import type { BaselineJson, PublicBaselineSource } from "@/services/baseline/public-baseline-types";
import { buildRasterQueryProjection } from "@/services/baseline/raster-query-projection";
import {
  PUBLIC_MONITORING_STATIONS_SCHEMA,
  PUBLIC_MONITORING_STATIONS_ADAPTER,
  PUBLIC_MONITORING_STATIONS_PRODUCT,
  MONITORING_PAGE_COUNT,
  MAX_MONITORING_PAGES,
  MAX_MONITORING_CANDIDATES,
  MAX_MONITORING_PAGE_BYTES,
  MAX_MONITORING_TOTAL_BYTES,
  MAX_MONITORING_TIMEOUT_MS,
  PublicMonitoringStationsError,
  buildPublicMonitoringStationsUrl,
  parsePublicMonitoringStationsPage,
  type PublicMonitoringStationsInput,
  type PublicMonitoringStationsPayload,
  type PublicMonitoringSiteCandidate,
} from "./public-monitoring-stations-source";
export interface PublicMonitoringStationsOptions {
  fetchImpl?: typeof fetch;
  now?: () => string;
  /** Tests may shorten the single total deadline, never widen it. */
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
        new PublicMonitoringStationsError(
          "SOURCE_TIMEOUT",
          "Stationskilden overskred tidsgrænsen.",
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
    `${url.origin}${url.pathname}` !== PUBLIC_MONITORING_STATIONS_PRODUCT.endpoint ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.has("apiKey")
  )
    throw new PublicMonitoringStationsError("UNSAFE_QUERY", "Stationskildens adresse er ugyldig.");
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
      throw new PublicMonitoringStationsError(
        "SOURCE_HTTP_ERROR",
        "Stationskilden returnerede ikke gyldige offentlige JSON-data.",
      );
    }
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) ||
        Number(declared) > MAX_MONITORING_PAGE_BYTES ||
        byteBudget.used + Number(declared) > MAX_MONITORING_TOTAL_BYTES)
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new PublicMonitoringStationsError(
        "SOURCE_SIZE_LIMIT",
        "Stationskildens svar overskrider størrelsesgrænsen.",
      );
    }
    if (!response.body)
      throw new PublicMonitoringStationsError("SOURCE_EMPTY_BODY", "Stationskildens svar mangler.");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await abortable(reader.read(), controller.signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      byteBudget.used += chunk.value.byteLength;
      if (bytes > MAX_MONITORING_PAGE_BYTES || byteBudget.used > MAX_MONITORING_TOTAL_BYTES)
        throw new PublicMonitoringStationsError(
          "SOURCE_SIZE_LIMIT",
          "Stationskildens svar overskrider størrelsesgrænsen.",
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
      throw new PublicMonitoringStationsError(
        "INVALID_JSON",
        "Stationskilden returnerede ugyldig JSON.",
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

/** Caller must authorize the project and load its saved polygon before import/fetch. Saved reads never call this adapter. */
export async function fetchPublicMonitoringStationsSource(
  input: PublicMonitoringStationsInput,
  options: PublicMonitoringStationsOptions = {},
): Promise<PublicBaselineSource> {
  const startedAt = Date.now();
  if (!validDate(input.dateFrom) || !validDate(input.dateTo) || input.dateFrom > input.dateTo)
    throw new Error("Stationsinventaret kræver en gyldig undersøgelsesperiode.");
  const timeout = options.totalTimeoutMs ?? MAX_MONITORING_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_MONITORING_TIMEOUT_MS)
    throw new Error("Stationsinventarets tidsgrænse er ugyldig.");
  // Shared helper is a declared buffered catalogue envelope, never a catchment or survey calculation.
  const projection = buildRasterQueryProjection(input.polygon);
  const geometrySha256 = await baselineSha256(input.polygon);
  if (input.geometrySha256 !== undefined && input.geometrySha256 !== geometrySha256)
    throw new Error("Stationsinventarets område matcher ikke det gemte datagrundlag.");
  const fetchedAt = (options.now ?? (() => new Date().toISOString()))();
  if (!z.string().datetime({ offset: true }).safeParse(fetchedAt).success)
    throw new Error("Stationsinventarets hentetid er ugyldig.");
  const points = input.polygon.coordinates.flat();
  const source: PublicBaselineSource = {
    id: "public-monitoring-stations",
    provider: "Danmarks Miljøportal",
    dataset: PUBLIC_MONITORING_STATIONS_PRODUCT.title,
    datasetVersion: null,
    licence: PUBLIC_MONITORING_STATIONS_PRODUCT.licence,
    attribution: PUBLIC_MONITORING_STATIONS_PRODUCT.attribution,
    sourceUrl: "https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:steder-undersoegelser",
    sourceModifiedAt: null,
    fetchedAt,
    adapterVersion: PUBLIC_MONITORING_STATIONS_ADAPTER,
    mode: "live",
    status: "partial",
    query: {
      geometrySha256,
      bbox: [
        Math.min(...points.map((p) => p[0])),
        Math.min(...points.map((p) => p[1])),
        Math.max(...points.map((p) => p[0])),
        Math.max(...points.map((p) => p[1])),
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
      method: "bounded_native_wfs_site_inventory_only",
      warnings: [
        "Kun generelle offentlige VanDa-steder er modtaget. Et undersøgelsessted er ikke automatisk en hydrometrisk station.",
        "Kildelaget oplyser ikke stedets stations-/medietype. Ustrukturerede navne er udeladt; stationsnummer og UUID identificerer kun sted-kandidaten og verificerer ikke vandløb eller opland.",
        "Vandstand, vandføring og andre hydrometriske målinger er ikke hentet. Ingen måledækning, kvalitet eller højder er verificeret.",
        "Det bufferede bbox-inventar er ikke en godkendt delstrækning, en oplandsanalyse eller en opmåling. Der er ikke beregnet metrics, scorer eller juridisk presence.",
        "Forespørgselsperioden er bevaret, men aktuelle registreringer og sidernes tidspunkt dokumenterer ikke historisk måledækning i perioden.",
        "Siderne er ikke en transaktionssikker kildesnapshot. Antal-/ID-kontrol og sidehashes dokumenterer kun de modtagne svar.",
        "Den erklærede datum-/epochantagelse anvendes kun til katalogforespørgslen. Native EPSG:25832-punkter bevares; ingen højder transformeres.",
        "Et tomt modtaget sted-inventar betyder ikke manglende stationer i andre registre, ingen vandføring eller manglende hydrologisk relevans.",
      ],
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  const failed = (error: PublicMonitoringStationsError): PublicBaselineSource => ({
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
      new PublicMonitoringStationsError("SOURCE_TIMEOUT", "Stationskilden overskred tidsgrænsen."),
    );
  const timer = setTimeout(() => controller.abort(), remaining);
  const byteBudget = { used: 0 };
  try {
    const candidates: PublicMonitoringSiteCandidate[] = [];
    const pages: PublicMonitoringStationsPayload["pages"] = [];
    const siteIds = new Set<string>(),
      stationNumbers = new Set<string>();
    let matched: number | undefined, previousStation: string | undefined;
    for (let pageIndex = 0; ; pageIndex++) {
      if (pageIndex >= MAX_MONITORING_PAGES)
        throw new PublicMonitoringStationsError(
          "REQUEST_LIMIT",
          "Stationsinventaret overskrider sidegrænsen.",
        );
      const startIndex = pageIndex * MONITORING_PAGE_COUNT;
      const queryUrl = buildPublicMonitoringStationsUrl(projection.bbox, startIndex);
      const raw = await readPage(queryUrl, options.fetchImpl ?? fetch, controller, byteBudget);
      const parsed = parsePublicMonitoringStationsPage(raw.value, projection.bbox, startIndex);
      if (matched !== undefined && matched !== parsed.numberMatched)
        throw new PublicMonitoringStationsError(
          "PAGINATION_CHANGED",
          "Stationsinventarets antal ændrede sig mellem siderne.",
        );
      matched ??= parsed.numberMatched;
      if (matched > MAX_MONITORING_CANDIDATES)
        throw new PublicMonitoringStationsError(
          "CANDIDATE_LIMIT",
          "Stationsinventaret overskrider kandidatgrænsen.",
        );
      for (const candidate of parsed.candidates) {
        if (siteIds.has(candidate.siteUuid) || stationNumbers.has(candidate.stationNumber))
          throw new PublicMonitoringStationsError(
            "CONFLICTING_ID",
            "Stationsinventaret gentog et sted eller stationsnummer.",
          );
        if (previousStation !== undefined && previousStation >= candidate.stationNumber)
          throw new PublicMonitoringStationsError(
            "SORT_CHANGED",
            "Stationsinventarets sorteringsrækkefølge ændrede sig mellem siderne.",
          );
        previousStation = candidate.stationNumber;
        siteIds.add(candidate.siteUuid);
        stationNumbers.add(candidate.stationNumber);
        candidates.push(candidate);
      }
      pages.push({
        queryUrl,
        responseSha256: raw.sha256,
        responseBytes: raw.bytes,
        startIndex,
        requestedCount: MONITORING_PAGE_COUNT,
        sortKey: "Stationsnummer",
        numberMatched: parsed.numberMatched,
        numberReturned: parsed.numberReturned,
        totalFeatures: parsed.totalFeatures,
        serverTimestamp: parsed.serverTimestamp,
      });
      if (startIndex + parsed.numberReturned >= matched) break;
    }
    if (candidates.length !== matched)
      throw new PublicMonitoringStationsError(
        "INCOMPLETE_INVENTORY",
        "Stationsinventarets modtagne sider er ufuldstændige.",
      );
    const payload: PublicMonitoringStationsPayload = {
      schema: PUBLIC_MONITORING_STATIONS_SCHEMA,
      inventoryOnly: true,
      catalogueView: "current_received_registry",
      historicalRegistryCoverageVerified: false,
      measurementDataFetched: false,
      hydrometricStationCoverage: "not_verified",
      automaticWatercourseAssociationPerformed: false,
      automaticCatchmentAssociationPerformed: false,
      municipalReachMapped: false,
      legalAssessmentPerformed: false,
      metricsCalculated: false,
      upstreamTransactionalSnapshot: false,
      geometrySha256,
      requestedPeriod: { from: input.dateFrom, to: input.dateTo },
      queryProjection: projection,
      product: {
        ...PUBLIC_MONITORING_STATIONS_PRODUCT,
        versionBasis: "received_page_hashes",
        receivedInventoryComplete: true,
        pagingIsTransactionSafe: false,
        matchedCount: matched,
        candidates,
      },
      pages,
    };
    source.payload = JSON.parse(JSON.stringify(payload)) as BaselineJson;
    source.payloadSha256 = await baselineSha256(source.payload);
    if (controller.signal.aborted || Date.now() - startedAt >= timeout)
      throw new PublicMonitoringStationsError(
        "SOURCE_TIMEOUT",
        "Stationskilden overskred tidsgrænsen.",
      );
    source.coverage.paginationComplete = true;
    source.coverage.returnedCount = candidates.length;
    return source;
  } catch (error) {
    if (error instanceof PublicMonitoringStationsError) return failed(error);
    return failed(
      new PublicMonitoringStationsError(
        controller.signal.aborted ? "SOURCE_TIMEOUT" : "SOURCE_FAILED",
        controller.signal.aborted
          ? "Stationskilden overskred tidsgrænsen."
          : "Stationsinventaret kunne ikke hentes eller valideres.",
      ),
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
