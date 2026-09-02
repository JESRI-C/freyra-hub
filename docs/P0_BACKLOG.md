# Prioriteret P0-backlog

Opdateret: 2026-09-02. Rækkefølgen er bindende, medmindre en opgave er dokumenteret blokeret. `AFVENTER` er ikke implementeret.

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
- **Tests:** En transaktionel pgTAP-fil med `plan(105)` udvider tenantmatricen med upload-intent, direct-insert-afvisning, idempotens, immutable binding, eksakt Storage-path, finalize/cancel, audit, legacy-read, udløb, medlemskabsrevoke, zoneproveniens samt service-role-only orphan-claims, leases, retry, stale-token, completion-ledger, orphan-row-retention og bevaret received-delete. Den fulde app-/service-/statiske regression består med 54 filer/412 tests; fem målrettede filer/36 tests dækker migration, route og cleanup-service. Frisk migrationsreplay, pgTAP, DB-lint samt rigtig TUS/Storage list/read/write/delete/cleanup/`UPDATE`-afvisnings-/signed-URL-integration er **AFVENTER**.
- **Status:** delvist implementeret og anvendt på staging; cyklus 013/014-forward migrationerne er kun i kilden og er ikke anvendt live. Det tidligere hardening-scope er uændret. Nyt uploadflow tilbagekalder direkte browserinsert og kræver en idempotent, kortlivet server-intent bundet til actor, tenant, projekt, zone, fil, MIME, størrelse og ubetroet metadata; eksakt servergenereret path må TUS-uploades uden upsert og kan først markeres modtaget efter serververificeret finalize. Draft-adgang bortfalder ved udløb eller mistet projektadgang, scope er immutable, og zoneproveniens bruger `ON DELETE RESTRICT`. Projektbundet FØR-batch/resume er implementeret lokalt. Orphan-reconciliation er implementeret i kilden med private, service-role-only `SKIP LOCKED`-claims, opaque leases, eksakt pathvalidering, Storage API-delete og saniteret completion-ledger; uploadmetadata og ledger bevares. Evidence-kontrakten, automatisk cleanup-scheduling, live Auth-/TUS-/Storage-verifikation og hele rollematricen mangler; P0 og produktion er fortsat **NO-GO**.
- **Evidens/commit:** Hardening-, upload-intent- og orphan-reconciliation-migrationerne, pgTAP-filen, de statiske migrationstests, den secret-beskyttede `/api/public/monitoring/reconcile-uploads`-route og service-/routetestene. Projektmedier og monitoring-downloads bruger 300-sekunders signed URLs fra DB-scopede paths. Monitoringflowet bruger intent → eksakt TUS-path → finalize/cancel; cancel arkiverer intentmetadata, og den betroede worker må kun slette den claimede path via Storage API. Et allerede udstedt bearer-link kan fortsat bruges i op til 300 sekunder efter access revoke. Supabase CLI 2.116.0 er fastlåst; Docker/Podman mangler, og frisk pgTAP/DB-lint stopper med `ECONNREFUSED 127.0.0.1:54322`. Lovable-/produktionsinstansen `ikrmcetjutqcjtwfhzfv` er fortsat utilgængelig via connectoren og er ikke ændret. Den brugerautoriserede staging-instans `xdvqdzdpyceojbdknofi` kører den tidligere hardening-baseline, men ingen af cyklus 013/014-forward migrationerne. Rigtig Auth-/TUS-/Storage-/cleanup-accept, hele rollematricen og de lokale replay-/pgTAP-/lint-gates mangler fortsat; commit/push-status registreres særskilt i checkpointet.
- **Cyklus 009 staging-evidens:** Brugeren klassificerede det tidligere inaktive `xdvqdzdpyceojbdknofi` som dedikeret staging. Projektet blev reaktiveret, inventeret og atomisk migreret efter en rollback-dry-run med katalogassertions. 61 app-tabeller har RLS, 0 `dev_*`-policies findes, tre buckets er private, og drone-/mediekoordinater har validerede par/range/nonnegative constraints. En transaktionel A/B-tenanttest bestod for projekt-, medie-, Storage-read, write og RPC og efterlod 0 Auth-brugere/Storage-objekter. Anon PostgREST afviser `projects`/`project_media` med 401. **Status er fortsat delvist verificeret:** `spatial_ref_sys` er anonymt læsbar uden RLS; de nye upload-intent-/cleanup-migrationer, rigtig Auth-/Storage-/TUS-/cleanup-accept, signed-URL/revoke, frisk lokal replay/105 pgTAP og DB-lint er `AFVENTER`. Produktion er fortsat **NO-GO**.
- **Cyklus 012 rigtig bruger-JWT-evidens:** Brugerens staging-login lykkedes og en rigtig `owner`-session nåede et `projects`-insert. Live log og rollback-beskyttet rolle/JWT-diagnose viste, at write-helperen tillod tenantens org, plain `INSERT` bestod, og kun `INSERT ... RETURNING` kolliderede med den eksisterende read-policys same-command snapshot. Appen opretter derfor med kendt UUID uden representation og foretager selection i en separat, frisk RLS-filtreret request; policies og tenantgrænser er uændrede. Unit/service/typecheck/build/dry-run er grønne; commit `fb06415` er pushet og hostet på staging-version `bab7b8fc-122a-46f3-ac97-1f6ec7cd1d77`. Brugerens browser create/open/reload-smoke og resten af rollematricen er fortsat `AFVENTER`.

## AUTH-P0-01 - ét session- og Supabase-klientlag

- **Prioritet:** P0 / 4.
- **Brugerproblem:** Flere GoTrue-klienter under samme storage key kan give races og udefineret sessionadfærd i login, logout og token refresh.
- **Scope:** Konsolidér de to browser-Supabase-klienter og deres miljøfallbacks; fasthold én auth/session-ejer og migrér services uden parallel state.
- **Acceptance criteria:** Browseren opretter én GoTrue-klient pr. context; login/reset/logout/refresh er deterministisk; ingen duplicate-client-advarsel; services bruger den kanoniske klient eller en eksplicit serverklient.
- **Afhængigheder:** Verificeret authmiljø og testbruger i Supabase dev/test.
- **Tests:** Cyklus 008's fem browserklienttests dækker singleton-identitet, miljøfallback og browser-/SSR-options. Cyklus 010 tilføjer 9/9 regressionstests for deferred/latest authbootstrap, stale/cancelled jobs, identity-vs-token-refresh, hydreringsstyret loginredirect og afvisning af eksterne/backslash-redirects. Typecheck, fuld serial Vitest 45 filer/359 tests, staging-build og Wrangler dry-run består. Hosted `/login` renderede med korrekt titel/indhold og 0 konsollogs; anonym `/app` redirectede til `/login`. Credential-båret login/reset/logout/refresh/account-switch, autentificeret initial navigation og SSR-/RLS-samspil er **AFVENTER**.
- **Status:** delvist implementeret og deployet til isoleret staging; ikke produktion. `src/lib/supabase/client.ts` ejer den eneste browser-Supabase-/GoTrue-instans. `onAuthStateChange` foretager ikke længere async Supabase-kald inde i callbacken: bootstrap køres deferred, kun seneste identitet må committe tenantstate, same-user token-events opdaterer alene sessionen, og manuelle refreshes afmonterer ikke aktive workflows. Password-login venter på en hydreret bruger før deklarativ navigation; bootstrapfejl vises med retry, og `next` er begrænset til en sikker same-origin relativ sti. Eksisterende SSR route-loaders bruger fortsat en global publishable/anon-klient uden request-scoped bruger-JWT, og Supabase Auth Site URL/redirect-allowlist er ikke ændret; disse dele samt den credential-bårne browserrejse er **AFVENTER**.
- **Evidens/commit:** Authbootstrap-/loginhelpers og tests, `src/lib/auth.tsx` og `src/routes/login.tsx`; commit `94b37f1` er pushet til `origin/codex/gofreyra-p0` og deployet på Worker-version `fbc38ac0-935b-43ff-8917-5a071b02e131` i `gofreyra-p0-staging`.

## QA-P0-01 - reproducerbare gates

- **Prioritet:** P0 / 5.
- **Brugerproblem:** En grøn ændring kan ikke stoles på, hvis install, tests og build ikke kan reproduceres fra et rent checkout.
- **Scope:** Fastlås understøttet Node/npm, synkron lock, dokumentér én gate-rækkefølge, genkør suite/build uden sandbox-blokering, etabler CI eller tilsvarende evidens og en snæver legacy-lintplan mod global exit 0.
- **Acceptance criteria:** Frisk `npm ci`, typecheck, test og produktionsbuild kører deterministisk; testantal og resultater logges; nye/berørte filer har 0 lintfejl; global lint-baseline er synlig og P0-releasegaten er exit 0.
- **Afhængigheder:** Filadgang til build/test-cache; `SEC-P0-01A` runtime/lock-ændringer.
- **Tests:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; samme gate fra rent checkout/CI.
- **Status:** delvist implementeret. En separat P0 app-CI er secretsfri, read-only og ikke-deployende; den kører ved pull request, accepteret push til `main` eller manuel dispatch og bruger ikke featurebranch-push som automatisk trigger. Jobbet fastlåser Node 22.14.0/npm-lockvejen og kører ren install, typecheck, faktor-/checksumkontrol, serial tests og normal build. En lokal kontrakttest beskytter permissions, trigger-scope og fraværet af secrets/deploy. Global lint, audit-triage, required-check/branch protection og første hosted Linux-run er **AFVENTER** og skjules ikke med `continue-on-error`.
- **Evidens/commit:** Cyklus 011: 3/3 workflowkontrakttests, typecheck, `verify:faktorer`, fuld serial Vitest 46 filer/362 tests, målrettet ESLint/Prettier, YAML parse og normal build består. Cyklus 014 genverificerer den aktuelle lockfil med `npm ci --no-audit --no-fund` på Node 22.14.0/npm 10.9.2 og genkører typecheck, 54 filer/412 tests samt normal build grønt. Workflowkilden ligger i `.github/workflows/ci.yml`; ingen workflowrun blev udløst, fordi push til featurebranchen ikke er en trigger. Global lint, hosted Linux-run og npm audit-triage forbliver releaseblokeringer.

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
- **Status:** delvist implementeret lokalt. Dronefotos routes gennem uploadvalidering; browserens hash, rå EXIF/XMP, normaliserede geodata og QA ligger tabsfrit som ubetroet `uploads.user_metadata.client_preview`, og syntetisk centroid bruges ikke. En betroet serverekstraktor skal udfylde `detected_metadata`. En projektbundet BEFORE-batch på op til 200 billeder med stabil rækkefølge, to samtidige jobs, server-intent, TUS-resume og retry-samme-intent i den åbne wizard er implementeret og app-/servicetestet. UI-pause/reload-resume, survey rounds, fotopar, synkroniserede sammenligninger, reviewerflow, canonical `drone_assets`-routing, footprint/ortofoto og live tenant-/Storage-verifikation er **AFVENTER**.
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
