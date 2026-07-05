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
