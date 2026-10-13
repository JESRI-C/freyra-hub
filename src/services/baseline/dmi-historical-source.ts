import { z } from "zod";
import { booleanPointInPolygon, point, polygon as turfPolygon } from "@turf/turf";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { BaselineJson, PublicBaselineSource } from "./public-baseline-types";

export const DMI_CLIMATE_BASE = "https://opendataapi.dmi.dk/v2/climateData/collections";
export const DMI_CLIMATE_DOCS = "https://www.dmi.dk/friedata/dokumentation/apis/climate-data-api-1";
export const DMI_PARAMETER_DOCS = "https://www.dmi.dk/friedata/dokumentation/climate-data";
const VERSION = "dmi-historical-station-precip/v1";
const MAX_PAGES = 3;
const PAGE_SIZE = 200;
const MAX_PAGE_BYTES = 768 * 1024;
const TOTAL_TIMEOUT_MS = 12_000;
const REQUEST_TIMEOUT_MS = 5_000;
const DAY_MS = 86_400_000;
type Bbox = [number, number, number, number];

export interface DmiHistoricalInput {
  polygon?: GeoJSONPolygon;
  /** Optional explicit source-search bbox; its stations are context, not catchment matches. */
  bbox?: Bbox;
  dateFrom: string;
  dateTo: string;
  geometrySha256?: string;
}
export interface DmiHistoricalOptions {
  fetchImpl?: typeof fetch;
  now?: () => string;
  requestTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxPages?: number;
}
export interface DmiDailyPrecipitation {
  id: string;
  stationId: string;
  coordinates: [number, number];
  parameterId: "acc_precip";
  timeResolution: "day";
  from: string;
  to: string;
  value: number;
  unit: "mm";
  valueKind: "amount" | "trace" | "invalid_negative";
  qcStatus: string;
  validity: boolean | null;
  created: string;
  calculatedAt: string | null;
  noValuesInCalculation: number | null;
}

const Timestamp = z.string().datetime({ offset: true });
const Coordinates = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const PointGeometry = z.object({ type: z.literal("Point"), coordinates: Coordinates });
const Station = z.object({
  id: z.string().min(1),
  geometry: PointGeometry,
  properties: z.object({
    stationId: z.string().min(1).max(30),
    name: z.string().min(1).max(200),
    parameterId: z.array(z.string()).max(200),
    country: z.string().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
    validFrom: Timestamp.optional(),
    validTo: Timestamp.nullable().optional(),
    operationFrom: Timestamp.optional(),
    operationTo: Timestamp.nullable().optional(),
    updated: Timestamp.nullable().optional(),
  }),
});
const DailyValue = z.object({
  id: z.string().min(1),
  geometry: PointGeometry,
  properties: z.object({
    stationId: z.string().min(1),
    parameterId: z.literal("acc_precip"),
    timeResolution: z.literal("day"),
    from: Timestamp,
    to: Timestamp,
    value: z.number().finite(),
    created: Timestamp,
    calculatedAt: Timestamp.nullable().optional(),
    qcStatus: z.string().min(1),
    validity: z.boolean().nullable().optional(),
    unit: z.literal("mm").optional(),
    noValuesInCalculation: z.number().int().nonnegative().nullable().optional(),
  }),
});
const Page = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()).max(PAGE_SIZE),
  links: z
    .array(z.object({ rel: z.string(), href: z.string().max(4000) }))
    .max(100)
    .default([]),
});
class SourceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function isoTime(value: string, end: boolean): number {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const text = dateOnly ? `${value}T00:00:00Z` : value;
  Timestamp.parse(text);
  const time = Date.parse(text);
  if (dateOnly && new Date(time).toISOString().slice(0, 10) !== value)
    throw new Error("Ugyldig DMI-dato.");
  return time + (dateOnly && end ? DAY_MS : 0);
}
function boundingBox(geometry: GeoJSONPolygon): Bbox {
  if (geometry.type !== "Polygon" || !geometry.coordinates.length)
    throw new Error("DMI kræver en polygon.");
  const positions = geometry.coordinates.flat().map((position) => Coordinates.parse(position));
  if (positions.length < 4) throw new Error("DMI kræver en gyldig polygon.");
  return [
    Math.min(...positions.map((p) => p[0])),
    Math.min(...positions.map((p) => p[1])),
    Math.max(...positions.map((p) => p[0])),
    Math.max(...positions.map((p) => p[1])),
  ];
}
function parseBbox(value: Bbox): Bbox {
  const [west, south, east, north] = value;
  Coordinates.parse([west, south]);
  Coordinates.parse([east, north]);
  if (west >= east || south >= north) throw new Error("Ugyldig DMI-bbox.");
  return value;
}
function canonical(value: unknown): string {
  if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
    throw new SourceError("INVALID_RESPONSE", "DMI-svaret indeholder ugyldige JSON-værdier.");
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}
async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function distanceKm(a: [number, number], b: [number, number]): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dlat = radians(b[1] - a[1]),
    dlng = radians(b[0] - a[0]);
  const value =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}
function withAbort<T>(operation: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("DMI request timed out", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    Promise.resolve(operation).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > MAX_PAGE_BYTES)
    throw new SourceError("RESPONSE_TOO_LARGE", "DMI-svaret overskrider størrelsesgrænsen.");
  if (!response.body)
    throw new SourceError("INVALID_RESPONSE", "DMI returnerede intet svarindhold.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await withAbort(reader.read(), signal);
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_PAGE_BYTES)
        throw new SourceError("RESPONSE_TOO_LARGE", "DMI-svaret overskrider størrelsesgrænsen.");
      chunks.push(chunk.value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** Official daily intervals retain their actual bounds; missing/trace/unchecked data is never summed as zero. */
export function summarizeDmiDailySeries(
  series: DmiDailyPrecipitation[],
  from: string,
  to: string,
  paginationComplete: boolean,
) {
  const start = Date.parse(from),
    end = Date.parse(to);
  const ordered = [...series].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  const reasons: string[] = [];
  if (!paginationComplete) reasons.push("pagination_incomplete");
  if (!ordered.length) reasons.push("no_daily_values");
  for (const [index, row] of ordered.entries()) {
    if (row.valueKind !== "amount") reasons.push(row.valueKind);
    if (row.validity === false) reasons.push("invalid_value");
    if (row.validity === null) reasons.push("validity_unknown");
    if (row.qcStatus !== "manual") reasons.push("quality_control_incomplete");
    const duration = Date.parse(row.to) - Date.parse(row.from);
    if (duration < 23 * 3_600_000 - 1000 || duration > 25 * 3_600_000)
      reasons.push("incomplete_daily_interval");
    if (
      row.noValuesInCalculation !== null &&
      row.noValuesInCalculation < Math.round(duration / 3_600_000)
    )
      reasons.push("incomplete_daily_inputs");
    if (index) {
      const gap = Date.parse(row.from) - Date.parse(ordered[index - 1].to);
      if (gap < 0 || gap > 1000) reasons.push("gap_or_overlap");
      if (row.stationId !== ordered[index - 1].stationId) reasons.push("mixed_stations");
    }
  }
  const first = ordered[0],
    last = ordered.at(-1);
  const exactPeriod =
    !!first &&
    !!last &&
    Date.parse(first.from) === start &&
    Math.abs(Date.parse(last.to) - end) <= 1000;
  if (!exactPeriod) reasons.push("requested_period_not_exact_daily_boundaries");
  return {
    unit: "mm" as const,
    requestedFrom: from,
    requestedTo: to,
    coveredFrom: first?.from ?? null,
    coveredTo: last?.to ?? null,
    dailyValueCount: ordered.length,
    complete: reasons.length === 0,
    totalMm: reasons.length === 0 ? ordered.reduce((sum, row) => sum + row.value, 0) : null,
    reasons: [...new Set(reasons)],
    method:
      "Sum of complete contiguous manually controlled DMI daily acc_precip intervals; no gap filling or prorating.",
  };
}

export async function fetchDmiHistoricalSource(
  input: DmiHistoricalInput,
  options: DmiHistoricalOptions = {},
): Promise<PublicBaselineSource> {
  const fromMs = isoTime(input.dateFrom, false),
    toMs = isoTime(input.dateTo, true);
  if (toMs <= fromMs || toMs - fromMs > 366 * DAY_MS)
    throw new Error("DMI-perioden skal være positiv og højst 366 døgn.");
  const bbox = parseBbox(input.polygon ? boundingBox(input.polygon) : input.bbox!);
  const geometrySha256 = await hash(input.polygon ?? bbox);
  if (input.geometrySha256 && input.geometrySha256 !== geometrySha256)
    throw new Error("DMI-geometriens hash matcher ikke forespørgslen.");
  const requestedFrom = new Date(fromMs).toISOString(),
    requestedTo = new Date(toMs).toISOString();
  const fetchedAt = (options.now ?? (() => new Date().toISOString()))();
  const warnings = [
    "Stationsnedbør er kontekst; stationens forbindelse til projektets opland er ikke vurderet.",
    "DMI climateData er officielle afledte/kvalitetskontrollerede værdier og kan indeholde DMI-interpolation; de er ikke en lokal vandføringsmåling.",
    "Daglige intervaller kan følge lokal eller meteorologisk dag. Vilkårlige flyvetidspunkter giver ikke automatisk en fuld 1/7/30-døgnssum.",
  ];
  const source: PublicBaselineSource = {
    id: "dmi-historical",
    mode: "live",
    status: "no_coverage",
    provider: "DMI",
    dataset: "climateData/stationValue acc_precip day",
    datasetVersion: null,
    licence: "CC BY 4.0",
    attribution: "DMI — officielle climateData; afledte summer beregnet af GoFreyra.",
    sourceUrl: `${DMI_CLIMATE_BASE}/stationValue/items`,
    sourceModifiedAt: null,
    fetchedAt,
    adapterVersion: VERSION,
    query: {
      geometrySha256,
      bbox,
      requestedFrom: requestedFrom.slice(0, 10),
      requestedTo: input.dateTo.slice(0, 10),
    },
    coverage: {
      spatial: "unknown",
      temporal: "none",
      observedFrom: null,
      observedTo: null,
      paginationComplete: false,
      returnedCount: 0,
    },
    quality: {
      evidenceKind: "calculation",
      method:
        "Official DMI daily station precipitation, nearest eligible station in bounded search; catchment relevance pending.",
      warnings,
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  const totalController = new AbortController();
  const totalTimer = setTimeout(
    () => totalController.abort(),
    Math.min(options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS, TOTAL_TIMEOUT_MS),
  );
  const requestTimeout = Math.min(
    options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    REQUEST_TIMEOUT_MS,
  );
  const maxPages = Math.max(1, Math.min(options.maxPages ?? MAX_PAGES, MAX_PAGES));
  const fetchImpl = options.fetchImpl ?? fetch;
  const queries: Array<{ url: string; sha256: string }> = [];
  async function collection(name: "station" | "stationValue", params: Record<string, string>) {
    let offset = 0,
      complete = false;
    const features: unknown[] = [];
    for (let index = 0; index < maxPages; index++) {
      const url = `${DMI_CLIMATE_BASE}/${name}/items?${new URLSearchParams({ ...params, limit: String(PAGE_SIZE), offset: String(offset) })}`;
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), requestTimeout);
      const totalAbort = () => controller.abort();
      totalController.signal.addEventListener("abort", totalAbort, { once: true });
      if (totalController.signal.aborted) controller.abort();
      try {
        const response = await withAbort(
          fetchImpl(url, { signal: controller.signal, redirect: "manual" }),
          controller.signal,
        );
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          throw new SourceError(`HTTP_${response.status}`, `DMI svarede HTTP ${response.status}.`);
        }
        const responseJson = await readJson(response, controller.signal);
        const page = Page.parse(responseJson);
        queries.push({ url, sha256: await hash(responseJson) });
        features.push(...page.features);
        const next = page.links.find((link) => link.rel === "next");
        if (!next || page.features.length === 0) {
          complete = true;
          break;
        }
        const nextUrl = new URL(next.href, url);
        if (
          nextUrl.origin !== "https://opendataapi.dmi.dk" ||
          nextUrl.pathname !== `/v2/climateData/collections/${name}/items` ||
          nextUrl.username ||
          nextUrl.password ||
          nextUrl.hash
        )
          throw new SourceError(
            "UNSAFE_PAGINATION",
            "DMI's næste side har en ugyldig kildeadresse.",
          );
        const nextOffset = Number(nextUrl.searchParams.get("offset"));
        if (
          !Number.isSafeInteger(nextOffset) ||
          nextOffset <= offset ||
          nextOffset > MAX_PAGES * PAGE_SIZE
        )
          throw new SourceError("INVALID_PAGINATION", "DMI's sideangivelse er ugyldig.");
        offset = nextOffset;
      } finally {
        clearTimeout(timer);
        totalController.signal.removeEventListener("abort", totalAbort);
      }
    }
    return { features, complete };
  }
  try {
    const searchBbox = parseBbox(
      input.bbox ?? [
        Math.max(-180, bbox[0] - 0.25),
        Math.max(-90, bbox[1] - 0.25),
        Math.min(180, bbox[2] + 0.25),
        Math.min(90, bbox[3] + 0.25),
      ],
    );
    const midpoint: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    const stations = await collection("station", {
      bbox: searchBbox.join(","),
      datetime: `${requestedFrom}/${requestedTo}`,
    });
    const candidates = stations.features
      .map((feature) => Station.parse(feature))
      .filter((station) => {
        const p = station.properties,
          c = station.geometry.coordinates;
        return (
          p.parameterId.includes("acc_precip") &&
          c[0] >= searchBbox[0] &&
          c[0] <= searchBbox[2] &&
          c[1] >= searchBbox[1] &&
          c[1] <= searchBbox[3] &&
          (!p.validFrom || Date.parse(p.validFrom) < toMs) &&
          (!p.validTo || Date.parse(p.validTo) >= fromMs)
        );
      })
      .sort(
        (a, b) =>
          distanceKm(midpoint, a.geometry.coordinates) -
            distanceKm(midpoint, b.geometry.coordinates) ||
          a.properties.stationId.localeCompare(b.properties.stationId),
      );
    if (!stations.complete)
      warnings.push(
        "Stationslisten er afgrænset af sidegrænsen; den nærmeste station er kun valgt blandt de modtagne kandidater.",
      );
    const selected = candidates[0];
    if (!selected) {
      source.coverage.paginationComplete = stations.complete;
      source.status = stations.complete ? "no_coverage" : "partial";
      source.payload = {
        searchBbox,
        queries,
        candidateCount: 0,
        reason: "No eligible precipitation station in the bounded search area.",
      };
    } else {
      const values = await collection("stationValue", {
        stationId: selected.properties.stationId,
        parameterId: "acc_precip",
        timeResolution: "day",
        datetime: `${requestedFrom}/${requestedTo}`,
      });
      const latest = new Map<string, DmiDailyPrecipitation>();
      for (const feature of values.features) {
        const value = DailyValue.parse(feature),
          p = value.properties;
        if (p.stationId !== selected.properties.stationId)
          throw new SourceError("STATION_MISMATCH", "DMI returnerede data fra en anden station.");
        if (Date.parse(p.to) <= Date.parse(p.from))
          throw new SourceError("INVALID_INTERVAL", "DMI returnerede et ugyldigt døgninterval.");
        if (Date.parse(p.to) <= fromMs || Date.parse(p.from) >= toMs) continue;
        const row: DmiDailyPrecipitation = {
          id: value.id,
          stationId: p.stationId,
          coordinates: value.geometry.coordinates,
          parameterId: p.parameterId,
          timeResolution: p.timeResolution,
          from: p.from,
          to: p.to,
          value: p.value,
          unit: "mm",
          valueKind: p.value === -0.1 ? "trace" : p.value < 0 ? "invalid_negative" : "amount",
          qcStatus: p.qcStatus,
          validity: p.validity ?? null,
          created: p.created,
          calculatedAt: p.calculatedAt ?? null,
          noValuesInCalculation: p.noValuesInCalculation ?? null,
        };
        const key = `${Date.parse(p.from)}:${Date.parse(p.to)}`,
          old = latest.get(key);
        if (!old || Date.parse(row.created) > Date.parse(old.created)) latest.set(key, row);
        else if (
          Date.parse(row.created) === Date.parse(old.created) &&
          canonical(row) !== canonical(old)
        )
          throw new SourceError(
            "CONFLICTING_DUPLICATE",
            "DMI returnerede modstridende versioner af samme døgn.",
          );
      }
      const series = [...latest.values()].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
      const paginationComplete = stations.complete && values.complete;
      if (!values.complete)
        warnings.push("Nedbørsseriens pagination er ikke komplet; ingen fuld periodesum frigives.");
      const summary = summarizeDmiDailySeries(
        series,
        requestedFrom,
        requestedTo,
        paginationComplete,
      );
      const withinProject = input.polygon
        ? booleanPointInPolygon(
            point(selected.geometry.coordinates),
            turfPolygon(input.polygon.coordinates),
          )
        : null;
      const coordinatesChanged = series.some((row) =>
        row.coordinates.some(
          (coordinate, index) =>
            Math.abs(coordinate - selected.geometry.coordinates[index]) > 0.00001,
        ),
      );
      if (coordinatesChanged)
        warnings.push(
          "Stationens observationer har andre koordinater end det valgte stationsregister; geografisk repræsentativitet skal kontrolleres.",
        );
      if (!withinProject)
        warnings.push(
          "Den valgte station ligger uden for projektpolygonen eller projektpolygonen er ikke angivet.",
        );
      source.status = series.length ? "partial" : paginationComplete ? "no_coverage" : "partial";
      source.coverage = {
        spatial: "partial",
        temporal: summary.complete ? "complete" : series.length ? "partial" : "none",
        observedFrom: summary.coveredFrom,
        observedTo: summary.coveredTo,
        paginationComplete,
        returnedCount: series.length,
      };
      source.sourceModifiedAt = series.length
        ? series.reduce(
            (latestTime, row) =>
              Date.parse(row.created) > Date.parse(latestTime) ? row.created : latestTime,
            series[0].created,
          )
        : null;
      source.payload = {
        requestedInterval: { from: requestedFrom, to: requestedTo },
        searchBbox,
        station: {
          id: selected.properties.stationId,
          name: selected.properties.name,
          coordinates: selected.geometry.coordinates,
          country: selected.properties.country ?? null,
          status: selected.properties.status ?? null,
          validFrom: selected.properties.validFrom ?? null,
          validTo: selected.properties.validTo ?? null,
          distanceToProjectCenterKm: distanceKm(midpoint, selected.geometry.coordinates),
          withinProject,
          catchmentRelevance: "not_assessed",
        },
        unit: "mm",
        unitSource: DMI_PARAMETER_DOCS,
        candidateCount: candidates.length,
        series: series as unknown as BaselineJson,
        summary,
        queries,
      };
    }
    source.payloadSha256 = await hash(source.payload);
    return source;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ...source,
      mode: "error",
      status: timedOut ? "timeout" : "failed",
      coverage: {
        spatial: "unknown",
        temporal: "unknown",
        observedFrom: null,
        observedTo: null,
        paginationComplete: false,
        returnedCount: null,
      },
      payload: null,
      payloadSha256: null,
      error: {
        code: timedOut
          ? "TIMEOUT"
          : error instanceof SourceError
            ? error.code
            : "INVALID_SOURCE_RESPONSE",
        message: timedOut
          ? "DMI-hentningen overskred tidsgrænsen."
          : error instanceof SourceError
            ? error.message
            : "DMI-data kunne ikke hentes eller valideres.",
      },
    };
  } finally {
    clearTimeout(totalTimer);
  }
}
