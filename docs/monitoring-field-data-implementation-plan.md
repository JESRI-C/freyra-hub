# Monitoring & Field Data — Implementation Plan

## Fase A — leveret

**Filer ændret**
- `supabase/migrations/*` — 5 nye tabeller: `monitoring_devices`, `device_parameters`, `device_measurements`, `device_maintenance_logs`, `monitoring_zones`.
- `src/routes/app.connect.tsx` — nav reduceret fra 10 til 6 tabs, `min-w-0` / `overflow-x-hidden` på indholdscontainer, integreret `ConnectTopbar`.
- `src/routes/app.connect.map.tsx` — grid stacker under `xl` (1280 px), højre panel bliver drawer i stedet for fast kolonne, fjernet `max-w-[1500px]` cap.
- `src/routes/app.connect.index.tsx` og `app.connect.devices.tsx` — hardkodede procent-KPI'er markeret eller fjernet.

**Nye filer**
- `src/lib/connect-context.tsx` — hook `useConnectContext()` der læser `projectId` og `range` fra URL search params med fallback til `useAuth().currentProject`.
- `src/components/connect/ConnectTopbar.tsx` — projektvælger, datointerval-picker, søg-stub.
- `docs/monitoring-field-data-audit.md` — audit-rapport.
- `docs/monitoring-field-data-data-model.md` — datamodel.
- `docs/monitoring-field-data-implementation-plan.md` — denne fil.

**Ny miljøvariabel**
- Ingen nye påkrævet i Fase A.

## Fase B — leveret

**Migration**
- Nye tabeller: `integration_runs`, `field_observations`, `observation_media`, `data_quality_assessments`. Alle med `is_project_member`-baseret RLS og GRANTs til `authenticated` + `service_role`.
- `data_sources` findes fra tidligere schema og genbruges.

**Nye services**
- `src/services/monitoring/devices-service.ts` — CRUD + `deriveDeviceStatus()` fra `last_seen_at` og `expected_interval_minutes`; `computeDeviceKpis()` for topkort.
- `src/services/monitoring/measurements-service.ts` — insert + list + `detectAnomalies()` (z-score).
- `src/services/monitoring/data-quality-service.ts` — beregner komplethed, aktualitet, konsistens, validering, rumlig og tidsmæssig score + klartekst-forklaring.

**Nye komponenter**
- `src/components/monitoring/DeviceWizard.tsx` — 6-trins opret-enhed (type → identifikation → placering → parametre → interval → bekræft).

**Sider koblet på ægte data**
- `src/routes/app.connect.devices.tsx` — henter `monitoring_devices` for det valgte projekt, viser tom-tilstand hvis der ingen enheder er, KPI'er beregnes fra rigtige felter, status udledes serverside-neutralt i klienten.

**Kendte begrænsninger (til Fase C)**
- Detaljedrawer med målehistorik, batterikurve og vedligeholdelseslog er endnu ikke koblet på (Wizard opretter enheden; historikvisning tilføjes næste iteration).
- `data_sources`-siden og live-strømmen kører fortsat på seed indtil deres wire-up i næste iteration.
- Zone-CRUD flyttes fra `project_areas` til `monitoring_zones` når kort-editoren refaktoreres.
- Ingen aggregerings-view endnu — måleaggregering laves ad-hoc i klienten indtil datamængden retfærdiggør et materialized view.

## Fase B — udestående (planlagt til færdiggørelse)

- `src/services/monitoring/data-sources-service.ts` + wire af `app.connect.sources.tsx`.
- `src/services/monitoring/zones-service.ts` + skift af kortet til `monitoring_zones`.
- `src/components/monitoring/DeviceDetailDrawer.tsx`, `LiveStream.tsx`, `CoverageAnalysis.tsx`.
- Server functions under `src/lib/monitoring/*.functions.ts` med `requireSupabaseAuth`.
- Følsomme arts-observationer bruger `visibility` (præcis / maskeret / kun zone / skjult).

## Fase C — planlagt

**Nye tabeller**
- `integration_connections`, `drone_flights`, `drone_assets`, `environmental_analyses`, `data_exports`, `monitoring_alerts`.

**Nye services**
- `src/services/monitoring/integrations-service.ts` — credentials gemmes som Supabase Vault-reference, aldrig plaintext i DB.
- `src/services/monitoring/species-recognition-service.ts` — Lovable AI Gateway (Gemini vision), forslag med sandsynlighed.
- `src/services/monitoring/drone-service.ts`.
- `src/services/monitoring/export-service.ts` — GeoJSON, CSV, Excel, PDF, JSON, KML med metadata.
- `src/services/monitoring/alerts-service.ts`.

**Nye komponenter**
- `src/components/monitoring/SpeciesRecognitionFlow.tsx` — upload → EXIF → AI → validér → gem observation.
- `src/components/monitoring/IntegrationWizard.tsx`.
- `src/components/monitoring/DroneFlightForm.tsx`.
- `src/components/monitoring/ExportWizard.tsx`.
- `src/components/monitoring/NotificationCenter.tsx`.

**Miljøvariabler**
- `LOVABLE_API_KEY` (findes) — bruges til artsgenkendelse.
- Evt. `SENTINEL_HUB_INSTANCE_ID` hvis rigtig satellit-behandling aktiveres.

**Teststrategi**
- Vitest: datakvalitets-beregning, anomali-detektion, zone-geometri, EXIF-parsing, permissions, eksport-generatorer.
- Playwright: zone-tegning (mere end 3 punkter), upload-til-observation, opret-integration, eksport, mobil-flow.

**Kendte begrænsninger**
- Ægte satellit-pixel-behandling kræver ekstern service (Sentinel Hub, Planet). Fase C leverer adapter-interface, ikke råpixel-beregning.
- Rigtig realtid kræver enten Supabase Realtime (≤100 enheder) eller ekstern MQTT-broker. Vi starter med Supabase Realtime + ærlig "opdateres hvert 5 min" ved batch-kilder.
- Drone ortofoto-stitching (OpenDroneMap eller lignende) markeres som ekstern integration; upload + metadata leveres.
- Rate limiting sker applikations-side; egentlig platform-limit kræver Cloudflare-konfiguration.
