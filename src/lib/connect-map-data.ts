/** Source configuration and empty legacy collections. No customer sample records. */
export type LatLng = { lat: number; lng: number };
export const SEARCH_SUGGESTIONS: { label: string; type: string; coord: string }[] = [];
export const MAP_PROJECTS: { id: string; name: string; area: string; center: string }[] = [];
export type LayerKey =
  | "boundary"
  | "zones"
  | "sensors"
  | "gateways"
  | "drone"
  | "satellite"
  | "field"
  | "water"
  | "gaps"
  | "alerts"
  | "ortofoto"
  | "terrain"
  | "basemap";
export const LAYER_DEFS: {
  key: LayerKey;
  label: string;
  lastUpdated: string;
  quality: number;
  source: string;
  defaultOn: boolean;
}[] = [];
export const MOCK_SENSORS: {
  id: string;
  x: number;
  y: number;
  label: string;
  quality: number;
  zone: string;
}[] = [];
export const MOCK_FIELD_OBS: { x: number; y: number; label: string; date: string }[] = [];
export const MOCK_WATER_SAMPLES: { x: number; y: number; label: string; ph: string }[] = [];
export const MOCK_ZONES_GEO: (
  | {
      name: string;
      path: string;
      area: string;
      habitat: string;
      quality: number;
      lastObs: string;
      sources: number;
      risk: "Lav";
    }
  | {
      name: string;
      path: string;
      area: string;
      habitat: string;
      quality: number;
      lastObs: string;
      sources: number;
      risk: "Medium";
    }
)[] = [];
export const COVERAGE_METRICS: { label: string; value: number }[] = [];
export const UPLOAD_TYPES: {
  name: string;
  desc: string;
  onMap: boolean;
  geo: boolean;
  use: string;
}[] = [];
export type UploadStatus = "Klar" | "Validering" | "Fejl" | "Uploading";
export const UPLOAD_QUEUE: {
  id: string;
  name: string;
  type: string;
  size: string;
  project: string;
  zone: string;
  status: UploadStatus;
  geo: boolean;
  metaOk: boolean;
  validationNote: string;
}[] = [];
export const ROUTING_DESTINATIONS: { key: string; label: string; desc: string }[] = [];
export const VALIDATION_WARNINGS: string[] = [];
