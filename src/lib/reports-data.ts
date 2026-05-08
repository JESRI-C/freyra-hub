// Reports module mock data — designed to be replaced by Supabase + PDF rendering later.

export type ReportStatus = "Kladde" | "Klar til review" | "Kræver data" | "Godkendt" | "Eksporteret" | "Arkiveret";

export const ORGANIZATIONS = [
  "Freyra Demo", "Skallebæk Biodiversity Pilot", "Nordic Coastal Restoration",
  "Urban Water Quality Program", "Danish Wetland Restoration",
  "Urban Biodiversity Corridor Copenhagen", "Mangrove Restoration Indonesia",
  "Regenerative Agriculture Kenya",
];

export const REPORT_TYPES = [
  { key: "esg", name: "ESG-overblik", desc: "Et samlet overblik over ESG-status, datakvalitet og handlinger.", best: "Intern ledelse, kunder", length: "12–18 sider", needs: ["ESG Ledger", "DecisionsIQ"], audience: "Intern ledelse" },
  { key: "mgmt", name: "Ledelsesrapport", desc: "Strategisk overblik med beslutningsoplæg og næste skridt.", best: "Direktion, ledelsesteam", length: "8–12 sider", needs: ["DecisionsIQ", "ESG Ledger"], audience: "Intern ledelse" },
  { key: "board", name: "Bestyrelsesrapport", desc: "Bestyrelsesoplæg med beslutninger, risici og finansiel impact.", best: "Bestyrelse", length: "6–10 sider", needs: ["DecisionsIQ", "ESG Ledger", "Impact Exchange"], audience: "Bestyrelse" },
  { key: "investor", name: "Investorrapport", desc: "Porteføljeperformance, risici og verifikation.", best: "Investorer, fonde", length: "16–24 sider", needs: ["Impact Exchange", "ESG Ledger", "DecisionsIQ"], audience: "Investor" },
  { key: "nature", name: "Naturimpact-rapport", desc: "Verificeret naturimpact og biodiversitetsudvikling.", best: "Kunder, partnere, kommuner", length: "14–22 sider", needs: ["Impact Exchange", "Smart Connect"], audience: "Kunde" },
  { key: "biodiv", name: "Biodiversitetsrapport", desc: "Habitater, arter og økologisk tilstand med feltverifikation.", best: "Forskning, NGO, myndigheder", length: "18–28 sider", needs: ["Impact Exchange", "Smart Connect"], audience: "Offentlig rapport" },
  { key: "co2", name: "CO₂-bilag", desc: "Komplet CO₂-regnskab med Scope 1, 2 og 3 detaljer.", best: "ESG-team, revisor", length: "10–16 sider", needs: ["ESG Ledger"], audience: "ESG-team" },
  { key: "scope", name: "Scope 1, 2 og 3 rapport", desc: "Detaljeret Scope-opdeling med emissionsfaktorer.", best: "Revisor, ESG-team", length: "12–20 sider", needs: ["ESG Ledger"], audience: "Revisor" },
  { key: "csrd", name: "CSRD/ESRS readiness", desc: "Mapping mod ESRS-standarderne og readiness-status.", best: "Compliance, revisor", length: "20–30 sider", needs: ["ESG Ledger", "Smart Connect"], audience: "Revisor" },
  { key: "audit", name: "Revisorpakke", desc: "Komplet revisionspakke med audit trail og bilag.", best: "Ekstern revisor", length: "30–60 sider", needs: ["ESG Ledger", "Smart Connect"], audience: "Revisor" },
  { key: "facts", name: "Projektfakta", desc: "Et 2-siders datablad over et enkelt projekt.", best: "Salg, partnere", length: "2 sider", needs: ["Impact Exchange"], audience: "Kunde" },
  { key: "portfolio", name: "Porteføljerapport", desc: "Aggregeret performance på tværs af projekter.", best: "Investor, ledelse", length: "12–18 sider", needs: ["Impact Exchange", "ESG Ledger"], audience: "Investor" },
  { key: "muni", name: "Kommune-/myndighedsrapport", desc: "Status og dokumentation til offentlige myndigheder.", best: "Kommuner, ministerier", length: "10–14 sider", needs: ["Impact Exchange", "Smart Connect"], audience: "Kommune" },
  { key: "customer", name: "Kunderapport", desc: "Kundespecifik rapport med projektimpact og credits.", best: "B2B-kunder", length: "8–12 sider", needs: ["Impact Exchange", "ESG Ledger"], audience: "Kunde" },
  { key: "verify", name: "Verifikationsrapport", desc: "Status på tredjepartsverifikation og åbne issues.", best: "Verifier, revisor", length: "8–14 sider", needs: ["Impact Exchange", "ESG Ledger"], audience: "Revisor" },
];

export const AUDIENCES = ["Intern ledelse", "Bestyrelse", "Kunde", "Investor", "Kommune", "ESG-team", "Revisor", "Projektpartner", "Offentlig rapport"];
export const TONES = ["Kort og skarpt", "Strategisk", "Teknisk", "Ledelsesvenligt", "Revisionsklart", "Salgsvenligt", "Offentligt/eksternt"];
export const LANGUAGES = ["Dansk", "Engelsk"];
export const DETAIL_LEVELS = ["Kort", "Standard", "Dybdegående", "Teknisk bilag inkluderet"];
export const EXPORT_FORMATS = ["PDF", "Word", "Excel", "CSV", "Delbart link", "Revisorpakke", "ESG Ledger archive"];

export const MODULE_DATA = [
  { module: "DecisionsIQ", items: ["AI-anbefalinger", "Risikoanalyse", "Scenarier", "Beslutningsnotater"] },
  { module: "Impact Exchange", items: ["Projektfakta", "Porteføljeimpact", "Verifikation", "Credits & aktiver"] },
  { module: "ESG Ledger", items: ["ESG-metrics", "CO₂-regnskab", "Audit trail", "Dokumenter", "CSRD/ESRS readiness"] },
  { module: "Smart Connect", items: ["Datakilder", "Datakvalitet", "Live data summary", "Sensorstatus", "Alerts"] },
];

export type SectionDef = {
  id: string; name: string; group: string; module: string;
  readiness: number; words: number; charts: number; missing?: string;
  recommended?: boolean;
};

export const SECTION_LIBRARY: SectionDef[] = [
  // A — Intro
  { id: "intro-cover", name: "Forside", group: "Intro & resume", module: "Reports", readiness: 100, words: 80, charts: 0, recommended: true },
  { id: "intro-exec", name: "Executive summary", group: "Intro & resume", module: "DecisionsIQ", readiness: 92, words: 320, charts: 0, recommended: true },
  { id: "intro-conc", name: "Hovedkonklusioner", group: "Intro & resume", module: "DecisionsIQ", readiness: 88, words: 240, charts: 1, recommended: true },
  { id: "intro-method", name: "Metodekort", group: "Intro & resume", module: "ESG Ledger", readiness: 86, words: 180, charts: 0 },
  { id: "intro-data", name: "Datagrundlag", group: "Intro & resume", module: "Smart Connect", readiness: 91, words: 220, charts: 1, recommended: true },
  { id: "intro-guide", name: "Læsevejledning", group: "Intro & resume", module: "Reports", readiness: 100, words: 90, charts: 0 },
  // B — ESG
  { id: "esg-score", name: "ESG-score", group: "ESG & compliance", module: "ESG Ledger", readiness: 90, words: 220, charts: 1, recommended: true },
  { id: "esg-csrd", name: "CSRD/ESRS readiness", group: "ESG & compliance", module: "ESG Ledger", readiness: 74, words: 380, charts: 1, missing: "ESRS E4 metrics", recommended: true },
  { id: "esg-scope", name: "Scope 1, 2 og 3", group: "ESG & compliance", module: "ESG Ledger", readiness: 78, words: 420, charts: 2, missing: "Scope 3 leverandørkategori" },
  { id: "esg-co2", name: "CO₂-regnskab", group: "ESG & compliance", module: "ESG Ledger", readiness: 88, words: 360, charts: 2, recommended: true },
  { id: "esg-energy", name: "Energiforbrug", group: "ESG & compliance", module: "ESG Ledger", readiness: 92, words: 200, charts: 1 },
  { id: "esg-water", name: "Vandforbrug", group: "ESG & compliance", module: "ESG Ledger", readiness: 84, words: 180, charts: 1 },
  { id: "esg-waste", name: "Affald", group: "ESG & compliance", module: "ESG Ledger", readiness: 70, words: 160, charts: 1, missing: "Q2-data fra affaldsleverandør" },
  { id: "esg-gov", name: "Governance status", group: "ESG & compliance", module: "ESG Ledger", readiness: 95, words: 200, charts: 0 },
  // C — Nature
  { id: "nat-impact", name: "Naturimpact", group: "Natur & impact", module: "Impact Exchange", readiness: 86, words: 380, charts: 2, recommended: true },
  { id: "nat-biodiv", name: "Biodiversitetsindeks", group: "Natur & impact", module: "Impact Exchange", readiness: 78, words: 320, charts: 2, missing: "Feltverifikation Zone C", recommended: true },
  { id: "nat-habitat", name: "Habitatstatus", group: "Natur & impact", module: "Impact Exchange", readiness: 82, words: 280, charts: 1 },
  { id: "nat-water", name: "Vandkvalitet", group: "Natur & impact", module: "Smart Connect", readiness: 94, words: 240, charts: 2, recommended: true },
  { id: "nat-area", name: "Areal beskyttet/restaureret", group: "Natur & impact", module: "Impact Exchange", readiness: 90, words: 180, charts: 1 },
  { id: "nat-projects", name: "Impact Exchange projekter", group: "Natur & impact", module: "Impact Exchange", readiness: 92, words: 220, charts: 1 },
  { id: "nat-facts", name: "Projektfakta", group: "Natur & impact", module: "Impact Exchange", readiness: 96, words: 160, charts: 0 },
  { id: "nat-port", name: "Porteføljeimpact", group: "Natur & impact", module: "Impact Exchange", readiness: 84, words: 280, charts: 2 },
  // D — AI
  { id: "ai-rec", name: "AI-anbefalinger", group: "AI & beslutninger", module: "DecisionsIQ", readiness: 92, words: 320, charts: 1, recommended: true },
  { id: "ai-risk", name: "Risikoanalyse", group: "AI & beslutninger", module: "DecisionsIQ", readiness: 88, words: 360, charts: 2, recommended: true },
  { id: "ai-scen", name: "Scenarier", group: "AI & beslutninger", module: "DecisionsIQ", readiness: 80, words: 280, charts: 2 },
  { id: "ai-note", name: "Beslutningsnotat", group: "AI & beslutninger", module: "DecisionsIQ", readiness: 86, words: 240, charts: 0 },
  { id: "ai-next", name: "Næste handlinger", group: "AI & beslutninger", module: "DecisionsIQ", readiness: 90, words: 220, charts: 0, recommended: true },
  { id: "ai-prio", name: "Prioriteringsliste", group: "AI & beslutninger", module: "DecisionsIQ", readiness: 88, words: 180, charts: 0 },
  // E — Data
  { id: "dat-src", name: "Datakilder", group: "Data & verifikation", module: "Smart Connect", readiness: 91, words: 240, charts: 1, recommended: true },
  { id: "dat-q", name: "Datakvalitet", group: "Data & verifikation", module: "Smart Connect", readiness: 91, words: 220, charts: 2, recommended: true },
  { id: "dat-conn", name: "Smart Connect status", group: "Data & verifikation", module: "Smart Connect", readiness: 88, words: 180, charts: 1 },
  { id: "dat-sensor", name: "Sensorstatus", group: "Data & verifikation", module: "Smart Connect", readiness: 86, words: 180, charts: 1 },
  { id: "dat-verify", name: "Verifikation", group: "Data & verifikation", module: "Impact Exchange", readiness: 78, words: 240, charts: 1, missing: "DNV signatur på Q2-overflight", recommended: true },
  { id: "dat-audit", name: "Audit trail", group: "Data & verifikation", module: "ESG Ledger", readiness: 96, words: 200, charts: 0 },
  { id: "dat-doc", name: "Dokumentationsniveau", group: "Data & verifikation", module: "ESG Ledger", readiness: 90, words: 180, charts: 0 },
  { id: "dat-uncert", name: "Usikkerheder", group: "Data & verifikation", module: "Reports", readiness: 84, words: 220, charts: 0, recommended: true },
  // F — Appendix
  { id: "ap-method", name: "Metodebilag", group: "Bilag", module: "Reports", readiness: 92, words: 320, charts: 0 },
  { id: "ap-table", name: "Datatabel", group: "Bilag", module: "ESG Ledger", readiness: 94, words: 0, charts: 0 },
  { id: "ap-fact", name: "Emissionsfaktorer", group: "Bilag", module: "ESG Ledger", readiness: 96, words: 0, charts: 0 },
  { id: "ap-verify", name: "Verifikationsnoter", group: "Bilag", module: "Impact Exchange", readiness: 80, words: 160, charts: 0 },
  { id: "ap-audit", name: "Audit trail extract", group: "Bilag", module: "ESG Ledger", readiness: 96, words: 0, charts: 0 },
  { id: "ap-proj", name: "Projektbilag", group: "Bilag", module: "Impact Exchange", readiness: 90, words: 240, charts: 1 },
  { id: "ap-raw", name: "Rådataudtræk", group: "Bilag", module: "Smart Connect", readiness: 100, words: 0, charts: 0 },
];

export const RECENT_REPORTS = [
  { id: "RPT-2041", name: "Skallebæk Naturimpact Q2 2026", type: "Naturimpact-rapport", scope: "Skallebæk Biodiversity Pilot", audience: "Kunde", status: "Klar til review" as ReportStatus, readiness: 82, updated: "2 t siden", owner: "Emma Larsen", version: "v1.4", format: "PDF" },
  { id: "RPT-2040", name: "Freyra Q2 ESG-overblik", type: "ESG-overblik", scope: "Freyra Demo", audience: "Intern ledelse", status: "Godkendt" as ReportStatus, readiness: 94, updated: "I går", owner: "Jesper Riel", version: "v2.0", format: "PDF" },
  { id: "RPT-2039", name: "Mangrove Investor Brief", type: "Investorrapport", scope: "Mangrove Restoration Indonesia", audience: "Investor", status: "Eksporteret" as ReportStatus, readiness: 96, updated: "3 dage", owner: "Jesper Riel", version: "v1.2", format: "PDF + Word" },
  { id: "RPT-2038", name: "CO₂-bilag H1 2026", type: "CO₂-bilag", scope: "Freyra Demo", audience: "Revisor", status: "Kræver data" as ReportStatus, readiness: 68, updated: "5 dage", owner: "Emma Larsen", version: "v0.9", format: "PDF + Excel" },
  { id: "RPT-2037", name: "CSRD readiness review", type: "CSRD/ESRS readiness", scope: "Freyra Demo", audience: "Revisor", status: "Kladde" as ReportStatus, readiness: 74, updated: "1 uge", owner: "Mikkel Holm", version: "v0.4", format: "PDF" },
  { id: "RPT-2036", name: "Urban Water Q2 kunderapport", type: "Kunderapport", scope: "Urban Water Quality Program", audience: "Kunde", status: "Eksporteret" as ReportStatus, readiness: 92, updated: "1 uge", owner: "Emma Larsen", version: "v1.0", format: "PDF" },
  { id: "RPT-2035", name: "Wetland projektfakta", type: "Projektfakta", scope: "Danish Wetland Restoration", audience: "Projektpartner", status: "Arkiveret" as ReportStatus, readiness: 100, updated: "3 uger", owner: "Mikkel Holm", version: "v1.0", format: "PDF" },
];

export const READINESS_DIMENSIONS = [
  { name: "Datadækning", score: 88, status: "OK", why: "92% af nødvendige metrics dækket", fix: "Tilføj affaldsdata fra leverandør" },
  { name: "Datakvalitet", score: 86, status: "OK", why: "Kvalitet over 85% på alle moduler", fix: "Verificér drone Q2-overflight" },
  { name: "Verifikation", score: 72, status: "Kræver handling", why: "Feltverifikation mangler i Zone C", fix: "Send opgave til feltteam" },
  { name: "Audit trail", score: 96, status: "OK", why: "Alle events logget i ESG Ledger", fix: "Ingen handling nødvendig" },
  { name: "Metodegrundlag", score: 90, status: "OK", why: "ESRS-mapping komplet", fix: "Tilføj reference til CSRD-skabelon" },
  { name: "Målgruppefit", score: 88, status: "OK", why: "Tone og længde matcher kunder", fix: "Forkort executive summary" },
  { name: "Sprogkvalitet", score: 92, status: "OK", why: "AI-review uden større flag", fix: "Manuel proofread før eksport" },
  { name: "Bilagsklarhed", score: 84, status: "OK", why: "Bilag dækker metode og audit", fix: "Tilføj rådataudtræk som bilag" },
];

export const MISSING_DATA = [
  { issue: "Feltverifikation mangler i Zone C", why: "Påvirker biodiversitetsindeks og verifikation", fix: "Send feltteam-opgave", target: "Smart Connect" },
  { issue: "Droneupload mangler geotags", why: "Blokerer naturimpact-verifikation", fix: "Re-eksportér med EXIF GPS", target: "Smart Connect" },
  { issue: "Scope 3 transportdata mangler leverandørkategori", why: "Fejl i Scope 3-aggregering", fix: "Opdatér CSV-mapping", target: "ESG Ledger" },
  { issue: "Vandmålinger fra Zone 3 kræver validering", why: "Outlier-værdier set i 24 t", fix: "Kalibrér sensor", target: "Smart Connect" },
  { issue: "Verifikationsnote mangler godkendelse", why: "DNV-signatur er ikke registreret", fix: "Anmod ny signatur", target: "Impact Exchange" },
];

export const TEMPLATES = [
  { name: "Ledelsesrapport", purpose: "Strategisk overblik til direktion", audience: "Intern ledelse", sections: 9, length: "10 sider", modules: ["DecisionsIQ", "ESG Ledger"] },
  { name: "Bestyrelsesrapport", purpose: "Bestyrelsesoplæg med beslutninger", audience: "Bestyrelse", sections: 8, length: "8 sider", modules: ["DecisionsIQ", "Impact Exchange", "ESG Ledger"] },
  { name: "Investorrapport", purpose: "Porteføljeperformance og verifikation", audience: "Investor", sections: 12, length: "20 sider", modules: ["Impact Exchange", "ESG Ledger", "DecisionsIQ"] },
  { name: "ESG-overblik", purpose: "Bredt ESG-overblik for organisationen", audience: "Intern ledelse", sections: 10, length: "14 sider", modules: ["ESG Ledger"] },
  { name: "CO₂-bilag", purpose: "Komplet CO₂-regnskab", audience: "Revisor", sections: 8, length: "12 sider", modules: ["ESG Ledger"] },
  { name: "Naturimpact-rapport", purpose: "Verificeret naturimpact", audience: "Kunde", sections: 11, length: "18 sider", modules: ["Impact Exchange", "Smart Connect"] },
  { name: "Biodiversitetsrapport", purpose: "Habitater og arter", audience: "Offentlig rapport", sections: 13, length: "22 sider", modules: ["Impact Exchange", "Smart Connect"] },
  { name: "Revisorpakke", purpose: "Komplet revisionspakke", audience: "Revisor", sections: 18, length: "45 sider", modules: ["ESG Ledger", "Smart Connect"] },
  { name: "Kommune-/myndighedsrapport", purpose: "Status til offentlige myndigheder", audience: "Kommune", sections: 9, length: "12 sider", modules: ["Impact Exchange", "Smart Connect"] },
  { name: "Projektfakta", purpose: "2-siders datablad", audience: "Projektpartner", sections: 4, length: "2 sider", modules: ["Impact Exchange"] },
  { name: "Porteføljerapport", purpose: "Performance på tværs af projekter", audience: "Investor", sections: 10, length: "16 sider", modules: ["Impact Exchange", "ESG Ledger"] },
  { name: "Kunderapport", purpose: "Kundespecifik impact og credits", audience: "Kunde", sections: 8, length: "10 sider", modules: ["Impact Exchange", "ESG Ledger"] },
];
