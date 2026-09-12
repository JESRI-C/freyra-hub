# Prioriteret P0-backlog

Opdateret: 2026-09-12. Rækkefølgen er bindende, medmindre en opgave er dokumenteret blokeret. `AFVENTER` er ikke implementeret.

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
- **Tests:** Den transaktionelle pgTAP-kilde er `plan(107)` og dækker tenantmatricen, upload-intent, direct-insert-afvisning, idempotens, immutable binding, eksakt Storage-path, finalize/cancel, audit, legacy-read, udløb, medlemskabsrevoke, zoneproveniens samt service-role-only orphan-claims, leases, retry, stale-token, completion-ledger, orphan-row-retention og bevaret received-delete. De 107 cases er **ikke runtime-kørt her**. Cyklus 020: 20/20 private-Storage-servicecases, typecheck, målrettet ESLint og fuld Vitest 57 filer/454 tests PASS; normalt produktionsbuild PASS. Én rigtig owner-bundet TUS/Storage/finalize/reload og en negativ fremmed-tenant-kontrol består; rigtig evidence-download/expiry/revoke, resten af Storage-/rollematricen, lokal replay, pgTAP og DB-lint er **AFVENTER**.
- **Status:** delvist implementeret og anvendt på den isolerede staging. Den registrerede livehistorik indeholder `20260831172610`, `20260831172839`, `20260901163924`, `20260902153933`, `20260912110614` og `20260912132006`; sidste version retter finalizerens ugyldige `pg_catalog.coalesce(...)` uden at lempe caller-, owner-, projekt-, objekt- eller grantkontroller. Den samlede kildemigration `20260912112500` er fortsat ikke anvendt. Evidence-signed-download er nu implementeret i kilden med RLS-rækkeopslag, valideret DB-path og 300 s download-URL; staging havde 0 evidence-rækker ved read-only kontrollen, og browser-/Storage-runtimeaccept afventer deploymandat. Evidence size/MIME-kontrakt, Worker-secrets, automatisk cleanup-scheduling, delete/expiry/revoke, serverekstraktion og hele rollematricen mangler; P0 og produktion er fortsat **NO-GO**.
- **Evidens/commit:** Commit `0560571` indeholder fresh-install-rettelsen, forward migration `20260912132006` og regressionstests. Live postflight på `xdvqdzdpyceojbdknofi` viser upload `13b16848-a2c5-480f-b3f2-f0468bc53c08` som `awaiting_validation` med matchende privat Storage-objekt/ejer/størrelse/MIME, udfyldt `received_at`, ét intent-audit-event og ét received-audit-event; `secure_receipt_chain_ok = true`. En uvedkommende authenticated tenant så projekt/upload/objekt/audit = `0/0/0/0`. Produktion `ikrmcetjutqcjtwfhzfv` er ikke ændret.
- **Cyklus 009 staging-evidens (historisk):** Brugeren klassificerede det tidligere inaktive `xdvqdzdpyceojbdknofi` som dedikeret staging. Projektet blev reaktiveret, inventeret og atomisk migreret efter en rollback-dry-run med katalogassertions. 61 app-tabeller har RLS, 0 `dev_*`-policies findes, tre buckets er private, og drone-/mediekoordinater har validerede par/range/nonnegative constraints. En transaktionel A/B-tenanttest bestod for projekt-, medie-, Storage-read, write og RPC og efterlod 0 Auth-brugere/Storage-objekter. Anon PostgREST afviser `projects`/`project_media` med 401. Databasestatussen her er afløst af cyklus 016; `spatial_ref_sys`, rigtig Auth-/Storage-/TUS-/cleanup-accept, signed-URL/revoke og lokal replay/pgTAP/DB-lint er fortsat **AFVENTER**. Produktion er **NO-GO**.
- **Cyklus 012 rigtig bruger-JWT-evidens:** Brugerens staging-login lykkedes og en rigtig `owner`-session nåede et `projects`-insert. Live log og rollback-beskyttet rolle/JWT-diagnose viste, at write-helperen tillod tenantens org, plain `INSERT` bestod, og kun `INSERT ... RETURNING` kolliderede med den eksisterende read-policys same-command snapshot. Appen opretter derfor med kendt UUID uden representation og foretager selection i en separat, frisk RLS-filtreret request; policies og tenantgrænser er uændrede. Unit/service/typecheck/build/dry-run er grønne; commit `fb06415` er pushet og hostet på staging-version `bab7b8fc-122a-46f3-ac97-1f6ec7cd1d77`. Brugerens browser create/open/reload-smoke og resten af rollematricen er fortsat `AFVENTER`.
- **Cyklus 015 staging-app-evidens (historisk):** App-pakken på commit `adcb03e` blev udgivet til Worker-version `51381b65-7bfb-499d-ae4c-d3175827adcf`; loginrendering, anonym redirect og tom browserkonsol bestod. På det tidspunkt var upload-intent-/orphan-migrationerne ikke anvendt, og reconciliation-routen returnerede fail-closed HTTP 503 uden Worker-secrets. Databasestatussen er afløst af cyklus 016; Worker-secrets og rigtig cleanup er fortsat **AFVENTER**.
- **Cyklus 016 staging database-/UI-evidens:** Cyklus 015-linjen ovenfor er historisk og afløst: upload-intent-, orphan- og `42702`-korrektionsmigrationerne er registreret på staging; `20260912112500` er kun i kilden. UI-kilden har en synlig `Upload`-fane, projektgrænse → projekt-scopet `FØR`-CTA og malformed-geometry gate. Detalje-, geometri- og kortruter har `ssr:false`; projektindekset har ingen beskyttet loader og ligger under auth-layoutet. Typecheck, målrettet ESLint, 55 filer/420 tests, staging-build/preflight og Wrangler `--strict --dry-run` består. Commit `57cdfe8` er pushet og udgivet som staging-Worker-version `80e8ba0f-90b6-49f1-abce-3a8b1702af14`; loginrendering samt anonyme redirects fra `/app` og direkte projektrute består. Cleanup-Worker-secrets/scheduler og rigtig credential-båret browser/TUS er fortsat **AFVENTER**.
- **Cyklus 018 credential-/Storage-evidens:** På staging `xdvqdzdpyceojbdknofi` blev `20260912132006_fix_finalize_upload_intent_coalesce.sql` anvendt. Projekt `e5b1344c-770c-4081-87e4-309dd87ac92a` og FØR-upload `13b16848-a2c5-480f-b3f2-f0468bc53c08` bestod credential-båret create/open/reload, Polygon save/reload, intent, TUS-object og finalize til `awaiting_validation`. Postflight viste `secure_receipt_chain_ok = true`; UI-reload viste uploadet persistent, og en uvedkommende authenticated tenant så projekt/upload/object/audit = `0/0/0/0`. Kildemigration `20260912112500`, hele rollematricen, cleanup/delete/signed-URL/revoke og lokal replay/107 pgTAP/DB-lint er fortsat `AFVENTER`.
- **Cyklus 020 evidence-download:** UI og service har nu en eksplicit `Hent`-handling, som kun er aktiv for en gyldig privat reference. Servicen validerer UUID'er, slår den eksakte evidence-/projektrække op gennem callerens RLS-session, genkontrollerer returneret id/projekt, accepterer kun legacy eller databasekompatibel canonical projektscope og signerer alene DB-pathen i 300 sekunder med download-disposition. URL-, absolutte, traversal-, backslash-, tomme, for korte og cross-project paths afvises før Storage. Mocked 20/20 servicecases og øvrige lokale gates består; staging havde 0 evidence-rækker, så rigtig credential-/cross-tenant-/expiry-/revokeaccept er `AFVENTER`, og kilden er ikke deployet i denne automation.

## AUTH-P0-01 - ét session- og Supabase-klientlag

- **Prioritet:** P0 / 4.
- **Brugerproblem:** Flere GoTrue-klienter under samme storage key kan give races og udefineret sessionadfærd i login, logout og token refresh.
- **Scope:** Konsolidér de to browser-Supabase-klienter og deres miljøfallbacks; fasthold én auth/session-ejer og migrér services uden parallel state.
- **Acceptance criteria:** Browseren opretter én GoTrue-klient pr. context; login/reset/logout/refresh er deterministisk; ingen duplicate-client-advarsel; services bruger den kanoniske klient eller en eksplicit serverklient.
- **Afhængigheder:** Verificeret authmiljø og testbruger i Supabase dev/test.
- **Tests:** Cyklus 008's fem browserklienttests dækker singleton-identitet, miljøfallback og browser-/SSR-options. Cyklus 010 tilføjer 9/9 regressionstests for deferred/latest authbootstrap, stale/cancelled jobs, identity-vs-token-refresh, hydreringsstyret loginredirect og afvisning af eksterne/backslash-redirects. Cyklus 017 tilføjer regression for atomisk cross-org projektvalg. Aktuel samlet suite er 57 filer/454 tests PASS. Credential-båret login/session, organisationsvalg, projekt create/open og direkte reload af projekt-, geometri-, upload- og kortruter består; reset/logout/refresh/account-switch er **AFVENTER**.
- **Status:** delvist implementeret; ikke produktion. `src/lib/supabase/client.ts` ejer den eneste browser-Supabase-/GoTrue-instans. Password-login og tenantbootstrap nåede observeret en rigtig owner-session, som kunne vælge autoriseret organisation og oprette/åbne/genindlæse projektet. De eksisterende race-, stale-session- og same-origin guards er uændrede. Supabase Auth Site URL/redirect-allowlist og de resterende auth-/reloadcases er fortsat **AFVENTER**.
- **Evidens/commit:** Auth-/selectionkoden er hostet på Worker-version `842dbf65-3e99-4fd1-83f5-62360268181d`. Cyklus 018 observerede credential-båret organisations-/projektvalg, create/open og persistence på staging; fuld suite 55 filer/422 tests består. Reset/logout/refresh/account-switch er ikke opgraderet uden runtime-evidens.

## QA-P0-01 - reproducerbare gates

- **Prioritet:** P0 / 5.
- **Brugerproblem:** En grøn ændring kan ikke stoles på, hvis install, tests og build ikke kan reproduceres fra et rent checkout.
- **Scope:** Fastlås understøttet Node/npm, synkron lock, dokumentér én gate-rækkefølge, genkør suite/build uden sandbox-blokering, etabler CI eller tilsvarende evidens og en snæver legacy-lintplan mod global exit 0.
- **Acceptance criteria:** Frisk `npm ci`, typecheck, test og produktionsbuild kører deterministisk; testantal og resultater logges; nye/berørte filer har 0 lintfejl; global lint-baseline er synlig og P0-releasegaten er exit 0.
- **Afhængigheder:** Filadgang til build/test-cache; `SEC-P0-01A` runtime/lock-ændringer.
- **Tests:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; samme gate fra rent checkout/CI.
- **Status:** delvist implementeret. En separat P0 app-CI er secretsfri, read-only og ikke-deployende; den kører ved pull request, accepteret push til `main` eller manuel dispatch og bruger ikke featurebranch-push som automatisk trigger. Jobbet fastlåser Node 22.14.0/npm-lockvejen og kører ren install, typecheck, faktor-/checksumkontrol, serial tests og normal build. En lokal kontrakttest beskytter permissions, trigger-scope og fraværet af secrets/deploy. Global lint, audit-triage, required-check/branch protection og første hosted Linux-run er **AFVENTER** og skjules ikke med `continue-on-error`.
- **Evidens/commit:** Cyklus 011: 3/3 workflowkontrakttests, typecheck, `verify:faktorer`, fuld serial Vitest 46 filer/362 tests, målrettet ESLint/Prettier, YAML parse og normal build består. Cyklus 017: typecheck, målrettet ESLint, fuld serial Vitest 55 filer/421 tests og staging-build med env-preflight/bundle-check består. Cyklus 018: typecheck, målrettet ESLint/Prettier og fuld Vitest 55 filer/422 tests består; Worker-bundle blev ikke ændret. Workflowkilden ligger i `.github/workflows/ci.yml`; hosted Linux-run, global lint og npm audit-triage er endnu ikke afsluttet.

## GEO-P0-01 - GeoJSON-projektgrænse ende til ende

- **Prioritet:** P0 / 6.
- **Brugerproblem:** En bruger skal kunne importere en reel projektgrænse og stole på, at den valideres, gemmes og genindlæses uændret.
- **Scope:** Verificér/importér GeoJSON Polygon/Feature, fejlbeskeder, CRS-antagelse, geometri/topologi, preview, gem/reload og version/proveniens; afklar lovede øvrige formater separat.
- **Acceptance criteria:** Kendt gyldig fixture vises korrekt og bevarer koordinater/areal efter reload; ugyldig, forkert geometri og uafklaret CRS afvises uden delvis skrivning; ny grænse skaber versionsspor frem for lydløs overskrivning.
- **Afhængigheder:** SEC-P0-02, verificeret schema og projektnavn.
- **Tests:** 8 filer og 68/68 historiske pure/service-tests dækker lukning, WGS84-range, unikke/nabopunkter, self-intersection, nulareal, Polygon-huller, areal/centroid, unsupported typer, importfejl, persistence/no-write/clear/concurrency, seed-after-clear, edit-state guards og canonical/fail-closed eksport. Credential-båret browser-save/reload af en manuelt oprettet Polygon bestod for projekt `e5b1344c-770c-4081-87e4-309dd87ac92a`; GeoJSON-import er fortsat `AFVENTER`.
- **Status:** delvist implementeret. Den aktuelle browserrejse beviser manuel boundary-persistence og den efterfølgende projektbundne FØR-CTA. Immutable revision, atomisk boundary+RPC-snapshot, metrics-friskhed mod boundary-version og cross-tab/to-bruger optimistic concurrency er `AFVENTER`.
- **Evidens/commit:** `MapEditorMap`, `useMapEditor`, `geo-service`, `projects-service`, `geospatial-service`, eksportservices og nye geometri-/persistence-/eksporttests i cyklus 005. `project_boundaries` er ikke fundet; checkpoint-commit oprettes på `codex/gofreyra-p0`.

## GEO-P0-02 - officiel vandløbsstreng og konkret projektstrækning

- **Prioritet:** P0 / 6b.
- **Brugerproblem:** Dronefotos og Før/Efter-observationer kan ikke forbindes fagligt, hvis projektet kun har en arealgrænse og ingen kildebelagt vandløbsakse eller entydig delstrækning.
- **Scope:** Søg og preview en allowlistet officiel navngivet vandløbsgeometri; gem den separat fra projektets Polygon med kilde-ID, URL, hentetid, CRS, geometrihash og faglig caveat; vælg eller klip derefter den konkrete projektstrækning og dokumentér fra-/til-stationering samt kommunal regulativ-/as-built-kilde.
- **Acceptance criteria:** Autoriseret editor kan gemme og genfinde én aktiv kildeverificeret streng efter reload; viewer kan ikke skrive; manipuleret URL, ID, provenance eller geometri afvises; den konkrete projektstrækning kan afgrænses reproducerbart uden at overskrive projektgrænsen; samtidige første writes kan ikke skabe dubletter.
- **Afhængigheder:** SEC-P0-02, kommunalt regulativ/kontrol- eller as-built-opmåling og sikker schema-/RPC-migration for atomisk unik aktiv strækning.
- **Tests:** Cyklus 019: 2 filer/18 tests dækker allowlist, bounded parsing/streaming, auth-rækkefølge, viewer write-denial, officiel server-genhentning, insert/update/load, falsk URL/hash/proveniens, dubletter og upstream-geometriændring. Typecheck PASS, fuld Vitest 57 filer/440 tests PASS, staging-build og Wrangler dry-run PASS. Credential-båret save/reload samt databasepostflight PASS for Bykær Bæk.
- **Status:** delvist implementeret. Hele Bykær Bæks officielle stednavnegeometri er gemt på staging som en RLS-beskyttet `monitoring_zones`-`MultiLineString`, separat fra `projects.geometry_polygon`, med 8 delstrækninger, 308 punkter, 4.471 m og fuld provenance. Præcis delstrækningsudvælgelse/klipning, stationering, kommunal as-built-reference og DB-atomisk uniqueness er **AFVENTER**.
- **Evidens/commit:** Appcommit `d66e2d7`, staging-Worker `94063d2d-a77d-4b5d-bfb8-9a32dbe94319`, projekt `90e964d6-040b-4286-b57f-6786531931b3`, kilde-ID `1233766a-1fdb-6b98-e053-d480220a5a3f`, gemt række `c9af4f49-6680-4467-a1c7-59a95e245ff0`. Produktion er uændret.

## BA-P0-01 - Før/Efter-runder og sammenligning

- **Prioritet:** P0 / 7.
- **Brugerproblem:** Et simpelt billed-swipe uden survey-, dataset- og fotoparversioner dokumenterer ikke kundesagen.
- **Scope:** Før/Efter survey rounds, versionsfaste aktiver/datasæt, obligatorisk foto-/droneproveniens, parring og godkendelse; swipe, side-by-side og opacity med synkroniseret udsnit.
- **Acceptance criteria:** Brugeren vælger to rounds/datasæt, sammenligner dem og genfinder samme par/valg efter reload; par viser afstand, retning, tid, fotograf og reviewer; mindst 90 % af P0-fotopunkter er godkendte; fejlet behandling vises aldrig som klar.
- **Afhængigheder:** Storage/metadata, tenant-RLS, repræsentativt P0-datasæt og projektgrænse.
- **Tests:** Domain/unit, upload/persistence-integration, browser swipe/side-by-side/opacity, negative metadata- og cross-tenant-tests. Den lokale drone-del har 32/32 målrettede upload-/metadata-tests, heraf 22 parser-/regressionstests med en reel minimal JPEG/EXIF-fixture; fuld suite 259/259.
- **Status:** delvist implementeret. Én lille syntetisk DJI FØR-JPEG bestod rigtig credential-båret intent/TUS/finalize og UI-reload på staging; hash, GPS og UTC blev bevaret som ubetroet browserpreview, og uploadet nåede korrekt `awaiting_validation`. Dette verificerer ikke batch med 120 billeder, aktiv pause/reload-resume, server-side metadataekstraktion, canonical `drone_assets`, survey rounds, fotopar, reviewerflow, footprint/ortofoto eller cleanup.
- **Evidens/commit:** Upload `13b16848-a2c5-480f-b3f2-f0468bc53c08`, `secure_receipt_chain_ok = true`, UI-reload PASS og fremmed-tenant `0/0/0/0` på staging. Finalize-rettelsen er commit `0560571`; de tidligere drone-/uploadkomponenter er hostet på Worker-version `842dbf65-3e99-4fd1-83f5-62360268181d`. Ingen `survey_rounds` eller `photo_pairs` er fundet.

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
