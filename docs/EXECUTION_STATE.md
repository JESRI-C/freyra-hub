# GoFreyra execution state

Opdateret: 2026-08-31, brugerbestilt P0-cyklus 005.

## Seneste verificerede checkpoint

- Repository/remote: `JESRI-C/freyra-hub`; branch `codex/gofreyra-p0`.
- Baseline HEAD for cyklus 005: `0f2afbd`, samme commit som `origin/codex/gofreyra-p0` ved cyklusstart.
- Faktisk stack og centrale auth-, API-, migrations-, kort-, upload-, Før/Efter-, målings-, kilde- og rapportveje er statisk auditeret.
- Runtime er fastlåst til Node `>=22 <23` og npm 10.9.2; frisk `npm ci` består med den synkroniserede lockfil.
- `npm run typecheck`: exit 0 efter alle ændringer.
- Målrettet lint på alle ændrede TypeScript-filer: exit 0. Global `npm run lint`: exit 1 med 5.432 fund (5.407 errors, 25 warnings), hovedsageligt eksisterende Prettier-gæld.
- Målrettede geometri-/persistens-/eksporttests: 8 filer og 68/68 tests består. Hele Vitest-suiten består ved ren solo-genkørsel med 37 filer og 308/308 tests. En tidligere parallel kørsel ramte timeoutstøj i urørte natur-/ledger-tests; solo-genkørslen er det aktuelle gate-resultat.
- `npm run build`: exit 0. Buildscriptet giver Node 4 GB heap; Windows-dev springer den fejlende Lovable MCP-routegenerator over, mens de versionsstyrede MCP-ruter bevares.
- Natur-serverfunktionen bruger den eksisterende bearer-attacher og JWT-middleware, verificerer projektmedlem/org-admin før WFS/admin, reserverer persistens til editor+, bruger kun serverlagret centroid og registrerer den verificerede actor. Læserroller og manglende service-role er read-only.
- Observations-ingest er lokalt bundet til ét serverkonfigureret projekt pr. credential. Manglende/ugyldigt scope og credential A mod projekt B stopper før admin-klient/database; projektet skal have organisation, og alle site-/source-ID'er valideres samlet mod samme projekt før én atomisk bulk-insert.
- Dronefotos går nu gennem monitoring-uploadets valideringskø. Originalens SHA-256, versioneret parserkontrakt, rå EXIF/XMP, normaliseret tid/position/højde/retning/kamera/RTK og eksplicit QA gemmes samlet i eksisterende `uploads.detected_metadata`. Manglende eller modstridende geodata, ukendt UTC, parsefejl og manglende koordinater blokerer automatisk kortaktivering; der anvendes ingen projektcentroid som erstatning.
- 4DM-auditten er dokumenteret mod den faktiske TanStack/React/Vite/Leaflet/Supabase-platform. Første vertikale slice gør projektgrænsen fail-closed, reelt redigerbar og ventende på bekræftet persistence før success; ugemte edits blokerer konfliktende boundary-operationer, clear nulstiller afledte værdier uden at genoplive seed-geometri, og både projektkort og Connect bruger canonical, valideret GeoJSON uden skjult seed-/preview-fallback.
- Polygon-ringe og huller valideres for lukning, WGS84-range, dubletter, selvskæring, nulareal og indbyrdes topologi. Import begrænses til 2 MiB og 500 reelle vertices før dyre operationer; MultiPolygon og FeatureCollection afvises eksplicit. Areal og centroid beregnes centralt og eksportarealet afledes fra den validerede geometri.
- RPC-observationer dybdevalideres for Point, MultiPoint, LineString, MultiLineString, Polygon og MultiPolygon. Ukendt/ugyldig geometri, usand project-identitet og 200 eller flere observationsfeatures afvises, så et muligt afkortet udtræk ikke fremstår komplet. Canonical observations-CSV afledes kun af dette validerede GeoJSON; Connect metrics-/zone-CSV er separate udtræk.
- Browser-smoke: `/` sender til `/login`, loginformularen renderes, og der er ingen browserfejl. En advarsel om flere GoTrue-klienter under samme storage key er registreret.
- Begge sikrede endpoints returnerer 503 før databaseadgang, når deres nye dedikerede secrets mangler.
- Verificerede checkpoints: `61bf18b` (runtime/npm/ledger), `106c825` (endpoint-sikkerhed/env/cutover), `142b9f4` (P0-styringsbaseline), `a13a1ae` (projektscopet naturpersistens), `29d0845` (projektscopet observations-ingest) og `0f2afbd` (drone-metadata-QA). Featurebranchen er pushet til `origin/codex/gofreyra-p0`; 4DM-geometrislicen er gateverificeret og afventer sit eget commit/push. Ingen PR, merge, deploy eller produktionsændring er udført.
- Samme-chat-automationen `gofreyra-p0-90-min-cyklus` er aktiv og fortsætter hver 90. minut med én afgrænset P0-opgave, de dokumenterede gates og automatisk stop/pause efter bestået P0.

## Aktiv højeste opgave

`SEC-P0-01B` er lokalt implementeret og testet for både naturpersistens og observations-ingest. Den højere `SEC-P0-02` er blokeret af manglende Supabase dev/test-adgang. På eksplicit brugerbestilling er drone-metadata-checkpointet pushet, og en afgrænset lokal del af `GEO-P0-01` er gennemført. Den samlede Før/Efter-rejse og 4DM Project Monitor er ikke bestået.

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
10. Projektgrænsen har endnu ikke immutable revisioner eller versionskolonne til cross-tab/to-bruger optimistic concurrency. Den lokale hook afviser samtidige writes i samme UI-instans, men en komplet løsning kræver schema-/RPC-ændring og live verifikation.
11. Canonical geometri er fortsat et enkelt GeoJSON `Polygon`; `MultiPolygon` og `FeatureCollection` er eksplicit unsupported i denne slice.
12. Boundary-rækken og RPC-feature-samlingen læses ikke atomisk eller mod samme version. Metrics-cachen invalideres på boundary save/clear, og ugyldigt `calculated_at` afvises, men det aktuelle schema har ingen boundary-/source-version, som kan bevise metrics-friskhed. Begge garantier er **AFVENTER** schema-/RPC-versionering og live verifikation.

## Næste handlinger

1. Commit og push kun den gateverificerede 4DM-geometrislice til `codex/gofreyra-p0`.
2. Få Supabase dev/test-adgang, preflight schema/data, luk self-insert/legacy policies og TOCTOU-gabet sikkert, og udfør negative RLS-/Storage-tests med to organisationer.
3. Når sikkerhedsmiljøet fortsat er blokeret, vælg næste højest prioriterede ublokerede P0-slice; efter backlogrækkefølgen er det konsolidering af auth/session-klientlaget før nye 4DM-domæner.
4. Efter sikkerhed/auth: etabler versionsfast boundary/survey/flight/dataset-model, privat Storage og Før/Efter-parring uden at bygge en parallel platform.

## Genoptagelseskontrol

Læs dette dokument, backlog, QA-matrix, beslutninger og seneste run-log. Kør derefter `git status --short --branch`, kontrollér at eksisterende ændringer tilhører den aktive cyklus, og overskriv dem ikke. Der må ikke startes P1/P2, commit/push eller ekstern handling uden opfyldt gate og mandat.
