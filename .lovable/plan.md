
# Fase D — Monitoring & Field Data: De fire fælles værktøjer

## Mål

Gøre `Upload center`, `Datakvalitet`, `Alerts` og `Tilføj datakilde` til fuldt operationelle rygrader i modulet — koblet til projekter, zoner, enheder, datakilder, indikatorer, handlinger og audit trail. Ingen fake-statistik, ingen døde knapper, ingen hardkodede procenter.

## Nuværende status (audit i korte træk)

Følgende findes allerede men er delvis prototyper:
- `app.connect.upload.tsx` (229 l) — UI-skitse uden reel backend/import.
- `app.connect.quality.tsx` (323 l) — læser fra `data_quality_service` men mangler regler, issues og handlinger.
- `app.connect.alerts.tsx` (238 l) — læser fra `monitoring_alerts` men mangler regler, kommentarer og handling-flow.
- `app.connect.add.tsx` (368 l) — enkel formular, ikke en wizard med test/mapping/validering.
- Services: `alerts-service`, `data-quality-service`, `devices-service`, `measurements-service`, `integrations-service` findes men er tynde.

Fuld audit skrives til `docs/monitoring-utilities-audit.md` i første trin.

## Leveranceplan (opdelt i 4 delfaser)

Fordi omfanget er meget stort (databaseskema for 7 nye tabeller + storage bucket + 4 store UI-flows + wizard + tests) foreslår jeg at levere det i 4 sammenhængende delfaser, så du kan godkende migrationer og se fremdrift undervejs.

### D1 — Fundament: audit, database, storage, services
- Audit-, plan- og testdokumenter i `docs/`.
- Migration: `uploads`, `upload_import_jobs`, `data_quality_rules`, `data_quality_issues`, `alert_rules`, `alert_comments`, `data_source_mappings` + GRANTs + RLS via `is_project_member`.
- Udvid `monitoring_alerts` med `alert_rule_id`, `resolution_data`, `recommended_actions`, `assigned_to`.
- Storage bucket `monitoring-uploads` (privat) + signed URL helper.
- Nye/udvidede services:
  - `uploads-service` (CRUD, signed URL, klassifikation)
  - `upload-import-service` (CSV/Excel/GeoJSON/KML/GPX parsing + mapping)
  - `data-quality-service` udvidet (regel-motor, issue-CRUD, score pr. dim.)
  - `alerts-service` udvidet (rules, comments, assign/resolve/reopen)
  - `data-sources-service` (wizard state, connection-test)
- Audit-logging helper der bruger eksisterende `audit_events`.

### D2 — Upload center
- Ny fuld side + drawer-wizard (Klassificér → Validér → Preview/Mapping → Godkend → Import).
- Drag-and-drop, mobil kamera-input, filtype-detektion, EXIF/GPS-læsning.
- Preview: tabel for CSV/Excel, kort for GeoJSON/KML/GPX, billede/video-preview.
- Kolonne-mapping UI, statusspor (kladde → importeret/afvist), importhistorik.
- Kobling til `SpeciesRecognitionFlow` for billeder → feltobservationer.
- Audit-events på upload, validering, import, sletning.

### D3 — Datakvalitet + Alerts
- **Datakvalitet:** overblik pr. projekt/zone/datakilde/enhed, 7 dimensioner, issue-liste, detaljedrawer, godkend/afvis/korrigér med audit trail, konsekvens for indikatorer, regelmotor `data_quality_rules`.
- **Alerts:** indbakke med filter/severity, detaljedrawer med relaterede data + kort/graf, tildel/kommentér/løs/genåbn, opret handling fra alert, alert-regel-editor, in-app notifikationer via `NotificationCenter`.

### D4 — Tilføj datakilde-wizard + oprydning
- 9-trins wizard i drawer/side (type → projekt/zone → opsætning → mapping → kvalitetsregler → indikatorer → sync → test → aktivér).
- Type-specifik opsætning: sensor / satellit / API / CSV / GeoJSON / manuel / offentlige geodata.
- Reel connection-test (server-side for API, format-test for filer).
- Aktivering skriver `data_sources`, `data_source_mappings`, første import job, audit-event.
- Topbar-navigation: sikre grøn underline for aktiv, ingen horisontal scroll på desktop, individuel scroll på mobil.
- Endelig `docs/monitoring-utilities-delivery-report.md` + testkørsel.

## Tekniske noter

- Alle nye tabeller får `is_project_member(project_id)`-baserede RLS-policier (SELECT/INSERT/UPDATE/DELETE) plus `service_role`-grants.
- Filparsing kører client-side hvor muligt (`papaparse`, `xlsx`, `@tmcw/togeojson`, `exifr`); tunge/valideringstunge trin (endelig import, connection-test) kører som `createServerFn` med `requireSupabaseAuth`.
- Storage: privat bucket `monitoring-uploads`; frontend uploader via signed URL fra server-fn.
- Ingen credentials i frontend — API-nøgler til datakilder gemmes via `add_secret` eller server-side `integration_connections.credentials_encrypted`.
- Alle mutationer skriver til `audit_events` med `entity_type`, `entity_id`, `action`, `metadata`.

## Bekræftelse

Sig **"kør fase D1"** for at starte med audit-dokumentation + database + services + storage. Herefter fortsætter jeg med D2, D3 og D4 i selvstændige leverancer.
