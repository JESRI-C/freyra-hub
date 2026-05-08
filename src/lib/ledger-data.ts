// Mock data layer for ESG Ledger.
// Mirrors planned tables: esg_metrics, esg_metric_values, esg_categories,
// esrs_requirements, esrs_gap_items, carbon_accounts, emission_sources,
// emission_factors, data_sources, data_quality_checks, audit_logs,
// ledger_entries, documents, document_versions, report_templates,
// generated_reports, verification_records, approval_workflows.

export type Category =
  | "Klima"
  | "Energi"
  | "Vand"
  | "Affald"
  | "Natur"
  | "Biodiversitet"
  | "Social"
  | "Governance";

export type VerificationLevel = "Verificeret" | "Under verifikation" | "Ikke verificeret";
export type ReportingStatus = "Rapportklar" | "Delvist klar" | "Mangler data";

export type ESGMetric = {
  id: string;
  name: string;
  category: Category;
  value: number;
  unit: string;
  trendPct: number; // % vs prev period
  trendValues: number[];
  source: string;
  confidence: number; // 0-100
  verification: VerificationLevel;
  reporting: ReportingStatus;
  owner: string;
  definition: string;
  method: string;
  lastUpdated: string;
};

export const METRICS: ESGMetric[] = [
  {
    id: "co2-total",
    name: "Total CO₂e",
    category: "Klima",
    value: 41200,
    unit: "ton",
    trendPct: -8.4,
    trendValues: [48, 47, 46, 44, 43, 41],
    source: "GHG-modul + Smart Connect",
    confidence: 92,
    verification: "Verificeret",
    reporting: "Rapportklar",
    owner: "Emma Larsen",
    definition: "Samlet drivhusgasudledning på tværs af Scope 1, 2 og 3 målt i CO₂-ækvivalenter.",
    method: "GHG Protocol · activity × emission factor · operationel kontrol",
    lastUpdated: "2026-05-06 08:14",
  },
  {
    id: "scope1",
    name: "Scope 1 emissioner",
    category: "Klima",
    value: 6840,
    unit: "ton CO₂e",
    trendPct: -5.1,
    trendValues: [7.4, 7.3, 7.1, 7.0, 6.9, 6.84],
    source: "ERP brændstof + varme",
    confidence: 95,
    verification: "Verificeret",
    reporting: "Rapportklar",
    owner: "Mikkel Holm",
    definition: "Direkte emissioner fra ejede/kontrollerede kilder (brændstof, kølemidler, proces).",
    method: "GHG Protocol Scope 1 · DEFRA-faktorer 2025",
    lastUpdated: "2026-05-05 17:02",
  },
  {
    id: "scope2",
    name: "Scope 2 emissioner",
    category: "Klima",
    value: 8420,
    unit: "ton CO₂e",
    trendPct: -12.3,
    trendValues: [11, 10.5, 9.8, 9.2, 8.7, 8.42],
    source: "Energinet API + elleverandør",
    confidence: 90,
    verification: "Verificeret",
    reporting: "Rapportklar",
    owner: "Mikkel Holm",
    definition: "Indirekte emissioner fra indkøbt el, varme og køling — markedsbaseret metode.",
    method: "GHG Protocol Scope 2 · markedsbaseret · oprindelsescertifikater",
    lastUpdated: "2026-05-06 06:30",
  },
  {
    id: "scope3",
    name: "Scope 3 emissioner",
    category: "Klima",
    value: 25940,
    unit: "ton CO₂e",
    trendPct: -3.2,
    trendValues: [27, 27, 26.8, 26.5, 26.1, 25.94],
    source: "Leverandørdata + transport-API",
    confidence: 71,
    verification: "Under verifikation",
    reporting: "Delvist klar",
    owner: "Emma Larsen",
    definition: "Værdikædeemissioner — indkøbte varer, forretningsrejser, transport, affald m.fl.",
    method: "GHG Protocol Scope 3 · 9 ud af 15 kategorier",
    lastUpdated: "2026-05-04 11:18",
  },
  {
    id: "energy",
    name: "Energiforbrug",
    category: "Energi",
    value: 14820,
    unit: "MWh",
    trendPct: -6.8,
    trendValues: [16.2, 15.9, 15.4, 15.1, 14.9, 14.82],
    source: "Energinet API",
    confidence: 96,
    verification: "Verificeret",
    reporting: "Rapportklar",
    owner: "Mikkel Holm",
    definition: "Samlet energiforbrug fordelt på el, varme og brændstof.",
    method: "Direkte måling fra ERP og Energinet · timesopløsning",
    lastUpdated: "2026-05-06 06:00",
  },
  {
    id: "water",
    name: "Vandforbrug",
    category: "Vand",
    value: 38400,
    unit: "m³",
    trendPct: 2.1,
    trendValues: [36, 36.5, 37, 37.4, 37.9, 38.4],
    source: "Vandværk + sensor (zone 1-2)",
    confidence: 78,
    verification: "Under verifikation",
    reporting: "Delvist klar",
    owner: "Mikkel Holm",
    definition: "Forbrug af ferskvand på tværs af projekter og driftssteder.",
    method: "Tællerdata + sensor (zone 3 mangler opdatering)",
    lastUpdated: "2026-04-28 09:42",
  },
  {
    id: "waste",
    name: "Affald",
    category: "Affald",
    value: 412,
    unit: "ton",
    trendPct: -11.0,
    trendValues: [490, 470, 450, 430, 420, 412],
    source: "Affaldsregistrering ERP",
    confidence: 84,
    verification: "Verificeret",
    reporting: "Rapportklar",
    owner: "Jesper Riel",
    definition: "Samlet affald opdelt på fraktion (genanvendelse, forbrænding, deponi, farligt).",
    method: "Vægt-baseret registrering · ekstern transportør",
    lastUpdated: "2026-05-02 14:10",
  },
  {
    id: "bio-index",
    name: "Biodiversitetsindeks",
    category: "Biodiversitet",
    value: 78,
    unit: "/100",
    trendPct: 6.4,
    trendValues: [70, 72, 73, 75, 76, 78],
    source: "Felt + satellit + Impact Exchange",
    confidence: 81,
    verification: "Under verifikation",
    reporting: "Delvist klar",
    owner: "Emma Larsen",
    definition: "Vægtet score for artsrigdom, indikatorarter og habitatkvalitet.",
    method: "Freyra Biodiversity Index v1.4 · krydsvalideret med Sentinel-2",
    lastUpdated: "2026-04-30 11:25",
  },
  {
    id: "nature-impact",
    name: "Naturimpact score",
    category: "Natur",
    value: 71,
    unit: "/100",
    trendPct: 4.1,
    trendValues: [62, 65, 67, 69, 70, 71],
    source: "Impact Exchange-portefølje",
    confidence: 79,
    verification: "Verificeret",
    reporting: "Delvist klar",
    owner: "Emma Larsen",
    definition: "Aggregeret naturimpact fra verificerede projekter i porteføljen.",
    method: "Vægtet indeks · areal × tilstandsforbedring × verifikationsfaktor",
    lastUpdated: "2026-05-05 09:00",
  },
  {
    id: "data-coverage",
    name: "Datadækning",
    category: "Governance",
    value: 91,
    unit: "%",
    trendPct: 3.0,
    trendValues: [82, 85, 87, 88, 90, 91],
    source: "Smart Connect",
    confidence: 95,
    verification: "Verificeret",
    reporting: "Rapportklar",
    owner: "Mikkel Holm",
    definition: "Andel af krævede datapunkter med aktiv datakilde.",
    method: "Mapping mod ESRS-datapunkter",
    lastUpdated: "2026-05-06 07:55",
  },
  {
    id: "verif-level",
    name: "Verifikationsniveau",
    category: "Governance",
    value: 74,
    unit: "%",
    trendPct: 5.5,
    trendValues: [60, 64, 67, 70, 72, 74],
    source: "Verifikationspartnere",
    confidence: 88,
    verification: "Verificeret",
    reporting: "Rapportklar",
    owner: "Jesper Riel",
    definition: "Andel af nøgledatapunkter dokumenteret af tredjepart.",
    method: "Optælling af verificerede ledger-poster ÷ samlet",
    lastUpdated: "2026-05-06 07:55",
  },
];

export type ESRSCategory = {
  id: string;
  code: string;
  name: string;
  coverage: number;
  missing: number;
  documentation: number;
  priority: "Høj" | "Medium" | "Lav";
  owner: string;
  deadline: string;
};

export const ESRS_CATEGORIES: ESRSCategory[] = [
  { id: "e1", code: "ESRS E1", name: "Klima", coverage: 88, missing: 4, documentation: 92, priority: "Høj", owner: "Emma Larsen", deadline: "2026-06-30" },
  { id: "e2", code: "ESRS E2", name: "Forurening", coverage: 62, missing: 9, documentation: 70, priority: "Medium", owner: "Mikkel Holm", deadline: "2026-07-15" },
  { id: "e3", code: "ESRS E3", name: "Vand & marine ressourcer", coverage: 71, missing: 6, documentation: 74, priority: "Høj", owner: "Mikkel Holm", deadline: "2026-06-30" },
  { id: "e4", code: "ESRS E4", name: "Biodiversitet & økosystemer", coverage: 58, missing: 11, documentation: 64, priority: "Høj", owner: "Emma Larsen", deadline: "2026-07-30" },
  { id: "e5", code: "ESRS E5", name: "Ressourceforbrug & cirkulær økonomi", coverage: 66, missing: 7, documentation: 68, priority: "Medium", owner: "Jesper Riel", deadline: "2026-08-15" },
  { id: "g", code: "Governance", name: "Governance", coverage: 82, missing: 3, documentation: 85, priority: "Medium", owner: "Jesper Riel", deadline: "2026-09-01" },
  { id: "s", code: "Social", name: "Social", coverage: 74, missing: 5, documentation: 78, priority: "Lav", owner: "Emma Larsen", deadline: "2026-09-15" },
];

export type GapItem = {
  area: string;
  dataPoint: string;
  status: "Mangler" | "Delvist" | "Til review";
  evidence: string;
  source: string;
  priority: "Høj" | "Medium" | "Lav";
  owner: string;
  deadline: string;
};

export const GAPS: GapItem[] = [
  { area: "ESRS E1", dataPoint: "Scope 3 transportdata Q2", status: "Mangler", evidence: "Leverandøropgørelse mangler", source: "Transport-API", priority: "Høj", owner: "Emma Larsen", deadline: "2026-06-15" },
  { area: "ESRS E3", dataPoint: "Vandforbrug månedlig validering", status: "Delvist", evidence: "Sensor zone 3 offline", source: "Sensor LF-12", priority: "Høj", owner: "Mikkel Holm", deadline: "2026-06-01" },
  { area: "ESRS E4", dataPoint: "Naturimpact feltverifikation", status: "Til review", evidence: "Felt-rapport mangler", source: "DCE feltteam", priority: "Høj", owner: "Emma Larsen", deadline: "2026-07-10" },
  { area: "ESRS E5", dataPoint: "Affaldsfraktioner dokumentation", status: "Mangler", evidence: "Fraktionsopdeling mangler", source: "ERP affaldsmodul", priority: "Medium", owner: "Jesper Riel", deadline: "2026-07-15" },
  { area: "Governance", dataPoint: "Godkendelseslog ansvarlig", status: "Mangler", evidence: "Ingen owner tilknyttet", source: "Workflow-modul", priority: "Medium", owner: "Jesper Riel", deadline: "2026-08-01" },
  { area: "ESRS E1", dataPoint: "Emissionsfaktor varme", status: "Til review", evidence: "Faktor fra 2023 — opdater", source: "DEFRA", priority: "Medium", owner: "Mikkel Holm", deadline: "2026-06-20" },
];

export type EmissionSource = {
  id: string;
  source: string;
  scope: 1 | 2 | 3;
  activity: number;
  unit: string;
  factor: number;
  factorUnit: string;
  co2e: number;
  method: string;
  quality: number;
  verification: VerificationLevel;
  status: "Aktiv" | "Mangler data" | "Under review";
};

export const EMISSION_SOURCES: EmissionSource[] = [
  { id: "diesel", source: "Diesel (firmabiler)", scope: 1, activity: 184000, unit: "liter", factor: 2.68, factorUnit: "kg CO₂e/L", co2e: 493, method: "Aktivitet × faktor", quality: 94, verification: "Verificeret", status: "Aktiv" },
  { id: "electricity", source: "Elektricitet", scope: 2, activity: 9420, unit: "MWh", factor: 142, factorUnit: "kg CO₂e/MWh", co2e: 1338, method: "Markedsbaseret", quality: 96, verification: "Verificeret", status: "Aktiv" },
  { id: "heating", source: "Fjernvarme", scope: 2, activity: 5400, unit: "MWh", factor: 71, factorUnit: "kg CO₂e/MWh", co2e: 383, method: "Lokationsbaseret", quality: 88, verification: "Under verifikation", status: "Under review" },
  { id: "travel", source: "Forretningsrejser", scope: 3, activity: 1.4, unit: "mio. pkm", factor: 96, factorUnit: "g CO₂e/pkm", co2e: 134, method: "DEFRA 2025", quality: 80, verification: "Verificeret", status: "Aktiv" },
  { id: "transport", source: "Transport (vej)", scope: 3, activity: 2.1, unit: "mio. tkm", factor: 62, factorUnit: "g CO₂e/tkm", co2e: 130, method: "DEFRA 2025", quality: 76, verification: "Under verifikation", status: "Aktiv" },
  { id: "purchased", source: "Indkøbte varer", scope: 3, activity: 24500, unit: "ton", factor: 0.94, factorUnit: "ton CO₂e/ton", co2e: 23030, method: "Spend-baseret + EPD'er", quality: 68, verification: "Under verifikation", status: "Mangler data" },
  { id: "waste", source: "Affald", scope: 3, activity: 412, unit: "ton", factor: 0.21, factorUnit: "ton CO₂e/ton", co2e: 87, method: "Fraktionsbaseret", quality: 82, verification: "Verificeret", status: "Aktiv" },
  { id: "land", source: "Arealanvendelse", scope: 1, activity: 1850, unit: "ha", factor: -1.4, factorUnit: "ton CO₂e/ha", co2e: -2590, method: "IPCC AFOLU", quality: 78, verification: "Under verifikation", status: "Aktiv" },
  { id: "offsets", source: "Verificerede projektreduktioner", scope: 3, activity: 41200, unit: "ton CO₂e", factor: -1, factorUnit: "—", co2e: -41200, method: "Impact Exchange", quality: 92, verification: "Verificeret", status: "Aktiv" },
];

export type DataSource = {
  id: string;
  name: string;
  type:
    | "Sensor"
    | "API"
    | "CSV upload"
    | "Manual entry"
    | "Satellit"
    | "Drone"
    | "ERP"
    | "Impact Exchange"
    | "Smart Connect"
    | "Tredjepartsverifikation";
  category: Category;
  project: string;
  lastSync: string;
  status: "Aktiv" | "Kræver handling" | "Offline";
  quality: number;
  verification: VerificationLevel;
  owner: string;
  metric: string;
  frequency: string;
  description: string;
};

export const DATA_SOURCES: DataSource[] = [
  { id: "ds-1", name: "Energinet API", type: "API", category: "Energi", project: "Freyra Demo", lastSync: "for 4 min", status: "Aktiv", quality: 96, verification: "Verificeret", owner: "Mikkel Holm", metric: "Energiforbrug", frequency: "Hver time", description: "Realtidsdata for elforbrug og oprindelsescertifikater fra Energinet." },
  { id: "ds-2", name: "ERP Brændstof", type: "ERP", category: "Klima", project: "Freyra Demo", lastSync: "i dag 06:14", status: "Aktiv", quality: 94, verification: "Verificeret", owner: "Mikkel Holm", metric: "Scope 1 emissioner", frequency: "Daglig", description: "Forbrug af brændstof for ejede køretøjer hentet fra ERP." },
  { id: "ds-3", name: "Sensor LF-12 (vand)", type: "Sensor", category: "Vand", project: "Urban Water Quality Program", lastSync: "12 dage siden", status: "Offline", quality: 64, verification: "Ikke verificeret", owner: "Mikkel Holm", metric: "Vandforbrug", frequency: "5 min", description: "Vandkvalitet og forbrug i zone 3 — sensor offline siden 24. april." },
  { id: "ds-4", name: "Sentinel-2", type: "Satellit", category: "Biodiversitet", project: "Skallebæk Biodiversity Pilot", lastSync: "i går", status: "Aktiv", quality: 88, verification: "Verificeret", owner: "Emma Larsen", metric: "Biodiversitetsindeks", frequency: "5 dage", description: "Vegetationsindeks og habitatklassificering fra Sentinel-2." },
  { id: "ds-5", name: "DCE feltregistrering", type: "Manual entry", category: "Biodiversitet", project: "Skallebæk Biodiversity Pilot", lastSync: "1 uge siden", status: "Aktiv", quality: 90, verification: "Verificeret", owner: "Emma Larsen", metric: "Biodiversitetsindeks", frequency: "Månedlig", description: "Manuelle artsobservationer fra DCE-feltteamet." },
  { id: "ds-6", name: "Impact Exchange feed", type: "Impact Exchange", category: "Natur", project: "Portefølje", lastSync: "for 2 timer", status: "Aktiv", quality: 92, verification: "Verificeret", owner: "Emma Larsen", metric: "Naturimpact score", frequency: "Hver time", description: "Verificerede impact-events fra Impact Exchange-projekter." },
  { id: "ds-7", name: "Affald CSV", type: "CSV upload", category: "Affald", project: "Freyra Demo", lastSync: "2 uger siden", status: "Kræver handling", quality: 78, verification: "Under verifikation", owner: "Jesper Riel", metric: "Affald", frequency: "Månedlig", description: "Månedlig CSV-fil fra affaldstransportør — fraktionsopdeling mangler." },
  { id: "ds-8", name: "Bureau Veritas review", type: "Tredjepartsverifikation", category: "Governance", project: "Skallebæk Biodiversity Pilot", lastSync: "for 3 dage", status: "Aktiv", quality: 95, verification: "Verificeret", owner: "Jesper Riel", metric: "Verifikationsniveau", frequency: "Halvårlig", description: "Tredjepartsverifikation fra Bureau Veritas — påbegyndt 4. maj." },
  { id: "ds-9", name: "Smart Connect (heat)", type: "Smart Connect", category: "Energi", project: "Freyra Demo", lastSync: "for 12 min", status: "Aktiv", quality: 91, verification: "Verificeret", owner: "Mikkel Holm", metric: "Energiforbrug", frequency: "15 min", description: "Smart Connect-integration til varmeforbrug på driftssteder." },
  { id: "ds-10", name: "Drone overflight (Q2)", type: "Drone", category: "Natur", project: "Nordic Coastal Restoration", lastSync: "for 3 dage", status: "Aktiv", quality: 84, verification: "Verificeret", owner: "Emma Larsen", metric: "Naturimpact score", frequency: "Kvartal", description: "Droneoptagelser og fotogrammetri fra Limfjorden Q2." },
  { id: "ds-11", name: "Transport-API (DSV)", type: "API", category: "Klima", project: "Freyra Demo", lastSync: "i går", status: "Kræver handling", quality: 71, verification: "Under verifikation", owner: "Emma Larsen", metric: "Scope 3 emissioner", frequency: "Daglig", description: "Transportdata fra DSV — Q2-data ikke fuldt synkroniseret." },
  { id: "ds-12", name: "DEFRA-faktorer 2025", type: "API", category: "Klima", project: "Freyra Demo", lastSync: "for 2 mdr", status: "Kræver handling", quality: 86, verification: "Under verifikation", owner: "Mikkel Holm", metric: "Total CO₂e", frequency: "Årlig", description: "Emissionsfaktorer fra DEFRA — kræver opdatering for varmeforbrug." },
];

export type LedgerEvent = {
  id: string;
  timestamp: string;
  user: string;
  type:
    | "Data tilføjet"
    | "Data ændret"
    | "Data valideret"
    | "Kilde synkroniseret"
    | "Rapport genereret"
    | "Dokument eksporteret"
    | "Verifikation tilføjet"
    | "AI-anbefaling accepteret"
    | "Impact Exchange-projekt tilføjet"
    | "Beslutningsnotat oprettet";
  description: string;
  related: string;
  ledgerId: string;
  status: "OK" | "Advarsel" | "Fejl";
  before?: string;
  after?: string;
  source?: string;
  document?: string;
};

export const LEDGER_EVENTS: LedgerEvent[] = [
  { id: "evt-001", timestamp: "2026-05-06 08:14", user: "System", type: "Kilde synkroniseret", description: "Energinet API hentede 24 timers elforbrug", related: "Energiforbrug", ledgerId: "FRY-LDG-EV-10412", status: "OK", source: "Energinet API" },
  { id: "evt-002", timestamp: "2026-05-06 07:55", user: "System", type: "Data valideret", description: "CO₂e-beregning krydsvalideret med markedsdata", related: "Total CO₂e", ledgerId: "FRY-LDG-EV-10411", status: "OK" },
  { id: "evt-003", timestamp: "2026-05-05 17:22", user: "Emma Larsen", type: "Impact Exchange-projekt tilføjet", description: "Skallebæk Biodiversity Pilot importeret som dokumentation", related: "Naturimpact score", ledgerId: "FRY-LDG-EV-10410", status: "OK", document: "Projektfakta — Skallebæk" },
  { id: "evt-004", timestamp: "2026-05-05 14:08", user: "Mikkel Holm", type: "Data ændret", description: "Emissionsfaktor opdateret for fjernvarme", related: "Scope 2 emissioner", ledgerId: "FRY-LDG-EV-10409", status: "OK", before: "98 kg CO₂e/MWh", after: "71 kg CO₂e/MWh", source: "DEFRA 2025" },
  { id: "evt-005", timestamp: "2026-05-05 11:40", user: "Bureau Veritas", type: "Verifikation tilføjet", description: "Tredjepartsreview påbegyndt for Skallebæk", related: "Verifikationsniveau", ledgerId: "FRY-LDG-EV-10408", status: "OK", document: "Verifikationsnote — Bureau Veritas" },
  { id: "evt-006", timestamp: "2026-05-04 09:12", user: "DecisionsIQ", type: "AI-anbefaling accepteret", description: "Anbefaling: opdater emissionsfaktor for varme", related: "Scope 2 emissioner", ledgerId: "FRY-LDG-EV-10407", status: "OK" },
  { id: "evt-007", timestamp: "2026-05-03 16:30", user: "Emma Larsen", type: "Rapport genereret", description: "ESG-bilag Q1 2026 (udkast)", related: "Rapportering", ledgerId: "FRY-LDG-EV-10406", status: "OK", document: "ESG-bilag Q1 2026" },
  { id: "evt-008", timestamp: "2026-05-02 14:11", user: "System", type: "Data tilføjet", description: "Affald CSV uploadet — 412 ton registreret", related: "Affald", ledgerId: "FRY-LDG-EV-10405", status: "Advarsel", source: "Affald CSV" },
  { id: "evt-009", timestamp: "2026-05-02 09:00", user: "Mikkel Holm", type: "Dokument eksporteret", description: "CO₂-bilag eksporteret som PDF", related: "Dokumenter", ledgerId: "FRY-LDG-EV-10404", status: "OK", document: "CO₂-bilag Q1 2026" },
  { id: "evt-010", timestamp: "2026-04-30 11:25", user: "DecisionsIQ", type: "Data valideret", description: "Datamangel markeret: Sensor LF-12 offline", related: "Vandforbrug", ledgerId: "FRY-LDG-EV-10403", status: "Advarsel", source: "Sensor LF-12" },
  { id: "evt-011", timestamp: "2026-04-29 13:48", user: "Jesper Riel", type: "Beslutningsnotat oprettet", description: "Q1-notat til ledelsen — fokus på Scope 3", related: "DecisionsIQ", ledgerId: "FRY-LDG-EV-10402", status: "OK", document: "Beslutningsnotat Q1" },
  { id: "evt-012", timestamp: "2026-04-28 10:02", user: "System", type: "Kilde synkroniseret", description: "Sentinel-2 vegetationslag opdateret", related: "Biodiversitetsindeks", ledgerId: "FRY-LDG-EV-10401", status: "OK", source: "Sentinel-2" },
];

export type LedgerDocument = {
  id: string;
  name: string;
  type:
    | "ESG-rapport"
    | "CO₂-bilag"
    | "Impact-bilag"
    | "Verifikationsnote"
    | "Datametode"
    | "Audit trail extract"
    | "Projektfakta"
    | "Feltdata"
    | "Revisionspakke";
  project: string;
  metric: string;
  created: string;
  status: "Draft" | "Intern review" | "Klar til godkendelse" | "Godkendt" | "Sendt til rapport" | "Arkiveret";
  owner: string;
  version: string;
  usedIn: string;
};

export const DOCUMENTS: LedgerDocument[] = [
  { id: "doc-1", name: "ESG-bilag Q1 2026", type: "ESG-rapport", project: "Portefølje", metric: "Total CO₂e", created: "2026-05-03", status: "Intern review", owner: "Emma Larsen", version: "v1.2", usedIn: "Bestyrelsesmøde maj" },
  { id: "doc-2", name: "CO₂-bilag Q1 2026", type: "CO₂-bilag", project: "Freyra Demo", metric: "Scope 1-3", created: "2026-05-02", status: "Godkendt", owner: "Mikkel Holm", version: "v1.0", usedIn: "ESG-bilag Q1 2026" },
  { id: "doc-3", name: "Projektfakta — Skallebæk", type: "Projektfakta", project: "Skallebæk Biodiversity Pilot", metric: "Biodiversitetsindeks", created: "2026-04-28", status: "Godkendt", owner: "Emma Larsen", version: "v2.1", usedIn: "Impact-bilag Q1" },
  { id: "doc-4", name: "Verifikationsnote — Bureau Veritas", type: "Verifikationsnote", project: "Skallebæk Biodiversity Pilot", metric: "Verifikationsniveau", created: "2026-05-05", status: "Klar til godkendelse", owner: "Jesper Riel", version: "v1.0", usedIn: "—" },
  { id: "doc-5", name: "Datametode v1.3", type: "Datametode", project: "Portefølje", metric: "Datakvalitet", created: "2026-04-12", status: "Godkendt", owner: "Mikkel Holm", version: "v1.3", usedIn: "Alle rapporter" },
  { id: "doc-6", name: "Audit trail extract — april", type: "Audit trail extract", project: "Freyra Demo", metric: "Audit", created: "2026-05-01", status: "Sendt til rapport", owner: "Jesper Riel", version: "v1.0", usedIn: "Revisionspakke" },
  { id: "doc-7", name: "Feltdata — Skallebæk Q2", type: "Feltdata", project: "Skallebæk Biodiversity Pilot", metric: "Biodiversitetsindeks", created: "2026-04-22", status: "Draft", owner: "Emma Larsen", version: "v0.4", usedIn: "—" },
  { id: "doc-8", name: "Revisionspakke 2026", type: "Revisionspakke", project: "Portefølje", metric: "—", created: "2026-04-30", status: "Klar til godkendelse", owner: "Jesper Riel", version: "v0.9", usedIn: "Ekstern revisor" },
  { id: "doc-9", name: "Impact-bilag Q1", type: "Impact-bilag", project: "Portefølje", metric: "Naturimpact", created: "2026-04-25", status: "Godkendt", owner: "Emma Larsen", version: "v1.1", usedIn: "ESG-bilag Q1 2026" },
];

export const SAVED_REPORTS = [
  { id: "RPT-101", name: "ESG-overblik Q1 2026", type: "ESG-overblik", project: "Portefølje", period: "Q1 2026", created: "2026-04-30", status: "Eksporteret", sentTo: "Bestyrelse" },
  { id: "RPT-102", name: "CSRD/ESRS readiness — maj", type: "CSRD/ESRS readiness", project: "Freyra Demo", period: "Maj 2026", created: "2026-05-04", status: "Klar", sentTo: "ESG-team" },
  { id: "RPT-103", name: "CO₂-bilag Q1 2026", type: "CO₂-bilag", project: "Freyra Demo", period: "Q1 2026", created: "2026-05-02", status: "Eksporteret", sentTo: "Revisor" },
  { id: "RPT-104", name: "Naturimpact-bilag Q1", type: "Naturimpact-bilag", project: "Portefølje", period: "Q1 2026", created: "2026-04-25", status: "Eksporteret", sentTo: "Investor" },
  { id: "RPT-105", name: "Revisionspakke 2026", type: "Revisionspakke", project: "Portefølje", period: "2026", created: "2026-04-30", status: "Under review", sentTo: "Ekstern revisor" },
];

export function getMetric(id: string) {
  return METRICS.find((m) => m.id === id) ?? null;
}
export function getSource(id: string) {
  return DATA_SOURCES.find((s) => s.id === id) ?? null;
}
export function getEvent(id: string) {
  return LEDGER_EVENTS.find((e) => e.id === id) ?? null;
}
