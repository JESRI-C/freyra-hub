# Naturprojekter — Audit

Sidst opdateret: 2026-07-05

Formålet med dette dokument er at give et ærligt billede af, hvad der findes,
hvad der virker, og hvad der reelt mangler for at Naturprojekter-modulet
opfylder masteropgaven.

## 1. Eksisterende struktur

### Stack
- Frontend: React 19 + TanStack Router v1 (file-based) + TanStack Query
- Styling: Tailwind v4 (`src/styles.css`) + shadcn-primitiver
- Backend: Lovable Cloud (Supabase) — DB + auth + storage
- Server-side: TanStack Start server functions (`createServerFn`) — ingen edge functions til app-intern logik
- Karto: `LiveProjectMap`, `MapEditorMap`, `ProjectGeometryMap` + Leaflet-lignende primitiver

### Routes (relevante for Naturprojekter)
- `/app/projects` — projektliste (`app.projects.index.tsx`)
- `/app/projects/$slug` — projektdetalje med 11 faner (`app.projects.$slug.tsx`, 908 linjer)
- `/app/projects/geometry/$slug` — dedikeret korteditor til projektgrænse
- `/app/projects/map/$slug` — fuldskærms geodata-kort

### Nuværende faner i `app.projects.$slug.tsx`
1. Overblik
2. Sites
3. Datakilder
4. Indikatorer
5. Handlinger
6. Audit trail
7. Dokumentation
8. Medier
9. Rapporter
10. Miljødata
11. Livekort

Masteropgaven forudsætter 8 primære faner. Rapporter/Miljødata/Livekort er ekstra
og bør slås sammen eller flyttes (se implementeringsplan).

### Eksisterende DB-tabeller (fra `<supabase-tables>` og `types.ts`)
Følgende er allerede migreret:
`projects`, `sites`, `data_sources`, `indicators`, `actions`, `audit_events`,
`reports`, `evidence_files`, `observations`, `project_media`, `profiles`,
`organizations`, `organization_memberships`, `nature_contexts`,
`geo_features`, `geo_observations`, `map_layers`, `impact_units`,
`mitigation_measures`, `runoff_profiles`, `environmental_risks`,
`construction_projects`, `authority_submissions`, `calculated_metrics`,
`connector_fetch_logs`, `sensors`, `project_areas`,
`email_send_log`, `email_send_state`, `email_unsubscribe_tokens`,
`suppressed_emails`.

## 2. Fane-for-fane status

Legend: 🟢 virker · 🟡 delvist · 🔴 dødt/mockup · ⚪ mangler helt

### Overblik 🟡
- 🟢 KPI-kort viser reelle indikatorer fra DB (`IndicatorCard`)
- 🟢 "Anbefalet næste skridt" beregnes dynamisk via `getRecommendedNextAction`
- 🟢 Seneste hændelser fra `audit_events`
- 🟢 Seneste observationer fra `observations`
- 🔴 Header-tællere (sites, datakilder, handlinger) er ikke klikbare — fører ikke til filtrerede faner
- 🔴 Ingen mulighed for at ændre projektstatus direkte fra header
- 🔴 Redigering af projektnavn/type/lokation findes ikke i UI
- 🟡 KPI-kort viser "0" i stedet for "Ikke beregnet endnu" når data mangler
- 🔴 Klik på KPI-kort åbner ikke indikator-detalje

### Sites 🟡
- 🟢 Liste vises fra DB (`getSitesByProject`)
- 🔴 Ingen "Opret site"-knap
- 🔴 Ingen redigering, arkivering, sletning
- 🔴 Ingen site-geometri (tabellen har ikke `geometry`-felt)
- 🔴 Ingen kobling til datakilder eller indikatorer på site-niveau
- 🔴 Ingen detalje-side/drawer
- 🔴 Ingen filtre eller søgning
- ⚪ Site-versionering (`project_boundaries` med `is_current`) findes ikke

### Datakilder 🟡
- 🟢 Liste med status-badge og sidste sync fra DB
- 🔴 Ingen "Tilføj datakilde"-wizard
- 🔴 Ingen test af forbindelse
- 🔴 Ingen manuel sync-knap
- 🔴 Ingen sync-log (`data_source_runs` findes ikke — kun `connector_fetch_logs` uden bruger-UI)
- 🔴 Ingen kobling til indikatorer synlig
- 🔴 Ingen datakvalitetsopdeling (komplethed/aktualitet/validering)

### Indikatorer 🟡
- 🟢 Grid med indikator-kort fra DB
- 🟢 NDVI, Biodiversitet og Environmental hentes fra levende connectors når geometri findes
- 🔴 Ingen detalje-side med historisk graf (indikatorer har kun `value`, ikke tidsserie)
- ⚪ `indicator_measurements` (tidsserie) findes ikke
- ⚪ `indicator_definitions` (metadata, thresholds) findes ikke
- 🔴 Ingen threshold-visning eller advarsler
- 🔴 Ingen "beregn igen"-handling
- 🔴 Ingen konfigurations-UI for indikatorer

### Handlinger 🟡
- 🟢 CRUD virker: opret, marker som i gang, marker som lukket
- 🟢 Sensor-forslag genereres automatisk fra `suggestSensorActions`
- 🟢 Audit-event skrives ved ændringer
- 🔴 Ingen underhandlinger, ingen checkliste, ingen kommentarer
- 🔴 Ingen kobling til indikator, dokument, medie
- 🔴 Ingen bevis-krav ved afslutning
- 🔴 Ingen filtrering/søgning
- 🔴 Ingen tildeling til bruger-id (kun fritekst `owner`)
- ⚪ `action_evidence`-tabel findes ikke

### Audit trail 🟢🟡
- 🟢 Liste vises fra `audit_events`
- 🟢 Bruges konsekvent i services (projects, actions, zones, boundary)
- 🔴 Ingen filtrering på dato/bruger/type
- 🔴 Ingen før/efter-visning (`before_data`/`after_data` gemmes ikke)
- 🔴 Ingen eksport til CSV/PDF
- 🔴 Ingen søgning

### Dokumentation 🟡
- 🟢 Upload af evidensfil virker (`EvidenceUploadForm` + `evidence_files`)
- 🟢 Liste vises
- 🔴 Ingen dokumenttyper, kun evidensfiler
- 🔴 Ingen versionering
- 🔴 Ingen kobling til site/handling/indikator
- 🔴 Ingen dokumentgenerator (rapport-generator findes separat i "Rapporter"-fanen)
- 🔴 Ingen dokumentationsscore

### Medier 🟢🟡
- 🟢 Upload virker med thumbnail + storage (`project_media`)
- 🟢 GPS-metadata udlæses fra EXIF
- 🟢 Visning på kort med markører
- 🟢 Gallery-view
- 🔴 Ingen kobling til handling/site/dokument
- 🔴 Ingen før/efter-sammenligning
- 🔴 Ingen filtrering på tags
- 🔴 Ingen fuldskærm-viewer med metadata

### Rapporter 🟡
- 🟢 Rapport-preview genereres af `report-engine.ts` med rigtige projektdata
- 🟢 Eksisterende rapporter fra DB vises
- 🔴 Ingen PDF-eksport fra denne fane (findes i `/app/reports/*` men ikke i projektet)
- 🔴 Ingen generator-knap

### Miljødata 🟢
- 🟢 `buildProjectEnvironmentalContext` bruger levende data (efter tidligere fix)
- 🟢 Genindlæses når projektgrænsen ændres

### Livekort 🟢
- 🟢 Sensor-visning + DMI vejrdata
- 🟢 Genererer sensorer deterministisk fra centroid

## 3. Døde knapper og manglende handlinger

Konkrete steder hvor UI antyder en handling der ikke findes:

- `ProjectHeader`: tællere er ikke `<Link>`
- `KPI-kort` (IndicatorCard): ikke klikbar
- `Sites`-fanen: mangler "Opret site"
- `Datakilder`-fanen: mangler "Tilføj datakilde", "Sync nu", "Test forbindelse"
- `Indikatorer`: intet klik åbner detalje
- `Audit trail`: mangler filter/eksport
- `Dokumentation`: mangler "Generér rapport"

## 4. Mock- vs. produktionsdata

- `SEED_PROJECTS`, `SEED_SITES`, `SEED_DATA_SOURCES`, `SEED_ACTIONS` i
  `src/data/platform-seed.ts` — bruges kun som fallback når Supabase svarer
  `PGRST205` (tabel mangler). Vi må ikke længere lade seed-data lække ind i
  produktionsflow — det er allerede opdaget for projektgeometri.
- `iot-simulation-service` genererer deterministiske sensorer fra centroid.
  Skal markeres tydeligt som "simuleret" indtil rigtige IoT-forbindelser
  findes.
- `report-engine` er ægte: den samler kun rigtige data.

## 5. Manglende backend-endpoints

Ingen skarpe REST-routes findes for Naturprojekter — al læsning/skrivning
går gennem services i `src/services/*` der kalder Supabase direkte via
`supabase-js`. Det er OK for skrivning fra klienten (RLS beskytter), men
følgende handlinger mangler helt:
- Manuel sync af datakilde
- Test af datakildeforbindelse
- Generering af PDF-rapport
- Eksport af audit trail
- Sletning af projekt

## 6. Datamodel-mangler

Skal tilføjes for at leve op til masteropgaven (detaljer i
`nature-projects-data-model.md`):
- `project_boundaries` med `version` og `is_current`
- `data_source_runs` (sync-log)
- `indicator_definitions` (metadata + thresholds)
- `indicator_measurements` (tidsserie)
- `action_evidence` (relation mellem handling og bevis)
- `documents` (adskilt fra `evidence_files`, med typer og versioner)
- `project_members` (roller på projektniveau)
- Udvidelse af `sites` med `geometry`, `centroid`, `area_ha`, `municipality`, `status`
- Udvidelse af `audit_events` med `before_data`/`after_data`/`entity_type`/`entity_id`
- Udvidelse af `project_media` med `action_id`, `document_id`, `tags[]`, `direction`

## 7. Teknisk gæld

- `app.projects.$slug.tsx` er 908 linjer — bør splittes til én komponent pr. fane
- Fane-navigation er lokal state, ikke URL — dyb-linking virker ikke
- Ingen error boundaries på fanniveau
- Ingen loading skeletons — kun suspense der blokerer hele siden
- `getSupabaseClient()` kastes rundt i services — hjælper for RLS-fejl er lokale
- Ingen tests for `actions-service`, `indicators-service`, `audit-service`

## 8. Anbefalet implementeringsrækkefølge

Se `nature-projects-implementation-plan.md`. Kort:

1. **Fase 1 — Ryd op og gør Overblik færdig** (1 iteration)
   Klikbare tællere, klikbare KPI-kort, edit-projekt, statusskift,
   URL-baseret fane-state, IndicatorCard "ikke beregnet" logik.

2. **Fase 2 — Sites som førsteklasses objekt** (1-2 iterationer)
   DB-migration (geometri på sites), opret/redigér/arkivér, site-detalje-drawer,
   kobling til datakilder & indikatorer.

3. **Fase 3 — Datakilder med wizard og sync-log** (1-2 iterationer)
   `data_source_runs` migration, tilføj-wizard for de mest realistiske typer
   (upload, offentlige geodata, satellit, manuel), sync-log, kobling til
   indikatorer.

4. **Fase 4 — Indikator-tidsserie og detaljeside** (2 iterationer)
   `indicator_definitions`, `indicator_measurements`, historisk graf,
   thresholds, automatiske handlinger.

5. **Fase 5 — Handlinger med bevis, filtrering og checkliste** (1-2 iterationer)
   `action_evidence`, kobling til medier/dokumenter, filter/søg, bevis-krav
   ved afslutning.

6. **Fase 6 — Dokumentation & generator** (1-2 iterationer)
   Ny `documents`-tabel, typer, versioner, dokumentgenerator (PDF/CSV/JSON),
   dokumentationsscore.

7. **Fase 7 — Medier: kobling, tags, før/efter** (1 iteration)
   Udvid `project_media`, kobling til handling/dokument, før/efter-view,
   fuldskærmsviewer.

8. **Fase 8 — Audit trail: filtre, før/efter, eksport** (1 iteration)
   Udvid `audit_events`, filtrering, CSV/PDF-eksport.

9. **Fase 9 — Roller & rettigheder** (1 iteration)
   `project_members` med `role`-enum, `has_role`-lignende RPC,
   RLS-policies opdateret.

10. **Fase 10 — Test, mobil, tomme tilstande, fejltekster** (løbende)
