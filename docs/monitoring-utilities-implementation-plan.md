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
  den dedikerede server-secret `MONITORING_CRON_API_SECRET`, leveret via
  `x-api-key` eller `Authorization: Bearer <secret>`. En Supabase publishable,
  anon, secret eller service-role key må ikke bruges som endpoint-secret. Kører
  begge motorer for et enkelt projekt (via body `{project_id}`) eller alle
  projekter med aktive regler. Bruger `supabaseAdmin` (service-role, bypass RLS)
  internt til databasearbejdet — denne nøgle er ikke endpointets credential.
- `src/services/monitoring/__tests__/engines.test.ts` — 12 unit-tests for
  evaluator-outputs.

**UI**

- "Kør regler nu" og "Kør alarmregler nu" knapper på
  `/app/connect/quality` og `/app/connect/alerts` med toast + sidst-kørt info.

**Cron-opsætning**
Målkonfigurationen er en tilfældig, selvstændig secret med navnet
`MONITORING_CRON_API_SECRET` i både applikationens server-runtime og
schedulerens secret store. Schedulerens POST til den verificerede deployment-URL
skal bruge præcis én af disse former:

```http
x-api-key: <MONITORING_CRON_API_SECRET>
```

eller:

```http
Authorization: Bearer <MONITORING_CRON_API_SECRET>
```

Uden server-secret returnerer endpointet 503; manglende eller forkert credential
returnerer 401. `apikey` og den tidligere cron-header er udfasede og må ikke
bruges.

### Cutover-blokering før deployment

Denne plan og kodeændringen ændrer **ikke** et live pg_cron-job eller en ekstern
scheduler. Deployment/cutover er blokeret, indtil en operatør har:

1. oprettet en ny, uafhængig `MONITORING_CRON_API_SECRET` og lagt den i både
   server-runtime og schedulerens secret store uden at logge værdien;
2. identificeret og verificeret den aktuelle job-ID, jobname, schedule og
   deployment-URL i produktionsmiljøet — tidligere værdier i rapporter er kun
   historiske og uverificerede;
3. opdateret det verificerede job til `x-api-key` eller Bearer og fjernet enhver
   afhængighed af Supabase keys og legacy headers;
4. kørt en autoriseret smoke-test samt negative tests, der bekræfter 401 for den
   gamle/manglende credential og 503 ved manglende serverkonfiguration;
5. observeret mindst én planlagt, vellykket kørsel og registreret den
   verificerede konfiguration og rollback-procedure i run-loggen.

**Kendte begrænsninger**

- `missing_value` no-op (device_measurements.value er NOT NULL — kræver
  parameter-coverage-check for at give mening).
- `outside_project` bruger bbox i configuration (`{minLat,maxLat,minLng,maxLng}`)
  — reel polygon-in-zone kommer med PostGIS-integration.
- Notifikations-fanout (email/slack) er endnu ikke koblet på fired alarmer
  — kun `in_app` via `NotificationCenter`.
