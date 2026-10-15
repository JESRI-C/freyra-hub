import type {
  DatafordelerWatercourseCollection,
  DatafordelerWatercourseGeometry,
  WatercourseSearchBounds,
} from "./datafordeler-watercourse-source";
import type { CanonicalDroneMediaReference } from "@/services/monitoring/canonical-drone-media-reference";
import type { DroneOriginalValidation } from "@/services/monitoring/drone-original-validation.server";
import type { GeoJSONPolygon } from "@/lib/supabase/types";

export const DRONE_LOCALIZATION_SCHEMA = "gofreyra.drone-localization/v1" as const;
export const MAX_LOCALIZATION_SOURCE_CALLS = 3;
const METRES_PER_DEGREE = 111_320;
const CLUSTER_GAP_M = 500;
const SEARCH_BUFFER_M = 500;
const AREA_BUFFER_M = 100;

export interface DroneLocalizationOriginal {
  media: CanonicalDroneMediaReference;
  validation: DroneOriginalValidation;
  fileName: string;
}
export interface DroneLocalizationPhoto {
  mediaId: string;
  fileName: string;
  originalSha256: string;
  originalValidationSha256: string;
  originalValidationStatus: "raw_original_validated" | "review_required";
  sizeBytes: number;
  status: "located" | "missing_gps" | "metadata_review" | "outside_denmark";
  reason: string | null;
  cameraPosition: {
    latitude: number;
    longitude: number;
    geometryRole: "camera_position_only";
  } | null;
  capturedAtUtc: string | null;
}
export interface DroneLocalizationCandidate {
  reference: DatafordelerWatercourseGeometry;
  /** Approximate median camera-to-line distance; never an image/object footprint. */
  distanceM: number;
  maximumDistanceM: number;
  supportedPhotoCount: number;
}
export interface DroneLocalizationCluster {
  id: string;
  mediaIds: string[];
  isolated: boolean;
  cameraBounds: WatercourseSearchBounds;
  searchBounds: WatercourseSearchBounds;
  /** Buffered camera search area, not observed stream or photographed footprint. */
  suggestedPolygon: GeoJSONPolygon;
  searchStatus:
    | "pending"
    | "complete"
    | "truncated"
    | "unavailable"
    | "isolated"
    | "too_broad"
    | "call_limit";
  candidates: DroneLocalizationCandidate[];
  /** Noneligible source features excluded from official reference suggestions. */
  excludedCandidateCount?: number;
  suggestedReferenceId: string | null;
}
export interface DroneLocalizationResult {
  schema: typeof DRONE_LOCALIZATION_SCHEMA;
  projectId: string;
  actorId: string;
  photos: DroneLocalizationPhoto[];
  clusters: DroneLocalizationCluster[];
  requiresConfirmation: true;
  georeferenced: false;
  reportEligible: false;
}

export function localizationPhoto(original: DroneLocalizationOriginal): DroneLocalizationPhoto {
  const { media, validation, fileName } = original;
  const position = validation.metadata?.position;
  let status: DroneLocalizationPhoto["status"] = "located";
  let reason: string | null = null;
  if (!position) {
    status = "missing_gps";
    reason = "Billedets original indeholder ingen entydig kameraposition. Vælg stedet på kortet.";
  } else if (!validation.cameraPositionEligible) {
    status = "metadata_review";
    reason =
      "Originalens position eller optagetid kræver gennemgang. Bekræft stedet og optagedatoen.";
  } else if (
    position.latitude < 54 ||
    position.latitude > 58 ||
    position.longitude < 7 ||
    position.longitude > 16
  ) {
    status = "outside_denmark";
    reason = "Kamerapositionen ligger uden for den danske datakildes område.";
  }
  return {
    mediaId: media.id,
    fileName,
    originalSha256: media.original_sha256,
    originalValidationSha256: media.original_validation_sha256,
    originalValidationStatus: media.original_validation_status,
    sizeBytes: media.file_size_bytes,
    status,
    reason,
    cameraPosition:
      status === "located" && position
        ? {
            latitude: position.latitude,
            longitude: position.longitude,
            geometryRole: "camera_position_only",
          }
        : null,
    capturedAtUtc: validation.metadata?.capture.capturedAtUtc ?? null,
  };
}
function distance(a: number[], b: number[]): number {
  const scale = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * scale, a[1] - b[1]) * METRES_PER_DEGREE;
}
function point(photo: DroneLocalizationPhoto): [number, number] {
  return [photo.cameraPosition!.longitude, photo.cameraPosition!.latitude];
}
function bufferedBounds(bounds: WatercourseSearchBounds, metres: number): WatercourseSearchBounds {
  const latitude = (bounds[1] + bounds[3]) / 2;
  const dy = metres / METRES_PER_DEGREE;
  const dx = dy / Math.cos((latitude * Math.PI) / 180);
  return [
    Math.max(7, bounds[0] - dx),
    Math.max(54, bounds[1] - dy),
    Math.min(16, bounds[2] + dx),
    Math.min(58, bounds[3] + dy),
  ];
}
function polygon(bounds: WatercourseSearchBounds): GeoJSONPolygon {
  const [w, s, e, n] = bounds;
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}
function bounded(bounds: WatercourseSearchBounds): boolean {
  const [w, s, e, n] = bounds;
  return (
    distance([w, s], [e, n]) <= 5_000 &&
    (n - s) * METRES_PER_DEGREE * (e - w) * METRES_PER_DEGREE * Math.cos((s * Math.PI) / 180) <=
      10_000_000
  );
}

/** Connected camera groups are shown separately. Isolated photos never enlarge the main area. */
export function buildDroneLocalization(
  projectId: string,
  actorId: string,
  originals: DroneLocalizationOriginal[],
): DroneLocalizationResult {
  return buildDroneLocalizationFromPhotos(projectId, actorId, originals.map(localizationPhoto));
}

/** Project raw metadata immediately, so a 200-photo batch never retains 200 MiB of EXIF. */
export function buildDroneLocalizationFromPhotos(
  projectId: string,
  actorId: string,
  projected: DroneLocalizationPhoto[],
): DroneLocalizationResult {
  const photos = [...projected].sort((a, b) => a.mediaId.localeCompare(b.mediaId));
  const pending = photos.filter((photo) => photo.status === "located");
  const groups: DroneLocalizationPhoto[][] = [];
  while (pending.length) {
    const group = [pending.shift()!];
    for (let i = 0; i < group.length; i++) {
      for (let j = pending.length - 1; j >= 0; j--) {
        if (distance(point(group[i]), point(pending[j])) <= CLUSTER_GAP_M)
          group.push(pending.splice(j, 1)[0]);
      }
    }
    groups.push(group);
  }
  groups.sort((a, b) => b.length - a.length || a[0].mediaId.localeCompare(b[0].mediaId));
  let sourceCalls = 0;
  const clusters = groups.map((group): DroneLocalizationCluster => {
    const points = group.map(point);
    const bounds: WatercourseSearchBounds = [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ];
    const searchBounds = bufferedBounds(bounds, SEARCH_BUFFER_M);
    const isolated = group.length === 1 && groups[0].length >= 3;
    let searchStatus: DroneLocalizationCluster["searchStatus"] = "pending";
    if (isolated) searchStatus = "isolated";
    else if (!bounded(searchBounds)) searchStatus = "too_broad";
    else if (sourceCalls >= MAX_LOCALIZATION_SOURCE_CALLS) searchStatus = "call_limit";
    else sourceCalls++;
    return {
      id: `camera-group:${group.map((photo) => photo.mediaId).sort()[0]}`,
      mediaIds: group.map((photo) => photo.mediaId).sort(),
      isolated,
      cameraBounds: bounds,
      searchBounds,
      suggestedPolygon: polygon(bufferedBounds(bounds, AREA_BUFFER_M)),
      searchStatus,
      candidates: [],
      suggestedReferenceId: null,
    };
  });
  return {
    schema: DRONE_LOCALIZATION_SCHEMA,
    projectId,
    actorId,
    photos,
    clusters,
    requiresConfirmation: true,
    georeferenced: false,
    reportEligible: false,
  };
}

/** Local metric projection around the camera; segment endpoints need not be nearby. */
export function cameraToWatercourseDistanceM(
  camera: [number, number],
  geometry: DatafordelerWatercourseGeometry["geometry"],
): number {
  const scale = Math.cos((camera[1] * Math.PI) / 180) * METRES_PER_DEGREE;
  let closest = Infinity;
  for (const line of geometry.coordinates) {
    for (let i = 1; i < line.length; i++) {
      const a = [
        (line[i - 1][0] - camera[0]) * scale,
        (line[i - 1][1] - camera[1]) * METRES_PER_DEGREE,
      ];
      const b = [(line[i][0] - camera[0]) * scale, (line[i][1] - camera[1]) * METRES_PER_DEGREE];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length2 = dx * dx + dy * dy;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / length2));
      closest = Math.min(closest, Math.hypot(a[0] + t * dx, a[1] + t * dy));
    }
  }
  return closest;
}

export function rankDroneLocalizationCandidates(
  cluster: DroneLocalizationCluster,
  photos: DroneLocalizationPhoto[],
  collection: DatafordelerWatercourseCollection,
): DroneLocalizationCluster {
  const cameras = photos
    .filter((photo) => cluster.mediaIds.includes(photo.mediaId) && photo.cameraPosition)
    .map(point);
  const candidates = collection.watercourses
    .map((reference): DroneLocalizationCandidate => {
      const distances = cameras
        .map((camera) => cameraToWatercourseDistanceM(camera, reference.geometry))
        .sort((a, b) => a - b);
      const middle = Math.floor(distances.length / 2);
      const median =
        distances.length % 2 ? distances[middle] : (distances[middle - 1] + distances[middle]) / 2;
      return {
        reference,
        distanceM: Math.round(median),
        maximumDistanceM: Math.round(Math.max(...distances)),
        supportedPhotoCount: distances.filter((d) => d <= 250).length,
      };
    })
    .filter(
      (candidate) => Number.isFinite(candidate.distanceM) && candidate.distanceM <= SEARCH_BUFFER_M,
    )
    .sort((a, b) => a.distanceM - b.distanceM || a.reference.id.localeCompare(b.reference.id));
  const excludedCandidateCount = collection.excludedFeatureCount ?? 0;
  const complete =
    Number.isSafeInteger(excludedCandidateCount) &&
    excludedCandidateCount >= 0 &&
    collection.paginationComplete &&
    collection.numberMatched === collection.numberReturned &&
    collection.numberReturned === collection.watercourses.length + excludedCandidateCount;
  const best = candidates[0];
  const suggestedReferenceId =
    complete &&
    best &&
    best.maximumDistanceM <= 250 &&
    (!candidates[1] || candidates[1].distanceM - best.distanceM > 100)
      ? best.reference.id
      : null;
  return {
    ...cluster,
    searchStatus: complete ? "complete" : "truncated",
    candidates,
    excludedCandidateCount,
    suggestedReferenceId,
  };
}
