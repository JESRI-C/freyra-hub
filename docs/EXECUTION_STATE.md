# GoFreyra execution state

Opdateret: 2026-08-30, brugerbestilt P0-cyklus 004.

## Seneste verificerede checkpoint

- Repository/remote: `JESRI-C/freyra-hub`; branch `codex/gofreyra-p0`.
- Baseline HEAD for cyklus 004: `29d0845`, samme commit som `origin/codex/gofreyra-p0` ved cyklusstart.
- Faktisk stack og centrale auth-, API-, migrations-, kort-, upload-, Før/Efter-, målings-, kilde- og rapportveje er statisk auditeret.
- Runtime er fastlåst til Node `>=22 <23` og npm 10.9.2; frisk `npm ci` består med den synkroniserede lockfil.
- `npm run typecheck`: exit 0 efter alle ændringer.
- Målrettet lint på alle ændrede TypeScript-filer: exit 0. Global `npm run lint`: exit 1 med 5.432 fund (5.407 errors, 25 warnings), hovedsageligt eksisterende Prettier-gæld.
- Målrettede drone-/uploadtests: 32/32 består, heraf 22 metadata- og regressionstests med en programmatisk JPEG/EXIF-fixture gennem den reelle `exifr`-parser. Hele Vitest-suiten: 32 filer og 259/259 tests består.
- `npm run build`: exit 0. Buildscriptet giver Node 4 GB heap; Windows-dev springer den fejlende Lovable MCP-routegenerator over, mens de versionsstyrede MCP-ruter bevares.
- Natur-serverfunktionen bruger den eksisterende bearer-attacher og JWT-middleware, verificerer projektmedlem/org-admin før WFS/admin, reserverer persistens til editor+, bruger kun serverlagret centroid og registrerer den verificerede actor. Læserroller og manglende service-role er read-only.
- Observations-ingest er lokalt bundet til ét serverkonfigureret projekt pr. credential. Manglende/ugyldigt scope og credential A mod projekt B stopper før admin-klient/database; projektet skal have organisation, og alle site-/source-ID'er valideres samlet mod samme projekt før én atomisk bulk-insert.
- Dronefotos går nu gennem monitoring-uploadets valideringskø. Originalens SHA-256, versioneret parserkontrakt, rå EXIF/XMP, normaliseret tid/position/højde/retning/kamera/RTK og eksplicit QA gemmes samlet i eksisterende `uploads.detected_metadata`. Manglende eller modstridende geodata, ukendt UTC, parsefejl og manglende koordinater blokerer automatisk kortaktivering; der anvendes ingen projektcentroid som erstatning.
- Browser-smoke: `/` sender til `/login`, loginformularen renderes, og der er ingen browserfejl. En advarsel om flere GoTrue-klienter under samme storage key er registreret.
- Begge sikrede endpoints returnerer 503 før databaseadgang, når deres nye dedikerede secrets mangler.
- Verificerede checkpoints: `61bf18b` (runtime/npm/ledger), `106c825` (endpoint-sikkerhed/env/cutover), `142b9f4` (P0-styringsbaseline), `a13a1ae` (projektscopet naturpersistens) og `29d0845` (projektscopet observations-ingest). Featurebranchen er pushet til `origin/codex/gofreyra-p0`. Dronecheckpointet er gateklart til commit/push på samme branch; ingen PR, merge, deploy eller produktionsændring er udført.
- Samme-chat-automationen `gofreyra-p0-90-min-cyklus` er aktiv og fortsætter hver 90. minut med én afgrænset P0-opgave, de dokumenterede gates og automatisk stop/pause efter bestået P0.

## Aktiv højeste opgave

`SEC-P0-01B` er lokalt implementeret og testet for både naturpersistens og observations-ingest. Den højere `SEC-P0-02` er blokeret af manglende Supabase dev/test-adgang. På eksplicit brugerbestilling er en afgrænset, lokal del af `BA-P0-01` gennemført: tabsfri drone-metadataudtræk og fail-closed validering før den eksisterende uploadkø. Den samlede Før/Efter-opgave er ikke bestået.

## Aktive blokeringer

1. Den scoped observationsvalidering og efterfølgende insert er ikke én database-transaktion; schemaet mangler composite relation constraints. Endelig TOCTOU-lukning kræver sikker migration/RPC og live preflight i `SEC-P0-02`.
2. Migrationshistorikken indeholder legacy åbne policies, og `project_members` tillader self-insert uden at begrænse rolle. Det kan omgå app-lagets naturrollecheck; effektiv live RLS er ikke kendt, så deployment er **NO-GO**.
3. Supabase-connectoren har ikke adgang til den konfigurerede instans `ikrmcetjutqcjtwfhzfv`; live schema, Storage, scoped secret-provisionering og to-tenant-tests er blokeret.
4. Der er to Supabase GoTrue-klienter under samme storage key; browseren advarer om mulig udefineret adfærd.
5. Global lint er rød, og npm audit rapporterer 17 advisories (2 low, 5 moderate, 10 high). Buildet består, men store chunks og bundler-advarsler mangler triage.
6. Endeligt Haderslev/Skallebæk-projektnavn og reelt P0-datasæt er **AFVENTER** projektmaster.
7. Uploadkøen er endnu ikke routet til den kanoniske `drone_assets`-model og en verificeret privat projekt-/flight-bucket. Resumable batchupload, idempotent duplikathåndtering og live RLS-/Storage-tests er **AFVENTER**.
8. Et dronekamerapunkt er ikke et footprint eller en ortofoto-georeference. Objektiv/sensor/GSD/footprint og eventuel fotogrammetri kræver verificerede input og må ikke udledes ved gæt.
9. Interaktiv browseraccept af droneflowet er **AFVENTER**: den tilgængelige browser afviste den lokale `127.0.0.1`-URL af sikkerhedspolitik. Det er ikke registreret som en produktfejl.

## Næste handlinger

1. Commit og push det gateverificerede drone-metadata-checkpoint alene til `codex/gofreyra-p0`.
2. Auditer den eksisterende platform mod den bestilte 4DM Project Monitor-arbejdsrejse og vælg derefter kun den højest prioriterede ublokerede vertikale P0-del; bevar TanStack/React/Vite/Leaflet/Supabase.
3. Få Supabase dev/test-adgang, preflight schema/data, luk self-insert/legacy policies og TOCTOU-gabet sikkert, og udfør negative RLS-/Storage-tests med to organisationer.
4. Provisionér ét nyt observations-secret sammen med præcis ét eksisterende projekt-ID, og rotér secretet ved scopeskift; dette kræver miljøejerens mandat og er **AFVENTER**.

## Genoptagelseskontrol

Læs dette dokument, backlog, QA-matrix, beslutninger og seneste run-log. Kør derefter `git status --short --branch`, kontrollér at eksisterende ændringer tilhører den aktive cyklus, og overskriv dem ikke. Der må ikke startes P1/P2, commit/push eller ekstern handling uden opfyldt gate og mandat.
