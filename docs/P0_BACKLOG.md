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
- **Status:** lokalt implementeret og verificeret i applikationslaget. Natur-serverfunktionen kræver verificeret JWT, eksplicit projektadgang og editor+/org-admin før service-role; lavere roller er read-only, og kun serverlagret centroid kan persisteres. Observations-ingest bruger ét serverkonfigureret projekt pr. credential; body-scope kan ikke udvides, og projekt/site/source valideres før en atomisk bulk-insert. Self-insert er lukket på staging, og det testede A/B-scope er grønt; deploy er fortsat **NO-GO**, fordi rigtig Auth-/Storage API, hele rollematricen og atomisk relationvalidering/insert ikke er verificeret.
- **Evidens/commit:** `a13a1ae` for naturflowet og `29d0845` for den projektscopede observationsroute, scope-test, env-/driftskontrakt og checkpoint; begge er pushet til `origin/codex/gofreyra-p0`.

## SEC-P0-02 - RLS-lockdown og live tenantverifikation

- **Prioritet:** P0 / 3.
- **Brugerproblem:** Organisation A kan ikke betro data til platformen, før læsning, skrivning, Storage og roller er negativt testet mod organisation B.
- **Scope:** Inventér effektivt live schema/policies; luk legacy `using(true)`/åbne write-policies; fjern self-admin i `project_members`; konsolidér org/project-helpers; begræns feltrollen til dokumenteret indsamling/evidens; lad `external` fejle lukket uden autoritativ document-share-relation; valider same-project parentrelationer, polymorf quality scope og målingsreferencer; gør indirekte child-parentnøgler og uploader-/path-identitet immutable; beskyt uploadpaths mod dublet-/insert-race; reservér afledt uploadmetadata og workflowstatus til backend; auditér uploadoprettelse i databasen; valider canonical Storage organisation→projekt-path og metadatareferencer; fjern private Storage `UPDATE`; fastlås godkendte bucketstørrelser/MIME-allowlists uden at opfinde en evidence-kontrakt; tillad kun snæver owner-bundet orphan-cleanup før metadata-række, mens almindelig delete kræver manage; lås Storage paths og serverhandlinger.
- **Acceptance criteria:** Alle tenanttabeller og buckets har eksplicit isolation; ingen selvopgradering; to organisationer og relevante roller kan hverken læse, gætte, hente eller ændre hinandens data via direkte Supabase, API, URL eller Storage. En upload kræver serverudstedt intent med eksakt pending-row-binding, runtime-verificerede bucketregler og en dokumenteret orphan reconciliation-/retention-proces; `evidence-files` kræver en særskilt godkendt size/MIME-kontrakt.
- **Afhængigheder:** Adgang til korrekt Supabase dev/test og sikker migrationplan.
- **Tests:** En transaktionel pgTAP-fil med `plan(62)` og 62 assertions dækker to organisationer, admin/viewer/field/external/outsider, direkte CRUD, self-enrolment/owner-promotion, founder-e-mail uden demo-owner-eskalering, isolated personal-org signup, immutable membership-/tenantnøgler, uploader/path-identitet og dubletter, upload/import-job scope, backend-ejet afledt metadata, DB-uploadaudit, bucketgrænser, feltrolle-whitelist, to negative external-read assertions, projekt-RPC'er, same-project relationer, polymorf quality scope, measurement-FK, forged canonical organisation/projekt-Storage-path, privat Storage rename-afvisning, negativ action-evidence re-parenting, field orphan-cleanup, Storage-medlemsfjernelse og anonym adgang. Fem statiske/app-regressionsfiler med 37/37 tests består. Frisk migrationsreplay, pgTAP, DB-lint samt negative Storage list/read/write/delete/`UPDATE`-afvisnings-/signed-URL-integrationstests er **AFVENTER**.
- **Status:** delvist implementeret og anvendt på staging; ikke anvendt i produktion. Kendte open-policy-navne droppes; self-enrolment og owner-opgradering fjernes; caller-bundne helpers låses; membership-/tenantnøgler, `uploads.uploaded_by` og indirekte child-parentnøgler gøres immutable; uploadpath skal matche uploaderen, er immutable og beskyttes mod dublet-/insert-race; uploads/import-jobs kan kun scopes én gang til en autoriseret tenant. `INSERT`- og `UPDATE`-kolonnegrants reserverer afledt metadata, validerings-/importresultater og status til backend; browserens preview/EXIF behandles alene som ubetroet `user_metadata`, og hver uploadoprettelse auditeres af databasen. Field kan kun bidrage i den eksplicitte indsamlings-/evidenswhitelist; external har ingen hel-projektadgang før en autoritativ document-share-relation findes; generic same-project guards, action-evidence/device-parameter guards og en fail-closed quality-scope trigger forhindrer krydsprojekt-proveniens; `measurement_id` får en `NOT VALID` FK med `ON DELETE SET NULL`; canonical Storage-path og metadatareferencer skal matche projektet, og etablerede metadata-paths er immutable. Private buckets har ingen `UPDATE`-policy; monitoring-delete følger manage, mens orphan-cleanup kræver owner, contributor-scope, alder højst 15 minutter og ingen metadata-række. Migrationen sætter `monitoring-uploads` til `209715200` bytes med den eksisterende MIME-allowlist og `project-media` til `52428800` bytes med `image/*`/`application/pdf`; `ON CONFLICT` genanvender reglerne. `evidence-files` forbliver privat og bevarer eksisterende constraints, fordi dens size/MIME-kontrakt ikke er godkendt. `handle_new_user` opretter profil plus isoleret personal organisation uden e-mail-baseret demo-owner-eskalering; projekt-RPC'er køres som invoker med eksplicit authz; og seed/bootstrap kan ikke genåbne RLS eller overskrive RPC-hærdning. Serverudstedt upload-intent/pending-row-binding, evidence-kontrakten, orphan reconciliation/retention, rigtig Auth-/Storage API og hele rollematricen mangler; P0 og deploy er fortsat **NO-GO**.
- **Evidens/commit:** Hardening-migrationen, pgTAP-filen, den statiske migrationstest og private-Storage-/monitoring-servicetestene. Projektmedier og monitoring-downloads bruger 300-sekunders signed URLs fra DB-scopede paths; evidence-upload gemmer kun privat path, og monitoring-upload gør rollbackfejl synlige. Et allerede udstedt bearer-link kan fortsat bruges i op til 300 sekunder efter access revoke. Supabase CLI 2.116.0 er fastlåst; Docker/Podman mangler, frisk reset stopper med `LegacyLocalDbRunningError`, og frisk pgTAP/DB-lint stopper med `ECONNREFUSED 127.0.0.1:54322`. Lovable-/produktionsinstansen `ikrmcetjutqcjtwfhzfv` er fortsat utilgængelig via connectoren og er ikke ændret. Den brugerautoriserede staging-instans `xdvqdzdpyceojbdknofi` blev i cyklus 009 reaktiveret, inventeret, migreret og delvist tenanttestet; se næste evidenslinje. Rigtig Auth-/Storage API-accept, hele rollematricen og de lokale replay-/pgTAP-/lint-gates mangler fortsat; commit/push-status registreres særskilt i checkpointet.
- **Cyklus 009 staging-evidens:** Brugeren klassificerede det tidligere inaktive `xdvqdzdpyceojbdknofi` som dedikeret staging. Projektet blev reaktiveret, inventeret og atomisk migreret efter en rollback-dry-run med katalogassertions. 61 app-tabeller har RLS, 0 `dev_*`-policies findes, tre buckets er private, og drone-/mediekoordinater har validerede par/range/nonnegative constraints. En transaktionel A/B-tenanttest bestod for projekt-, medie-, Storage-read, write og RPC og efterlod 0 Auth-brugere/Storage-objekter. Anon PostgREST afviser `projects`/`project_media` med 401. **Status er fortsat delvist verificeret:** `spatial_ref_sys` er anonymt læsbar uden RLS; rigtig Auth- og Storage API-accept, upload-intent, signed-URL/revoke, frisk lokal replay/62 pgTAP og DB-lint er `AFVENTER`. Produktion er fortsat **NO-GO**.

## AUTH-P0-01 - ét session- og Supabase-klientlag

- **Prioritet:** P0 / 4.
- **Brugerproblem:** Flere GoTrue-klienter under samme storage key kan give races og udefineret sessionadfærd i login, logout og token refresh.
- **Scope:** Konsolidér de to browser-Supabase-klienter og deres miljøfallbacks; fasthold én auth/session-ejer og migrér services uden parallel state.
- **Acceptance criteria:** Browseren opretter én GoTrue-klient pr. context; login/reset/logout/refresh er deterministisk; ingen duplicate-client-advarsel; services bruger den kanoniske klient eller en eksplicit serverklient.
- **Afhængigheder:** Verificeret authmiljø og testbruger i Supabase dev/test.
- **Tests:** Cyklus 008's fem browserklienttests dækker singleton-identitet, publishable-prioritet, fallback fra tom/manglende publishable til legacy anon, afvisning af server-`SUPABASE_*` som browserkonfiguration og browser-/SSR-specifikke auth-options. Sammen med 5/5 cache-transition-, 4/4 Connect-selection- og 4/4 serverauth-middlewaretests består den målrettede suite med 4 filer/18 tests. Frisk `/login` renderede med korrekt titel, synlig loginoverskrift, 0 console warnings/errors og uden duplicate-GoTrue-advarsel. Komplet browserflow for login/reset/logout/refresh/account-switch, autentificeret initial navigation og SSR-/RLS-samspil er **AFVENTER**.
- **Status:** delvist implementeret. `src/lib/supabase/client.ts` ejer den eneste browser-Supabase-/GoTrue-instans. Den genererede integrationsklient er en fail-fast compatibility Proxy til samme instans, så eksisterende imports ikke skaber parallel authstate. `VITE_SUPABASE_PUBLISHABLE_KEY` vinder; tom/manglende publishable falder tilbage til legacy `VITE_SUPABASE_ANON_KEY`, og serverens `SUPABASE_*`-værdier ignoreres i browseren. Auth persistence, auto-refresh og URL-session-detektion er kun aktive i browserkontekst og deaktiverede ved SSR-evaluering. React Query-cache og tenantvalg ryddes ved reel authovergang/logout; stale async resultater ignoreres; direkte org-/projektvalg kræver membership-match; og Connect bruger kun et projekt fra den aktuelle organisation. Den lokale singleton-/konsolgate er grøn, mens den credential-bårne browserrejse fortsat mangler. Eksisterende SSR route-loaders bruger fortsat en global publishable/anon-klient uden request-scoped bruger-JWT, så autentificeret initial navigation/RLS er **AFVENTER** en særskilt serverklientkontrakt.
- **Evidens/commit:** `src/lib/supabase/client.ts`, compatibility-modulet i `src/integrations/supabase/client.ts`, browserklienttesten samt de eksisterende auth-cache-, Connect-selection- og serverauth-tests; cyklus-commit **AFVENTER**.

## QA-P0-01 - reproducerbare gates

- **Prioritet:** P0 / 5.
- **Brugerproblem:** En grøn ændring kan ikke stoles på, hvis install, tests og build ikke kan reproduceres fra et rent checkout.
- **Scope:** Fastlås understøttet Node/npm, synkron lock, dokumentér én gate-rækkefølge, genkør suite/build uden sandbox-blokering, etabler CI eller tilsvarende evidens og en snæver legacy-lintplan mod global exit 0.
- **Acceptance criteria:** Frisk `npm ci`, typecheck, test og produktionsbuild kører deterministisk; testantal og resultater logges; nye/berørte filer har 0 lintfejl; global lint-baseline er synlig og P0-releasegaten er exit 0.
- **Afhængigheder:** Filadgang til build/test-cache; `SEC-P0-01A` runtime/lock-ændringer.
- **Tests:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; samme gate fra rent checkout/CI.
- **Status:** frisk installbaseline, typecheck, cyklus 008's målrettede 4 filer/18 tests, en fuldkørsel med 43 filer/350 tests og build består; 3/3 direkte ledger-fallbacktests beviser eksakt idempotent retry samt konflikt ved ændret payload eller hash. ESLint på de tre ændrede klient-/testfiler har 0 fund. Global lint/CI/audit-triage er **AFVENTER**.
- **Evidens/commit:** Node 22.14/npm 10.9.2; cyklus 008 global lint er rød på 395 filer og 5.155 errors/23 warnings; npm audit-baseline 17 advisories; build kræver den versionsstyrede 4 GB-wrapper og har kendte bundle-advarsler. Remote fetch består, og `HEAD...upstream` var `0/0` på `777b05b`; cyklus 006/007/008 er dirty, ucommittet og ikke pushet grundet uopfyldt DB-/browseraccept.

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
