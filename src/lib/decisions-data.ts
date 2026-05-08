// Mock data for DecisionsIQ. Structured so it can be replaced with Supabase fetches later.

export type Priority = "Høj" | "Medium" | "Lav";
export type Status = "Åben" | "Igangsat" | "Dokumenteret" | "Afventer data";
export type RiskLevel = "Lav" | "Medium" | "Høj" | "Kritisk";

export const PROJECTS = [
  "Nordic Coastal Restoration",
  "Skallebæk Biodiversity Pilot",
  "Urban Water Quality Program",
  "Regenerative Agriculture Kenya",
  "Amazonas Forest Protection",
  "Mangrove Restoration Indonesia",
] as const;

export const CATEGORIES = [
  "CO₂-reduktion",
  "Biodiversitet",
  "Vand",
  "Datakvalitet",
  "Compliance",
  "Naturpleje",
  "Rapportering",
] as const;

export type Recommendation = {
  id: string;
  title: string;
  category: (typeof CATEGORIES)[number];
  priority: Priority;
  expectedEffect: string;
  confidence: number;
  requiredAction: string;
  owner: string;
  deadline: string;
  status: Status;
  problem: string;
  whyItMatters: string;
  dataBasis: string[];
  businessValue: string;
  esgValue: string;
  nextSteps: string[];
};

export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: "rec-1",
    title: "Reducer energiforbruget i bygning A",
    category: "CO₂-reduktion",
    priority: "Høj",
    expectedEffect: "−18 t CO₂e / år",
    confidence: 0.91,
    requiredAction: "Udskift ventilationsstyring + LED",
    owner: "Mikkel Holm",
    deadline: "30. jul 2026",
    status: "Åben",
    problem: "Bygning A bruger 38% mere energi end sammenlignelige bygninger i porteføljen.",
    whyItMatters: "Energiforbruget udgør 22% af projektets samlede CO₂e og påvirker ESG-scoren direkte.",
    dataBasis: ["IoT energimålere (12 mdr.)", "Sammenligningsindeks Norden", "Vejrnormaliseret model"],
    businessValue: "Estimeret besparelse 142.000 DKK/år ved nuværende eltariff.",
    esgValue: "Bidrager til Scope 2-reduktion og dokumenterbar handling under CSRD E1-4.",
    nextSteps: [
      "Indhent tilbud på ventilationsopgradering",
      "Planlæg LED-udskiftning Q3",
      "Opdatér emissionsfaktor i CO₂-modellen",
    ],
  },
  {
    id: "rec-2",
    title: "Undersøg vandforbrug i zone 3",
    category: "Vand",
    priority: "Høj",
    expectedEffect: "Risikoreduktion vandkvalitet",
    confidence: 0.84,
    requiredAction: "Feltinspektion + sensorkalibrering",
    owner: "Emma Larsen",
    deadline: "20. jun 2026",
    status: "Igangsat",
    problem: "Anomali i pH og turbiditet siden uge 17 — over kontrolgrænse i 9 ud af 14 dage.",
    whyItMatters: "Mulig påvirkning af nedstrøms biotop og rapporteringsforpligtelse til kommunen.",
    dataBasis: ["Sensor WQ-12 (realtid)", "Manuel prøve uge 18", "Satellit NDWI"],
    businessValue: "Forebygger potentiel myndighedsindskærpelse.",
    esgValue: "Sikrer dokumentation under TNFD vand-disclosures.",
    nextSteps: ["Genkalibrér WQ-12", "Tag manuel kontrolprøve", "Opdatér risikomatrix"],
  },
  {
    id: "rec-3",
    title: "Forbedr datadækning fra manuelle feltregistreringer",
    category: "Datakvalitet",
    priority: "Medium",
    expectedEffect: "+14% datadækning",
    confidence: 0.78,
    requiredAction: "Indfør mobil registrering i felt",
    owner: "Mikkel Holm",
    deadline: "15. aug 2026",
    status: "Åben",
    problem: "32% af planlagte feltregistreringer mangler i Q2.",
    whyItMatters: "Lav dækning sænker AI-konfidens og blokerer biodiversitetsverificering.",
    dataBasis: ["Field log Q2", "Sammenligning Q1 vs Q2"],
    businessValue: "Frigør tidligere rapportlukning (estimeret 2 uger).",
    esgValue: "Hæver verifikationsniveau fra B til A.",
    nextSteps: ["Udrul felt-app til 6 medarbejdere", "Træn felthold", "Opsæt valideringsregler"],
  },
  {
    id: "rec-4",
    title: "Tilføj satellitbaseret vegetationsanalyse",
    category: "Biodiversitet",
    priority: "Medium",
    expectedEffect: "Bedre habitatdokumentation",
    confidence: 0.88,
    requiredAction: "Forbind Sentinel-2 NDVI pipeline",
    owner: "Jesper Riel",
    deadline: "01. jul 2026",
    status: "Åben",
    problem: "Vegetationsdækning beregnes i dag manuelt med 6 ugers forsinkelse.",
    whyItMatters: "Realtidsindsigt muliggør tidlig opdagelse af habitatforringelse.",
    dataBasis: ["Sentinel-2 (åbent dataset)", "Eksisterende GIS-lag"],
    businessValue: "Reducerer manuel felttid med 40 timer/kvartal.",
    esgValue: "Styrker TNFD habitatrapportering.",
    nextSteps: ["Aktivér Smart Connect Sentinel-2", "Definér AOI", "Verificér mod feltdata"],
  },
  {
    id: "rec-5",
    title: "Prioritér plejeindsats i område B",
    category: "Naturpleje",
    priority: "Høj",
    expectedEffect: "+0,08 biodiversitetsindeks",
    confidence: 0.82,
    requiredAction: "Planlæg græsning + invasiv kontrol",
    owner: "Emma Larsen",
    deadline: "10. sep 2026",
    status: "Åben",
    problem: "Biodiversitetsindeks i område B er faldet 11% over to kvartaler.",
    whyItMatters: "Område B er kerneområde for målarter — fortsat fald risikerer projektets KPI.",
    dataBasis: ["eDNA-prøver", "Felt artsregistrering", "Drone LiDAR"],
    businessValue: "Sikrer udbetaling af resultatbaseret tilskud.",
    esgValue: "Direkte bidrag til Nature Positive-mål.",
    nextSteps: ["Aftale med græsningsleverandør", "Kortlæg invasive arter", "Udarbejd plejeplan"],
  },
  {
    id: "rec-6",
    title: "Dokumentér biodiversitetsløft med feltdata",
    category: "Rapportering",
    priority: "Medium",
    expectedEffect: "Klar til Q2-rapport",
    confidence: 0.86,
    requiredAction: "Saml feltobservationer + verificér",
    owner: "Emma Larsen",
    deadline: "25. jun 2026",
    status: "Åben",
    problem: "Positiv udvikling er ikke dokumenteret i et form-godkendt format.",
    whyItMatters: "Manglende dokumentation forsinker resultatkommunikation.",
    dataBasis: ["Felt observationer Q2", "Foto-evidens", "eDNA"],
    businessValue: "Muliggør investor-opdatering rettidigt.",
    esgValue: "Bidrager til verificeret impact rapportering.",
    nextSteps: ["Indsaml feltdata", "Verificér mod baseline", "Generér beslutningsnotat"],
  },
  {
    id: "rec-7",
    title: "Valider CO₂e-beregning før rapporteksport",
    category: "Compliance",
    priority: "Høj",
    expectedEffect: "Forhindrer rapportfejl",
    confidence: 0.93,
    requiredAction: "Re-beregn med opdaterede faktorer",
    owner: "Jesper Riel",
    deadline: "12. jun 2026",
    status: "Afventer data",
    problem: "Tre emissionsfaktorer er ældre end 12 mdr. og afviger fra DEFRA 2026.",
    whyItMatters: "Forkerte faktorer kan medføre revisionspåtegning.",
    dataBasis: ["Emissionsfaktor-bibliotek", "DEFRA 2026", "Intern auditlog"],
    businessValue: "Reducerer revisionsrisiko.",
    esgValue: "Sikrer overholdelse af GHG Protocol.",
    nextSteps: ["Opdatér faktor-bibliotek", "Re-kør beregning", "Log ændring i ESG Ledger"],
  },
];

export type Insight = {
  label: string;
  value: string;
  delta?: string;
  tone: "success" | "warning" | "danger" | "info";
  description: string;
};

export const KEY_INSIGHTS: Insight[] = [
  { label: "Største forbedring", value: "Biodiversitet område A", delta: "+0,11", tone: "success",
    description: "Stigning i artsrigdom efter genplantning bekræftet via eDNA og felt." },
  { label: "Største risiko", value: "Vandkvalitet zone 3", delta: "−14%", tone: "danger",
    description: "pH og turbiditet uden for kontrolgrænse i 9/14 dage." },
  { label: "Mest kritiske datamangel", value: "Felt område B", delta: "32% mgl.", tone: "warning",
    description: "Manglende manuelle registreringer blokerer verifikation." },
  { label: "Anbefalet næste handling", value: "Re-beregn CO₂e", tone: "info",
    description: "Opdatér tre emissionsfaktorer før Q2-rapport." },
];

export const TIMELINE_CHANGES = [
  { month: "Maj", icon: "co2", label: "CO₂e faldet 4,2% efter optimering af bygning A", tone: "success" as const },
  { month: "Maj", icon: "bio", label: "Biodiversitetsindeks i område A steget til 0,74", tone: "success" as const },
  { month: "Apr", icon: "water", label: "Vandkvalitet i zone 3 faldet under tærskel", tone: "danger" as const },
  { month: "Apr", icon: "data", label: "Datadækning øget med 8% fra nye sensorer", tone: "info" as const },
  { month: "Mar", icon: "anomaly", label: "Anomali registreret i sensor WQ-12", tone: "warning" as const },
];

export const RISK_SNAPSHOT = [
  { name: "Klima", score: 62, trend: -3, level: "Medium" as RiskLevel },
  { name: "Biodiversitet", score: 41, trend: -8, level: "Lav" as RiskLevel },
  { name: "Compliance", score: 28, trend: -12, level: "Lav" as RiskLevel },
  { name: "Datakvalitet", score: 71, trend: +6, level: "Høj" as RiskLevel },
  { name: "Økonomi", score: 35, trend: -2, level: "Lav" as RiskLevel },
];

export const RISK_CATEGORIES = [
  { name: "Klimarisiko", score: 62, trend: "−3", level: "Medium" as RiskLevel,
    explanation: "Stigende temperatur påvirker vækstsæson og vandbalance.",
    action: "Udvid scenariemodellering for klimavariabler." },
  { name: "Biodiversitetsrisiko", score: 41, trend: "−8", level: "Lav" as RiskLevel,
    explanation: "Positiv tendens i kerneområde A; svaghed i område B.",
    action: "Prioritér plejeindsats i område B." },
  { name: "Compliance-risiko", score: 28, trend: "−12", level: "Lav" as RiskLevel,
    explanation: "Audit trail er komplet for sidste 6 mdr.",
    action: "Opdatér emissionsfaktorer før rapporteksport." },
  { name: "Datakvalitetsrisiko", score: 71, trend: "+6", level: "Høj" as RiskLevel,
    explanation: "Manglende felt-dækning og forsinket satellitsynk.",
    action: "Aktivér Sentinel-2 og udrul felt-app." },
  { name: "Fysisk risiko", score: 54, trend: "+2", level: "Medium" as RiskLevel,
    explanation: "Kysterosion og oversvømmelser er voksende trussel.",
    action: "Inkludér havniveau-scenarie i 24-mdr. plan." },
  { name: "Overgangsrisiko", score: 38, trend: "−1", level: "Lav" as RiskLevel,
    explanation: "Lav eksponering for prisstigning på kvoter.",
    action: "Overvåg kvotemarked månedligt." },
  { name: "Reputationsrisiko", score: 32, trend: "−4", level: "Lav" as RiskLevel,
    explanation: "Verificeret kommunikation reducerer greenwashing-risiko.",
    action: "Fortsæt tredjepartsverifikation." },
  { name: "Projektrisiko", score: 47, trend: "+1", level: "Medium" as RiskLevel,
    explanation: "Ressourceknaphed i Q3 kan forsinke leverance.",
    action: "Allokér felthold tidligt." },
];

export const RISK_MATRIX_POINTS = [
  { name: "CO₂-afvigelse", probability: 0.45, impact: 0.7, level: "Medium" as RiskLevel },
  { name: "Lav datadækning", probability: 0.7, impact: 0.55, level: "Høj" as RiskLevel },
  { name: "Manglende feltverifikation", probability: 0.6, impact: 0.5, level: "Medium" as RiskLevel },
  { name: "Vandkvalitetsfald", probability: 0.55, impact: 0.85, level: "Kritisk" as RiskLevel },
  { name: "Habitatforringelse", probability: 0.35, impact: 0.75, level: "Medium" as RiskLevel },
  { name: "Manglende audit trail", probability: 0.2, impact: 0.6, level: "Lav" as RiskLevel },
];

export const RISK_TIMELINE = [
  { date: "08. maj", event: "Vandkvalitet under tærskel — zone 3", level: "Høj" as RiskLevel },
  { date: "02. maj", event: "Sensor WQ-12 mistede heartbeat i 6 timer", level: "Medium" as RiskLevel },
  { date: "27. apr", event: "Habitatdækning faldt 4% i område B", level: "Medium" as RiskLevel },
  { date: "19. apr", event: "Emissionsfaktor-bibliotek markeret som forældet", level: "Høj" as RiskLevel },
  { date: "11. apr", event: "Manglende felt-data fra 3 områder", level: "Lav" as RiskLevel },
];

export const MITIGATIONS = [
  { action: "Genkalibrér vandsensorer i zone 3", owner: "Emma Larsen", deadline: "20. jun", status: "Igangsat", effect: "−25% risiko" },
  { action: "Udrul felt-app til 6 medarbejdere", owner: "Mikkel Holm", deadline: "15. aug", status: "Planlagt", effect: "−18% risiko" },
  { action: "Opdatér emissionsfaktor-bibliotek", owner: "Jesper Riel", deadline: "12. jun", status: "Åben", effect: "−12% risiko" },
  { action: "Etabler satellit-monitorering område B", owner: "Jesper Riel", deadline: "01. jul", status: "Åben", effect: "−15% risiko" },
];

export const SCENARIOS = [
  {
    id: "baseline", name: "Baseline", tag: "Nuværende kurs",
    description: "Fortsæt nuværende drift uden ekstra indsats.",
    metrics: { esg: 68, co2: 1284, bio: 0.72, water: 92, data: 78, risk: 64 },
    color: "muted",
  },
  {
    id: "data", name: "Datadækning forbedres", tag: "Lav investering",
    description: "Fuld udrulning af felt-app + satellitsynk.",
    metrics: { esg: 74, co2: 1280, bio: 0.74, water: 93, data: 92, risk: 52 },
    color: "info",
  },
  {
    id: "bio", name: "Biodiversitetsindsats øges", tag: "Medium investering",
    description: "Plejeplan for område B + udvidet eDNA-program.",
    metrics: { esg: 78, co2: 1268, bio: 0.81, water: 94, data: 86, risk: 47 },
    color: "success",
  },
  {
    id: "co2", name: "CO₂-reduktion prioriteres", tag: "Høj investering",
    description: "Energirenovering + transition til vedvarende kilder.",
    metrics: { esg: 82, co2: 1098, bio: 0.74, water: 92, data: 84, risk: 41 },
    color: "leaf",
  },
  {
    id: "no-action", name: "Ingen handling", tag: "Risikoscenarie",
    description: "Forværring af datakvalitet og biodiversitet.",
    metrics: { esg: 58, co2: 1322, bio: 0.66, water: 88, data: 64, risk: 81 },
    color: "danger",
  },
];

export const DATA_SOURCES = [
  { name: "Sensorer", status: "Aktiv", lastSync: "3 min", quality: 94, verification: "A", missing: "0%", improvement: "—" },
  { name: "Satellitdata", status: "Forsinket", lastSync: "32 dage", quality: 71, verification: "B", missing: "12%", improvement: "Genaktivér Sentinel-2 pipeline" },
  { name: "Dronebilleder", status: "Aktiv", lastSync: "5 dage", quality: 88, verification: "A", missing: "4%", improvement: "Planlæg næste flyvning" },
  { name: "Manuelle feltdata", status: "Mangelfuld", lastSync: "9 dage", quality: 62, verification: "B", missing: "32%", improvement: "Udrul felt-app + træning" },
  { name: "Tredjepartsdata", status: "Aktiv", lastSync: "1 dag", quality: 90, verification: "A", missing: "2%", improvement: "Tilføj ekstra leverandør" },
  { name: "ESG-systemer", status: "Aktiv", lastSync: "1 time", quality: 86, verification: "A", missing: "3%", improvement: "Validér emissionsfaktorer" },
  { name: "CSV uploads", status: "Inaktiv", lastSync: "21 dage", quality: 55, verification: "C", missing: "—", improvement: "Migrer til API-integration" },
];

export const DATA_GAPS = [
  "Mangler feltregistrering for område B (32% dækning)",
  "Satellitdata ikke opdateret siden sidste måned",
  "Vandmålinger mangler fra zone 3 i 4 dage",
  "CO₂e-beregning mangler emissionsfaktor for transport",
];

export const SAVED_NOTES = [
  { id: "n-1", title: "Q2 statusnotat — Limfjorden", project: "Nordic Coastal Restoration", audience: "Investor", date: "12. maj 2026", status: "Eksporteret" },
  { id: "n-2", title: "Risikoopdatering — vandkvalitet", project: "Urban Water Quality Program", audience: "Kommune", date: "06. maj 2026", status: "Sendt" },
  { id: "n-3", title: "Biodiversitetsfremgang Q2", project: "Skallebæk Biodiversity Pilot", audience: "Intern ledelse", date: "28. apr 2026", status: "Udkast" },
  { id: "n-4", title: "ESG-status til bestyrelse", project: "Nordic Coastal Restoration", audience: "Intern ledelse", date: "14. apr 2026", status: "Eksporteret" },
];

export const SUGGESTED_PROMPTS = [
  "Hvad er de største risici i projektet?",
  "Hvilke anbefalinger bør vi prioritere først?",
  "Hvad mangler vi for at dokumentere biodiversitet bedre?",
  "Lav et kort beslutningsnotat til ledelsen.",
  "Forklar ændringen i CO₂e siden sidste måned.",
  "Hvilke datakilder er svagest?",
  "Hvordan kan vi forbedre ESG-scoren?",
];

export const SAMPLE_ASSISTANT_REPLIES: Record<string, {
  short: string; basis: string[]; recommendation: string; uncertainty: string; nextAction: string;
}> = {
  default: {
    short: "Projektet er overordnet på rette kurs, men datakvalitet og vandkvalitet i zone 3 kræver opmærksomhed.",
    basis: ["Sensor- og satellitdata sidste 30 dage", "Felt-observationer Q2", "ESG-indikatorer fra ledger"],
    recommendation: "Prioritér genkalibrering af WQ-12 og opdatering af emissionsfaktorer før Q2-rapport.",
    uncertainty: "Konfidens 0,82 — påvirket af 32% mangel i felt-data fra område B.",
    nextAction: "Opret opgave i Smart Connect og generér beslutningsnotat til ledelsen.",
  },
  "risici": {
    short: "Tre risici stikker ud: vandkvalitet zone 3 (Kritisk), datakvalitet (Høj) og forældede emissionsfaktorer (Høj).",
    basis: ["Risk matrix", "WQ-12 anomalilog", "Emissionsfaktor-bibliotek"],
    recommendation: "Iværksæt mitigation for de tre Høj/Kritisk-risici inden 14 dage.",
    uncertainty: "Konfidens 0,86 — robust evidens for de tre topscorende risici.",
    nextAction: "Åbn Risikoanalyse → Mitigation plan og tildel ejer.",
  },
  "co2": {
    short: "CO₂e er steget 2,1% siden sidste måned, primært fra transport og bygning A.",
    basis: ["Energimålere bygning A", "Transport-log", "Emissionsfaktor-bibliotek"],
    recommendation: "Gennemfør anbefaling 'Reducer energiforbruget i bygning A' og opdatér transportfaktorer.",
    uncertainty: "Konfidens 0,79 — to faktorer er forældede.",
    nextAction: "Validér beregning i DecisionsIQ → Datakvalitet.",
  },
};
