// Mock data layer for Impact Exchange.
// Structure mirrors planned Supabase tables:
// impact_projects, project_categories, project_metrics, project_data_sources,
// verification_records, organizations, portfolios, portfolio_projects,
// impact_assets, credit_transactions, impact_reports, audit_logs.

export type Category =
  | "Skov & natur"
  | "Biodiversitet"
  | "Klimaprojekter"
  | "Jord & landbrug"
  | "Vand & hav"
  | "Bynatur"
  | "Vådområder"
  | "Energiomstilling";

export type VerificationStatus = "Verificeret" | "Under verifikation" | "Planlagt";
export type RiskLevel = "Lav" | "Medium" | "Høj";
export type ReportingStatus = "Rapportklar" | "Delvist klar" | "Ikke klar";

export type ImpactProject = {
  id: string;
  title: string;
  country: string;
  region: string;
  location: string;
  category: Category;
  natureType: string;
  description: string;
  verification: VerificationStatus;
  verifier: string;
  standard: string;
  co2ePotential: number; // ton CO2e
  co2eReduced: number;
  biodiversityIndex: number; // 0-100
  hectares: number;
  hectaresProtected: number;
  hectaresRestored: number;
  dataQuality: number; // 0-100
  risk: RiskLevel;
  pricePerUnit: number; // DKK pr ton CO2e or BU
  reporting: ReportingStatus;
  documentationLevel: number; // 0-100
  provider: string;
  ledgerId: string;
  image: string; // gradient seed
  coords: { x: number; y: number }; // 0-100 for fake map placement
  lastReview: string;
  nextReview: string;
};

const G = (h: number, s: number) =>
  `linear-gradient(135deg, oklch(0.78 0.12 ${h}), oklch(0.55 0.16 ${h + s}))`;

export const PROJECTS: ImpactProject[] = [
  {
    id: "nordic-coastal",
    title: "Nordic Coastal Restoration",
    country: "Danmark",
    region: "Nordeuropa",
    location: "Limfjorden",
    category: "Vand & hav",
    natureType: "Kystnært økosystem",
    description:
      "Storskala genopretning af tang- og ålegræsenge langs den danske kyststrækning for at styrke marin biodiversitet og blå CO₂-binding.",
    verification: "Verificeret",
    verifier: "DNV Verification",
    standard: "Verra VM0033 + intern Freyra-metode",
    co2ePotential: 248000,
    co2eReduced: 41200,
    biodiversityIndex: 82,
    hectares: 4200,
    hectaresProtected: 3100,
    hectaresRestored: 1100,
    dataQuality: 94,
    risk: "Lav",
    pricePerUnit: 165,
    reporting: "Rapportklar",
    documentationLevel: 92,
    provider: "Nordic Coastal Restoration Foundation",
    ledgerId: "FRY-LDG-1042",
    image: G(200, 20),
    coords: { x: 52, y: 28 },
    lastReview: "2026-03-12",
    nextReview: "2026-09-12",
  },
  {
    id: "skallebaek",
    title: "Skallebæk Biodiversity Pilot",
    country: "Danmark",
    region: "Nordeuropa",
    location: "Haderslev",
    category: "Biodiversitet",
    natureType: "Vandløb og eng",
    description:
      "Pilotprojekt for naturgenopretning langs Skallebæk med fokus på vandløbsbiodiversitet, vådområder og skovkant.",
    verification: "Under verifikation",
    verifier: "Bureau Veritas",
    standard: "EU Biodiversity Strategy + Freyra",
    co2ePotential: 1850,
    co2eReduced: 420,
    biodiversityIndex: 76,
    hectares: 18.4,
    hectaresProtected: 12.1,
    hectaresRestored: 6.3,
    dataQuality: 92,
    risk: "Lav",
    pricePerUnit: 220,
    reporting: "Delvist klar",
    documentationLevel: 78,
    provider: "Haderslev Kommune",
    ledgerId: "FRY-LDG-2087",
    image: G(140, 10),
    coords: { x: 51, y: 32 },
    lastReview: "2026-04-02",
    nextReview: "2026-10-02",
  },
  {
    id: "urban-water",
    title: "Urban Water Quality Program",
    country: "Danmark",
    region: "Nordeuropa",
    location: "København",
    category: "Bynatur",
    natureType: "Bynære vandløb",
    description:
      "Forbedring af vandkvalitet og biodiversitet i bynære vandløb og havne i Storkøbenhavn via sensorer og hydrologiske indgreb.",
    verification: "Verificeret",
    verifier: "Intertek",
    standard: "Freyra Water Method v1.2",
    co2ePotential: 3200,
    co2eReduced: 980,
    biodiversityIndex: 64,
    hectares: 86,
    hectaresProtected: 60,
    hectaresRestored: 26,
    dataQuality: 88,
    risk: "Medium",
    pricePerUnit: 140,
    reporting: "Rapportklar",
    documentationLevel: 84,
    provider: "Urban Water Authority",
    ledgerId: "FRY-LDG-3310",
    image: G(220, 10),
    coords: { x: 53, y: 30 },
    lastReview: "2026-02-20",
    nextReview: "2026-08-20",
  },
  {
    id: "regen-kenya",
    title: "Regenerative Agriculture Kenya",
    country: "Kenya",
    region: "Østafrika",
    location: "Rift Valley",
    category: "Jord & landbrug",
    natureType: "Regenerativt landbrugsareal",
    description:
      "Omlægning af landbrugsarealer til regenerativ praksis for at opbygge jordkulstof, øge biodiversitet og forbedre vandretention.",
    verification: "Verificeret",
    verifier: "Gold Standard",
    standard: "Gold Standard SDV + Freyra Agri",
    co2ePotential: 412000,
    co2eReduced: 88000,
    biodiversityIndex: 71,
    hectares: 9800,
    hectaresProtected: 0,
    hectaresRestored: 9800,
    dataQuality: 86,
    risk: "Medium",
    pricePerUnit: 95,
    reporting: "Rapportklar",
    documentationLevel: 88,
    provider: "Regenerative Agriculture Kenya",
    ledgerId: "FRY-LDG-4501",
    image: G(80, 20),
    coords: { x: 60, y: 60 },
    lastReview: "2026-01-30",
    nextReview: "2026-07-30",
  },
  {
    id: "amazonas",
    title: "Amazonas Forest Protection",
    country: "Brasilien",
    region: "Sydamerika",
    location: "Pará",
    category: "Skov & natur",
    natureType: "Tropisk regnskov",
    description:
      "Beskyttelse af 28.000 ha urørt regnskov i Pará gennem REDD+ rammeværk, satellitovervågning og lokale forvaltningsaftaler.",
    verification: "Verificeret",
    verifier: "Verra",
    standard: "Verra VCS + REDD+",
    co2ePotential: 685000,
    co2eReduced: 154000,
    biodiversityIndex: 92,
    hectares: 28400,
    hectaresProtected: 28400,
    hectaresRestored: 0,
    dataQuality: 90,
    risk: "Medium",
    pricePerUnit: 110,
    reporting: "Rapportklar",
    documentationLevel: 95,
    provider: "Amazonas Forest Alliance",
    ledgerId: "FRY-LDG-5120",
    image: G(150, 5),
    coords: { x: 32, y: 60 },
    lastReview: "2026-03-01",
    nextReview: "2026-09-01",
  },
  {
    id: "mangrove-id",
    title: "Mangrove Restoration Indonesia",
    country: "Indonesien",
    region: "Sydøstasien",
    location: "Sumatra",
    category: "Vådområder",
    natureType: "Mangroveskov",
    description:
      "Genplantning og beskyttelse af mangroveskove langs Sumatras kyst — kritisk for kystsikring, blå CO₂ og fiskeriets fødekæde.",
    verification: "Verificeret",
    verifier: "Plan Vivo",
    standard: "Plan Vivo + Blue Carbon",
    co2ePotential: 312000,
    co2eReduced: 64000,
    biodiversityIndex: 87,
    hectares: 6400,
    hectaresProtected: 4200,
    hectaresRestored: 2200,
    dataQuality: 84,
    risk: "Medium",
    pricePerUnit: 130,
    reporting: "Rapportklar",
    documentationLevel: 86,
    provider: "Mangrove Restoration Indonesia",
    ledgerId: "FRY-LDG-6088",
    image: G(170, 10),
    coords: { x: 78, y: 60 },
    lastReview: "2026-02-12",
    nextReview: "2026-08-12",
  },
  {
    id: "wind-india",
    title: "Wind Community Transition India",
    country: "Indien",
    region: "Sydasien",
    location: "Tamil Nadu",
    category: "Energiomstilling",
    natureType: "Vind- og lokalsamfundsprojekt",
    description:
      "Lokalt forankret vindkraftprojekt med fokus på CO₂-fortrængning og social bæredygtighed i landdistrikter.",
    verification: "Verificeret",
    verifier: "Gold Standard",
    standard: "Gold Standard for Global Goals",
    co2ePotential: 540000,
    co2eReduced: 198000,
    biodiversityIndex: 48,
    hectares: 1200,
    hectaresProtected: 0,
    hectaresRestored: 0,
    dataQuality: 89,
    risk: "Lav",
    pricePerUnit: 78,
    reporting: "Rapportklar",
    documentationLevel: 90,
    provider: "Tamil Nadu Wind Cooperative",
    ledgerId: "FRY-LDG-7042",
    image: G(245, 10),
    coords: { x: 70, y: 55 },
    lastReview: "2026-03-20",
    nextReview: "2026-09-20",
  },
  {
    id: "danish-wetland",
    title: "Danish Wetland Restoration",
    country: "Danmark",
    region: "Nordeuropa",
    location: "Vestjylland",
    category: "Vådområder",
    natureType: "Lavbund og vådområde",
    description:
      "Genvådning af lavbundsjorde i Vestjylland for at reducere CO₂-udledning fra dyrket tørvejord og styrke biodiversitet.",
    verification: "Under verifikation",
    verifier: "DNV Verification",
    standard: "Freyra Wetland v2 + ESRS E4",
    co2ePotential: 92000,
    co2eReduced: 14000,
    biodiversityIndex: 79,
    hectares: 1850,
    hectaresProtected: 1100,
    hectaresRestored: 750,
    dataQuality: 81,
    risk: "Medium",
    pricePerUnit: 175,
    reporting: "Delvist klar",
    documentationLevel: 72,
    provider: "Naturstyrelsen Vest",
    ledgerId: "FRY-LDG-8004",
    image: G(160, 15),
    coords: { x: 51, y: 30 },
    lastReview: "2026-04-08",
    nextReview: "2026-10-08",
  },
  {
    id: "baltic-nutrient",
    title: "Baltic Sea Nutrient Reduction",
    country: "Sverige/Danmark",
    region: "Nordeuropa",
    location: "Østersøen",
    category: "Vand & hav",
    natureType: "Marint økosystem",
    description:
      "Tværnationalt program til at reducere kvælstof- og fosfortilførsel til Østersøen og genoprette marin biodiversitet.",
    verification: "Planlagt",
    verifier: "HELCOM-aligned partner",
    standard: "HELCOM + Freyra Marine",
    co2ePotential: 45000,
    co2eReduced: 0,
    biodiversityIndex: 58,
    hectares: 12000,
    hectaresProtected: 8500,
    hectaresRestored: 0,
    dataQuality: 70,
    risk: "Høj",
    pricePerUnit: 190,
    reporting: "Ikke klar",
    documentationLevel: 55,
    provider: "Baltic Marine Alliance",
    ledgerId: "FRY-LDG-9011",
    image: G(210, 5),
    coords: { x: 55, y: 28 },
    lastReview: "2026-01-15",
    nextReview: "2026-07-15",
  },
  {
    id: "urban-corridor-cph",
    title: "Urban Biodiversity Corridor Copenhagen",
    country: "Danmark",
    region: "Nordeuropa",
    location: "København",
    category: "Bynatur",
    natureType: "Grøn bykorridor",
    description:
      "Sammenhængende grøn korridor gennem København, der forbinder parker, vådområder og kystlinje for at styrke bybiodiversitet.",
    verification: "Under verifikation",
    verifier: "Bureau Veritas",
    standard: "Freyra Urban Nature v1",
    co2ePotential: 6800,
    co2eReduced: 1200,
    biodiversityIndex: 68,
    hectares: 240,
    hectaresProtected: 160,
    hectaresRestored: 80,
    dataQuality: 83,
    risk: "Lav",
    pricePerUnit: 210,
    reporting: "Delvist klar",
    documentationLevel: 74,
    provider: "Københavns Kommune",
    ledgerId: "FRY-LDG-1180",
    image: G(120, 15),
    coords: { x: 53, y: 29 },
    lastReview: "2026-03-25",
    nextReview: "2026-09-25",
  },
];

export const CATEGORIES: Category[] = [
  "Skov & natur",
  "Biodiversitet",
  "Klimaprojekter",
  "Jord & landbrug",
  "Vand & hav",
  "Bynatur",
  "Vådområder",
  "Energiomstilling",
];

// User's portfolio (mock state seed) — IDs of selected projects.
export const PORTFOLIO_SEED = [
  "nordic-coastal",
  "skallebaek",
  "amazonas",
  "regen-kenya",
  "mangrove-id",
  "danish-wetland",
];

export type Organization = {
  id: string;
  name: string;
  type:
    | "Projektudbyder"
    | "Køber/investor"
    | "Verifikationspartner"
    | "Kommune"
    | "NGO"
    | "Virksomhed";
  country: string;
  projects: number;
  role: string;
  portfolioSize: string;
  contactStatus: "Aktiv" | "Pending" | "Inaktiv";
  trust: number; // 0-100
  description: string;
  contact: string;
};

export const ORGANIZATIONS: Organization[] = [
  {
    id: "freyra-demo",
    name: "Freyra Demo",
    type: "Virksomhed",
    country: "Danmark",
    projects: 6,
    role: "Køber & rapportering",
    portfolioSize: "245.000 t CO₂e",
    contactStatus: "Aktiv",
    trust: 96,
    description:
      "Demoorganisation der bruger Impact Exchange til at sammensætte og dokumentere en blandet impact-portefølje.",
    contact: "Jesper Riel · jesper@freyra.io",
  },
  {
    id: "haderslev",
    name: "Haderslev Kommune",
    type: "Kommune",
    country: "Danmark",
    projects: 2,
    role: "Projektejer",
    portfolioSize: "1.850 t CO₂e",
    contactStatus: "Aktiv",
    trust: 90,
    description: "Kommunal projektejer for Skallebæk Biodiversity Pilot og lokal naturgenopretning.",
    contact: "Anne Toft · natur@haderslev.dk",
  },
  {
    id: "nordic-foundation",
    name: "Nordic Coastal Restoration Foundation",
    type: "NGO",
    country: "Danmark",
    projects: 4,
    role: "Projektudbyder",
    portfolioSize: "248.000 t CO₂e",
    contactStatus: "Aktiv",
    trust: 94,
    description: "Non-profit organisation der genopretter kystnære økosystemer i Norden.",
    contact: "Lars Brink · contact@nordiccoastal.org",
  },
  {
    id: "amazon-alliance",
    name: "Amazonas Forest Alliance",
    type: "Projektudbyder",
    country: "Brasilien",
    projects: 7,
    role: "Projektudbyder",
    portfolioSize: "685.000 t CO₂e",
    contactStatus: "Aktiv",
    trust: 92,
    description:
      "Alliance der beskytter regnskov i Amazonas gennem REDD+ rammeværk og lokal forvaltning.",
    contact: "Maria Souza · m.souza@amazon-alliance.org",
  },
  {
    id: "mangrove-id-org",
    name: "Mangrove Restoration Indonesia",
    type: "Projektudbyder",
    country: "Indonesien",
    projects: 3,
    role: "Projektudbyder",
    portfolioSize: "312.000 t CO₂e",
    contactStatus: "Aktiv",
    trust: 88,
    description: "Organisation med fokus på blå CO₂ og kystsikring via mangrover.",
    contact: "Budi Santoso · b.santoso@mangrove-id.org",
  },
  {
    id: "urban-water-auth",
    name: "Urban Water Authority",
    type: "Kommune",
    country: "Danmark",
    projects: 2,
    role: "Projektejer",
    portfolioSize: "3.200 t CO₂e",
    contactStatus: "Aktiv",
    trust: 89,
    description: "Vandforsyning og kvalitetsovervågning for storkøbenhavnske områder.",
    contact: "Mette Lund · m.lund@uwa.dk",
  },
  {
    id: "regen-kenya-org",
    name: "Regenerative Agriculture Kenya",
    type: "Projektudbyder",
    country: "Kenya",
    projects: 5,
    role: "Projektudbyder",
    portfolioSize: "412.000 t CO₂e",
    contactStatus: "Aktiv",
    trust: 86,
    description:
      "Driver omlægning af landbrugsarealer i Rift Valley til regenerative praksis.",
    contact: "Wanjiku Kamau · w.kamau@regenkenya.org",
  },
  {
    id: "verifier-indep",
    name: "Independent Verification Partner",
    type: "Verifikationspartner",
    country: "EU",
    projects: 18,
    role: "Tredjepartsverifikation",
    portfolioSize: "—",
    contactStatus: "Aktiv",
    trust: 97,
    description:
      "Akkrediteret tredjepart der udfører revisioner, datakontrol og ESG-relaterede rammevurderinger.",
    contact: "audit@verifierpartner.eu",
  },
];

export type ImpactAsset = {
  id: string;
  projectId: string;
  type:
    | "CO₂-credit"
    | "Naturcredit"
    | "Biodiversitetscredit"
    | "Vandimpact"
    | "Habitat-enhed"
    | "Regenerativ landbrugsimpact";
  quantity: number;
  unit: string;
  vintage: number;
  status: "Tilgængelig" | "Reserveret" | "Købt" | "Under verifikation" | "Ikke rapportklar";
  verification: VerificationStatus;
  pricePerUnit: number;
  ledgerId: string;
};

export const ASSETS: ImpactAsset[] = [
  { id: "AST-1042-A", projectId: "nordic-coastal", type: "CO₂-credit", quantity: 4200, unit: "t CO₂e", vintage: 2025, status: "Tilgængelig", verification: "Verificeret", pricePerUnit: 165, ledgerId: "FRY-LDG-1042/A" },
  { id: "AST-2087-B", projectId: "skallebaek", type: "Biodiversitetscredit", quantity: 85, unit: "BU", vintage: 2025, status: "Reserveret", verification: "Under verifikation", pricePerUnit: 220, ledgerId: "FRY-LDG-2087/B" },
  { id: "AST-3310-C", projectId: "urban-water", type: "Vandimpact", quantity: 60, unit: "WQU", vintage: 2025, status: "Købt", verification: "Verificeret", pricePerUnit: 140, ledgerId: "FRY-LDG-3310/C" },
  { id: "AST-4501-D", projectId: "regen-kenya", type: "Regenerativ landbrugsimpact", quantity: 8800, unit: "t CO₂e", vintage: 2025, status: "Tilgængelig", verification: "Verificeret", pricePerUnit: 95, ledgerId: "FRY-LDG-4501/D" },
  { id: "AST-5120-E", projectId: "amazonas", type: "CO₂-credit", quantity: 15400, unit: "t CO₂e", vintage: 2024, status: "Tilgængelig", verification: "Verificeret", pricePerUnit: 110, ledgerId: "FRY-LDG-5120/E" },
  { id: "AST-6088-F", projectId: "mangrove-id", type: "Naturcredit", quantity: 6400, unit: "t CO₂e", vintage: 2025, status: "Reserveret", verification: "Verificeret", pricePerUnit: 130, ledgerId: "FRY-LDG-6088/F" },
  { id: "AST-7042-G", projectId: "wind-india", type: "CO₂-credit", quantity: 19800, unit: "t CO₂e", vintage: 2025, status: "Købt", verification: "Verificeret", pricePerUnit: 78, ledgerId: "FRY-LDG-7042/G" },
  { id: "AST-8004-H", projectId: "danish-wetland", type: "Habitat-enhed", quantity: 1400, unit: "ha", vintage: 2026, status: "Under verifikation", verification: "Under verifikation", pricePerUnit: 175, ledgerId: "FRY-LDG-8004/H" },
  { id: "AST-9011-I", projectId: "baltic-nutrient", type: "Vandimpact", quantity: 320, unit: "WQU", vintage: 2026, status: "Ikke rapportklar", verification: "Planlagt", pricePerUnit: 190, ledgerId: "FRY-LDG-9011/I" },
];

export const AUDIT_EVENTS = [
  { date: "2026-05-04", who: "Bureau Veritas", what: "Tredjepartsreview påbegyndt", project: "Skallebæk Biodiversity Pilot" },
  { date: "2026-05-02", who: "Sentinel-2 layer", what: "Satellitlag opdateret (vegetationsindeks)", project: "Amazonas Forest Protection" },
  { date: "2026-04-28", who: "AI risk monitor", what: "Risiko-flag gennemgået og lukket", project: "Urban Water Quality Program" },
  { date: "2026-04-22", who: "Feltteam DK-3", what: "Feltobservation tilføjet (12 arter)", project: "Skallebæk Biodiversity Pilot" },
  { date: "2026-04-18", who: "Freyra Reporting", what: "ESG-bilag genereret og signeret", project: "Nordic Coastal Restoration" },
];

export const REPORTS = [
  { id: "RPT-001", name: "ESG-bilag Q1 2026 — Samlet portefølje", type: "ESG-bilag", scope: "Portefølje", created: "2026-04-12", status: "Eksporteret", sentToLedger: true },
  { id: "RPT-002", name: "Projektfakta — Skallebæk Biodiversity Pilot", type: "Projektfakta", scope: "Skallebæk", created: "2026-04-08", status: "Klar", sentToLedger: false },
  { id: "RPT-003", name: "Verifikationsrapport — Nordic Coastal", type: "Verifikationsrapport", scope: "Nordic Coastal", created: "2026-03-30", status: "Under review", sentToLedger: false },
  { id: "RPT-004", name: "Ledelsesnotat — Q1 impact-resultater", type: "Ledelsesnotat", scope: "Portefølje", created: "2026-03-20", status: "Eksporteret", sentToLedger: true },
];

export function getProject(id: string) {
  return PROJECTS.find((p) => p.id === id) ?? null;
}
