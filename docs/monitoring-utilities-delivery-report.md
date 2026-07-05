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

Vitest: 76 passing (12 test-filer). Nye:
- `src/services/monitoring/__tests__/engines.test.ts` — 12 unit-tests
  for kvalitets- og alarm-evaluators.

`tsgo --noEmit`: 0 fejl.

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
