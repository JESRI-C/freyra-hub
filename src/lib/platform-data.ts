// Shared cross-module mock data so Smart Connect, DecisionsIQ,
// Impact Exchange, ESG Ledger and Reports tell one consistent story.

export type PlatformStatus =
  | "Online"
  | "Offline"
  | "Kræver handling"
  | "Under verifikation"
  | "Verificeret"
  | "Rapportklar"
  | "Ikke rapportklar"
  | "Høj risiko"
  | "Medium risiko"
  | "Lav risiko"
  | "Kladde"
  | "Klar til review"
  | "Godkendt"
  | "Eksporteret";

export const PROJECT_FACTS = {
  name: "Skallebæk Naturprojekt",
  location: "Haderslev, Danmark",
  area: "18,4 ha",
  dataQuality: 91,
  biodiversityIndex: 76,
  reportReadiness: 74,
  activeDataSources: 12,
  openRecommendations: 5,
  status: "Under verifikation" as PlatformStatus,
  criticalGaps: [
    "Feltverifikation i Zone C",
    "Drone-metadata mangler geotags",
    "Vandsensor Zone 3 kræver validering",
  ],
};

// ─── Strategisk positionering ────────────────────────────────────────────────

export const KEY_MESSAGE =
  "Biodiversitet er ikke CO₂. GoFreyra reducerer ikke natur til én simpel score. Hver vurdering kan rummer metode, kontekst, datakilde, konfidensniveau, usikkerhed og anbefalet brug.";

export const POSITIONING_STATEMENT =
  "GoFreyra hjælper kommuner, rådgivere, lodsejere, virksomheder og fonde med at føre naturprojekter fra arealplanlægning og lodsejerdialog til biodiversitetsmonitorering, rapportering og offentlig effekt­dokumentation.";

// ─── Nature-projekt dashboard-kort ───────────────────────────────────────────

export const NATURE_DASHBOARD_CARDS = [
  {
    id: "active-projects",
    title: "Aktive naturprojekter",
    value: "6",
    sub: "3 i planlægning · 3 i drift",
    tone: "info" as const,
    href: "/app/projects",
  },
  {
    id: "tripart-readiness",
    title: "Green Tripart-readiness",
    value: "68%",
    sub: "2 projekter klar til indmelding",
    tone: "warning" as const,
    href: "/app/ledger/csrd",
  },
  {
    id: "report-readiness",
    title: "Rapportklarhed",
    value: "74%",
    sub: "Mangler feltverifikation",
    tone: "warning" as const,
    href: "/app/reports/readiness",
  },
  {
    id: "method-confidence",
    title: "Metode-konfidens",
    value: "Høj",
    sub: "DCE-protokol · Sentinel-2 · feltindex",
    tone: "success" as const,
    href: "/app/decisions/data-quality",
  },
  {
    id: "stakeholder-risk",
    title: "Lodsejer- & interessentrisiko",
    value: "Medium",
    sub: "2 åbne dialoger · 1 indsigelse",
    tone: "warning" as const,
    href: "/app/decisions/risk",
  },
  {
    id: "next-actions",
    title: "Næste kritiske handlinger",
    value: "5",
    sub: "2 høj prioritet i denne uge",
    tone: "danger" as const,
    href: "/app/decisions/recommendations",
  },
  {
    id: "documentation",
    title: "Dokumentationsstatus",
    value: "82%",
    sub: "Audit trail sporbar til datapunkt",
    tone: "success" as const,
    href: "/app/ledger/audit",
  },
  {
    id: "public-comms",
    title: "Offentlig kommunikation",
    value: "Kladde",
    sub: "Effektside afventer godkendelse",
    tone: "info" as const,
    href: "/app/impact/reports",
  },
];

// ─── Strategiske indholdssektioner ──────────────────────────────────────────

export const STRATEGIC_SECTIONS = [
  {
    id: "tripart",
    title: "Green Tripart-implementering",
    description:
      "Support til indmelding, arealudpegning og dokumentation under den grønne trepartsaftale.",
    href: "/app/ledger/csrd",
  },
  {
    id: "conversion",
    title: "Arealkonvertering & projektforløb",
    description:
      "Fra polygon og baseline til lodsejeraftale, tilladelser og monitoreringsplan.",
    href: "/app/projects",
  },
  {
    id: "method",
    title: "Biodiversitets-metodekonfidens",
    description:
      "Synlig metode, datagrundlag, usikkerhed og anbefalet brug for hvert indikator-tal.",
    href: "/app/decisions/data-quality",
  },
  {
    id: "landowner",
    title: "Lodsejerøkonomi & kommunikation",
    description:
      "Briefs, kompensationsmodeller og dialogforløb for lodsejere og naboer.",
    href: "/app/decisions/risk",
  },
  {
    id: "audit",
    title: "Dokumentation & audit trail",
    description:
      "Sporbar dokumentation fra datapunkt til rapport — klar til myndighed og revisor.",
    href: "/app/ledger/audit",
  },
  {
    id: "public",
    title: "Offentlige impact-sider",
    description:
      "Borgerrettet formidling af naturprojekters effekt med metode og kilder synlige.",
    href: "/app/impact/reports",
  },
];

// ─── Mock-rapportkort ───────────────────────────────────────────────────────

export const MOCK_REPORT_TEMPLATES = [
  {
    id: "tripart-summary",
    title: "Green Tripart projekt-resumé",
    audience: "Kommune · Stat",
    sub: "Arealstatus, type, tilskudsgrundlag",
    href: "/app/reports/new",
  },
  {
    id: "landowner-brief",
    title: "Lodsejer-brief",
    audience: "Lodsejer",
    sub: "Aftaler, økonomi, tidsplan i klart sprog",
    href: "/app/reports/new",
  },
  {
    id: "method-note",
    title: "Biodiversitets-metodenotat",
    audience: "Rådgiver · Fagperson",
    sub: "Metode, datagrundlag, konfidens, usikkerhed",
    href: "/app/reports/new",
  },
  {
    id: "decision-note",
    title: "Kommunalt beslutningsnotat",
    audience: "Udvalg · Direktion",
    sub: "Anbefaling, konsekvens, alternativer",
    href: "/app/reports/new",
  },
  {
    id: "baseline",
    title: "Baseline-rapport",
    audience: "Projektejer",
    sub: "Udgangspunkt før indsats — sporbart",
    href: "/app/reports/new",
  },
  {
    id: "public-impact",
    title: "Offentlig effektside",
    audience: "Borgere · Presse",
    sub: "Letlæselig formidling med metode synlig",
    href: "/app/reports/new",
  },
  {
    id: "esg-impact",
    title: "ESG-/impact-rapport",
    audience: "Fond · Investor",
    sub: "Effekt, finansiering, sporbar dokumentation",
    href: "/app/reports/new",
  },
];

export const PLATFORM_MODULES = [
  {
    id: "connect",
    name: "Monitoring & Field Data",
    href: "/app/connect",
    metric: "42 datakilder",
    sub: "91% datakvalitet",
    status: "Online" as PlatformStatus,
    updated: "3 min siden",
    cta: "Åbn datakilder",
  },
  {
    id: "decisions",
    name: "Project Intelligence",
    href: "/app/decisions",
    metric: "14 anbefalinger",
    sub: "5 høj prioritet",
    status: "Kræver handling" as PlatformStatus,
    updated: "14 min siden",
    cta: "Se anbefalinger",
  },
  {
    id: "impact",
    name: "Funding & Impact",
    href: "/app/impact",
    metric: "6 projekter",
    sub: "3 fund-klare",
    status: "Verificeret" as PlatformStatus,
    updated: "1 time siden",
    cta: "Åbn portefølje",
  },
  {
    id: "ledger",
    name: "Documentation & Audit",
    href: "/app/ledger",
    metric: "74% rapportklarhed",
    sub: "7 åbne datamangler",
    status: "Under verifikation" as PlatformStatus,
    updated: "27 min siden",
    cta: "Åbn dokumentation",
  },
  {
    id: "reports",
    name: "Report Engine",
    href: "/app/reports",
    metric: "8 rapporter",
    sub: "2 kræver review",
    status: "Klar til review" as PlatformStatus,
    updated: "2 timer siden",
    cta: "Se rapporter",
  },
];

export const ACTIVITY_FEED = [
  {
    module: "Monitoring & Field Data",
    text: "Drone upload modtaget for Zone C",
    at: "8 min siden",
    tone: "info" as const,
  },
  {
    module: "Project Intelligence",
    text: "Ny høj-prioritet anbefaling — vandkvalitet Zone 3",
    at: "14 min siden",
    tone: "warning" as const,
  },
  {
    module: "Monitoring & Field Data",
    text: "Vandmåler Zone 3 kræver validering",
    at: "32 min siden",
    tone: "warning" as const,
  },
  {
    module: "Documentation & Audit",
    text: "Audit trail opdateret — 4 nye datapunkter",
    at: "1 time siden",
    tone: "success" as const,
  },
  {
    module: "Funding & Impact",
    text: "Skallebæk tilføjet til fondsoverblik",
    at: "3 timer siden",
    tone: "success" as const,
  },
  {
    module: "Report Engine",
    text: "Naturimpact-rapport sendt til review",
    at: "i går",
    tone: "info" as const,
  },
];

export const CRITICAL_ACTIONS = [
  {
    module: "Monitoring & Field Data",
    title: "3 datakilder kræver handling",
    priority: "Høj",
    owner: "Mikkel Holm",
    deadline: "I dag",
    href: "/app/connect/quality",
  },
  {
    module: "Project Intelligence",
    title: "2 anbefalinger bør prioriteres",
    priority: "Høj",
    owner: "Emma Larsen",
    deadline: "12. jun",
    href: "/app/decisions/recommendations",
  },
  {
    module: "Documentation & Audit",
    title: "4 datapunkter mangler bilag før Tripart-indmelding",
    priority: "Medium",
    owner: "Emma Larsen",
    deadline: "20. jun",
    href: "/app/ledger/csrd",
  },
  {
    module: "Monitoring & Field Data",
    title: "Droneupload mangler geotags",
    priority: "Medium",
    owner: "Mikkel Holm",
    deadline: "15. jun",
    href: "/app/connect/upload",
  },
  {
    module: "Report Engine",
    title: "Lodsejer-brief mangler godkendelse",
    priority: "Lav",
    owner: "Jesper Riel",
    deadline: "30. jun",
    href: "/app/reports/approval",
  },
];

export const ONBOARDING_STEPS = [
  { id: 1, label: "Opret organisation", done: true, href: "/app/settings" },
  { id: 2, label: "Opret naturprojekt", done: true, href: "/app/settings/projects" },
  { id: 3, label: "Tegn projektområde eller upload polygon", done: true, href: "/app/connect/map" },
  { id: 4, label: "Tilføj datakilder & felt-protokol", done: true, href: "/app/connect/sources" },
  { id: 5, label: "Validér datakvalitet og metode", done: false, href: "/app/connect/quality" },
  { id: 6, label: "Gennemgå anbefalinger i Project Intelligence", done: false, href: "/app/decisions" },
  { id: 7, label: "Byg første rapport eller lodsejer-brief", done: false, href: "/app/reports/builder" },
];

export const AI_SUMMARY =
  "Skallebæk Naturprojekt har stærkt datagrundlag på vand og satellitbaseret vegetationsanalyse, men feltverifikation og lodsejerdialog i Zone C skal lukkes før Green Tripart-indmelding og ekstern rapportering.";

export const NEXT_RECOMMENDED_ACTIONS = [
  { title: "Validér vandsensor Zone 3", module: "Monitoring & Field Data", href: "/app/connect/quality" },
  {
    title: "Færdiggør lodsejer-brief for Zone C",
    module: "Report Engine",
    href: "/app/reports/new",
  },
  {
    title: "Indmeld baseline til Green Tripart",
    module: "Documentation & Audit",
    href: "/app/ledger/csrd",
  },
  { title: "Generér kommunalt beslutningsnotat", module: "Report Engine", href: "/app/reports/builder" },
];

