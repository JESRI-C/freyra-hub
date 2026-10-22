import { z } from "zod";
import { requireVerifiedInputContext, type VerifiedInputContext } from "./verified-input-context";
import { validateProjectPolygon } from "@/services/geo-service";
import {
  hasOfficialWatercourseProvenance,
  isDatafordelerWatercourseReference,
} from "@/services/geospatial/watercourse-source-provenance";
import type { SavedOfficialWatercourseReach } from "@/lib/watercourse-reach.functions";
import {
  PUBLIC_BASELINE_SCHEMA,
  PUBLIC_BASELINE_DATAFORDELER_SCHEMA,
  type CreatePublicBaselineInput,
  type PublicBaselineManifest,
  type PublicBaselineSnapshot,
  type PublicBaselineSummary,
  type PublicBaselineSource,
  type BaselineJson,
} from "./public-baseline-types";

const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const Bbox = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const DateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Coverage = z.enum(["complete", "partial", "none", "unknown"]);
const SourceSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(["live", "import", "preview", "error"]),
  status: z.enum([
    "complete",
    "partial",
    "no_coverage",
    "not_configured",
    "not_implemented",
    "timeout",
    "failed",
  ]),
  provider: z.string(),
  dataset: z.string(),
  datasetVersion: z.string().nullable(),
  licence: z.string().nullable(),
  attribution: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceModifiedAt: z.string().nullable(),
  fetchedAt: z.string(),
  adapterVersion: z.string(),
  retrieval: z
    .object({ mode: z.enum(["cache", "saved_fallback"]), checkedAt: z.string().datetime() })
    .optional(),
  query: z.object({
    geometrySha256: Hash,
    bbox: Bbox,
    requestedFrom: DateText,
    requestedTo: DateText,
  }),
  coverage: z.object({
    spatial: Coverage,
    temporal: Coverage,
    observedFrom: z.string().nullable(),
    observedTo: z.string().nullable(),
    paginationComplete: z.boolean(),
    returnedCount: z.number().int().nonnegative().nullable(),
  }),
  quality: z.object({
    evidenceKind: z.enum([
      "official_registration",
      "measurement",
      "calculation",
      "estimate",
      "preview",
    ]),
    method: z.string(),
    warnings: z.array(z.string()),
  }),
  payload: z.json(),
  payloadSha256: Hash.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});
const ManifestSchema = z.object({
  schema: z.union([
    z.literal(PUBLIC_BASELINE_SCHEMA),
    z.literal(PUBLIC_BASELINE_DATAFORDELER_SCHEMA),
  ]),
  project: z.object({
    id: Uuid,
    name: z.string(),
    polygon: z
      .object({
        type: z.literal("Polygon"),
        coordinates: z.array(z.array(z.array(z.number().finite()))),
      })
      .catchall(z.json()),
    polygonSha256: Hash,
    crs: z.literal("EPSG:4326"),
    bbox: Bbox,
  }),
  period: z.object({ from: DateText, to: DateText }),
  reference: z.object({
    id: Uuid,
    zoneId: Uuid,
    savedAt: z.string(),
    name: z.string(),
    nameStatus: z.string(),
    municipalities: z.array(z.string()),
    center: z.object({ lat: z.number().finite(), lng: z.number().finite() }),
    bbox: Bbox,
    geometry: z.object({
      type: z.literal("MultiLineString"),
      coordinates: z.array(z.array(z.tuple([z.number().finite(), z.number().finite()]))),
    }),
    segmentCount: z.number().int(),
    vertexCount: z.number().int(),
    lengthM: z.number().finite(),
    modifiedAt: z.string().nullable(),
    geometryVersion: z.number().nullable(),
    sourceUrl: z.string(),
    attribution: z.string(),
    disclaimer: z.string(),
    sourceProvider: z.literal("datafordeler-ds-bearbejdet-wfs/v1").optional(),
    sourceCrs: z.literal("EPSG:4326").optional(),
    sourceAxisOrder: z.literal("lat-lng").optional(),
    datasetVersion: z.literal("static-2025-09").optional(),
    sourceRegisteredAt: z.string().datetime().nullable().optional(),
    sourceValidFrom: z.string().datetime().nullable().optional(),
    officialLengthM: z.number().finite().nonnegative().nullable().optional(),
  }),
  sources: z.array(SourceSchema).min(1),
});

/** Sorted JSON keys make hashes stable across JSONB's key reordering on reload. */
export function canonicalBaselineJson(value: unknown): string {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint" ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    throw new Error("Datagrundlaget skal være gyldig JSON.");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalBaselineJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalBaselineJson(record[key])}`)
    .join(",")}}`;
}

export async function baselineSha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalBaselineJson(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface BaselineProjectRow {
  id: string;
  name: string;
  geometry_polygon: unknown;
}

export async function buildPublicBaselineManifest(
  input: CreatePublicBaselineInput,
  project: BaselineProjectRow,
  reference: SavedOfficialWatercourseReach,
  fetchedReference: SavedOfficialWatercourseReach,
  fetchedAt: string,
): Promise<PublicBaselineManifest> {
  if (project.id !== input.projectId)
    throw new Error("Projektets datagrundlag matcher ikke sagen.");
  const validation = validateProjectPolygon(project.geometry_polygon);
  if (!validation.valid)
    throw new Error(`Projektgrænse mangler eller er ugyldig: ${validation.error}`);
  if (
    reference.id !== fetchedReference.id ||
    reference.sourceProvider !== fetchedReference.sourceProvider ||
    (await baselineSha256(reference.geometry)) !== (await baselineSha256(fetchedReference.geometry))
  ) {
    throw new Error(
      "Den officielle reference er ændret. Vælg og gem strækningen igen, før du henter en ny version.",
    );
  }
  if (!hasOfficialWatercourseProvenance(fetchedReference)) {
    throw new Error("Vandløbsreferencen har ugyldig kildeproveniens.");
  }
  const polygon = validation.polygon;
  const positions = polygon.coordinates.flat();
  const bbox: [number, number, number, number] = [
    Math.min(...positions.map((p) => p[0])),
    Math.min(...positions.map((p) => p[1])),
    Math.max(...positions.map((p) => p[0])),
    Math.max(...positions.map((p) => p[1])),
  ];
  const polygonSha256 = await baselineSha256(polygon);
  const query = {
    geometrySha256: polygonSha256,
    bbox,
    requestedFrom: input.dateFrom,
    requestedTo: input.dateTo,
  };
  const isDatafordeler = isDatafordelerWatercourseReference(fetchedReference);
  const source: PublicBaselineSource = {
    id: "official-watercourse-reference",
    mode: "live",
    status: "complete",
    provider: isDatafordeler ? "Klimadatastyrelsen / Datafordeler" : "SDFI / Dataforsyningen",
    dataset: "Danske Stednavne — vandløbsreference",
    datasetVersion: isDatafordeler
      ? fetchedReference.datasetVersion
      : (fetchedReference.geometryVersion?.toString() ?? null),
    licence: null,
    attribution: fetchedReference.attribution,
    sourceUrl: fetchedReference.sourceUrl,
    sourceModifiedAt: fetchedReference.modifiedAt,
    fetchedAt,
    adapterVersion: isDatafordeler
      ? "datafordeler-ds-bearbejdet-wfs/v1"
      : "official-watercourse-reference/v1",
    query,
    coverage: {
      spatial: "unknown",
      temporal: "unknown",
      observedFrom: null,
      observedTo: null,
      paginationComplete: true,
      returnedCount: 1,
    },
    quality: {
      evidenceKind: "official_registration",
      method: "named-watercourse-reference",
      warnings: [
        fetchedReference.disclaimer,
        "Referencegeometrien beskriver det navngivne vandløb. Den dokumenterer ikke juridisk stationering eller hele undersøgelsesperioden.",
        "Kildens licens skal afklares før videre aflevering.",
        ...(isDatafordeler
          ? [
              "Danske Stednavne er et statisk register fra september 2025. Hentetid og registrerings-/virkningstid er ikke en ny kontrolopmåling.",
            ]
          : []),
      ],
    },
    payload: z.json().parse(JSON.parse(JSON.stringify(fetchedReference))) as BaselineJson,
    payloadSha256: await baselineSha256(fetchedReference),
    error: null,
  };
  const pending = [
    ["municipal-regulation", "Kommunen", "Regulativ og kommunal delstrækning"],
    ["orthophoto-terrain", "Datafordeler", "Ortofoto og DHM"],
    ["orthophoto-preview", "Datafordeler", "Ortofoto · gemt oversigtsbillede"],
    ["planting-markblocks", "Landbrugs- og Fiskeristyrelsen", "Markblokke 2026"],
    ["planting-lowland", "DCA / Aarhus Universitet", "Kulstof 2022 (lavbundskort)"],
    ["planting-woodland", "GeoDanmark", "Skove og registreret trædække"],
    ["cadastral-parcels", "Geodatastyrelsen", "Matrikel · versioneret geometri afventer"],
    ["soil-type", "GEUS", "Jordart · versioneret geometri afventer"],
    ["dmi-historical", "DMI", "Historisk vejr og nedbør"],
    [
      "water-plan-nature",
      "Miljøstyrelsen / Danmarks Miljøportal",
      "Vandområdeplan og naturregistreringer",
    ],
    ["sentinel-2-scenes", "Copernicus", "Sentinel-2-scener og brugbarhed"],
    ["public-monitoring-stations", "Offentlige dataudbydere", "Målestationer og officielle serier"],
  ].map(
    ([id, provider, dataset]): PublicBaselineSource => ({
      id,
      provider,
      dataset,
      mode: "error",
      status: "not_implemented",
      datasetVersion: null,
      licence: null,
      attribution: null,
      sourceUrl: null,
      sourceModifiedAt: null,
      fetchedAt,
      adapterVersion: "not-implemented/v1",
      query,
      coverage: {
        spatial: "unknown",
        temporal: "unknown",
        observedFrom: null,
        observedTo: null,
        paginationComplete: false,
        returnedCount: null,
      },
      quality: {
        evidenceKind: "preview",
        method: "not_implemented",
        warnings: ["Denne kilde er endnu ikke hentet i det gemte datagrundlag."],
      },
      payload: null,
      payloadSha256: null,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Kilden afventer tilslutning eller versioneret officiel import.",
      },
    }),
  );
  return {
    schema: isDatafordeler ? PUBLIC_BASELINE_DATAFORDELER_SCHEMA : PUBLIC_BASELINE_SCHEMA,
    project: { id: project.id, name: project.name, polygon, polygonSha256, crs: "EPSG:4326", bbox },
    period: { from: input.dateFrom, to: input.dateTo },
    reference: fetchedReference,
    sources: [source, ...pending],
  };
}

export async function validatePublicBaselineManifest(
  value: unknown,
): Promise<PublicBaselineManifest> {
  if (new TextEncoder().encode(canonicalBaselineJson(value)).byteLength > 2 * 1024 * 1024) {
    throw new Error("Datagrundlaget overskrider grænsen på 2 MiB.");
  }
  const manifest = ManifestSchema.parse(value) as PublicBaselineManifest;
  const validation = validateProjectPolygon(manifest.project.polygon);
  if (
    !validation.valid ||
    (await baselineSha256(manifest.project.polygon)) !== manifest.project.polygonSha256
  ) {
    throw new Error("Det gemte datagrundlag har ugyldig projektgeometri eller checksum.");
  }
  if (
    !hasOfficialWatercourseProvenance(manifest.reference) ||
    (manifest.schema === PUBLIC_BASELINE_DATAFORDELER_SCHEMA) !==
      isDatafordelerWatercourseReference(manifest.reference)
  ) {
    throw new Error("Det gemte datagrundlag har ugyldig referenceproveniens.");
  }
  if (manifest.schema === PUBLIC_BASELINE_DATAFORDELER_SCHEMA) {
    const officialSource = manifest.sources.find(
      (source) => source.id === "official-watercourse-reference",
    );
    if (
      !officialSource ||
      officialSource.mode !== "live" ||
      officialSource.status !== "complete" ||
      officialSource.adapterVersion !== manifest.reference.sourceProvider ||
      officialSource.datasetVersion !== manifest.reference.datasetVersion ||
      officialSource.sourceUrl !== manifest.reference.sourceUrl ||
      officialSource.sourceModifiedAt !== null ||
      canonicalBaselineJson(officialSource.payload) !== canonicalBaselineJson(manifest.reference)
    ) {
      throw new Error("Den gemte Datafordeler-kilde matcher ikke vandløbsreferencen.");
    }
  }
  const ids = new Set<string>();
  for (const source of manifest.sources) {
    if (
      ids.has(source.id) ||
      source.query.geometrySha256 !== manifest.project.polygonSha256 ||
      source.query.requestedFrom !== manifest.period.from ||
      source.query.requestedTo !== manifest.period.to
    ) {
      throw new Error("Det gemte datagrundlag har inkonsistente kildehenvisninger.");
    }
    ids.add(source.id);
    if (
      (source.mode === "error" &&
        (source.status === "complete" ||
          source.payload !== null ||
          source.payloadSha256 !== null ||
          source.error === null)) ||
      (source.status === "complete" && source.error !== null) ||
      (source.payload === null && source.payloadSha256 !== null) ||
      (source.mode === "preview" && source.quality.evidenceKind !== "preview") ||
      (["not_implemented", "not_configured", "timeout", "failed"].includes(source.status) &&
        source.mode !== "error")
    ) {
      throw new Error(
        "Det gemte datagrundlag blander manglende, foreløbige og dokumenterede kilder.",
      );
    }
    if (
      source.payload !== null &&
      (await baselineSha256(source.payload)) !== source.payloadSha256
    ) {
      throw new Error("En gemt kilde har ugyldig checksum.");
    }
  }
  return manifest;
}

export function baselineSummaryFromRow(value: unknown): PublicBaselineSummary {
  const row = z
    .object({
      id: Uuid,
      project_id: Uuid,
      version_no: z.number().int().positive(),
      created_at: z.string(),
      created_by: Uuid,
      request_id: Uuid,
      manifest_sha256: Hash,
    })
    .parse(value);
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version_no,
    createdAt: row.created_at,
    createdBy: row.created_by,
    requestId: row.request_id,
    manifestSha256: row.manifest_sha256,
  };
}

export async function baselineSnapshotFromRow(
  value: unknown,
  context?: VerifiedInputContext,
): Promise<PublicBaselineSnapshot> {
  if (context !== undefined) return requireVerifiedInputContext(context).baselineFromRow(value);
  const row = z
    .object({
      id: Uuid,
      project_id: Uuid,
      version_no: z.number().int().positive(),
      created_at: z.string(),
      created_by: Uuid,
      request_id: Uuid,
      schema_version: z.union([z.literal(1), z.literal(2)]).optional(),
      manifest_sha256: Hash,
      manifest: z.unknown(),
    })
    .parse(value);
  const manifest = await validatePublicBaselineManifest(row.manifest);
  if (
    manifest.project.id !== row.project_id ||
    (row.schema_version !== undefined &&
      row.schema_version !== (manifest.schema === PUBLIC_BASELINE_DATAFORDELER_SCHEMA ? 2 : 1)) ||
    (await baselineSha256(manifest)) !== row.manifest_sha256
  ) {
    throw new Error("Den gemte version matcher ikke dens projekt eller manifest-checksum.");
  }
  return { ...baselineSummaryFromRow(row), manifest };
}
