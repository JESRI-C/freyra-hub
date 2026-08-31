# 4DM Project Monitor — integrationskontrakt

Status: audit og implementeringsretning, opdateret 2026-08-31. Live endpoints er ikke verificeret i denne cyklus.

## Fælles adapterkontrakt

Hver adapter skal tilbyde:

- `discover()` — capabilities, collections/layers/assets og metadata;
- `health()` — faktisk status, latency, `checked_at` og sanitiseret fejl;
- `fetch(request)` — timeout, begrænset retry/backoff, paging og rate-limit-awareness;
- `normalize(raw)` — typesikker canonical feature/asset/snapshot-model;
- `provenance(request, response)` — CRS, vilkår, upstream-id/version, `fetched_at` og checksum hvor muligt;
- `persist(snapshot)` — projekt-/tenant-scope og idempotent skrivning.

Når live mode er valgt, skal timeout/4xx/5xx give synlig fejl. Adapteren må ikke erstatte fejlen med preview-success. Preview-fixtures er separate og tydeligt mærkede. Connector logging er server-side, projektscopet og må ikke indeholde secrets.

## Aktuel status og næste handling

| Teknologi/kilde      | Auditstatus                   | Eksisterende                                           | Næste handling                                                                                                        |
| -------------------- | ----------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| WMS                  | Findes delvist                | Leaflet `tileLayer.wms` og hardcodede overlays         | Fælles GetCapabilities-parser; registrér layer-id, CRS, format, licens og health; bind registry til renderer.         |
| WFS                  | Dublet, som skal konsolideres | Flere fungerende Arealdata/Miljøportal/GEUS-veje       | Én serveradapter med capabilities, paging, timeout/cache, canonical feature-id og ens fejlsemantik.                   |
| STAC                 | Dublet, som skal konsolideres | Element84 scene discovery og separat Copernicus-client | Én kontrakt med provider-konfiguration, asset roles, bbox/datetime, pagination og provenance.                         |
| COG                  | Findes delvist                | `geotiff.js` range-read og B04/B08 NDVI                | Bevar læseren; tilføj rastermetadata/georeference og assetbinding. Generisk tiling/worker er **AFVENTER**.            |
| MARS WMS/WFS         | Mangler                       | Kun officielle endpoints i datakildekataloget          | Hent capabilities, fastlæg faktiske lag-id/CRS/format/vilkår, tilføj fixturetests og derefter én live dev/test smoke. |
| Supabase Storage/TUS | Kan ikke verificeres          | Standard upload og uploader-baseret object policy      | Transportabstraktion, projektsti og resumable klient; bucket/limits/resume/RLS verificeres i godkendt dev/test.       |

## Canonical kildehierarki

`integration_connection → data_source → integration_run → dataset/snapshot → asset/features → timeline/review/report`

- Connection indeholder secret-reference og providerkonfiguration, aldrig plaintext credentials i klienten.
- Data source beskriver semantik, ejer, CRS, dækning, opløsning, licens og forventet cadence.
- Run beskriver request, attempt, cursor/watermark, status, sanitized fejl og outputdataset.
- Dataset/snapshot låser præcis den version, som senere sammenligning og rapport anvender.

## Implementeringsrækkefølge

1. Konsolidér registry-/adapterkontrakten uden live ændring.
2. Gør uploadmanifest, checksum og idempotens canonical.
3. Konsolidér WFS og STAC med deterministiske fixtures.
4. Implementér MARS capabilities-adapter mod fixture.
5. Tilknyt validerede snapshots til tidslinje, Før/Efter og rapport.
6. Kør live dev/test smoke efter endpoint-, miljø- og mandatbekræftelse.

## Definition of done

En integration er først færdig med adapterkode, schema/metadata, negative fixturetests, synlig UI-status, persistens/proveniens, dokumenteret licens/CRS, sanitiseret logging og observeret dev/test-smoke. “Kode findes” eller preview er ikke “live”.
