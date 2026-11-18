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

## Fase C — leveret

**Migration**
- Nye tabeller: `integration_connections`, `drone_flights`, `drone_assets`, `environmental_analyses`, `data_exports`, `monitoring_alerts`. RLS via `is_project_member` + GRANTs til `authenticated` / `service_role`.

**Nye services**
- `src/services/monitoring/integrations-service.ts` — CRUD for 3.-parts kilder (fx Sentinel Hub, MiljøGIS, GBIF). Credentials refereres via `credential_ref` (peger på Supabase-secret), aldrig plaintext i DB.
- `src/services/monitoring/drone-service.ts` — flyvninger + tilhørende assets.
- `src/services/monitoring/alerts-service.ts` — list, opret, `acknowledgeAlert`, `resolveAlert`, severity-tone helper.
- `src/services/monitoring/observations-service.ts` — feltobservationer + `maskCoordinates()` for følsomme arter (præcis / maskeret ≈1 km / kun zone ≈10 km / skjult).
- `src/services/monitoring/export-service.ts` — CSV, GeoJSON og JSON generatorer + browser-download; Excel/PDF/KML markeret som næste iteration.

**Nye komponenter**
- `src/components/monitoring/SpeciesRecognitionFlow.tsx` — upload feltbillede → Lovable AI Gateway (Gemini vision via eksisterende `identifySpeciesFromImage`) → forslag med sandsynlighed → bekræft og gem som `field_observation`.
- `src/components/monitoring/NotificationCenter.tsx` — viser åbne / bekræftede alarmer, tillader bekræft og løs.

**Sikkerhed**
- Alle nye tabeller kræver projektmedlemsskab; ingen anon-adgang.
- Observationer bruger `visibility` og `maskCoordinates()` for at skjule præcise koordinater for følsomme arter (fx redepladser for rovfugle).

**Miljøvariabler**
- `LOVABLE_API_KEY` — allerede aktiv, bruges af `identifySpeciesFromImage`.
- Eventuelle satellitkilder (Sentinel Hub Instance ID mv.) tilføjes via `integration_connections.configuration` + secret-reference — ikke som globale env vars.

**Kendte begrænsninger**
- IntegrationWizard, DroneFlightForm og ExportWizard er ikke leveret som UI endnu — services er klar, wizards mangler.
- Ægte satellit-pixel-behandling kræver ekstern service (Sentinel Hub, Planet). `environmental_analyses` er datamodel og adapter-punkt, ikke råpixel-processor.
- Rigtig realtid: Supabase Realtime kan slås til pr. tabel når behovet opstår; i dag polles via TanStack Query.
- Drone ortofoto-stitching (OpenDroneMap eller lignende) er ekstern; upload + metadata + link til færdig ortho leveres via `drone_assets`.
- Export understøtter CSV / GeoJSON / JSON — Excel, PDF og KML mangler.
- Alarmer skabes p.t. programmatisk (fx fra anomali-detektion i `measurements-service.detectAnomalies`) — en automatisk cron eller trigger til at oprette dem er ikke sat op endnu.

## Anbefalede næste udviklingsspor

1. **IntegrationWizard + DroneFlightForm + ExportWizard UI** oven på de leverede services.
2. **Alarm-motor**: cron/edge-job der ser på nye `device_measurements` og opretter `monitoring_alerts` når `detectAnomalies` eller device-offline-status slår ind.
3. **Storage buckets** for observation-media og drone-assets (RLS bundet til projektmedlemsskab).
4. **Excel/PDF/KML** til `export-service.ts` (fx via `xlsx`, server-side PDF).
5. **Realtime** via Supabase Realtime på `monitoring_alerts` og `device_measurements` når skalering kræver det.
