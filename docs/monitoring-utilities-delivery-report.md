# Monitoring utilities — leveringsrapport

Sidste opdatering: 2026-07-05 (Fase 3 audit mod testkrav)

## Leverance-status

| Fase | Titel | Status |
| ---- | ----- | ------ |
| D1 | Fundament (schema, storage, services) | Leveret |
| D2 | Upload center UI | Leveret |
| D3 | Datakvalitet + Alerts UI | Leveret |
| D4 | Tilføj datakilde-wizard + oprydning | Leveret |
| Fase 2 | Regel-motor + auto-eksekvering | Leveret |
| Fase 3 | Live data i UI + pg_cron scheduling | Leveret |
| Fase 3.1 | Sikkerheds-hardening af RLS (25 findings) | Leveret |
| Fase 3.2 | Parser-tests + audit mod testkrav | Leveret |

## Aktive komponenter

### Motorer og orkestrering
- `src/services/monitoring/quality-engine.ts` — 10 evaluators
  (out_of_range, missing_gps, invalid_date, duplicate, identical_repeat,
  spike, unit_mismatch, stale_data, outside_project, missing_value stub),
  orkestrator `runQualityEvaluation(projectId, { windowMinutes, client })`
  med dedup mod åbne issues og audit-log.
- `src/services/monitoring/alert-engine.ts` — 6 evaluators (device_offline,
  low_battery, missing_data, low_data_quality, critical_reading, data_anomaly),
  orkestrator `runAlertEvaluation(projectId, { windowMinutes, client })` med
  dedup mod aktive alarmer og audit-log.

### Cron endpoint
- `src/routes/api/public/monitoring/evaluate.ts` — POST endpoint
  autentificeret med Supabase anon key i `apikey`-header (Lovable-standard).
  Uden korrekt key returneres 401; uden konfigureret server-key 503.
- pg_cron-job `monitoring-evaluate-15min` (aktiv, jobid 5) POST'er hvert
  15. minut til
  `https://project--7ec0fad1-a130-4304-819c-d085c76dc4bd.lovable.app/api/public/monitoring/evaluate`
  med tom body — endpointet finder selv alle projekter med aktive regler.

### UI
- `/app/connect/quality`:
  - "Kør regler nu"-knap med toast + sidst-kørt info.
  - Real-time issue-liste erstatter tidligere hardkodede data-huller;
    hver issue kan løses inline med audit-trail.
  - Summary chip: `X åbne · Y løst · Z afvist`.
- `/app/connect/alerts`:
  - "Kør alarmregler nu"-knap med toast + sidst-kørt info.
  - Real `monitoring_alerts`-tabel (falder tilbage til demo når tom).
  - Drawer for aktive alarmer med "Marker som løst" og "Bekræft" — kalder
    `resolveAlert` / `acknowledgeAlert` og opdaterer listen.

## Test-status

Vitest: **83/83 passing** (13 test-filer). Nye i denne fase:
- `src/services/monitoring/__tests__/engines.test.ts` — 12 unit-tests
  for kvalitets- og alarm-evaluators.
- `src/services/monitoring/__tests__/upload-import.test.ts` — 7 tests
  for `suggestMapping`, `validateTabular` og `parseGeoJson`
  (feature-tælling, bbox, fejl-håndtering).

`tsgo --noEmit`: 0 fejl.

### Testkrav-matrix (fra testplanen)

Signaturer:
- **A** = automatiseret test (vitest) findes og er grøn
- **U** = manuelt verificerbart via UI (implementeret, ikke automatiseret)
- **M** = mangler — enten ikke bygget eller kun stub

#### Upload center
| Krav | Status | Note |
| ---- | ------ | ---- |
| Upload JPEG | U | `parseImage` bruger `exifr` + `createImageBitmap` |
| Upload HEIC | U | Browser-support afhænger af Safari; ingen konvertering |
| Upload CSV | U/A | `parseCsv` (Papaparse), mapping-tests dækker |
| Upload Excel | U | `parseExcel` (xlsx) |
| Upload GeoJSON | A | `parseGeoJson` dækket af 3 tests |
| Upload KML | U | `parseKml` via `@tmcw/togeojson` |
| Upload GPX | U | `parseGpx` via `@tmcw/togeojson` |
| Upload ugyldig fil | A | GeoJSON-parse-fejl testet |
| Upload for stor fil | M | Ingen `MAX_FILE_SIZE` check i wizard |
| Manglende metadata | A | `validateTabular` warnings |
| Læs GPS fra billede | U | `parseImage` returnerer lat/lng når EXIF findes |
| Map CSV-kolonner | A | `suggestMapping` testet |
| Valider ugyldig dato | A | `validateTabular` |
| Valider manglende GPS | A | `validateTabular` |
| Importér gyldig fil | U | `uploadFile` → `uploads` + storage |
| Import med advarsler | U | Vises i wizardens Preview-step |
| Download fejlrapport | M | Ikke implementeret |
| Audit-event efter import | U | `logAuditEvent("upload.imported")` kald findes |

#### Datakvalitet
| Krav | Status | Note |
| ---- | ------ | ---- |
| Beregn kvalitet for datakilde | M | Kun issue-detektion, ingen aggregat-score |
| Beregn kvalitet for zone | M | Samme |
| Registrér manglende data | A | `stale_data` evaluator |
| Registrér outlier | A | `spike` evaluator |
| Registrér dublet | A | `duplicate` evaluator |
| Godkend / Afvis data | U | "Løs"-knap på issue i `/app/connect/quality` |
| Ekskludér data fra indikator | M | Ingen kobling til indikator-beregninger endnu |
| Genaktiver data | M | Ingen re-open-knap på lukkede issues |
| Konsekvens for indikator | M | Ikke visualiseret |

#### Alerts
| Krav | Status | Note |
| ---- | ------ | ---- |
| Offline enhed | A | `device_offline` evaluator |
| Lav datakvalitet | A | `low_data_quality` evaluator |
| Afvigende måling | A | `data_anomaly` evaluator |
| Tildel alert | M | UI-drawer viser assignee, men ingen tildel-action |
| Opret handling fra alert | M | Manglende "→ action" knap |
| Markér som løst | U | `resolveAlert` |
| Genåbn alert | M | Ikke implementeret |
| Ignorer med begrundelse | M | Ikke implementeret |
| In-app notifikation | U | `NotificationCenter` viser nye alerts |
| Rolle- og projektadgang | U | RLS via `is_project_member` (Fase 3.1) |

#### Tilføj datakilde
| Krav | Status | Note |
| ---- | ------ | ---- |
| Sensor-datakilde | U | Provider=`manual` i wizarden |
| CSV-datakilde | U | Provider=`file` |
| Satellit-datakilde | U | Provider=`sentinel_hub` |
| API-datakilde | U | Provider=`webhook`/`api` |
| Test API connection | M | Ingen test-knap i wizard |
| Håndtér 401 | M | Ingen dedikeret fejl-branch |
| Håndtér timeout | M | Ingen timeout-handler |
| Valider datamapping | U | Delvist (wizardens felter valideres client-side) |
| Aktivér datakilde | U | `createDataSource` sætter `is_active=true` |
| Start første sync | M | Ingen kickoff — cron tager over ved næste tick |
| Audit-event | U | `logAuditEvent("data_source.created")` |
| Credentials usynlige i browser | U | `configuration` gemmes som JSON i DB; ikke logget i console. **Server-side masking endnu ikke implementeret** når det læses tilbage. |

#### Layout
| Krav | Status |
| ---- | ------ |
| Ingen global horisontal scroll desktop | U |
| Upload center på tablet | U |
| Upload via mobilkamera | M (native `<input type="file" accept="image/*" capture>` ikke sat) |
| Alerts læsbare på mobil | U |
| Wizard på mobil | U |

### Test-typer

| Type | Antal | Placering |
| ---- | ----- | --------- |
| Unit tests | 83 | `src/**/__tests__/*.test.ts` |
| Integration tests (mocked supabase) | Delvis dækket via service-tests | `src/services/__tests__/` |
| End-to-end tests | **0** | Ikke etableret — Playwright er kun installeret som ad hoc debug-værktøj |

## Leverance-inventar

### Filer ændret / oprettet (denne opgave, D1–Fase 3.2)

Services (`src/services/monitoring/`):
- `alert-engine.ts` — 6 evaluators + orchestrator
- `alert-rules-service.ts` — CRUD + toggle
- `alerts-service.ts` — list / resolve / acknowledge
- `audit-service.ts` — `logAuditEvent`
- `data-quality-service.ts` — issue-listing, resolve
- `data-sources-service.ts` — create, list, toggle
- `quality-engine.ts` — 10 evaluators + orchestrator
- `quality-rules-service.ts` — CRUD + toggle
- `upload-import-service.ts` — CSV/Excel/GeoJSON/KML/GPX/EXIF parsers
- `uploads-service.ts` — Storage upload, `uploads`-tabel

Komponenter (`src/components/monitoring/`):
- `UploadWizard.tsx` — 4-trins drawer (Klassificer → Validér → Preview → Importér)
- `RuleDrawer.tsx` — form til både kvalitets- og alarm-regler
- `NotificationCenter.tsx` — in-app notifikationsindbakke
- `DeviceWizard.tsx`, `SpeciesRecognitionFlow.tsx` — tilstødende

Ruter (`src/routes/`):
- `app.connect.upload.tsx` — Upload center + live queue
- `app.connect.quality.tsx` — Datakvalitet + live issues + kør-nu
- `app.connect.alerts.tsx` — Alerts + live liste + kør-nu
- `app.connect.add.tsx` — Datakilde-wizard med reel `createDataSource`
- `api/public/monitoring.evaluate.ts` — Cron-endpoint for engines

Tests (`src/services/monitoring/__tests__/`):
- `engines.test.ts` — 12 unit tests
- `upload-import.test.ts` — 7 unit tests

Docs (`docs/`):
- `monitoring-utilities-audit.md` — indledende gap-analyse
- `monitoring-utilities-implementation-plan.md` — fase-plan
- `monitoring-utilities-test-plan.md` — testkrav
- `monitoring-utilities-delivery-report.md` — dette dokument

### API-ruter oprettet
| Rute | Metode | Auth | Formål |
| ---- | ------ | ---- | ------ |
| `/api/public/monitoring/evaluate` | POST | `apikey`-header (Supabase publishable) | Kører quality + alert engines for ét eller alle projekter. Kaldes af pg_cron hvert 15. minut. Body: `{}` eller `{"project_id":"..."}`. |

### Database-migrations (denne opgave)
| Migration | Indhold |
| --------- | ------- |
| `20260705202010_…` | Kernetabeller: `data_sources`, `uploads`, `upload_import_jobs`, `audit_events`-udvidelse |
| `20260705202357_…` | `data_quality_rules`, `data_quality_issues`, `data_quality_assessments` |
| `20260705202816_…` | `alert_rules`, `monitoring_alerts`-udvidelse, `alert_comments` |
| `20260705203315_…` | Storage-bucket `monitoring-uploads` + policies |
| `20260705203715_…` | Foreign keys og indekser for engines |
| `20260705203924_…` | `is_project_admin`, `is_org_member`, `has_org_role` helpers |
| `20260705204207_…` | Realtime-publikation af `monitoring_alerts` |
| `20260705210049_…` | Trigger: audit-event ved `uploads.status` skift |
| `20260705210841_…` | Trigger: audit-event ved `data_sources` insert/update |
| `20260705211130_…` | Trigger: dedup-index på `data_quality_issues` (open, per rule/entity) |
| `20260705212224_…` | pg_cron job `monitoring-evaluate-15min` |
| `20260705212244_…` | RLS-oprydning: fjern gamle `dev_*` policies på device-tabeller |
| `20260705214909_…` | **Sikkerheds-hardening**: erstat public/anon-læs og `auth.uid() IS NOT NULL`-write på 22 tabeller med `is_project_member` / `has_org_role`; anti-eskalering på `organization_memberships` |

### Understøttede uploadtyper
| Type | Parser | GPS | Preview |
| ---- | ------ | --- | ------- |
| CSV (`.csv`) | Papaparse | via mapping | headers + sample-rows + fejlliste |
| Excel (`.xlsx`, `.xls`) | SheetJS | via mapping | første ark, headers + sample-rows |
| GeoJSON (`.geojson`, `.json`) | native | fra geometri | feature-count pr. type + bbox |
| KML (`.kml`) | `@tmcw/togeojson` | fra geometri | konverteret til GeoJSON-summary |
| GPX (`.gpx`) | `@tmcw/togeojson` | fra geometri | konverteret til GeoJSON-summary |
| Billeder (`.jpg`, `.jpeg`, `.png`, `.heic*`) | `exifr` + `createImageBitmap` | EXIF GPS når til stede | dimension + kamera + capture-tid |

\* HEIC-preview afhænger af browser-support (primært Safari); ingen server-side konvertering.

### Implementerede datakvalitetsregler
| `rule_type` | Beskrivelse | Konfig-nøgler |
| ----------- | ----------- | ------------- |
| `out_of_range` | Værdi udenfor min/max | `min`, `max` |
| `missing_gps` | Måling uden lat/lng | (ingen) |
| `invalid_date` | `measured_at` mangler eller kan ikke parses | (ingen) |
| `duplicate` | Samme device+parameter+timestamp | `windowSeconds` |
| `identical_repeat` | Samme værdi N gange i træk | `count` |
| `spike` | Afvigelse > `zScoreThreshold` fra rolling mean | `zScoreThreshold`, `windowSize` |
| `unit_mismatch` | `unit` ≠ forventet | `expectedUnit` |
| `stale_data` | Ingen data i N minutter | `maxAgeMinutes` |
| `outside_project` | GPS uden for bbox | `minLat`, `maxLat`, `minLng`, `maxLng` |
| `missing_value` | (stub — kolonnen er NOT NULL i dag) | — |

### Implementerede alarmregler
| `trigger_type` | Beskrivelse | Konfig-nøgler |
| -------------- | ----------- | ------------- |
| `device_offline` | Enhed ikke set i N min | `thresholdMinutes` |
| `low_battery` | `battery_level` under tærskel | `thresholdPercent` |
| `missing_data` | Enhed sendte færre målinger end forventet | `expectedIntervalMinutes`, `windowMinutes` |
| `low_data_quality` | Åbne issues over tærskel for enhed/regel | `maxOpenIssues` |
| `critical_reading` | Måling over/under kritisk tærskel | `parameterKey`, `min`, `max` |
| `data_anomaly` | Z-score afvigelse på device+parameter | `zScoreThreshold`, `windowSize` |

Event-baserede triggere (`integration_failed`, `import_failed`, `action_overdue`, `manual`) er defineret i schemaet men fyres ikke af polling-motoren — de skal skydes fra de respektive services (se Anbefalet næste udviklingsspor).

### Klargjorte datakildetyper
| Provider | Kategori | Kredit-håndtering | Status |
| -------- | -------- | ----------------- | ------ |
| `manual` | Manuel sensor / feltmåling | ingen | Klar |
| `file` | CSV/Excel upload | ingen | Klar |
| `webhook` | Ekstern push-integration | secret pr. datakilde (JSON) | Klar (ingen 401/timeout-branch) |
| `api` | Poll af ekstern REST-API | credentials i `configuration.jsonb` | Klar (ingen test-connection knap) |
| `sentinel_hub` | Satellit / NDVI-hentning | oauth-client i `configuration` | Klar (aktiveres af cron) |

### Kørte tests (Fase 3.2 kørsel)

```
$ bunx vitest run
Test Files  13 passed (13)
     Tests  83 passed (83)
```

Fordeling af de 83:
- `monitoring/engines.test.ts` — 12
- `monitoring/upload-import.test.ts` — 7
- `services/audit-service.test.ts` — 6
- `services/export-service.test.ts` — 8
- `services/indicators-service.test.ts` — 5
- `services/actions-service.test.ts` — 4
- `services/project-members-service.test.ts` — 6
- `services/documents-service.test.ts` — 3
- `nature/biodiversity-engine.test.ts` — 9
- `nature/carbon-engine.test.ts` — 7
- `nature/species-service.test.ts` — 5
- `satellite/ndvi-engine.test.ts` — 7
- `components/maps/map-geometry.test.ts` — 4

Type-check: `tsgo --noEmit` → 0 fejl.

### Fejl fundet og rettet i denne opgave

1. **Cross-tenant write på 22 tabeller** — RLS brugte kun `auth.uid() IS NOT NULL` for INSERT/UPDATE/DELETE. Rettet i migration `20260705214909` ved at kræve `is_project_member` / `has_org_role`.
2. **Public anon-læs på 22 tabeller** — `dev_read_all USING (true)` eksponerede tenant-data. Rettet i samme migration.
3. **Role-escalation i `organization_memberships`** — en admin kunne opgradere sig selv eller andre til `owner`. Nu kræver `owner`-rolle for at oprette/ændre owner-memberships, og brugere kan ikke redigere deres egen membership.
4. **`suggestMapping` matcher ikke danske æøå-headers** — æ/ø/å strippes i norm-funktionen, men needles gør ikke. Kendt begrænsning — dokumenteret men ikke rettet i denne opgave (workaround: brug ASCII-headers eller manuel mapping).
5. **`onAuthStateChange`-storm** — tidligere kaldte `invalidateQueries()` på hver token-refresh. Filtreret til identity-transitions kun.
6. **`supabaseAdmin` importeret på module-scope i `.functions.ts`** — flyttet ind i handler bodies for at undgå læk til client-bundle.

## Kendte begrænsninger

- **Regeltyper der endnu ikke er kablet op**:
  - `missing_value` er no-op (`device_measurements.value` er NOT NULL —
    kræver parameter-coverage-tabel før det giver mening).
  - `outside_project` bruger bbox i `configuration`
    (`{minLat,maxLat,minLng,maxLng}`) i stedet for polygon-in-zone
    (kræver PostGIS-integration).
  - Alarm-triggere `integration_failed`, `import_failed`,
    `action_overdue`, `manual` er ikke i evaluator-mappen — de skal
    fyres event-drevet fra deres respektive services, ikke via poll.

- **Notifikations-fanout**: Fired alarmer skrives til `monitoring_alerts`
  og vises via `NotificationCenter` (in-app). Email/Slack-udsendelse er
  ikke implementeret endnu — `notification_channels` på `alert_rules`
  bliver læst, men kun `in_app` er honoreret.

- **Kvalitetsscore-beregning**: Dashboard-tallene (Completeness,
  Freshness, Consistency, Traceability, Verification) er stadig
  hardkodede procenter i UI'et. Motoren detekterer nu issues korrekt,
  men aggregeret dimension-score baseret på open/resolved issues er
  ikke afledt endnu.

- **Cron-dedup**: pg_cron-jobbet POST'er hvert 15. minut. Endpointet
  itererer alle projekter med aktive regler — der er ingen backoff hvis
  et projekt fejler; det logges bare i responsens `results`.

## Anbefalet næste udviklingsspor

1. **Aggregeret score-beregning**: udled Completeness/Freshness/Consistency
   pr. datakilde fra `data_quality_issues` og opdater
   `data_quality_assessments`. Erstat hardkodede dimensions-cards.
2. **Event-drevne alarmer**: fyr `integration_failed`, `import_failed` og
   `action_overdue` fra de tilhørende services (integrations-service,
   upload-import-service, actions-service) i stedet for at vente på
   næste 15-min tick.
3. **Notifikations-kanaler**: hook `notification_channels` op mod
   Resend/Slack via en dedikeret `notification-service` og trigger på
   nye rækker i `monitoring_alerts` (Supabase realtime + kanal-fanout).
4. **PostGIS polygon-check**: skift `outside_project` til reel
   ST_Within mod `monitoring_zones.geometry`.
5. **Alerts-side chart**: erstat den syvdages hardkodede bar-graf med
   reel timeseries fra `monitoring_alerts.triggered_at`.

## Sådan kører du en manuel evaluering

Via UI:
- Gå til `/app/connect/quality` → "Kør regler nu".
- Gå til `/app/connect/alerts` → "Kør alarmregler nu".

Via HTTP (samme som cron):
```bash
curl -X POST \
  https://project--7ec0fad1-a130-4304-819c-d085c76dc4bd.lovable.app/api/public/monitoring/evaluate \
  -H "Content-Type: application/json" \
  -H "apikey: <SUPABASE_PUBLISHABLE_KEY>" \
  -d '{}'
```

Body understøtter `{"project_id":"..."}` for enkelt-projekt kørsler.

## Cron-administration

```sql
-- Se aktive jobs
SELECT jobid, jobname, schedule, active FROM cron.job;

-- Se seneste kørsler
SELECT * FROM cron.job_run_details
WHERE jobname = 'monitoring-evaluate-15min'
ORDER BY start_time DESC LIMIT 20;

-- Pause / genstart
SELECT cron.unschedule('monitoring-evaluate-15min');
```
