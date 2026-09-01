# 4DM Project Monitor — datamodel og konsolideringsplan

Status: auditbaseret målmodel, opdateret 2026-08-31. Ingen nye 4DM-domænemigrationer i denne målmodel er anvendt; sikkerhedshardening er kun anvendt på staging.

## Principper

- Supabase/Postgres er system of record; PostGIS er canonical for søgbar geometri.
- Tenant/projekt scope håndhæves i databasen, ikke kun i UI/services.
- Originale filer og godkendte rapporter er immutable; nye behandlinger giver nye versioner.
- `uploads` er staging, ikke slutdomæne.
- Før nye tabeller oprettes, genbruges eller konsolideres eksisterende domæner, når semantikken passer.
- JSON bruges til rå provenance og leverandørmetadata; søgbare/validerbare kernefelter er typed kolonner.

## Kravdomæne til eksisterende model

| Kravdomæne           | Aktuel model                                                           | Beslutning                                                                                       |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Organisation/brugere | `organizations`, memberships, Supabase Auth, `profiles`                | Genbrug Auth som identitet og `profiles` som app-profil.                                         |
| Projekter            | `projects`                                                             | Genbrug; kræv organisation, statusconstraint, timestamps og senere soft delete.                  |
| Projektområder       | `projects.geometry_*`, `project_areas`                                 | Current boundary først; senere `project_boundaries` med revision, source, actor og `is_current`. |
| Datakilder           | `data_sources`, connector registry, `map_layers`                       | Konsolidér registry/source/layer-binding.                                                        |
| Datasets             | Ingen canonical tabel                                                  | Ny tabel er nødvendig mellem source/sync og asset/observation/analyse.                           |
| Observationer        | `observations`, `geo_observations`, `field_observations`, measurements | Definér fælles envelope; behold specialiserede typer som children/projections.                   |
| Change events        | Ingen                                                                  | Nyt domæne med før-/efter-dataset, geometri, metode, resultat, confidence og status.             |
| Reviews              | Ingen                                                                  | Nyt immutable review-domæne for dataset/change/observation/report/evidens.                       |
| Field visits         | Ingen sessionmodel                                                     | Nyt visit-domæne; observationer/media relateres til visit.                                       |
| Interventioner       | `actions`, `mitigation_measures`                                       | Intervention er den faktiske hændelse; `actions` genbruges som opgaver.                          |
| Tasks                | `actions`                                                              | Udvid med assignee-id, type/statusconstraints og relationer.                                     |
| Flyvninger           | `drone_flights`                                                        | Udvid med phase/round, mission, sensor, CRS/GSD, path/footprint og processing state.             |
| Media assets         | `uploads`, `project_media`, `drone_assets`, `observation_media`        | `uploads` staging; `project_media` canonical; øvrige specialisering/junction.                    |
| Evidens              | `evidence_files`, `action_evidence`, `documents`                       | `evidence_files` som register med checksum/version/provenance/review; relationer bevares.        |
| Audit                | `audit_events` og to services                                          | Genbrug tabellen; én service/RPC, stærk actor/project/before/after og append-only.               |
| Rapportskabelon      | Ingen                                                                  | Ny versioneret template-model.                                                                   |
| Genereret rapport    | `reports`, `documents`                                                 | `reports` er workflow/instance; `documents` er immutable output med hash/version.                |
| Integration/sync     | `integration_connections`, `integration_runs`, connector logs          | Connection → source → run → dataset; logs er child events.                                       |

## Første dataintegritetsgate

Før 4DM-migrationer må følgende dokumenteres på en frisk lokal/dev database:

1. hele migrationshistorikken replayes;
2. `project_media.project_id`-typekonflikt mod `projects.id` afklares;
3. åbne `dev_select_all`/anon/brede media-policies fjernes ved præcist navn;
4. `project_members` self-insert lukkes, så membership-baseret RLS ikke kan omgås;
5. `SECURITY DEFINER`-funktioner får eksplicit `REVOKE/GRANT EXECUTE` og fast `search_path`;
6. composite projectrelationer eller constraints forhindrer cross-project references;
7. GRANT og RLS testes separat med to organisationer og flere roller.

Nye 4DM-domænemigrationer samt hostet/produktionsdeploy er **NO-GO**, indtil hele gaten er bestået; cyklus 009's afgrænsede staging-sikkerhedsmigration er dokumenteret separat.

## Geometri

- P0 current boundary skal kunne valideres, gemmes, genindlæses og serialiseres identisk som canonical boundary-GeoJSON.
- Den nuværende JSONB-Polygon understøtter lokalt validerede huller i parser, beregning, Leaflet og eksport. MultiPolygon understøttes ikke ende til ende og afvises tydeligt uden skrivning, indtil schema, typer, editor og eksport udvides samlet.
- Senere canonical `project_boundaries.geom` bør være PostGIS `MultiPolygon,4326` med GiST, revision, source/provenance, actor, valid-from/-to og ét current-element pr. projekt.
- GeoJSON er en afledt serialisering af canonical geometri, ikke en separat uafhængig sandhed.

## Droneasset

Rå EXIF/XMP bevares i JSON, mens følgende er kandidater til typed kolonner på den eksisterende drone-specialisering: canonical media-id, PointZ/4326 capture point, capture time, GPS accuracy, absolute/relative altitude, heading/yaw/pitch/roll, kamera/sensor-id, focal length, width/height, CRS, GSD, SHA-256, validation/processing status, error, uploader og timestamps.

Flyvningen får phase/round, ekstern mission-id, sensor/kamera, CRS/GSD, PostGIS flight path/footprint og processing state. En unik idempotensregel baseres på projekt/flyvning/logical role/checksum.

## Vigtige indexer efter modelgodkendelse

- `actions(project_id, status, due_date)`
- `reports(project_id, status, created_at)`
- `evidence_files(project_id, report_id)`
- `project_media(project_id, captured_at, status)`
- `drone_assets(flight_id, captured_at)` plus GiST capture/footprint
- `integration_runs(connection_id, started_at)` og unik idempotency key
- `datasets(project_id, source_id, observed_from, observed_to)`
- `change_events(project_id, status, observed_at)` plus GiST geometri

## Storage

Staging har tre private buckets og delvist SQL-verificeret Storage-RLS. Den endelige drone-/documents-bucket- og pathkontrakt, rigtig Storage API list/read/write/delete, path spoofing og URL-expiry er fortsat **AFVENTER**.
