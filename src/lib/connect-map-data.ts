// Geospatial mock data for Smart Connect map workspace and upload center.
// Designed to be replaced by Supabase + PostGIS + Storage later.

export type LatLng = { lat: number; lng: number };

export const SEARCH_SUGGESTIONS = [
  { label: "Skallebæk, Haderslev", type: "Projekt", coord: "55.252, 9.488" },
  { label: "Årslev Engsø", type: "Lokation", coord: "56.165, 10.222" },
  { label: "Urban Biodiversity Corridor Copenhagen", type: "Projekt", coord: "55.687, 12.572" },
  { label: "Danish Wetland Restoration", type: "Projekt", coord: "55.978, 9.842" },
  { label: "Mangrove Restoration Indonesia", type: "Projekt", coord: "-1.245, 116.832" },
];

export const MAP_PROJECTS = [
  { id: "skallebaek", name: "Skallebæk Biodiversity Pilot", area: "7,3 ha", center: "55.252, 9.488" },
  { id: "nordic", name: "Nordic Coastal Restoration", area: "24,1 ha", center: "57.041, 9.928" },
  { id: "urban-water", name: "Urban Water Quality Program", area: "—", center: "55.681, 12.566" },
  { id: "wetland", name: "Danish Wetland Restoration", area: "12,8 ha", center: "55.978, 9.842" },
  { id: "urban-bio", name: "Urban Biodiversity Corridor Copenhagen", area: "3,2 ha", center: "55.687, 12.572" },
];

export type LayerKey =
  | "boundary" | "zones" | "sensors" | "gateways" | "drone"
  | "satellite" | "field" | "water" | "gaps" | "alerts"
  | "ortofoto" | "terrain" | "basemap";

export const LAYER_DEFS: { key: LayerKey; label: string; lastUpdated: string; quality: number; source: string; defaultOn: boolean }[] = [
  { key: "boundary", label: "Projektgrænse", lastUpdated: "12. maj 2026", quality: 100, source: "Tegnet", defaultOn: true },
  { key: "zones", label: "Zoner", lastUpdated: "12. maj 2026", quality: 96, source: "Tegnet", defaultOn: true },
  { key: "sensors", label: "Sensorer", lastUpdated: "2 min siden", quality: 94, source: "IoT", defaultOn: true },
  { key: "gateways", label: "Gateways", lastUpdated: "3 t siden", quality: 80, source: "LoRaWAN", defaultOn: true },
  { key: "drone", label: "Drone coverage", lastUpdated: "2 d siden", quality: 71, source: "Drone upload", defaultOn: true },
  { key: "satellite", label: "Satellit NDVI", lastUpdated: "6 t siden", quality: 88, source: "Sentinel-2", defaultOn: true },
  { key: "field", label: "Feltobservationer", lastUpdated: "1 t siden", quality: 82, source: "Field App", defaultOn: true },
  { key: "water", label: "Vandprøver", lastUpdated: "30 min siden", quality: 91, source: "Lab + sensor", defaultOn: false },
  { key: "gaps", label: "Datagaps", lastUpdated: "Realtid", quality: 0, source: "Beregnet", defaultOn: true },
  { key: "alerts", label: "Alerts", lastUpdated: "Realtid", quality: 0, source: "System", defaultOn: true },
  { key: "ortofoto", label: "Ortofoto baggrund", lastUpdated: "2024", quality: 100, source: "GeoDanmark", defaultOn: false },
  { key: "terrain", label: "Terræn baggrund", lastUpdated: "2023", quality: 100, source: "GeoDanmark", defaultOn: false },
  { key: "basemap", label: "Standardkort", lastUpdated: "Live", quality: 100, source: "OSM", defaultOn: true },
];

// Coordinates are in viewBox space (0..600 x 0..400) for the mock SVG canvas
export const MOCK_SENSORS = [
  { id: "SKB-WQ-01", x: 140, y: 110, label: "Vandkvalitet", quality: 96, zone: "Zone A — Vandløb" },
  { id: "SKB-SOIL-02", x: 200, y: 160, label: "Jordfugtighed", quality: 92, zone: "Zone B — Eng og vådområde" },
  { id: "SKB-AIR-05", x: 380, y: 130, label: "Luftkvalitet", quality: 84, zone: "Zone B — Eng og vådområde" },
  { id: "SKB-WQ-08", x: 420, y: 180, label: "Vandkvalitet", quality: 88, zone: "Zone B — Eng og vådområde" },
  { id: "SKB-CAM-04", x: 180, y: 250, label: "Camera trap", quality: 78, zone: "Zone C — Skovkant" },
  { id: "SKB-ACU-06", x: 340, y: 280, label: "Akustik", quality: 90, zone: "Zone D — Bufferområde" },
];

export const MOCK_FIELD_OBS = [
  { x: 160, y: 290, label: "Sumphøne", date: "12. maj" },
  { x: 220, y: 310, label: "Stor vandsalamander", date: "10. maj" },
  { x: 410, y: 145, label: "Engryle", date: "9. maj" },
];

export const MOCK_WATER_SAMPLES = [
  { x: 150, y: 130, label: "WS-01", ph: "7,4" },
  { x: 410, y: 175, label: "WS-02", ph: "7,2" },
];

export const MOCK_ZONES_GEO = [
  { name: "Zone A — Vandløb", path: "M60,60 L260,70 L240,200 L80,210 Z", area: "1,4 ha", habitat: "Vandløb", quality: 94, lastObs: "2 min", sources: 6, risk: "Lav" as const },
  { name: "Zone B — Eng og vådområde", path: "M260,70 L520,80 L500,210 L240,200 Z", area: "3,2 ha", habitat: "Eng og vådområde", quality: 89, lastObs: "5 min", sources: 8, risk: "Lav" as const },
  { name: "Zone C — Skovkant", path: "M80,210 L300,205 L280,340 L100,335 Z", area: "1,9 ha", habitat: "Skovkant", quality: 71, lastObs: "2 d", sources: 3, risk: "Medium" as const },
  { name: "Zone D — Bufferområde", path: "M300,205 L500,210 L520,300 L290,330 Z", area: "0,8 ha", habitat: "Buffer", quality: 76, lastObs: "45 min", sources: 2, risk: "Medium" as const },
];

export const COVERAGE_METRICS = [
  { label: "Sensor coverage", value: 82 },
  { label: "Drone coverage", value: 64 },
  { label: "Satellite coverage", value: 100 },
  { label: "Feltobservation coverage", value: 58 },
];

export const UPLOAD_TYPES = [
  { name: "Dronebilleder", desc: "Enkeltbilleder fra drone overflyvning", onMap: true, geo: true, use: "Visuel dokumentation" },
  { name: "Drone orthomosaic", desc: "Sammensat dronekort i høj opløsning", onMap: true, geo: true, use: "Coverage og analyse" },
  { name: "GeoTIFF", desc: "Georefereret raster (NDVI, højde, m.m.)", onMap: true, geo: true, use: "Satellit/drone lag" },
  { name: "GeoJSON", desc: "Vektor polygoner og punkter", onMap: true, geo: true, use: "Zoner og grænser" },
  { name: "KML/KMZ", desc: "Google Earth lag", onMap: true, geo: true, use: "Eksterne lag" },
  { name: "Shapefile ZIP", desc: "ESRI shapefile pakket i ZIP", onMap: true, geo: true, use: "GIS import" },
  { name: "CSV", desc: "Tabeldata med koordinatkolonner", onMap: true, geo: true, use: "Punktobservationer" },
  { name: "GPX", desc: "GPS-tracks fra felten", onMap: true, geo: true, use: "Field walks" },
  { name: "PDF", desc: "Metoder, tilladelser, rapporter", onMap: false, geo: false, use: "Dokumentation" },
  { name: "JPG/PNG", desc: "Feltbilleder, dokumentation", onMap: false, geo: false, use: "Bilag" },
  { name: "Feltdata", desc: "Strukturerede feltobservationer", onMap: true, geo: true, use: "Biodiversitet" },
  { name: "Vandprøver", desc: "Lab- eller sensorprøver", onMap: true, geo: true, use: "Vandkvalitet" },
  { name: "Metodedokumenter", desc: "Beskrivelse af målemetode", onMap: false, geo: false, use: "Verifikation" },
];

export type UploadStatus = "Klar" | "Validering" | "Fejl" | "Uploading";

export const UPLOAD_QUEUE = [
  { id: "u1", name: "Skallebaek_orthomosaic_May2026.tif", type: "Drone orthomosaic", size: "284 MB", project: "Skallebæk Biodiversity Pilot", zone: "Hele projektet", status: "Klar" as UploadStatus, geo: true, metaOk: true, validationNote: "Coverage 92% af projektarealet" },
  { id: "u2", name: "ZoneC_field_observations.csv", type: "CSV", size: "84 KB", project: "Skallebæk Biodiversity Pilot", zone: "Zone C — Skovkant", status: "Validering" as UploadStatus, geo: true, metaOk: false, validationNote: "Mangler metodebeskrivelse" },
  { id: "u3", name: "DroneCoverage_NorthEast.geojson", type: "GeoJSON", size: "12 KB", project: "Skallebæk Biodiversity Pilot", zone: "Zone B — Eng og vådområde", status: "Klar" as UploadStatus, geo: true, metaOk: true, validationNote: "Polygon valid" },
  { id: "u4", name: "WaterSamples_Q2_2026.csv", type: "CSV", size: "38 KB", project: "Urban Water Quality Program", zone: "Zone A — Vandløb", status: "Klar" as UploadStatus, geo: true, metaOk: true, validationNote: "Koordinater fundet" },
  { id: "u5", name: "Habitat_Methodology.pdf", type: "PDF", size: "1,2 MB", project: "Skallebæk Biodiversity Pilot", zone: "—", status: "Klar" as UploadStatus, geo: false, metaOk: true, validationNote: "Bilag" },
  { id: "u6", name: "NDVI_layer_June2026.tif", type: "GeoTIFF", size: "164 MB", project: "Urban Biodiversity Corridor Copenhagen", zone: "Hele projektet", status: "Fejl" as UploadStatus, geo: true, metaOk: false, validationNote: "Projektion (EPSG) ikke genkendt" },
  { id: "u7", name: "Drone_Q2_RAW_pack.zip", type: "Dronebilleder", size: "1,8 GB", project: "Danish Wetland Restoration", zone: "Hele projektet", status: "Validering" as UploadStatus, geo: false, metaOk: false, validationNote: "EXIF GPS mangler på 12% af billeder" },
];

export const ROUTING_DESTINATIONS = [
  { key: "map", label: "Smart Connect map", desc: "Vis som kortlag" },
  { key: "decisions", label: "DecisionsIQ analyse", desc: "Brug i scenarier og anbefalinger" },
  { key: "ledger", label: "ESG Ledger dokumentation", desc: "Bilag og verifikation" },
  { key: "impact", label: "Impact Exchange projektprofil", desc: "Vis i projektprofilen" },
  { key: "reports", label: "Reports modul", desc: "Tilgængelig i rapportbygger" },
];

export const VALIDATION_WARNINGS = [
  "Drone upload mangler geotags på 12% af billederne",
  "CSV mangler koordinatkolonne (lat/lon eller easting/northing)",
  "GeoTIFF overlapper kun 72% af projektområdet",
  "Feltdata mangler metodebeskrivelse",
  "Koordinatsystem skal bekræftes (EPSG-kode foreslået: 25832)",
];
