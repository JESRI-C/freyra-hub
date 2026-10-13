import { buildOfficialWatercourseGeometryUrl } from "@/services/geospatial/official-watercourse-source";
import type { SavedOfficialWatercourseReach } from "@/lib/watercourse-reach.functions";
import {
  baselineSha256,
  baselineSnapshotFromRow,
  buildPublicBaselineManifest,
} from "../public-baseline-service";
import type {
  CreatePublicBaselineInput,
  PublicBaselineManifest,
  PublicBaselineSnapshot,
} from "../public-baseline-types";

export const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
export const ACTOR_ID = "20000000-0000-4000-8000-000000000001";
export const SNAPSHOT_ID = "30000000-0000-4000-8000-000000000001";
export const REQUEST_ID = "40000000-0000-4000-8000-000000000001";
export const ZONE_ID = "50000000-0000-4000-8000-000000000001";
export const REFERENCE_ID = "60000000-0000-4000-8000-000000000001";
export const COLLECTED_AT = "2026-10-13T12:00:00.000Z";
export const INPUT: CreatePublicBaselineInput = {
  projectId: PROJECT_ID,
  requestId: REQUEST_ID,
  dateFrom: "2026-09-01",
  dateTo: "2026-09-30",
};
export const PROJECT = {
  id: PROJECT_ID,
  name: "Kontrolleret testbæk",
  geometry_polygon: {
    type: "Polygon",
    coordinates: [
      [
        [9.0, 55.0],
        [9.1, 55.0],
        [9.1, 55.1],
        [9.0, 55.1],
        [9.0, 55.0],
      ],
    ],
  },
};
export const REFERENCE: SavedOfficialWatercourseReach = {
  id: REFERENCE_ID,
  zoneId: ZONE_ID,
  savedAt: "2026-10-12T12:00:00.000Z",
  name: "Kontrolleret testbæk",
  nameStatus: "officielt",
  municipalities: ["Testkommune"],
  center: { lat: 55.05, lng: 9.05 },
  bbox: [9.01, 55.01, 9.09, 55.09],
  geometry: {
    type: "MultiLineString",
    coordinates: [
      [
        [9.01, 55.01],
        [9.09, 55.09],
      ],
    ],
  },
  segmentCount: 1,
  vertexCount: 2,
  lengthM: 10_000,
  modifiedAt: "2026-09-01T00:00:00Z",
  geometryVersion: 1,
  sourceUrl: buildOfficialWatercourseGeometryUrl(REFERENCE_ID),
  attribution: "SDFI / Dataforsyningen",
  disclaimer: "Kommunalt regulativ er facit.",
};

export function makeManifest(): Promise<PublicBaselineManifest> {
  return buildPublicBaselineManifest(INPUT, PROJECT, REFERENCE, REFERENCE, COLLECTED_AT);
}

export async function makeSnapshot(
  manifest?: PublicBaselineManifest,
  version = 1,
): Promise<PublicBaselineSnapshot> {
  const locked = manifest ?? (await makeManifest());
  return baselineSnapshotFromRow({
    id: SNAPSHOT_ID,
    project_id: PROJECT_ID,
    version_no: version,
    created_at: COLLECTED_AT,
    created_by: ACTOR_ID,
    request_id: REQUEST_ID,
    manifest_sha256: await baselineSha256(locked),
    manifest: locked,
  });
}
