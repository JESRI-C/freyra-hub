export type MediaCategory =
  | "field_photo"
  | "drone_image"
  | "satellite_snapshot"
  | "before_after"
  | "document_scan"
  | "biodiversity_observation"
  | "water_observation"
  | "soil_observation";

export type MediaSource = "field_upload" | "drone" | "copernicus" | "drone_api" | "manual";
export type MediaStatus = "uploaded" | "processing" | "ready" | "report_ready" | "archived";

export interface MediaGeoReference {
  lat: number;
  lng: number;
  altitudeM?: number;
  accuracyM?: number;
}

export interface ProjectMediaItem {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  category: MediaCategory;
  source: MediaSource;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  capturedAt?: string;
  coordinates?: MediaGeoReference;
  isReportReady: boolean;
  tags: string[];
  status: MediaStatus;
  actionId?: string | null;
  documentId?: string | null;
  direction?: number | null;
  beforeMediaId?: string | null;
}

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  field_photo: "Feltfoto",
  drone_image: "Drone",
  satellite_snapshot: "Satellit",
  before_after: "Før/efter",
  document_scan: "Dokument",
  biodiversity_observation: "Biodiversitet",
  water_observation: "Vand",
  soil_observation: "Jordbund",
};

export const MEDIA_CATEGORY_COLORS: Record<MediaCategory, string> = {
  field_photo: "bg-emerald-100 text-emerald-700",
  drone_image: "bg-sky-100 text-sky-700",
  satellite_snapshot: "bg-violet-100 text-violet-700",
  before_after: "bg-amber-100 text-amber-700",
  document_scan: "bg-slate-100 text-slate-700",
  biodiversity_observation: "bg-green-100 text-green-700",
  water_observation: "bg-blue-100 text-blue-700",
  soil_observation: "bg-orange-100 text-orange-700",
};
