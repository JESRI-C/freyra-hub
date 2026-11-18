# Monitoring Utilities — Implementation Plan (Fase D)

## D1 — Fundament (denne leverance)
- Docs: audit, plan, testplan.
- Migration: 7 nye tabeller + udvidelse af `monitoring_alerts`, RLS + GRANTs.
- Storage: privat bucket `monitoring-uploads`.
- Services: `uploads-service`, `upload-import-service`, udvidet
  `data-quality-service`, `alerts-service`, `data-sources-service`,
  `audit-service` helper.

## D2 — Upload center
- `app.connect.upload.tsx` (fuld side): 4 sektioner (upload / seneste /
  kø / importhistorik).
- `UploadWizard.tsx` (drawer): klassificér → validér → preview/mapping →
  godkend → import.
- Filparsere: papaparse, xlsx, @tmcw/togeojson, exifr.
- Kort-preview for geometri via eksisterende map-komponent.
- Kobling til `SpeciesRecognitionFlow` for billeder.

## D3 — Datakvalitet + Alerts
- `app.connect.quality.tsx`: overblik + issue-liste + detaljedrawer +
  regel-editor.
- `app.connect.alerts.tsx`: indbakke + detaljedrawer + regel-editor +
  handling-flow.
- Notifikationer via `NotificationCenter`.

## D4 — Tilføj datakilde
- `app.connect.add.tsx`: 9-trin wizard med type-specifik opsætning.
- Connection-test server-fn.
- Aktivering opretter `data_sources`, `data_source_mappings`, første job,
  audit-event.
- Topbar-oprydning + delivery report.

## Krydsende krav
- Alle mutationer skriver til `audit_events` via `logAuditEvent`.
- Server-fn med `requireSupabaseAuth` for privilegerede handlinger.
- Ingen credentials i frontend-state.

## Fase 2 — Engine + auto-eksekvering (leveret)

**Nye moduler**
- `src/services/monitoring/quality-engine.ts` — rene evaluators (`out_of_range`,
  `missing_gps`, `invalid_date`, `duplicate`, `identical_repeat`, `spike`,
  `unit_mismatch`, `stale_data`, `outside_project`) + orkestrator
  `runQualityEvaluation(projectId, { windowMinutes, client })` med dedup mod
  åbne issues og audit-log.
- `src/services/monitoring/alert-engine.ts` — evaluators for `device_offline`,
  `low_battery`, `missing_data`, `low_data_quality`, `critical_reading`,
  `data_anomaly` + orkestrator `runAlertEvaluation(projectId, ...)` med dedup
  mod aktive alarmer og audit-log.
- `src/routes/api/public/monitoring.evaluate.ts` — POST endpoint beskyttet af
  `X-Cron-Secret: $MONITORING_CRON_SECRET`. Kører begge motorer for et enkelt
  projekt (via body `{project_id}`) eller alle projekter med aktive regler.
  Bruger `supabaseAdmin` (service-role, bypass RLS) — kun til cron.
- `src/services/monitoring/__tests__/engines.test.ts` — 12 unit-tests for
  evaluator-outputs.

**UI**
- "Kør regler nu" og "Kør alarmregler nu" knapper på
  `/app/connect/quality` og `/app/connect/alerts` med toast + sidst-kørt info.

**Cron-opsætning**
Sæt secret via `add_secret` som `MONITORING_CRON_SECRET`, og lad pg_cron eller
en ekstern scheduler POST'e til
`https://<project>.lovable.app/api/public/monitoring/evaluate` med headeren
`X-Cron-Secret: <secret>`. Uden secret returnerer endpointet 503.

**Kendte begrænsninger**
- `missing_value` no-op (device_measurements.value er NOT NULL — kræver
  parameter-coverage-check for at give mening).
- `outside_project` bruger bbox i configuration (`{minLat,maxLat,minLng,maxLng}`)
  — reel polygon-in-zone kommer med PostGIS-integration.
- Notifikations-fanout (email/slack) er endnu ikke koblet på fired alarmer
  — kun `in_app` via `NotificationCenter`.
