# Monitoring & Field Data — Audit (Fase A)

Optaget pr. 5. juli 2026. Baseret på faktisk kildekode i `src/routes/app.connect.*` og `src/components/connect/*`.

## Eksisterende routes

| Route | Fil | Status | Note |
|---|---|---|---|
| `/app/connect` | `app.connect.tsx` | Layout | Topbar + tabs. Har 10 tabs, ingen projektvælger, ingen datointerval. |
| `/app/connect/` | `app.connect.index.tsx` | Prototype | KPI-kort med hardkodede tal ("42", "36", "86%"). Fake datastrøm. AI-banner. |
| `/app/connect/devices` | `app.connect.devices.tsx` | Prototype | Tabel læser fra `DEVICES` seed i `src/lib/connect-data.ts`. Ingen backend. Filter og drawer virker på seed. Alle knapper i drawer-footer (Test forbindelse, Send til ESG, Deaktiver) er døde. |
| `/app/connect/sources` | `app.connect.sources.tsx` | Prototype | Læser fra seed. Ingen wizard, ingen synkronisering, ingen fejllog. |
| `/app/connect/integrations` | `app.connect.integrations.tsx` | Prototype | Ingen backend, ingen test-forbindelse. Credentials-håndtering findes ikke. |
| `/app/connect/live` | `app.connect.live.tsx` | Prototype | Læser `LIVE_OBSERVATIONS` fra seed. Fejlagtigt fremstillet som realtid. |
| `/app/connect/map` | `app.connect.map.tsx` | Delvist funktionel | Bruger `useMapEditor` + `MapEditorMap` med rigtig geometri fra `projects`. Zone-tegning findes men lukker efter 3 punkter. Grid `[280px_1fr_320px]` giver horisontal scroll under ~1080 px. Højre panel skæres af. |
| `/app/connect/upload` | `app.connect.upload.tsx` | Duplikat | Bør konsolideres ind i observations-flow. |
| `/app/connect/quality` | `app.connect.quality.tsx` | Prototype | Tabeller med hardkodede kvalitetstal. Ingen beregnet score. |
| `/app/connect/alerts` | `app.connect.alerts.tsx` | Prototype | Læser `ALERTS` fra seed. Ingen `monitoring_alerts`-tabel. |
| `/app/connect/registry` | `app.connect.registry.tsx` | Duplikat | Overlapper med Enheder. |
| `/app/connect/add` | `app.connect.add.tsx` | Wizard-stub | Ikke koblet på backend. |

## Konkrete UI-fejl (baseret på skærmbillede)

- **Horisontal scroll på hele indholdet** under ~1080 px viewport. Skyldes `grid-cols-[280px_1fr_320px]` på `app.connect.map.tsx` uden `min-w-0` på celler; center-kolonnen tvinger 540 px kort, og de tre kolonner + 2×16 px gap + p-6 kræver ca. 1000 px indre plads.
- **Tabs-bar** har 10 elementer i `overflow-x-auto`. Kombineret med `sticky` under AppTopbar gør den at siden føles snæver på små desktops.
- **Højre paneler skæres af** når grid ikke stacker fordi `lg:` breakpoint er 1024 px, og der er stadig 3-kolonne-tvang derover.
- **Fake procenter overalt**: "Aktive datakilder 42", "Datakvalitet 91%", "Online 86%" — ingen har backing i database. Kilde: `src/lib/connect-data.ts` + `src/lib/platform-data.ts`.
- **AI-banner** og "AI vedligeholdelsesanbefalinger" er statiske strings, ingen AI-kald.

## Døde knapper og widgets

- `app.connect.devices.tsx`, drawer-footer: `Test forbindelse`, `Se live data`, `Planlæg service`, `Send til ESG Ledger`, `Deaktiver` — alle er `<button>` uden `onClick`.
- `app.connect.index.tsx` "Send til DecisionsIQ", "Send til ESG Ledger", "Brug i rapport" — kalder kun `actionToast()`, ingen effekt.
- `app.connect.map.tsx` højre panel `Dataudtræk` — knapper virker (bruger `export-service`), men baseline er kun projektgrænse + zoner + sensorer. Ingen sensorhistorik, ingen observationer, ingen droneflyvninger endnu.

## Kortlag der ikke er ægte datalag

- **NDVI overlay** — virker (`useNdvi` henter fra `environmental.functions.ts` mod ekstern service). OK.
- **§3 natur** og **Vandløb** — virker (`useMapEditor` bruger GEUS/miljøportalen). OK.
- **IoT sensorer** — læser fra `SEED_SENSORS`, ikke database. Ingen ægte kobling til hverken `sensors` eller ny `monitoring_devices`.

## Eksisterende komponenter til genbrug

- `src/components/maps/MapEditorMap.tsx` og `src/hooks/useMapEditor.ts` — solid base for kortet.
- `src/hooks/useNdvi.ts`, `src/hooks/useFullAnalysis.ts` — reelle analyser mod ekstern data.
- `src/services/zones-service.ts` — CRUD på eksisterende `project_areas`-tabel (bruges af MapEditor).
- `src/services/export-service.ts` — GeoJSON/CSV eksport.
- `src/components/nature/SpeciesIdentifier.tsx` — AI-artsgenkendelse (findes, men leverer ikke til `field_observations`).
- `src/components/connect/Primitives.tsx` — `Drawer`, `DataQualityScore`, `DeviceStatusBadge`, `Section`, `Chip`.

## Manglende databasetabeller (adresseret i Fase A)

- ✅ `monitoring_devices` — oprettet
- ✅ `device_parameters` — oprettet
- ✅ `device_measurements` — oprettet
- ✅ `device_maintenance_logs` — oprettet
- ✅ `monitoring_zones` — oprettet (koblet til `monitoring_devices.zone_id`)

## Manglende databasetabeller (Fase B–C)

- `data_sources` med `integration_runs`
- `integration_connections` (credentials som reference, ikke plaintext)
- `field_observations` og `observation_media`
- `drone_flights` og `drone_assets`
- `environmental_analyses`
- `data_exports`
- `monitoring_alerts`
- `data_quality_assessments`

## Sikkerhedsproblemer fundet

- Ingen server-side credentials-håndtering for integrationer. Wizard i `add.tsx` gemmer værdier klientside.
- `ALERTS` og andre seed-lister eksponerer projekter og enhedsnavne som konstanter — OK i preview, men skal væk før produktion.
- Ingen rate limiting på uploads.

## Manglende audit logging

- Ingen af de nuværende Connect-handlinger kalder `logAuditEvent`. Ny model skal logge: enhed oprettet/opdateret/flyttet, måling valideret/afvist, integration testet/fejlet, zone oprettet, analyse gennemført, eksport genereret.

## Performanceproblemer

- Kort henter `paragraph3Areas` og `watercourseFeatures` uden viewport-filtrering. OK for demo-projekt, men skalerer ikke.
- Ingen aggregering på sensorhistorik — når `device_measurements` fyldes, skal chart-visning bruge time/dag-buckets.

## Anbefalet oprydningsrækkefølge

**Fase A (denne runde):**
1. Migration for de 5 kernetabeller — færdig.
2. Konsolidér nav fra 10 til 6 tabs (Overblik, Enheder, Datakilder, Integrationer, Live data, Kort & zoner). Wizards og lister flyttes ind under den relevante tab.
3. Fjern hardkodede procenter fra Overblik og Enheder — erstattes med ærlig tom tilstand.
4. Fix layout: `min-w-0`, `overflow-x-hidden` på indholdscontainer. Map-grid stacker under `xl` (1280 px), højre panel bliver drawer.
5. Global `ConnectTopbar` med projektvælger og datointerval (URL-synkroniseret via `?project=...&range=30d`).
6. Skriv `docs/monitoring-field-data-audit.md`, `-implementation-plan.md`, `-data-model.md`.

**Fase B:**
Enheder, Datakilder, Live data og Kort & zoner får ægte backend. Zone-tegning fixes (ingen auto-luk efter 3 punkter). NDVI + miljøanalyse bliver reelt værktøj.

**Fase C:**
Artsgenkendelse → `field_observations`. Droneflow. Integrationer med server-side credentials. Eksportwizard. Notifikationer. Test.
