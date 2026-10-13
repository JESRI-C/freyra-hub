import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { OfficialWatercourseGeometry } from "@/services/geospatial/official-watercourse-source";

export const PUBLIC_BASELINE_SCHEMA = "gofreyra.public-baseline/v1" as const;
export type BaselineJson =
  | string
  | number
  | boolean
  | null
  | BaselineJson[]
  | { [key: string]: BaselineJson };
export type BaselineSourceMode = "live" | "import" | "preview" | "error";
export type BaselineSourceStatus =
  | "complete"
  | "partial"
  | "no_coverage"
  | "not_configured"
  | "not_implemented"
  | "timeout"
  | "failed";
export type BaselineEvidenceKind =
  | "official_registration"
  | "measurement"
  | "calculation"
  | "estimate"
  | "preview";
export type BaselineCoverage = "complete" | "partial" | "none" | "unknown";

export interface PublicBaselineSource {
  id: string;
  mode: BaselineSourceMode;
  status: BaselineSourceStatus;
  provider: string;
  dataset: string;
  datasetVersion: string | null;
  licence: string | null;
  attribution: string | null;
  sourceUrl: string | null;
  sourceModifiedAt: string | null;
  fetchedAt: string;
  adapterVersion: string;
  query: {
    geometrySha256: string;
    bbox: [number, number, number, number];
    requestedFrom: string;
    requestedTo: string;
  };
  coverage: {
    spatial: BaselineCoverage;
    temporal: BaselineCoverage;
    observedFrom: string | null;
    observedTo: string | null;
    paginationComplete: boolean;
    returnedCount: number | null;
  };
  quality: {
    evidenceKind: BaselineEvidenceKind;
    method: string;
    warnings: string[];
  };
  payload: BaselineJson;
  payloadSha256: string | null;
  error: { code: string; message: string } | null;
}

export interface PublicBaselineManifest {
  schema: typeof PUBLIC_BASELINE_SCHEMA;
  project: {
    id: string;
    name: string;
    polygon: GeoJSONPolygon;
    polygonSha256: string;
    crs: "EPSG:4326";
    bbox: [number, number, number, number];
  };
  period: { from: string; to: string };
  reference: OfficialWatercourseGeometry & { zoneId: string; savedAt: string };
  sources: PublicBaselineSource[];
}

export interface PublicBaselineSnapshot {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
  createdBy: string;
  requestId: string;
  manifestSha256: string;
  manifest: PublicBaselineManifest;
}

/** Version pickers need small metadata rows, never the full source payloads. */
export type PublicBaselineSummary = Omit<PublicBaselineSnapshot, "manifest">;

export interface CreatePublicBaselineInput {
  projectId: string;
  dateFrom: string;
  dateTo: string;
  requestId: string;
}

/** A partial baseline may be saved, but preview/error/estimates are never measured evidence. */
export function isBaselineMeasuredEvidence(source: PublicBaselineSource): boolean {
  return (
    (source.mode === "live" || source.mode === "import") &&
    source.status === "complete" &&
    source.error === null &&
    source.quality.evidenceKind === "measurement" &&
    source.payload !== null &&
    source.payloadSha256 !== null &&
    source.coverage.spatial === "complete" &&
    source.coverage.temporal === "complete" &&
    source.coverage.paginationComplete
  );
}
