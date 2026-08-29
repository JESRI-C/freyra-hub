# Prioriteret P0-backlog

Opdateret: 2026-08-29. Rækkefølgen er bindende, medmindre en opgave er dokumenteret blokeret. `AFVENTER` er ikke implementeret.

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
- **Tests:** 37/37 målrettede natur-/JWT-/rolle-/cross-tenant-/no-write-/persistenstests; typecheck; ændrede TypeScript-filer lint 0; samlet Vitest 29 filer og 222/222 tests; produktionsbuild exit 0. Live dev/test-smoke **AFVENTER**.
- **Status:** delvist implementeret og lokalt verificeret. Natur-serverfunktionen kræver verificeret JWT, eksplicit projektadgang og editor+/org-admin før service-role; lavere roller er read-only, og kun serverlagret centroid kan persisteres. Observations-ingest er stadig globalt scopet. Deploy er **NO-GO**, fordi `project_members` fortsat tillader self-insert, og effektiv live RLS/to-tenant-isolation ikke er verificeret.
- **Evidens/commit:** `a13a1ae` — `src/lib/nature-geo.functions.ts`, `src/lib/project-nature-access.server.ts`, de to nye auth-/autorisationstestfiler og servermiljøkontrakten; pushet på `origin/codex/gofreyra-p0`.

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
- **Status:** frisk install, typecheck, 193 tests og build består; 3/3 direkte ledger-fallbacktests beviser eksakt idempotent retry samt konflikt ved ændret payload eller hash; ændrede TypeScript-filer har lint 0. Global lint/CI/audit-triage er **AFVENTER**.
- **Evidens/commit:** `61bf18b`; Node 22.14/npm 10.9.2; global lint 5.428 errors/25 warnings; npm audit 17 advisories; build kræver den versionsstyrede 4 GB-wrapper og har kendte bundle-advarsler; pushet på `origin/codex/gofreyra-p0`.

## GEO-P0-01 - GeoJSON-projektgrænse ende til ende

- **Prioritet:** P0 / 6.
- **Brugerproblem:** En bruger skal kunne importere en reel projektgrænse og stole på, at den valideres, gemmes og genindlæses uændret.
- **Scope:** Verificér/importér GeoJSON Polygon/Feature, fejlbeskeder, CRS-antagelse, geometri/topologi, preview, gem/reload og version/proveniens; afklar lovede øvrige formater separat.
- **Acceptance criteria:** Kendt gyldig fixture vises korrekt og bevarer koordinater/areal efter reload; ugyldig, forkert geometri og uafklaret CRS afvises uden delvis skrivning; ny grænse skaber versionsspor frem for lydløs overskrivning.
- **Afhængigheder:** SEC-P0-02, verificeret schema og projektnavn.
- **Tests:** Parser/unit-fixtures, persistence-integration, browserflow import/save/reload, polygon med >3 punkter og redigering.
- **Status:** planlagt; eksisterende parser/kortkode er ikke end-to-end-verificeret.
- **Evidens/commit:** `MapEditorMap`, `useMapEditor` og historisk kortaudit; `project_boundaries` ikke fundet; commit **AFVENTER**.

## BA-P0-01 - Før/Efter-runder og sammenligning

- **Prioritet:** P0 / 7.
- **Brugerproblem:** Et simpelt billed-swipe uden survey-, dataset- og fotoparversioner dokumenterer ikke kundesagen.
- **Scope:** Før/Efter survey rounds, versionsfaste aktiver/datasæt, obligatorisk foto-/droneproveniens, parring og godkendelse; swipe, side-by-side og opacity med synkroniseret udsnit.
- **Acceptance criteria:** Brugeren vælger to rounds/datasæt, sammenligner dem og genfinder samme par/valg efter reload; par viser afstand, retning, tid, fotograf og reviewer; mindst 90 % af P0-fotopunkter er godkendte; fejlet behandling vises aldrig som klar.
- **Afhængigheder:** Storage/metadata, tenant-RLS, repræsentativt P0-datasæt og projektgrænse.
- **Tests:** Domain/unit, upload/persistence-integration, browser swipe/side-by-side/opacity, negative metadata- og cross-tenant-tests.
- **Status:** planlagt; visuel swipe-komponent findes, domæneflow **AFVENTER**.
- **Evidens/commit:** `BeforeAfterCompare.tsx`/`MediaLightbox.tsx`; ingen `survey_rounds` eller `photo_pairs` fundet; commit **AFVENTER**.

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
