# Monitoring Utilities — Test Plan (Fase D)

## Unit tests
- `uploads-service`: klassifikation, status-overgange, filtype-detektion.
- `upload-import-service`: CSV-parse, Excel-parse, GeoJSON validering,
  kolonne-mapping.
- `data-quality-service`: regelmotor (missing / outlier / dublet / GPS /
  interval / stale), score-aggregering.
- `alerts-service`: assign, resolve, reopen, regel-evaluering.
- `data-sources-service`: connection-test happy path + 401/timeout.

## Integration tests
- Upload → import job → audit-event kæde.
- Alert-regel trigger → alert oprettet → notifikation.
- Datakvalitet-issue oprettet → indikator markeret som usikker.

## E2E / manuel
- Upload JPEG med GPS → observation.
- Upload CSV → mapping → import med advarsler → fejlrapport.
- Upload GeoJSON → kort-preview → gem som zone.
- Opret sensor via wizard → connection-test → aktiver → første måling.
- Opret API-datakilde → 401-fejl → tydelig fejltekst.
- Godkend/afvis datakvalitet-issue → indikator opdateret.
- Alert-regel → alert oprettes → tildel → løs.
- Layout: ingen horisontal scroll på desktop; tab-bar scroller på mobil.
