// Shared cross-module mock data so Smart Connect, DecisionsIQ,
// Impact Exchange, ESG Ledger and Reports tell one consistent story.

export type PlatformStatus =
  | "Online" | "Offline"
  | "Kræver handling" | "Under verifikation" | "Verificeret"
  | "Rapportklar" | "Ikke rapportklar"
  | "Høj risiko" | "Medium risiko" | "Lav risiko"
  | "Kladde" | "Klar til review" | "Godkendt" | "Eksporteret";

export const PROJECT_FACTS = {
  name: "Skallebæk Biodiversity Pilot",
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

export const PLATFORM_MODULES = [
  {
    id: "connect",
    name: "Smart Connect",
    href: "/app/connect",
    metric: "42 datakilder",
    sub: "91% datakvalitet",
    status: "Online" as PlatformStatus,
    updated: "3 min siden",
    cta: "Åbn datakilder",
  },
  {
    id: "decisions",
    name: "DecisionsIQ",
    href: "/app/decisions",
    metric: "14 anbefalinger",
    sub: "5 høj prioritet",
    status: "Kræver handling" as PlatformStatus,
    updated: "14 min siden",
    cta: "Se anbefalinger",
  },
  {
    id: "impact",
    name: "Impact Exchange",
    href: "/app/impact",
    metric: "6 projekter",
    sub: "3 rapportklare",
    status: "Verificeret" as PlatformStatus,
    updated: "1 time siden",
    cta: "Åbn portefølje",
  },
  {
    id: "ledger",
    name: "ESG Ledger",
    href: "/app/ledger",
    metric: "74% rapportklarhed",
    sub: "7 åbne datamangler",
    status: "Under verifikation" as PlatformStatus,
    updated: "27 min siden",
    cta: "Åbn ledger",
  },
  {
    id: "reports",
    name: "Rapporter",
    href: "/app/reports",
    metric: "8 rapporter",
    sub: "2 kræver review",
    status: "Klar til review" as PlatformStatus,
    updated: "2 timer siden",
    cta: "Se rapporter",
  },
];

export const ACTIVITY_FEED = [
  { module: "Smart Connect", text: "Drone upload modtaget for Zone C", at: "8 min siden", tone: "info" as const },
  { module: "DecisionsIQ", text: "Ny høj-prioritet anbefaling oprettet — vandkvalitet Zone 3", at: "14 min siden", tone: "warning" as const },
  { module: "Smart Connect", text: "Vandmåler Zone 3 kræver validering", at: "32 min siden", tone: "warning" as const },
  { module: "ESG Ledger", text: "Audit trail opdateret — 4 nye datapunkter", at: "1 time siden", tone: "success" as const },
  { module: "Impact Exchange", text: "Skallebæk tilføjet til portefølje", at: "3 timer siden", tone: "success" as const },
  { module: "Rapporter", text: "Naturimpact-rapport sendt til review", at: "i går", tone: "info" as const },
];

export const CRITICAL_ACTIONS = [
  { module: "Smart Connect", title: "3 datakilder kræver handling", priority: "Høj", owner: "Mikkel Holm", deadline: "I dag", href: "/app/connect/quality" },
  { module: "DecisionsIQ", title: "2 anbefalinger bør prioriteres", priority: "Høj", owner: "Emma Larsen", deadline: "12. jun", href: "/app/decisions/recommendations" },
  { module: "ESG Ledger", title: "4 ESRS-datapunkter mangler dokumentation", priority: "Medium", owner: "Emma Larsen", deadline: "20. jun", href: "/app/ledger/csrd" },
  { module: "Smart Connect", title: "Droneupload mangler geotags", priority: "Medium", owner: "Mikkel Holm", deadline: "15. jun", href: "/app/connect/upload" },
  { module: "Rapporter", title: "1 rapport mangler godkendelse", priority: "Lav", owner: "Jesper Riel", deadline: "30. jun", href: "/app/reports/approval" },
];

export const ONBOARDING_STEPS = [
  { id: 1, label: "Opret organisation", done: true, href: "/app/settings" },
  { id: 2, label: "Opret projekt", done: true, href: "/app/settings/projects" },
  { id: 3, label: "Tegn projektområde eller upload polygon", done: true, href: "/app/connect/map" },
  { id: 4, label: "Tilføj datakilder", done: true, href: "/app/connect/sources" },
  { id: 5, label: "Valider datakvalitet", done: false, href: "/app/connect/quality" },
  { id: 6, label: "Se første analyse i DecisionsIQ", done: false, href: "/app/decisions" },
  { id: 7, label: "Byg første rapport", done: false, href: "/app/reports/builder" },
];

export const AI_SUMMARY =
  "Skallebæk Biodiversity Pilot har stærkt datagrundlag på vand og satellitbaseret vegetationsanalyse, men feltverifikation og drone-metadata bør styrkes før ekstern rapportering.";

export const NEXT_RECOMMENDED_ACTIONS = [
  { title: "Validér vandsensor Zone 3", module: "Smart Connect", href: "/app/connect/quality" },
  { title: "Gennemgå høj-prioritet anbefaling om vandkvalitet", module: "DecisionsIQ", href: "/app/decisions/recommendations" },
  { title: "Send Skallebæk dokumentation til ESG Ledger", module: "Impact Exchange", href: "/app/ledger" },
  { title: "Generér Q2 ledelsesrapport", module: "Rapporter", href: "/app/reports/builder" },
];
