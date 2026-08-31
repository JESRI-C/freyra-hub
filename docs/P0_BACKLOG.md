# Prioriteret P0-backlog

Opdateret: 2026-08-31. Rækkefølgen er bindende, medmindre en opgave er dokumenteret blokeret. `AFVENTER` er ikke implementeret.

## SEC-P0-01A - public endpoint credential containment

- **Prioritet:** P0 / 1, verificeret lokalt.
- **Brugerproblem:** En klientkendt Supabase publishable/anon-nøgle kunne godkende observations- og monitoring-ruter, som derefter brugte `service_role`.
- **Scope:** Dedikerede server-only secrets til de to ruter; ingen `apikey`-fallback; afvis alle kendte Supabase publishable-, anon-, secret- og service-role-formater; fail closed; fjern `.env` fra tracking; reproducerbar npm/runtime/build.
- **Acceptance criteria:** Manglende server-secret giver 503 før databaseadgang; manglende/forkert/Supabase credential giver 401; kun korrekt dedikeret `x-api-key`/Bearer accepteres; `.env` er ignoreret og ikke tracket; frisk install, typecheck, ændret lint, test og build består.
- **Afhængigheder:** Stærke uafhængige secrets skal provisioneres og tidligere credentials rotationsvurderes af miljøejer før deployment.
- **Tests:** 20/20 endpointtests; runtime 503-smoke på begge ruter; `npm ci`; typecheck; 193/193 samlet Vitest; ændrede TypeScript-filer lint 0; `npm run build` exit 0.
- **Status:** implementeret og lokalt verificeret; deployment/provisionering **AFVENTER**.
- **Evidens/commit:** `106c825` — `src/lib/server-api-auth.server.ts`, de to public routes, `.env.example`, `.gitignore`, endpointtesten og cutover-dokumentation; pushet på `origin/codex/gofreyra-p0`.

## SEC-P0-01B - scope resterende service-role-flows

- **Prioritet:** P0 / 2, aktiv sikkerhedsgate.
- **Brugerproblem:** En legitim global secret må ikke give vilkårlig projektskrivning, og en browserudløst natur-serverfunktion må ikke persistere med `service_role` uden medlemskab.
- **Scope:** Knyt observations-ingest til eksplicit projekt-/tenantidentitet eller separat scoped credential; autentificér og autorisér `fetchAndIngestNatureGeo`; bevar åbne geodata som read-only fallback uden privilegeret persistens.
- **Acceptance criteria:** Credential A kan ikke skrive til projekt B; naturpersistens kræver aktivt medlemskab/rolle; ukendt projekt, URL-manipulation og cross-tenant-kald afvises før service-role-brug; afvisning efterlader ingen delvis skrivning.
- **Afhængigheder:** Verificeret auth helper og adgang til Supabase dev/test med mindst to organisationer.
- **Tests:** 20/20 credentialtests, 12/12 observations-scope-/relations-/no-write-tests og 37/37 natur-/JWT-/rolle-/cross-tenant-/persistenstests; typecheck; ændrede TypeScript-filer lint 0; samlet Vitest 30 filer og 234/234 tests; produktionsbuild exit 0. Live dev/test-smoke **AFVENTER**.
- **Status:** lokalt implementeret og verificeret i applikationslaget. Natur-serverfunktionen kræver verificeret JWT, eksplicit projektadgang og editor+/org-admin før service-role; lavere roller er read-only, og kun serverlagret centroid kan persisteres. Observations-ingest bruger ét serverkonfigureret projekt pr. credential; body-scope kan ikke udvides, og projekt/site/source valideres før en atomisk bulk-insert. Deploy er fortsat **NO-GO**, fordi `project_members` tillader self-insert, effektiv live RLS/to-tenant-isolation ikke er verificeret, og relationvalidering/insert endnu ikke er databaseatomisk.
- **Evidens/commit:** `a13a1ae` for naturflowet og `29d0845` for den projektscopede observationsroute, scope-test, env-/driftskontrakt og checkpoint; begge er pushet til `origin/codex/gofreyra-p0`.

## SEC-P0-02 - RLS-lockdown og live tenantverifikation

- **Prioritet:** P0 / 3.
- **Brugerproblem:** Organisation A kan ikke betro data til platformen, før læsning, skrivning, Storage og roller er negativt testet mod organisation B.
- **Scope:** Inventér effektivt live schema/policies; luk legacy `using(true)`/åbne write-policies; fjern self-admin i `project_members`; konsolidér org/project-helpers; lås Storage paths og serverhandlinger.
- **Acceptance criteria:** Alle tenanttabeller og buckets har eksplicit isolation; ingen selvopgradering; to organisationer og relevante roller kan hverken læse, gætte, hente eller ændre hinandens data via direkte Supabase, API, URL eller Storage.
- **Afhængigheder:** Adgang til korrekt Supabase dev/test og sikker migrationplan.
- **Tests:** SQL/policytests samt integrationtests med mindst to organisationer; negative CRUD- og Storage-tests; migration up/down-strategi uden produktion.
- **Status:** planlagt; live verifikation **AFVENTER**.
- **Evidens/commit:** Legacy policies og self-insert er fundet i migrationshistorikken; 0 RLS-tests; commit **AFVENTER**.

## AUTH-P0-01 - ét session- og Supabase-klientlag

- **Prioritet:** P0 / 4.
- **Brugerproblem:** Flere GoTrue-klienter under samme storage key kan give races og udefineret sessionadfærd i login, logout og token refresh.
- **Scope:** Konsolidér de to browser-Supabase-klienter og deres miljøfallbacks; fasthold én auth/session-ejer og migrér services uden parallel state.
- **Acceptance criteria:** Browseren opretter én GoTrue-klient pr. context; login/reset/logout/refresh er deterministisk; ingen duplicate-client-advarsel; services bruger den kanoniske klient eller en eksplicit serverklient.
- **Afhængigheder:** Verificeret authmiljø og testbruger i Supabase dev/test.
- **Tests:** Unit for env-resolution, browserflow for login/reset/logout/refresh og konsolkontrol.
- **Status:** planlagt; browser-smoke reproducerer advarslen.
- **Evidens/commit:** `src/integrations/supabase/client.ts`, `src/lib/supabase/client.ts` og browserlog 2026-08-29; commit **AFVENTER**.

## QA-P0-01 - reproducerbare gates

- **Prioritet:** P0 / 5.
- **Brugerproblem:** En grøn ændring kan ikke stoles på, hvis install, tests og build ikke kan reproduceres fra et rent checkout.
- **Scope:** Fastlås understøttet Node/npm, synkron lock, dokumentér én gate-rækkefølge, genkør suite/build uden sandbox-blokering, etabler CI eller tilsvarende evidens og en snæver legacy-lintplan mod global exit 0.
- **Acceptance criteria:** Frisk `npm ci`, typecheck, test og produktionsbuild kører deterministisk; testantal og resultater logges; nye/berørte filer har 0 lintfejl; global lint-baseline er synlig og P0-releasegaten er exit 0.
- **Afhængigheder:** Filadgang til build/test-cache; `SEC-P0-01A` runtime/lock-ændringer.
- **Tests:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; samme gate fra rent checkout/CI.
- **Status:** frisk install, typecheck, en ren solo-fuldkørsel med 308/308 tests og build består; 3/3 direkte ledger-fallbacktests beviser eksakt idempotent retry samt konflikt ved ændret payload eller hash; ændrede TypeScript-filer har lint 0. Global lint/CI/audit-triage er **AFVENTER**.
- **Evidens/commit:** `61bf18b`; Node 22.14/npm 10.9.2; global lint 5.428 errors/25 warnings; npm audit 17 advisories; build kræver den versionsstyrede 4 GB-wrapper og har kendte bundle-advarsler; pushet på `origin/codex/gofreyra-p0`.

## GEO-P0-01 - GeoJSON-projektgrænse ende til ende

- **Prioritet:** P0 / 6.
- **Brugerproblem:** En bruger skal kunne importere en reel projektgrænse og stole på, at den valideres, gemmes og genindlæses uændret.
- **Scope:** Verificér/importér GeoJSON Polygon/Feature, fejlbeskeder, CRS-antagelse, geometri/topologi, preview, gem/reload og version/proveniens; afklar lovede øvrige formater separat.
- **Acceptance criteria:** Kendt gyldig fixture vises korrekt og bevarer koordinater/areal efter reload; ugyldig, forkert geometri og uafklaret CRS afvises uden delvis skrivning; ny grænse skaber versionsspor frem for lydløs overskrivning.
- **Afhængigheder:** SEC-P0-02, verificeret schema og projektnavn.
- **Tests:** 8 filer og 68/68 pure/service-tests dækker lukning, WGS84-range, unikke/nabopunkter, self-intersection, nulareal, Polygon-huller, areal/centroid, unsupported typer, importfejl, persistence/no-write/clear/concurrency, seed-after-clear, edit-state guards og canonical/fail-closed eksport. RPC-observationer dækker seks GeoJSON-geometrityper, ugyldige nested koordinater og 200-cap. Browser import/edit/save/reload og live RLS er `AFVENTER`.
- **Status:** delvist implementeret lokalt i cyklus 005. Alle boundary-skriveveje bruger én fail-closed validator; persistent Polygon kan redigeres med eksplicit Gem/Annuller og frosset lag under save; ugemte edits blokerer konfliktende boundary-operationer; clear nulstiller alle afledte felter uden seed-genoplivning; parallel skrivning i samme UI-instans afvises; servicekontrakten kontrollerer den returnerede DB-række. Projektfuldkort og Connect-eksport bruger canonical, verificerbar data, tavs preview-fallback er fjernet, RPC-geometri dybdevalideres, og 200 eller flere observationsfeatures afvises som mulig afkortning. Polygon-huller understøttes; MultiPolygon/FeatureCollection afvises tydeligt som boundary. Immutable revision, atomisk boundary+RPC-snapshot, metrics-friskhed mod boundary-version, cross-tab optimistic concurrency, read-after-write mod rigtig database, browserflow og tenant-RLS er `AFVENTER`.
- **Evidens/commit:** `MapEditorMap`, `useMapEditor`, `geo-service`, `projects-service`, `geospatial-service`, eksportservices og nye geometri-/persistence-/eksporttests i cyklus 005. `project_boundaries` er ikke fundet; checkpoint-commit oprettes på `codex/gofreyra-p0`.

## BA-P0-01 - Før/Efter-runder og sammenligning

- **Prioritet:** P0 / 7.
- **Brugerproblem:** Et simpelt billed-swipe uden survey-, dataset- og fotoparversioner dokumenterer ikke kundesagen.
- **Scope:** Før/Efter survey rounds, versionsfaste aktiver/datasæt, obligatorisk foto-/droneproveniens, parring og godkendelse; swipe, side-by-side og opacity med synkroniseret udsnit.
- **Acceptance criteria:** Brugeren vælger to rounds/datasæt, sammenligner dem og genfinder samme par/valg efter reload; par viser afstand, retning, tid, fotograf og reviewer; mindst 90 % af P0-fotopunkter er godkendte; fejlet behandling vises aldrig som klar.
- **Afhængigheder:** Storage/metadata, tenant-RLS, repræsentativt P0-datasæt og projektgrænse.
- **Tests:** Domain/unit, upload/persistence-integration, browser swipe/side-by-side/opacity, negative metadata- og cross-tenant-tests. Den lokale drone-del har 32/32 målrettede upload-/metadata-tests, heraf 22 parser-/regressionstests med en reel minimal JPEG/EXIF-fixture; fuld suite 259/259.
- **Status:** delvist implementeret lokalt. Dronefotos routes gennem uploadvalidering; originalens hash, rå EXIF/XMP, normaliserede geodata og QA ligger tabsfrit i `uploads.detected_metadata`, og syntetisk centroid bruges ikke. Survey rounds, fotopar, synkroniserede sammenligninger, reviewerflow, canonical `drone_assets`-routing, privat bucket, resumable batchupload, footprint/ortofoto og live tenantverifikation er **AFVENTER**.
- **Evidens/commit:** `BeforeAfterCompare.tsx`/`MediaLightbox.tsx`; `drone-image-metadata.ts`, uploadservicen, UploadWizard og metadata-/regressionstests i cyklus 004. Dronecheckpoint `0f2afbd` er pushet til `origin/codex/gofreyra-p0`. Ingen `survey_rounds` eller `photo_pairs` er fundet.

## MEAS-P0-01 - persistente målinger og faglig validering

- **Prioritet:** P0 / 8.
- **Brugerproblem:** Et tal uden geometri, inputversion, metode, enhed og usikkerhed kan ikke anvendes i en professionel rapport.
- **Scope:** Gem længde/areal og tilladte ændringsobservationer med geometri, metodeversion, inputs, confidence/usikkerhed, reviewer, status og audit; blokér fagligt uforsvarlige afledninger.
- **Acceptance criteria:** Kendte fixtures giver facit inden for dokumenteret tolerance; måling gemmes/genindlæses og kan spores til Før/Efter-input; godkendelse er rolle- og tidsstemplet; RGB-begrænsninger vises.
- **Afhængigheder:** BA-P0-01, RLS og metodebeslutning.
- **Tests:** Geometri/unit mod facit, persistence/RLS-integration, browser save/reload/approve og rapportreference.
- **Status:** planlagt; kortets areal/omkreds er ikke et verificeret, versionsfast P0-resultat.
- **Evidens/commit:** Kortmåling og `indicator_measurements` findes, men P0-proveniensmodel er ikke fundet; commit **AFVENTER**.

## MARS-P0-01 - officiel MARS-adapter

- **Prioritet:** P0 / 9.
- **Brugerproblem:** Brugeren skal kunne se relevante officielle MARS-lag med korrekt kildeinfo og uden skjulte hardcodede antagelser.
- **Scope:** WMS/WFS capabilities-discovery, kildekatalog, relevante lag efter verificeret lag-id, visning, fejl/status, provenance og tilladt WFS-brug.
- **Acceptance criteria:** Valgt P0-lag vises i projektkortet med ejer, endpoint/type, lag-id, CRS, vilkår, upstream/hentet tidspunkt og begrænsninger; mocktests og én live dev/test-smoke består; kildefejl er synlig.
- **Afhængigheder:** Officielle capabilities/vilkår, netværksadgang og konkret Haderslev-lagbehov.
- **Tests:** Capabilities/parser mocks, WMS URL/render-fejl, WFS transform, timeout og live smoke uden kundedata.
- **Status:** planlagt; MARS-integration er ikke fundet.
- **Evidens/commit:** Officielle endpoints er registreret i `DATA_SOURCE_CATALOG.md`; lag/licens/CRS og commit **AFVENTER**.

## REPORT-P0-01 - reproducerbar rapport og manifest

- **Prioritet:** P0 / 10.
- **Brugerproblem:** Den eksisterende simple PDF kan ikke dokumentere en versionsfast Før/Efter-leverance eller genskabes efter senere projektændringer.
- **Scope:** Deterministisk P0-skabelon med projektkort, Før/Efter, fotos, datakilder, metoder, målinger, usikkerheder, QA, audit og manifest; Storage-aktiv, checksum, snapshot/version og godkendelse.
- **Acceptance criteria:** Komplet fixture genererer læsbar PDF uden klip/tomme opdigtede sektioner; manglende obligatoriske data giver tydelig fejl; godkendt PDF/hash ændres ikke; ny generering skaber ny version; snapshot kan reproduceres og downloades med manifest.
- **Afhængigheder:** Alle foregående datadomæner, rapportskabelon og Storage/RLS.
- **Tests:** Unit for snapshot/layoutdata, PDF-/checksum-integration, golden/snapshot, browser generate/download/approve/re-generate og mobil/desktop læsbarhed.
- **Status:** planlagt; grundlæggende `jsPDF`-generering findes, P0-versionering **AFVENTER**.
- **Evidens/commit:** `documents-service.ts` og rapportkode auditeret; ingen `report_versions` fundet; commit **AFVENTER**.

Backloggen opdeles i mindre vertikale opgaver før implementering. Nye punkter placeres efter sikkerheds- og dataintegritetsgates og må ikke skjule ovenstående P0-huller.
