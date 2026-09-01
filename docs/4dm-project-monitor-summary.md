# 4DM Project Monitor — arbejdscheckpoint

Status: **4DM er ikke afsluttet**. Dette dokument opsummerer det auditerede arbejdscheckpoint pr. 2026-08-31. Staging er migreret, tenanttestet og lokalt browser-smoketestet; rigtig Auth-/Storage API, den samlede kunderejse og produktion er fortsat `AFVENTER`, så platformen er ikke deployklar.

## 1. Hvad der allerede fandtes

- En moden TanStack Start/Router/Query-, React 19-, Vite-, Leaflet/Geoman- og Supabase-platform med login, tenants, projekter, kort, upload, mediebibliotek, connectorer, målinger og rapportkode.
- Flere eksisterende projektkort, en `projects.geometry_polygon`-grænse, GeoJSON-import/-eksport, WMS/WFS/STAC-byggesten, drone-uploadstaging, Før/Efter-komponent og `jsPDF`-generering.
- En etableret migrationshistorik, RLS-policies, Storage-relateret kode, service-role-endpoints og en voksende unit-/servicetestsuite.

Den detaljerede repository-status og gap matrix ligger i [4dm-project-monitor-audit.md](./4dm-project-monitor-audit.md).

## 2. Hvad der blev genbrugt

- De eksisterende projekt-, kort- og Supabase-services samt `projects.geometry_polygon`; der blev ikke oprettet en parallel boundary-tabel eller app.
- `MapEditorMap`, `useMapEditor` og de eksisterende projekt-/Connect-routes som brugerflader for den første slice.
- Den eksisterende RPC-baserede canonical GeoJSON-eksport og den deraf afledte observations-CSV, men nu bag en fail-closed validerings- og normaliseringskontrakt.
- Den eksisterende P0-backlog, QA-matrix, beslutningslog, run-log og operations-runbook som styringsspor.

## 3. Hvad der blev forbedret

- Gemte projektgrænser er nu faktisk redigerbare med eksplicit **Gem** og **Annuller**.
- UI'et fryser den aktuelle geometri før den asynkrone gemning, venter på persistence og viser retry ved fejl; sen create-events og samtidige writes i samme hook afvises.
- Mens en boundary har ugemte edits, blokeres tegning, upload, clear, projektskift og canonical GeoJSON-download; Gem og Annuller er fortsat tilgængelige.
- Polygonvalidering er centraliseret og dækker lukning, koordinatrange, nabodubletter, selvskæring, nulareal, huller og indbyrdes topologi.
- Areal og centroid beregnes centralt fra den validerede geometri; eksport genbruger ikke stale felter.
- Import begrænses før læsning/beregning til 2 MiB og 500 reelle vertices.
- RPC-observationer dybdevalideres for alle seks understøttede GeoJSON-geometrityper, og 200 eller flere observationsfeatures afvises som mulig databaseafkortning.
- Boundary save/clear invaliderer metrics-cachen; manglende eller ugyldigt `calculated_at` afvises. Friskhed mod den aktuelle boundary kan endnu ikke bevises uden schema-/versionsstøtte.
- Den afledte observations-CSV escape'r felter korrekt og neutraliserer værdier, der ellers kan blive regnearksformler; dette er ikke en bred garanti for Connects separate metrics-/zone-CSV.

## 4. Hvad der blev bygget

- En canonical eksportpipeline, hvor `geospatial-service` validerer RPC-svaret og injicerer den verificerede projektgrænse, mens `map-export-service` serialiserer den deraf afledte observations-CSV.
- Servicekontrakter for `persistProjectBoundary` og `clearProjectBoundary`, inklusive kontrol af den returnerede database-række før success.
- Nye pure/service-regressionstests for geometri, huller, limits, persistence, no-write/clear/concurrency og canonical/fail-closed eksport.
- En samlet 4DM-dokumentationspakke: audit, målarkitektur, brugerflow, datamodel, integrationskontrakt, teststrategi og en særskilt faglig [vandløbsmetodekontrakt](./4dm-watercourse-monitoring-method.md).

## 5. Hvilke dubletter der blev fjernet

- Connect-kortets lokale/simulerede GeoJSON-bygger er fjernet fra kundedownloadflowet; Connect og projektkort bruger nu den samme canonical eksportservice.
- Den uvirksomme **Send til rapport**-handling i korteksportpanelet er fjernet, så UI'et ikke lover en persistence, der ikke findes.
- Fire legacy-tests knyttet til den usikre, ubrugte eksportbygger blev fjernet og erstattet af tests af den canonical vej.

Andre identificerede dubletter i connector-, WFS/STAC-, kort-, medie-, audit- og rapportlagene er dokumenteret, men ikke massefjernet i denne afgrænsede slice.

## 6. Hvilke fejl der blev rettet

- En gemt grænse kunne se redigerbar ud, men ændringen blev ikke persisteret.
- Success kunne blive vist før alle relevante cache-invalideringer/readback var færdige, og stale success kunne hænge ved efter en ny operation.
- Clear kunne efterlade afledt areal/centroid, og eksport kunne anvende stale `area_ha`.
- Preview/seed eller mislykket RPC kunne blive til tilsyneladende kundedata ved fuldkortseksport.
- En ryddet live-boundary kunne blive genoplivet af matchende seed-geometri; seed fallback er nu begrænset til eksplicit preview/ukonfigureret miljø.
- Malformed RPC-features og ugyldige nested koordinater blev ikke dybdevalideret før download, og RPC-grænsen på 200 kunne ligne et komplet udtræk.
- Styret tegnetilstand og sene Geoman-events kunne kollidere med edit/save.
- Eksport, projektskift og andre boundary-operationer kunne startes med ugemte edits.
- Store filer eller Polygoner kunne udløse dyr parsing/topologibehandling før en rimelig grænse.

## 7. Databaseændringer

Boundary-slicen tilføjede ingen nye 4DM-domæne- eller Storage-migrationer. Sikkerhedshardening blev derimod anvendt på staging i cyklus 009; produktion blev ikke ændret. `projects.geometry_polygon` er fortsat canonical. Immutable boundary-revision/version og optimistic concurrency kræver en senere særskilt migrationsgate.

## 8. Nye routes og komponenter

Der er ingen nye routes eller parallelle UI-komponenter. Følgende eksisterende flader er ændret:

- projektets geometri-route;
- projektets fulde kort-route;
- Connect-kortet;
- `MapEditorMap`, `MapExportPanel` og `useMapEditor`.

Nyt kode-modul: `src/services/map-export-service.ts`. Derudover er der tilføjet fem målrettede testfiler og otte 4DM-dokumenter inklusive denne opsummering.

## 9. Integrationer

- Eksisterende Supabase/RPC-geodataeksport bruges kun, når databasekonfigurationen er til stede og svaret består strukturvalidering; live-fejl bliver synlige fejl, ikke seed-success.
- MARS, WMS/WFS, STAC/COG, feltdata og rapportintegrationen er auditeret og har en målkontrakt i [4dm-project-monitor-integrations.md](./4dm-project-monitor-integrations.md), men live adapter-smokes er ikke bestået.
- Staging-schema, private buckets og det afgrænsede SQL A/B-/anon-scope er verificeret. Rigtig Auth-/Storage API, hele rollematricen og produktion er ikke verificeret.

## 10. Testresultater

- Målrettet Vitest: 8 filer, 68/68 tests, exit 0.
- Fuld Vitest: 37 filer, 308/308 tests i den rene solo-genkørsel, exit 0. En tidligere parallel kørsel havde timeoutstøj i urørte natur-/ledger-tests; solo-genkørslen er det aktuelle gate-resultat.
- TypeScript: exit 0.
- ESLint på berørte TypeScript-filer: 0 fejl og 2 kendte Fast Refresh-warnings.
- Produktionsbuild: exit 0 med kendte ikke-blokerende bundler-/chunk-advarsler.
- Global lint: fortsat fejlet releasegate med 5.407 errors og 25 warnings.

Den løbende evidens findes i [4dm-project-monitor-test-report.md](./4dm-project-monitor-test-report.md) og [QA_MATRIX.md](./QA_MATRIX.md).

## 11. Kendte begrænsninger

- Login- og signup-skærmen renderes i rigtig lokal browser, `/app` redirecter unauthenticated til login, og konsollen er ren. Den fulde import → edit → save → reload → download-rejse med en rigtig bruger er `AFVENTER`.
- Staging-schemaet, private buckets og det testede A/B-tenant-scope er verificeret. Rigtig Auth-/Storage API, alle roller og `spatial_ref_sys`-beslutningen mangler; produktion er fortsat **NO-GO**.
- Cross-tab/to-bruger optimistic concurrency og immutable boundary-revision mangler.
- Boundary-rækken og RPC-feature-samlingen læses ikke som ét atomisk, versionsbundet snapshot; denne garanti kræver database-/RPC-versionering og er `AFVENTER`.
- Metrics har ingen boundary-version eller anden sammenlignelig source-version i det aktuelle schema. Cache-invalidation og `calculated_at`-validering reducerer risikoen lokalt, men kan ikke bevise, at metrics svarer til den aktuelle boundary; fuld freshness-guard er `AFVENTER` schema-/RPC-versionering.
- Kun ét GeoJSON `Polygon` med eventuelle huller understøttes; `MultiPolygon` og `FeatureCollection` afvises. Koordinater skal ligge i WGS84-range, men eksplicit CRS-detektion/-konvertering mangler.
- Survey rounds, flight plans, canonical drone assets, datasets, Før/Efter-par, change events, reviews, field visits, interventions og versionsfaste rapporter mangler som sammenhængende domæner.
- Et drones fotos GPS/EXIF beskriver kamerapositionen, ikke automatisk billedets footprint eller pixelkorrekte georeference. Ortofoto/fotogrammetri og faglig QA må ikke simuleres.

## 12. Næste tekniske prioriteringer

1. Luk resten af `SEC-P0-02`: rigtig Auth-session, Storage API upload/list/read/delete/signed-URL/revoke, alle roller og en ejerbeslutning om `spatial_ref_sys`.
2. Kør clean lokal replay/62 pgTAP og DB-lint, når Docker/Podman er tilgængelig.
3. Tilføj immutable boundary-revision/version og optimistic concurrency med sikker migration og live readback.
4. Etablér canonical survey/flight/dataset/drone-asset-model og privat resumable Storage, så dronebilleder kan blive georefererede og reviewbare dataleverancer.
5. Byg Før/Efter-parring, dokumenterede målinger/change events og review/action-flow efter [4dm-project-monitor-user-flow.md](./4dm-project-monitor-user-flow.md).
6. Slut med versionsfast rapportmanifest/PDF og den fulde Haderslev Vandløb browser-, RLS-, Storage- og regressionsgate.
