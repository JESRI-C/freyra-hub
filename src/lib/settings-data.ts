// Settings/Admin mock data — replace with Supabase later.

export const ORG_PROFILE = {
  name: "Freyra Demo",
  cvr: "DK 42 88 17 03",
  industry: "Sustainability technology",
  country: "Danmark",
  address: "Havnegade 12, 1058 København K",
  mainContact: "Jesper Riel · jesper@freyra.io",
  esgContact: "Sofie Berg · sofie@freyra.io",
  reportingPeriod: "1. januar – 31. december",
  reportingYear: "2026",
  language: "Dansk",
  currency: "DKK",
  timezone: "Europe/Copenhagen",
};

export const ORGANIZATIONS = [
  "Freyra Demo",
  "Haderslev Kommune",
  "Nordic Coastal Restoration Foundation",
  "Urban Water Authority",
  "Regenerative Agriculture Kenya",
];

export type AdminProject = {
  id: string;
  name: string;
  type: string;
  location: string;
  owner: string;
  status: "Aktiv" | "Pause" | "Planlægning" | "Afsluttet";
  dataQuality: number;
  sources: number;
  modules: string[];
  readiness: number;
  updated: string;
  description: string;
  area: string;
};

export const PROJECTS: AdminProject[] = [
  {
    id: "PRJ-1001",
    name: "Skallebæk Biodiversity Pilot",
    type: "Biodiversitet",
    location: "Haderslev, DK",
    owner: "Anna Fischer",
    status: "Aktiv",
    dataQuality: 91,
    sources: 18,
    modules: ["Smart Connect", "Impact Exchange", "ESG Ledger"],
    readiness: 82,
    updated: "2 t siden",
    description: "Genopretning af våd-eng og biodiversitet langs Skallebæk åløb.",
    area: "42 ha",
  },
  {
    id: "PRJ-1002",
    name: "Nordic Coastal Restoration",
    type: "Marin",
    location: "Limfjorden, DK",
    owner: "Emma Larsen",
    status: "Aktiv",
    dataQuality: 88,
    sources: 24,
    modules: ["Smart Connect", "Impact Exchange"],
    readiness: 76,
    updated: "I går",
    description: "Restaurering af kystnære habitater og ålegræs.",
    area: "210 ha",
  },
  {
    id: "PRJ-1003",
    name: "Urban Water Quality Program",
    type: "Vand",
    location: "København, DK",
    owner: "Mikkel Holm",
    status: "Aktiv",
    dataQuality: 94,
    sources: 32,
    modules: ["Smart Connect", "ESG Ledger"],
    readiness: 88,
    updated: "3 t siden",
    description: "Realtid-monitering af vandkvalitet i byens vandløb.",
    area: "—",
  },
  {
    id: "PRJ-1004",
    name: "Danish Wetland Restoration",
    type: "Vådområde",
    location: "Jylland, DK",
    owner: "Anna Fischer",
    status: "Planlægning",
    dataQuality: 62,
    sources: 6,
    modules: ["Impact Exchange"],
    readiness: 41,
    updated: "1 uge",
    description: "Genskabelse af vådområder med CO₂- og naturværdi.",
    area: "120 ha",
  },
  {
    id: "PRJ-1005",
    name: "Urban Biodiversity Corridor Copenhagen",
    type: "Biodiversitet",
    location: "København, DK",
    owner: "Sofie Berg",
    status: "Aktiv",
    dataQuality: 84,
    sources: 14,
    modules: ["Smart Connect", "Impact Exchange", "Reports"],
    readiness: 79,
    updated: "I går",
    description: "Sammenhængende grønne korridorer gennem byrum.",
    area: "38 ha",
  },
  {
    id: "PRJ-1006",
    name: "Mangrove Restoration Indonesia",
    type: "Marin",
    location: "Sulawesi, ID",
    owner: "Emma Larsen",
    status: "Aktiv",
    dataQuality: 81,
    sources: 12,
    modules: ["Impact Exchange", "ESG Ledger"],
    readiness: 86,
    updated: "5 dage",
    description: "Genplantning af mangrove med carbon- og fiskebestandseffekt.",
    area: "640 ha",
  },
  {
    id: "PRJ-1007",
    name: "Regenerative Agriculture Kenya",
    type: "Landbrug",
    location: "Nakuru, KE",
    owner: "Mikkel Holm",
    status: "Pause",
    dataQuality: 70,
    sources: 8,
    modules: ["Impact Exchange"],
    readiness: 58,
    updated: "2 uger",
    description: "Regenerativt landbrug og jordbundskulstof.",
    area: "1.250 ha",
  },
];

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  org: string;
  initials: string;
  projects: number;
  status: "Aktiv" | "Inviteret" | "Inaktiv";
  lastLogin: string;
  mfa: boolean;
};

export const USERS: AdminUser[] = [
  {
    id: "U-01",
    name: "Jesper Riel",
    email: "jesper@freyra.io",
    role: "Admin",
    org: "Freyra Demo",
    initials: "JR",
    projects: 7,
    status: "Aktiv",
    lastLogin: "I dag · 09:12",
    mfa: true,
  },
  {
    id: "U-02",
    name: "Emma Larsen",
    email: "emma@freyra.io",
    role: "Sustainability Manager",
    org: "Freyra Demo",
    initials: "EL",
    projects: 5,
    status: "Aktiv",
    lastLogin: "I dag · 08:42",
    mfa: true,
  },
  {
    id: "U-03",
    name: "Mikkel Holm",
    email: "mikkel@freyra.io",
    role: "Data Manager",
    org: "Freyra Demo",
    initials: "MH",
    projects: 6,
    status: "Aktiv",
    lastLogin: "I går · 17:21",
    mfa: true,
  },
  {
    id: "U-04",
    name: "Sofie Berg",
    email: "sofie@freyra.io",
    role: "ESG Lead",
    org: "Freyra Demo",
    initials: "SB",
    projects: 4,
    status: "Aktiv",
    lastLogin: "I går · 14:08",
    mfa: false,
  },
  {
    id: "U-05",
    name: "Thomas Nygaard",
    email: "thomas@revisor.dk",
    role: "Auditor",
    org: "Freyra Demo",
    initials: "TN",
    projects: 3,
    status: "Aktiv",
    lastLogin: "3 dage siden",
    mfa: true,
  },
  {
    id: "U-06",
    name: "Anna Fischer",
    email: "anna@haderslev.dk",
    role: "Project Owner",
    org: "Haderslev Kommune",
    initials: "AF",
    projects: 2,
    status: "Aktiv",
    lastLogin: "I dag · 07:55",
    mfa: true,
  },
  {
    id: "U-07",
    name: "Lars Olsen",
    email: "lars@partner.io",
    role: "Partner",
    org: "Nordic Coastal Restoration Foundation",
    initials: "LO",
    projects: 1,
    status: "Inviteret",
    lastLogin: "—",
    mfa: false,
  },
  {
    id: "U-08",
    name: "Rikke Lund",
    email: "rikke@freyra.io",
    role: "Viewer",
    org: "Freyra Demo",
    initials: "RL",
    projects: 7,
    status: "Aktiv",
    lastLogin: "1 uge",
    mfa: false,
  },
];

export const ROLES = [
  "Admin",
  "Sustainability Manager",
  "ESG Lead",
  "Data Manager",
  "Viewer",
  "Auditor",
  "Partner",
  "Project Owner",
];

export const PERMISSIONS = [
  "Se dashboard",
  "Redigér projekter",
  "Tilføj datakilder",
  "Validér data",
  "Brug DecisionsIQ",
  "Eksportér rapporter",
  "Godkend rapporter",
  "Se audit trail",
  "Administrér brugere",
  "Administrér abonnement",
  "API-adgang",
];

// matrix[role][permission] = "full" | "limited" | "none"
export const ROLE_MATRIX: Record<string, Record<string, "full" | "limited" | "none">> = {
  Admin: Object.fromEntries(PERMISSIONS.map((p) => [p, "full"])),
  "Sustainability Manager": {
    "Se dashboard": "full",
    "Redigér projekter": "full",
    "Tilføj datakilder": "full",
    "Validér data": "full",
    "Brug DecisionsIQ": "full",
    "Eksportér rapporter": "full",
    "Godkend rapporter": "limited",
    "Se audit trail": "full",
    "Administrér brugere": "limited",
    "Administrér abonnement": "none",
    "API-adgang": "limited",
  },
  "ESG Lead": {
    "Se dashboard": "full",
    "Redigér projekter": "limited",
    "Tilføj datakilder": "limited",
    "Validér data": "full",
    "Brug DecisionsIQ": "full",
    "Eksportér rapporter": "full",
    "Godkend rapporter": "full",
    "Se audit trail": "full",
    "Administrér brugere": "none",
    "Administrér abonnement": "none",
    "API-adgang": "none",
  },
  "Data Manager": {
    "Se dashboard": "full",
    "Redigér projekter": "limited",
    "Tilføj datakilder": "full",
    "Validér data": "full",
    "Brug DecisionsIQ": "limited",
    "Eksportér rapporter": "limited",
    "Godkend rapporter": "none",
    "Se audit trail": "full",
    "Administrér brugere": "none",
    "Administrér abonnement": "none",
    "API-adgang": "full",
  },
  Viewer: {
    "Se dashboard": "full",
    "Redigér projekter": "none",
    "Tilføj datakilder": "none",
    "Validér data": "none",
    "Brug DecisionsIQ": "limited",
    "Eksportér rapporter": "limited",
    "Godkend rapporter": "none",
    "Se audit trail": "limited",
    "Administrér brugere": "none",
    "Administrér abonnement": "none",
    "API-adgang": "none",
  },
  Auditor: {
    "Se dashboard": "full",
    "Redigér projekter": "none",
    "Tilføj datakilder": "none",
    "Validér data": "none",
    "Brug DecisionsIQ": "none",
    "Eksportér rapporter": "limited",
    "Godkend rapporter": "limited",
    "Se audit trail": "full",
    "Administrér brugere": "none",
    "Administrér abonnement": "none",
    "API-adgang": "none",
  },
  Partner: {
    "Se dashboard": "limited",
    "Redigér projekter": "none",
    "Tilføj datakilder": "none",
    "Validér data": "none",
    "Brug DecisionsIQ": "none",
    "Eksportér rapporter": "limited",
    "Godkend rapporter": "none",
    "Se audit trail": "none",
    "Administrér brugere": "none",
    "Administrér abonnement": "none",
    "API-adgang": "none",
  },
  "Project Owner": {
    "Se dashboard": "full",
    "Redigér projekter": "full",
    "Tilføj datakilder": "limited",
    "Validér data": "limited",
    "Brug DecisionsIQ": "full",
    "Eksportér rapporter": "full",
    "Godkend rapporter": "limited",
    "Se audit trail": "full",
    "Administrér brugere": "limited",
    "Administrér abonnement": "none",
    "API-adgang": "limited",
  },
};

export type ModuleStatus = "Aktiv" | "Begrænset" | "Ikke aktiv";

export const MODULES: {
  key: string;
  name: string;
  desc: string;
  status: ModuleStatus;
  users: number;
  data: string;
  usage: string;
  deps?: string[];
}[] = [
  {
    key: "decisions",
    name: "DecisionsIQ",
    desc: "AI-drevet beslutningsintelligens på tværs af risici, scenarier og handlinger.",
    status: "Aktiv",
    users: 12,
    data: "ESG Ledger, Smart Connect",
    usage: "238 kørsler / md.",
    deps: ["Smart Connect", "ESG Ledger"],
  },
  {
    key: "impact",
    name: "Impact Exchange",
    desc: "Marketplace og portefølje for verificeret natur- og klimaimpact.",
    status: "Aktiv",
    users: 9,
    data: "7 projekter, 3 verifiers",
    usage: "12 transaktioner / md.",
  },
  {
    key: "ledger",
    name: "ESG Ledger",
    desc: "Auditerbar dokumentations- og compliance-motor.",
    status: "Aktiv",
    users: 14,
    data: "248 metrics, 34 datakilder",
    usage: "1.482 events / md.",
  },
  {
    key: "connect",
    name: "Smart Connect",
    desc: "Datakilder, integrationer og IoT-operations.",
    status: "Aktiv",
    users: 8,
    data: "42 enheder, 18 integrationer",
    usage: "1.2M observationer / md.",
  },
  {
    key: "reports",
    name: "Reports",
    desc: "AI-assisteret rapportstudie til ESG og impact.",
    status: "Aktiv",
    users: 11,
    data: "24 rapporter",
    usage: "12 eksports / md.",
  },
  {
    key: "api",
    name: "API Access",
    desc: "Programmatisk adgang til data, metrics og rapporter.",
    status: "Begrænset",
    users: 3,
    data: "4 nøgler aktive",
    usage: "184k requests / md.",
  },
  {
    key: "verify",
    name: "Verification",
    desc: "Tredjepartsverifikation og signaturflow.",
    status: "Aktiv",
    users: 5,
    data: "DNV, Preferred by Nature",
    usage: "8 reviews / md.",
  },
  {
    key: "portfolio",
    name: "Portfolio Management",
    desc: "Aggregeret performance på tværs af projekter og porteføljer.",
    status: "Ikke aktiv",
    users: 0,
    data: "—",
    usage: "—",
  },
];

export const FRAMEWORKS = [
  {
    key: "csrd",
    name: "CSRD/ESRS readiness",
    desc: "Mapping og readiness mod ESRS E1–E5 og governance.",
    status: "Aktiv",
    projects: 6,
    data: "ESG-metrics, governance, CO₂",
    relevance: "Høj — krævet for EU-rapportering",
  },
  {
    key: "ghg",
    name: "GHG Protocol",
    desc: "Scope 1, 2 og 3 metodologi for klimaregnskab.",
    status: "Aktiv",
    projects: 7,
    data: "Energi, transport, leverandører",
    relevance: "Høj — fundament for CO₂-bilag",
  },
  {
    key: "sbtn",
    name: "SBTN",
    desc: "Science Based Targets for Nature — mål og baseline.",
    status: "Aktiv",
    projects: 4,
    data: "Biodiversitet, vand, areal",
    relevance: "Mellem — natur-rapportering",
  },
  {
    key: "biodiv",
    name: "Biodiversity indicators",
    desc: "Habitat-, art- og økosystem-indikatorer.",
    status: "Aktiv",
    projects: 5,
    data: "Smart Connect feltdata, satellitdata",
    relevance: "Høj — naturimpact",
  },
  {
    key: "internal",
    name: "Intern ESG-model",
    desc: "Freyras egen aggregerede ESG-score-model.",
    status: "Aktiv",
    projects: 7,
    data: "Alle ESG-metrics",
    relevance: "Mellem — internt overblik",
  },
  {
    key: "muni",
    name: "Kommunale naturmål",
    desc: "Mapping mod kommunens naturhandleplaner.",
    status: "Aktiv",
    projects: 3,
    data: "Areal, biodiversitet, vand",
    relevance: "Mellem — relevant for kommuner",
  },
  {
    key: "climate",
    name: "Climate accounting",
    desc: "Dansk klimaregnskab efter VE-DK metode.",
    status: "Begrænset",
    projects: 2,
    data: "Energi, varme, transport",
    relevance: "Lav — supplerende",
  },
  {
    key: "naturmeth",
    name: "Nature impact methodology",
    desc: "Verificeret naturimpact (Freyra v2.1).",
    status: "Aktiv",
    projects: 6,
    data: "Felt, satellit, drone",
    relevance: "Høj — kerne i Impact Exchange",
  },
];

export type AlertRule = {
  key: string;
  label: string;
  severity: "Lav" | "Middel" | "Høj";
  module: string;
  email: boolean;
  inApp: boolean;
  frequency: "Realtid" | "Time" | "Dag";
  recipients: string;
};

export const ALERT_RULES: AlertRule[] = [
  {
    key: "src-offline",
    label: "Datakilde offline",
    severity: "Høj",
    module: "Smart Connect",
    email: true,
    inApp: true,
    frequency: "Realtid",
    recipients: "Data Manager",
  },
  {
    key: "low-quality",
    label: "Lav datakvalitet",
    severity: "Middel",
    module: "Smart Connect",
    email: true,
    inApp: true,
    frequency: "Time",
    recipients: "Data Manager, ESG Lead",
  },
  {
    key: "review",
    label: "Rapport kræver review",
    severity: "Middel",
    module: "Reports",
    email: true,
    inApp: true,
    frequency: "Realtid",
    recipients: "Sustainability Manager",
  },
  {
    key: "ai-rec",
    label: "Ny AI-anbefaling",
    severity: "Lav",
    module: "DecisionsIQ",
    email: false,
    inApp: true,
    frequency: "Dag",
    recipients: "Hele teamet",
  },
  {
    key: "risk",
    label: "Høj risiko detekteret",
    severity: "Høj",
    module: "DecisionsIQ",
    email: true,
    inApp: true,
    frequency: "Realtid",
    recipients: "Admin, Sustainability Manager",
  },
  {
    key: "missing-esg",
    label: "Manglende ESG-data",
    severity: "Middel",
    module: "ESG Ledger",
    email: true,
    inApp: true,
    frequency: "Dag",
    recipients: "ESG Lead",
  },
  {
    key: "verify",
    label: "Verifikationsstatus ændret",
    severity: "Middel",
    module: "Impact Exchange",
    email: true,
    inApp: true,
    frequency: "Realtid",
    recipients: "Project Owner",
  },
  {
    key: "api-fail",
    label: "API-sync fejlede",
    severity: "Høj",
    module: "API",
    email: true,
    inApp: true,
    frequency: "Realtid",
    recipients: "Admin",
  },
  {
    key: "export",
    label: "Eksport gennemført",
    severity: "Lav",
    module: "Reports",
    email: false,
    inApp: true,
    frequency: "Realtid",
    recipients: "Ejer af rapport",
  },
];

export const API_KEYS = [
  {
    name: "Production · ingest",
    createdBy: "Jesper Riel",
    created: "12. mar. 2026",
    lastUsed: "8 min siden",
    scope: "ingest:write",
    status: "Aktiv",
  },
  {
    name: "Skallebæk · sensors",
    createdBy: "Mikkel Holm",
    created: "04. apr. 2026",
    lastUsed: "2 t siden",
    scope: "ingest:write",
    status: "Aktiv",
  },
  {
    name: "Reports · read",
    createdBy: "Emma Larsen",
    created: "21. apr. 2026",
    lastUsed: "I går",
    scope: "reports:read",
    status: "Aktiv",
  },
  {
    name: "Legacy export",
    createdBy: "Jesper Riel",
    created: "08. nov. 2025",
    lastUsed: "3 mdr siden",
    scope: "exports:read",
    status: "Udløbet",
  },
];

export const WEBHOOKS = [
  {
    name: "Slack — alerts",
    endpoint: "https://hooks.slack.com/services/T0…",
    event: "alerts.high",
    status: "Aktiv",
    lastDelivery: "12 min siden",
    errors: 0,
  },
  {
    name: "ERP — emissions",
    endpoint: "https://erp.freyra.io/webhooks/emissions",
    event: "ledger.entry",
    status: "Aktiv",
    lastDelivery: "2 t siden",
    errors: 0,
  },
  {
    name: "Auditor — exports",
    endpoint: "https://audit.partner.dk/in",
    event: "report.exported",
    status: "Aktiv",
    lastDelivery: "I går",
    errors: 0,
  },
  {
    name: "Legacy CRM",
    endpoint: "https://crm.example.com/in",
    event: "project.updated",
    status: "Fejler",
    lastDelivery: "3 dage",
    errors: 14,
  },
];

export const SECURITY_EVENTS = [
  {
    who: "Jesper Riel",
    what: "Loggede ind",
    where: "København, DK · macOS",
    when: "I dag · 09:12",
    tone: "ok" as const,
  },
  {
    who: "Emma Larsen",
    what: "Aktiverede 2FA",
    where: "København, DK",
    when: "I går · 16:42",
    tone: "ok" as const,
  },
  {
    who: "Ukendt",
    what: "Mislykket login forsøg",
    where: "Sofia, BG",
    when: "I går · 03:21",
    tone: "warn" as const,
  },
  {
    who: "Mikkel Holm",
    what: "Genererede ny API-nøgle",
    where: "Aarhus, DK",
    when: "2 dage",
    tone: "ok" as const,
  },
  {
    who: "System",
    what: "Webhook 'Legacy CRM' fejler",
    where: "Backend",
    when: "3 dage",
    tone: "warn" as const,
  },
  {
    who: "Sofie Berg",
    what: "Tilføjede ny datakilde",
    where: "København, DK",
    when: "5 dage",
    tone: "ok" as const,
  },
];

export const PLAN = {
  current: "Professional",
  price: "12.500 DKK / md.",
  renewal: "1. december 2026",
  contact: "billing@freyra.io",
};

export const USAGE = [
  { label: "Brugere", used: 8, limit: 25, unit: "" },
  { label: "Projekter", used: 7, limit: 15, unit: "" },
  { label: "Datakilder", used: 42, limit: 100, unit: "" },
  { label: "Rapporter genereret", used: 24, limit: 100, unit: "" },
  { label: "API-kald", used: 184_000, limit: 500_000, unit: "" },
  { label: "Storage", used: 38, limit: 200, unit: " GB" },
  { label: "AI-rapport credits", used: 64, limit: 200, unit: "" },
  { label: "Eksport-volumen", used: 12, limit: 50, unit: "" },
];

export const PLANS = [
  {
    name: "Starter",
    price: "Gratis",
    best: "Pilotprojekter og test",
    features: [
      "1 organisation",
      "3 projekter",
      "5 brugere",
      "Basis-rapporter",
      "Community support",
    ],
  },
  {
    name: "Professional",
    price: "12.500 DKK / md.",
    best: "Aktive ESG- og naturteams",
    features: ["Alle moduler", "25 brugere", "100 datakilder", "AI-rapporter", "E-mail support"],
    current: true,
  },
  {
    name: "Enterprise",
    price: "Tilpasset",
    best: "Større organisationer og porteføljer",
    features: [
      "Ubegrænsede brugere",
      "API & SSO",
      "Dedikeret success manager",
      "Audit-pakke",
      "SLA",
    ],
  },
  {
    name: "Partner",
    price: "Partner-aftale",
    best: "Verifiers og rådgivere",
    features: ["Multi-organisation", "White-label rapporter", "Partner API", "Co-marketing"],
  },
];

export const INVOICES = [
  { no: "INV-2026-005", date: "1. maj 2026", amount: "12.500 DKK", status: "Betalt" },
  { no: "INV-2026-004", date: "1. apr. 2026", amount: "12.500 DKK", status: "Betalt" },
  { no: "INV-2026-003", date: "1. mar. 2026", amount: "12.500 DKK", status: "Betalt" },
  { no: "INV-2026-002", date: "1. feb. 2026", amount: "12.500 DKK", status: "Betalt" },
];
