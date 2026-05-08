// Smart Connect mock data — designed to be replaced by Supabase / IoT backend later.

export type DeviceStatus = "online" | "partial" | "attention" | "offline" | "setup";
export type Severity = "critical" | "medium" | "low";

export const PROJECTS = [
  "Skallebæk Biodiversity Pilot",
  "Nordic Coastal Restoration",
  "Urban Water Quality Program",
  "Danish Wetland Restoration",
  "Urban Biodiversity Corridor Copenhagen",
  "Regenerative Agriculture Kenya",
  "Mangrove Restoration Indonesia",
];

export const ZONES = ["Zone A — Vandløb", "Zone B — Eng og vådområde", "Zone C — Skovkant", "Zone D — Bufferområde"];

export const SOURCE_TYPES = [
  "IoT sensor", "Gateway", "Satellitlag", "Drone upload", "Feltobservation",
  "Vandprøve", "Jordsensor", "Vejrstation", "Akustisk monitor", "Camera trap",
  "API integration", "CSV upload", "ERP data", "ESG-system", "Manuel registrering", "Tredjepartsverifikation",
];

export const MEASUREMENTS = [
  "Temperatur", "Luftfugtighed", "Jordfugtighed", "Jordtemperatur", "Vandstand",
  "Vandkvalitet", "pH", "Nitrat", "Fosfor", "Turbiditet", "CO₂e", "Energiforbrug",
  "Vegetationsindeks", "Biodiversitetsobservation", "Artsregistrering",
  "Lydaktivitet", "Billedobservation", "Drone coverage", "Satellite NDVI", "Habitat score",
];

export const DEVICES = [
  { id: "SKB-WQ-01", name: "Vandkvalitetssensor", type: "Vandsensor", project: "Skallebæk Biodiversity Pilot", zone: "Zone A — Vandløb", status: "online" as DeviceStatus, battery: 82, signal: 4, lastContact: "2 min siden", firmware: "v2.4.1", lastReading: "pH 7,4", quality: 96, conn: "LoRaWAN" },
  { id: "SKB-GW-03", name: "LoRaWAN Gateway", type: "Gateway", project: "Skallebæk Biodiversity Pilot", zone: "Zone B — Eng og vådområde", status: "offline" as DeviceStatus, battery: 0, signal: 0, lastContact: "3 t siden", firmware: "v1.9.0", lastReading: "—", quality: 0, conn: "LoRaWAN" },
  { id: "SKB-SOIL-02", name: "Jordfugtighedssensor", type: "Jordsensor", project: "Skallebæk Biodiversity Pilot", zone: "Zone B — Eng og vådområde", status: "online" as DeviceStatus, battery: 41, signal: 3, lastContact: "5 min siden", firmware: "v2.4.1", lastReading: "28%", quality: 92, conn: "NB-IoT" },
  { id: "URB-AIR-04", name: "Luftkvalitetssensor", type: "Luftsensor", project: "Urban Biodiversity Corridor Copenhagen", zone: "Zone C — Skovkant", status: "partial" as DeviceStatus, battery: 67, signal: 2, lastContact: "12 min siden", firmware: "v3.1.0", lastReading: "PM2.5 18", quality: 84, conn: "LTE-M" },
  { id: "NOR-ACOUSTIC-01", name: "Akustisk monitor", type: "Acoustic", project: "Nordic Coastal Restoration", zone: "Zone A — Vandløb", status: "online" as DeviceStatus, battery: 73, signal: 4, lastContact: "1 min siden", firmware: "v2.0.3", lastReading: "Index 64", quality: 95, conn: "WiFi" },
  { id: "WET-CAM-02", name: "Camera trap", type: "Camera", project: "Danish Wetland Restoration", zone: "Zone D — Bufferområde", status: "attention" as DeviceStatus, battery: 18, signal: 2, lastContact: "45 min siden", firmware: "v1.4.2", lastReading: "12 events i dag", quality: 78, conn: "LTE-M" },
  { id: "AGR-WEATHER-01", name: "Weather station", type: "Vejrstation", project: "Regenerative Agriculture Kenya", zone: "Zone B — Eng og vådområde", status: "online" as DeviceStatus, battery: 91, signal: 5, lastContact: "3 min siden", firmware: "v4.0.0", lastReading: "21°C / 64%", quality: 97, conn: "API" },
  { id: "MNG-WATER-07", name: "Mangrove vandstand", type: "Vandstand", project: "Mangrove Restoration Indonesia", zone: "Zone A — Vandløb", status: "online" as DeviceStatus, battery: 55, signal: 3, lastContact: "8 min siden", firmware: "v2.4.0", lastReading: "48 cm", quality: 90, conn: "MQTT" },
];

export const DATA_SOURCES = [
  { id: "src-001", name: "Skallebæk vandsensorer", type: "IoT sensor", project: "Skallebæk Biodiversity Pilot", category: "Vand", metrics: ["pH", "Turbiditet", "Vandstand"], lastSync: "2 min", freq: "5 min", quality: 96, verified: true, usedBy: ["DecisionsIQ", "ESG Ledger"], status: "online" as DeviceStatus, owner: "Mikkel Holm" },
  { id: "src-002", name: "Sentinel-2 NDVI", type: "Satellitlag", project: "Urban Biodiversity Corridor Copenhagen", category: "Satellit", metrics: ["NDVI", "Vegetationsindeks"], lastSync: "6 t", freq: "5 dage", quality: 88, verified: true, usedBy: ["Impact Exchange", "DecisionsIQ"], status: "online" as DeviceStatus, owner: "Emma Larsen" },
  { id: "src-003", name: "DMI Klima API", type: "API integration", project: "Nordic Coastal Restoration", category: "Vejr", metrics: ["Temperatur", "Luftfugtighed"], lastSync: "12 min", freq: "Time", quality: 99, verified: true, usedBy: ["DecisionsIQ", "ESG Ledger", "Reports"], status: "online" as DeviceStatus, owner: "Jesper Riel" },
  { id: "src-004", name: "Scope 3 transport CSV", type: "CSV upload", project: "Skallebæk Biodiversity Pilot", category: "ESG", metrics: ["CO₂e", "Energiforbrug"], lastSync: "Fejlet", freq: "Manuel", quality: 0, verified: false, usedBy: ["ESG Ledger"], status: "attention" as DeviceStatus, owner: "Emma Larsen" },
  { id: "src-005", name: "Drone overflight Q2", type: "Drone upload", project: "Danish Wetland Restoration", category: "Drone", metrics: ["Drone coverage"], lastSync: "2 d", freq: "Kvartal", quality: 71, verified: false, usedBy: ["Impact Exchange"], status: "attention" as DeviceStatus, owner: "Mikkel Holm" },
  { id: "src-006", name: "Feltobservation app", type: "Feltobservation", project: "Skallebæk Biodiversity Pilot", category: "Felt", metrics: ["Artsregistrering", "Biodiversitetsobservation"], lastSync: "1 t", freq: "Ad hoc", quality: 82, verified: true, usedBy: ["Impact Exchange", "ESG Ledger"], status: "partial" as DeviceStatus, owner: "Emma Larsen" },
  { id: "src-007", name: "ERP energidata", type: "ERP data", project: "Urban Water Quality Program", category: "ESG", metrics: ["Energiforbrug", "CO₂e"], lastSync: "30 min", freq: "Daglig", quality: 94, verified: true, usedBy: ["ESG Ledger", "Reports"], status: "online" as DeviceStatus, owner: "Jesper Riel" },
  { id: "src-008", name: "DNV verifikationsfeed", type: "Tredjepartsverifikation", project: "Mangrove Restoration Indonesia", category: "Verifikation", metrics: ["Habitat score"], lastSync: "1 d", freq: "Uge", quality: 97, verified: true, usedBy: ["Impact Exchange"], status: "online" as DeviceStatus, owner: "Jesper Riel" },
];

export const INTEGRATIONS = [
  { id: "MQTT Broker", desc: "Live IoT telemetri via MQTT 3.1.1", types: ["IoT", "Telemetri"], complexity: "Mellem", status: "Aktiv" },
  { id: "REST API", desc: "Generisk REST endpoint med polling eller webhook", types: ["JSON", "API"], complexity: "Enkel", status: "Aktiv" },
  { id: "Webhook", desc: "Push-baseret hændelsesmodtagelse", types: ["Events"], complexity: "Enkel", status: "Aktiv" },
  { id: "CSV Upload", desc: "Manuel eller scheduled CSV ingest", types: ["Tabeldata"], complexity: "Enkel", status: "Aktiv" },
  { id: "Supabase", desc: "Direkte forbindelse til projektets database", types: ["Postgres"], complexity: "Enkel", status: "Aktiv" },
  { id: "Google Sheets", desc: "Synkronisér rækker fra delt sheet", types: ["Tabeldata"], complexity: "Enkel", status: "Aktiv" },
  { id: "Airtable", desc: "Synk fra Airtable bases", types: ["Tabeldata"], complexity: "Enkel", status: "Token udløber" },
  { id: "ERP system", desc: "SAP / Microsoft Dynamics konnektor", types: ["ESG", "Finans"], complexity: "Avanceret", status: "Aktiv" },
  { id: "ESG reporting system", desc: "Position2 / Workiva sync", types: ["ESG"], complexity: "Avanceret", status: "Aktiv" },
  { id: "GIS system", desc: "ArcGIS / QGIS Feature Service", types: ["Geo"], complexity: "Mellem", status: "Aktiv" },
  { id: "Satellite provider", desc: "Sentinel Hub / Planet API", types: ["Raster"], complexity: "Mellem", status: "Aktiv" },
  { id: "Drone storage", desc: "S3-bucket med drone overflights", types: ["Imagery"], complexity: "Mellem", status: "Aktiv" },
  { id: "LoRaWAN Network Server", desc: "Chirpstack / TTN integration", types: ["IoT"], complexity: "Avanceret", status: "Aktiv" },
  { id: "NB-IoT Gateway", desc: "Mobiloperatør NB-IoT feed", types: ["IoT"], complexity: "Avanceret", status: "Fejlet sync" },
  { id: "Third-party verifier", desc: "DNV / Verra / Gold Standard feed", types: ["Verifikation"], complexity: "Mellem", status: "Aktiv" },
  { id: "Manual field app", desc: "Freyra Field iOS/Android", types: ["Felt"], complexity: "Enkel", status: "Kræver opsætning" },
];

export const ALERTS = [
  { id: "ALT-2041", title: "Sensor Gateway 03 offline i Skallebæk", severity: "critical" as Severity, project: "Skallebæk Biodiversity Pilot", source: "SKB-GW-03", type: "Offline device", first: "I dag 09:14", last: "I dag 11:42", status: "Åben", owner: "Mikkel Holm", action: "Kontroller strømforsyning og LoRaWAN backhaul" },
  { id: "ALT-2042", title: "Satellitlag mangler ny opdatering", severity: "medium" as Severity, project: "Urban Biodiversity Corridor Copenhagen", source: "Sentinel-2 NDVI", type: "Data gap", first: "I går 22:00", last: "I dag 10:00", status: "Under arbejde", owner: "Emma Larsen", action: "Vent på næste overflight om 36 timer" },
  { id: "ALT-2043", title: "CSV-import for Scope 3 transport fejlede", severity: "critical" as Severity, project: "Skallebæk Biodiversity Pilot", source: "Scope 3 transport CSV", type: "Failed sync", first: "I dag 08:02", last: "I dag 08:02", status: "Åben", owner: "Emma Larsen", action: "Validér kolonnenavne og enheder" },
  { id: "ALT-2044", title: "Drone upload mangler geotags", severity: "medium" as Severity, project: "Danish Wetland Restoration", source: "Drone overflight Q2", type: "Invalid metadata", first: "For 2 dage siden", last: "I dag 07:30", status: "Åben", owner: "Mikkel Holm", action: "Re-eksportér med EXIF GPS aktiveret" },
  { id: "ALT-2045", title: "Vandmåler Zone 3 sender uregelmæssige værdier", severity: "medium" as Severity, project: "Urban Water Quality Program", source: "URB-WQ-12", type: "Outlier detected", first: "I dag 06:18", last: "I dag 11:50", status: "Åben", owner: "Mikkel Holm", action: "Planlæg sensor-kalibrering" },
  { id: "ALT-2046", title: "Camera trap batteri lavt", severity: "low" as Severity, project: "Danish Wetland Restoration", source: "WET-CAM-02", type: "Low battery", first: "I dag 04:00", last: "I dag 11:00", status: "Åben", owner: "Mikkel Holm", action: "Udskift batteri inden for 5 dage" },
  { id: "ALT-2047", title: "Token udløber for Airtable", severity: "low" as Severity, project: "—", source: "Airtable", type: "Expiring token", first: "I dag 00:00", last: "I dag 11:00", status: "Åben", owner: "Jesper Riel", action: "Forny OAuth token" },
];

export const LIVE_OBSERVATIONS = [
  { ts: "11:52:14", source: "SKB-WQ-01", project: "Skallebæk Biodiversity Pilot", zone: "Zone A", measurement: "pH", value: "7,4", unit: "", status: "valid", quality: 96, routedTo: ["DecisionsIQ", "ESG Ledger"] },
  { ts: "11:51:58", source: "MNG-WATER-07", project: "Mangrove Restoration Indonesia", zone: "Zone A", measurement: "Vandstand", value: "48", unit: "cm", status: "valid", quality: 90, routedTo: ["Impact Exchange"] },
  { ts: "11:51:30", source: "Sentinel-2 NDVI", project: "Urban Biodiversity Corridor Copenhagen", zone: "Zone C", measurement: "NDVI", value: "0,71", unit: "", status: "valid", quality: 88, routedTo: ["DecisionsIQ", "Impact Exchange"] },
  { ts: "11:50:12", source: "Field App", project: "Skallebæk Biodiversity Pilot", zone: "Zone B", measurement: "Artsregistrering", value: "Sumphøne", unit: "", status: "review", quality: 70, routedTo: ["Impact Exchange"] },
  { ts: "11:49:44", source: "SKB-SOIL-02", project: "Skallebæk Biodiversity Pilot", zone: "Zone B", measurement: "Jordfugtighed", value: "28", unit: "%", status: "valid", quality: 92, routedTo: ["DecisionsIQ"] },
  { ts: "11:48:07", source: "ERP API", project: "Urban Water Quality Program", zone: "—", measurement: "CO₂e", value: "1.204", unit: "kg", status: "valid", quality: 94, routedTo: ["ESG Ledger", "Reports"] },
  { ts: "11:47:31", source: "Drone overflight Q2", project: "Danish Wetland Restoration", zone: "Zone D", measurement: "Drone coverage", value: "12,4", unit: "ha", status: "blocked", quality: 0, routedTo: [] },
  { ts: "11:46:09", source: "NOR-ACOUSTIC-01", project: "Nordic Coastal Restoration", zone: "Zone A", measurement: "Lydaktivitet", value: "64", unit: "idx", status: "valid", quality: 95, routedTo: ["Impact Exchange"] },
  { ts: "11:44:50", source: "URB-AIR-04", project: "Urban Biodiversity Corridor Copenhagen", zone: "Zone C", measurement: "Luftfugtighed", value: "62", unit: "%", status: "valid", quality: 84, routedTo: ["DecisionsIQ"] },
  { ts: "11:43:18", source: "AGR-WEATHER-01", project: "Regenerative Agriculture Kenya", zone: "Zone B", measurement: "Temperatur", value: "21,2", unit: "°C", status: "valid", quality: 97, routedTo: ["DecisionsIQ", "ESG Ledger"] },
];

export const QUALITY_DIMENSIONS = [
  { name: "Completeness", score: 87, trend: +2, why: "8 datakilder mangler felter", action: "Udfyld manglende metadata på Scope 3 CSV" },
  { name: "Freshness", score: 94, trend: +1, why: "Gennemsnitlig sync under 10 min", action: "Hold MQTT-broker på autoscale" },
  { name: "Consistency", score: 89, trend: 0, why: "Enheder afviger lejlighedsvist", action: "Tilføj enhedsvalidering på vandmålere" },
  { name: "Accuracy", score: 90, trend: +3, why: "Lav fejlrate på sensorer", action: "Planlæg kalibrering hver 6. måned" },
  { name: "Traceability", score: 96, trend: +1, why: "Audit log dækker 96% af events", action: "Aktivér audit på manuelle uploads" },
  { name: "Verification", score: 82, trend: -2, why: "Felt- og droneuploads mangler signatur", action: "Aktivér tredjepartsverifikation" },
  { name: "Geospatial validity", score: 88, trend: +1, why: "Drone-uploads mangler EXIF GPS", action: "Tving geotag i Field-app" },
  { name: "Metadata quality", score: 79, trend: -1, why: "Manglende sensor calibration noter", action: "Krav metadata på upload" },
];

export const VALIDATION_RULES = [
  "Required timestamp", "Required location", "Unit validation", "Range check",
  "Duplicate detection", "Metadata required", "Source signature",
  "Manual review needed", "Outlier detection",
];

export const ZONES_DETAIL = [
  { name: "Zone A — Vandløb", area: "1,4 ha", sources: 6, quality: 94, lastObs: "2 min", biodiv: "Højt", risk: "Lav" },
  { name: "Zone B — Eng og vådområde", area: "3,2 ha", sources: 8, quality: 89, lastObs: "5 min", biodiv: "Medium", risk: "Lav" },
  { name: "Zone C — Skovkant", area: "1,9 ha", sources: 3, quality: 71, lastObs: "2 d", biodiv: "Medium", risk: "Medium" },
  { name: "Zone D — Bufferområde", area: "0,8 ha", sources: 2, quality: 76, lastObs: "45 min", biodiv: "Lav", risk: "Medium" },
];
