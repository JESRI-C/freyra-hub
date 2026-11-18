# Monitoring Utilities — Audit (Fase D)

Denne audit dækker de fire fælles værktøjer i Monitoring & Field Data-modulet:
Upload center, Datakvalitet, Alerts og Tilføj datakilde.

## Eksisterende komponenter

| Område | Fil | Status |
| --- | --- | --- |
| Upload UI | `src/routes/app.connect.upload.tsx` (229 l) | Prototype-UI. Dropzone er dekorativ, ingen backend-behandling. |
| Datakvalitet UI | `src/routes/app.connect.quality.tsx` (323 l) | Læser `computeDataQualityScore`, men mangler regler, issues og godkendelsesflow. |
| Alerts UI | `src/routes/app.connect.alerts.tsx` (238 l) | Læser `monitoring_alerts`, men mangler regel-editor, kommentarer og handlings-flow. |
| Tilføj datakilde UI | `src/routes/app.connect.add.tsx` (368 l) | Enkelt formular. Ikke en wizard, ingen test/validering, ingen mapping. |
| Devices wizard | `src/components/monitoring/DeviceWizard.tsx` | 6-trin, virker — bruges i D4 som mønster. |
| Species flow | `src/components/monitoring/SpeciesRecognitionFlow.tsx` | Genbruges i upload-flow for billeder. |
| Notification center | `src/components/monitoring/NotificationCenter.tsx` | Genbruges til in-app alert-notifikationer. |

## Eksisterende services

| Fil | Formål | Mangler |
| --- | --- | --- |
| `services/monitoring/alerts-service.ts` (54 l) | List/ack/resolve | Regler, kommentarer, assign, resolution_data, oprettelse via regelmotor. |
| `services/monitoring/data-quality-service.ts` (92 l) | 7-dim score | Issue-CRUD, regeltabel, `godkend/afvis/korrigér`-mutationer, indikator-konsekvens. |
| `services/monitoring/devices-service.ts` (81 l) | CRUD + KPI | OK. |
| `services/monitoring/measurements-service.ts` (33 l) | Series + anomaly | OK. |
| `services/monitoring/integrations-service.ts` (30 l) | List integrations | Test-connection, credentials via server-fn. |
| `services/monitoring/observations-service.ts` (46 l) | List field obs | OK. |
| `services/monitoring/export-service.ts` (76 l) | CSV/JSON export | OK. |

## Eksisterende tabeller

Findes: `monitoring_devices`, `device_parameters`, `device_measurements`,
`device_maintenance_logs`, `monitoring_zones`, `monitoring_alerts`,
`data_sources`, `integration_connections`, `integration_runs`,
`field_observations`, `observation_media`, `data_quality_assessments`,
`indicators`, `indicator_measurements`, `actions`, `action_evidence`,
`audit_events`.

Mangler for Fase D: `uploads`, `upload_import_jobs`, `data_quality_rules`,
`data_quality_issues`, `alert_rules`, `alert_comments`, `data_source_mappings`.

`monitoring_alerts` mangler kolonnerne `alert_rule_id`, `recommended_actions`,
`assigned_to`, `resolution_data`, `category`, `source_type`, `source_id`.

## Eksisterende storage

Ingen storage buckets er oprettet. Fase D opretter privat bucket
`monitoring-uploads` med signed-URL-adgang.

## Fejl og mangler fundet

- Ingen reel filbehandling — dropzones er inaktive.
- Ingen kolonne-mapping for CSV/Excel.
- Ingen preview for GeoJSON/KML/GPX.
- Ingen EXIF/GPS-læsning på billeder.
- Ingen regelmotor for alerts eller datakvalitet.
- Ingen kommentar- eller assign-flow på alerts.
- Ingen connection-test i "Tilføj datakilde".
- Credentials afsløret som simple tekstfelter uden server-side håndtering.
- Audit trail ikke koblet på upload/data-mutationer.
- Ingen indikator-konsekvens vist når data ekskluderes.

## Sikkerhedsrisici at adressere

- Filupload uden validering af MIME/size/type.
- Credentials i frontend state.
- Manglende RLS på kommende tabeller.
- Manglende maskering af følsomme artspositioner.
- Manglende sporbarhed på rådata-mutationer.

## Layout-issues

- Global horisontal scroll blev fjernet i Fase A; sikres igen efter tilføjelse
  af nye tabs (Upload, Datakvalitet, Alerts, Tilføj datakilde).
