# Leverancelog for samling af Freyra

## 2. november 2026 — plan og afgrænset oprydning

Udgangspunkt: `2b122fe4518fc3673a6c8db0450b2073c5a166d3`, `codex/work-order-ux-v1`.
PR34 er genlæst som åben draft med samme head. Ingen ny integrationsgren,
merge, migration, provideraktivering eller deploy i denne opgave.

### Leveret

- `UDVIKLINGSPLAN_SAMLING_2026-11-02.md`: S00–S12, genbrug, konkrete kodeindgange,
  afhængigheder, skøn, accept, drift og kobling til eksisterende F-/D-krav.
- README henviser til planen. Den ældre output-/genbrugsanalyse er mærket som
  historisk, så allerede rettede layoutblokeringer ikke bliver nyudviklet igen.
- Tre ubrugte `ProjectEvidenceStatus`-imports fjernet i decisions/impact/ledger.
  Importerne havde ingen anvendelse i filerne; `Outlet` og brugeradfærd er bevaret.
  Komponenten selv og øvrige genbrugskandidater er ikke slettet.

### Genbrugsbeslutninger

| Kandidat | Beslutning nu | Næste kontrol |
|---|---|---|
| SpeciesRecognitionFlow | Bevar, vurder under S08 | Unikke dele, aktuelle serverfunktioner, evalueringssæt og manuel reviewvej |
| AiReportDraft | Bevar, vurder under S08/S05 | Sammenhold med eksisterende rapportudkast; ingen parallel rapportmotor |
| NotificationCenter | Bevar, vurder under S09 | Sammenhold med opgaver/aktivitet og faktisk beskedkvittering |
| WatercoursePanel / OrthophotoOverlayControl | Bevar, vurder under S03/S07 | Sammenhold med aktive kort og rasterpreview |
| Ældre live-data-connectors | Bevar, kortlæg under S07 | Parser/testværdi og aktiv ejer pr. kilde |
| Projektspecifik Python-produktion | Bevar uden eksekvering | Udskil genanvendeligt layout/GIS fra projektkonstanter under S05/S06 |
| ProjectEvidenceStatus-import i tre layouts | Fjernet som ubrugt import | Typecheck, målrettet lint og eksisterende routeintegritetsprøver |

### Status og næste arbejde

S00 er **delvist undersøgt**: lokal/remote PR34 er afstemt; faktisk hosted build,
fuld PR-række, migrationsfingeraftryk og produktionsrevision er ikke genkontrolleret.
S01–S09 og S11–S12 er **planlagt**. S10 er **påbegyndt** med ovenstående lille
oprydning, ikke afsluttet. Ingen eksisterende F-/D-krav eller kundeaccept lukkes.

Eksisterende brugerændringer i JOBS_GEOTAG_KRAVMATRIX og
JOBS_GEOTAG_TESTLEVERING er bevaret. Ældre CI-resultater tælles ikke som nye.

### Kontrol faktisk udført i denne opgave

- `npm run typecheck`: bestået, exit 0.
- ESLint på de tre ændrede routefiler: bestået, exit 0, ingen output.
- De eksisterende `customer-project-route-integrity` og
  `customer-connect-route-integrity`: 15/15 prøver i to filer bestået.
- `git diff --check`: bestået. Git gav alene meddelelser om forventet LF/CRLF.
- Planens S00–S12 kontrolleret: 13 unikke arbejdspakker.
- Diff gennemgået: kodeændringen er kun tre fjernede ubrugte imports.

Ingen ny fuld testsuite, build, database-/Storage-prøve, browserkontrol eller
pilotprøve er kørt; disse ligger uden for den lille importoprydnings risiko.
Denne kvittering er ikke dokumentation for samlet produktionsparathed.

## 2. november 2026 — projektnavigation og feltforbindelse implementeret

Gren: `codex/project-navigation-integration-v1`, oprettet fra verificeret PR34-head.
[Versions-/miljøkvittering](samling-baseline-2026-11-02.json) og
[ændringsbeskrivelse og destinationsmapping](SAMLING_NAVIGATION.md).

### Ændret og genbrugt

- S00: main/PR18/PR33 er verificerede ancestors. PR34's head og grønne
  grundlags-CI er genlæst. Stagingmigrationshistorik og de syv relevante
  arbejdsordremigrationer er læst uden skrivning. Hosted app-/produktionsrevision
  er fortsat ukendt, fordi de offentlige buildmetadata ikke kunne hentes.
- S01: fælles typed destinationsmapping og seks arbejdsområder for både
  projektfaner og guidede trin. Gamle task-/round-/work-links bevares.
- Den samme opgave-/rapportvisning bruges fra gamle og nye indgange.
  Besøgte paneler bevares i hukommelsen under navigation; konto/projekt skifter
  ejer og rydder dem. Eksisterende opgavekladdelåse og adgangskontrol genbruges.
- Indlæsnings-/fejlgrænser bevarer navigation med genforsøg. Kort justerer
  størrelsen, når bevarede paneler bliver synlige igen.
- WorkflowReportPanel og WorkflowFollowupPanel er koblet ind i projektets
  rapportområde sammen med eksisterende rapport-/dokumentvisninger.
- S02 påbegyndt: præcis opgave følger links til `/felt` og tilbage til samme
  jobkort. Opgaven vælges kun i den aktuelle gemte projektpakke. Manglende
  opgave giver eksplicit fejl og ingen erstatning. Fotos er stadig projektbundne.
- Et returlink kan skifte det allerede monterede opgavearbejdsrum til
  feltregistrering uden at genmontere tidligere redigeringer.

### Kontroller og status

- Indledende målrettede navigations-/routeprøver bestod efter tilpasning af
  den eksisterende data-guard-test til at teste under shellens Suspense-grænse.
  Kravet om at stoppe rapportpreview ved mediefejl er bevaret.
- Første fulde regression: 3.293 bestået, to fejl. En eksisterende Vite-bundleprøve
  overskred sin 15-sekunders grænse, og en eksisterende asynkron adgangspanelprøve
  fandt ikke knappen efter sin faste ventetid. Begge bestod uændret i isoleret
  genprøve (22/22). Prøvernes kildekode og assertions er ikke ændret for at få grønt.
- Den første feltlinkprøve afslørede en forventning uden task-reference;
  forventningen er opdateret til den tilsigtede nye identitet. De berørte
  felt-/opgave-/returlink- og kortstørrelsesprøver består: 26/26 i fem filer.
- Fuld lint: 0 fejl og 24 eksisterende advarsler før den sidste lille
  returlinktilpasning. Endelig kandidatkontrol følger nedenfor efter kørsel.
- En ny typesignatur i routetesten blev rettet til den faktisk anvendte
  validatorfunktion; ingen produktkontrakt blev ændret af testrettelsen.
- Anden samlet standardkørsel: 3.297 bestået og fire tidsoverskridelser
  i eksisterende analyse-/lokaliserings-/rapport-/bundlingprøver. Kontrollen
  køres derfor igen som en fuld, dækningskontrolleret serie med højst 30
  filer pr. frisk Vitest-proces, én fork-worker og uden filparallelisme.
  CLI-grænsen for standardtests/hooks sættes til 30 sekunder på denne maskine;
  eksisterende eksplicitte per-testgrænser og samtlige assertions bevares.
  Det er en anden kørselsform, ikke dokumentation for grøn standardkørsel.

S00's kodegrundlag er fastlagt; aktuelle online-buildmetadata er en åben
miljøkontrol. S01 er implementeret og afventer samlet kandidatkontrol og
faktisk desktop-/telefonprøve. S02/D03 er fortsat delvis: databasehåndhævet
opgave-/observations-/originalbinding og ekstern filvej er næste udviklingsdel.
S04/D05 og S05/D07 er ikke lukket af denne navigation.

Ingen migrationsfil, originalfil, kundedata eller eksisterende funktion er
slettet. Eksisterende Jobs/Geotag-dokumentændringer er hashkontrolleret uændrede.
Ingen hosted migration, deployment, merge, mail eller betalt providerkald.

### Endelig regression på integrationsændringen

- Typecheck: bestået på den samlede kode før slutregressionen.
- Alle **3.301/3.301 tests i 246 filer** bestod i ti sekventielle grupper.
  Hver af de konfigurerede testfiler blev kontrolleret medtaget præcis én gang.
  Den reelle Vite-/EXIF-bundleprøve bestod også sin uændrede 15-sekunders grænse.
- [Maskinlæsbar oversigt](samling-regression-2026-11-02.json) registrerer
  kørselsform, filantal, tests og exitkode for hver gruppe. Komplette JSON-/tekst-
  kvitteringer og kørselsscript er bevaret i ignoreret `tmp/samling-2026-11-02/`.
- Standardkørslernes tidsoverskridelser står ovenfor; de erklæres ikke bestået.
  Ingen assertions eller testkildefiler er svækket af opdelingen.
- Bygning og dens præcise kilde-SHA registreres i en efterfølgende kvittering.

### Efterfølgende afgrænset S03-forbedring

Integrationskoden ovenfor er gemt i `1accaab`. En afsluttende gennemgang
viste, at den gamle detaljeside indlæste eksternt miljøgrundlag med Suspense
for alle faner, også rapporter og opgaver. Det blev en unødvendig afhængighed
for de nu samlede indgange.

Miljøkilder indlæses nu særskilt, når en indlogget bruger åbner Miljødata
eller Projektkort. Cacheidentiteten indeholder aktør, organisation, projekt
og de sted-/geometriinput, som forespørgslen faktisk bruger. Kildefejl viser
ukendt og genforsøg frem for gamle miljøværdier. Projekt-/foto-/rapportdata
og deres eksisterende fejlstop er bevaret.

Den afgrænsede opfølgning består 20/20 relevante route-/datagrundlagsprøver
i tre filer. Den nye prøve verificerer, at rapporter og opgaver ikke starter
miljøkald, og at miljøvisningen aktiverer dem i den rette aktør-/projektkontekst.
Den fulde opdelte 3.301-testkørsel ovenfor gælder `1accaab`; denne lille
opfølgning har sin egen målrettede genprøve og efterfølgende type-/byggekontrol.

### Bygget kandidat og afgrænsning

- Applikationskilde: `2a16edd9ea1a0c749dc81ef0be83afae4aa247ec`.
- Typecheck og lint af opfølgningens ændrede filer bestod.
- `FREYRA_BUILD_REVISION` sat til den præcise applikationscommit og
  `CLOUDFLARE_ENV=staging`; `npm run build:staging` bestod inklusive
  efterfølgende bundle-/miljøkontrol. Den genererede buildmetadata er læst
  tilbage og matcher SHA, staging, kundedata og kommunalt workflow.
- [Kandidatkvittering](samling-kandidat-2026-11-02.json) angiver
  testomfang, kilderevision, build og de fortsat åbne acceptpunkter.
- Bygningen gav kendte GeoTIFF-/chunk-/Nitro-/use-client-advarsler, men
  ingen buildfejl. Den nye feltroutetest flyttes til `lib/__tests__`, så den
  ikke bliver opfattet som en mulig applikationsroute. En eksisterende
  login-routetest giver fortsat en separat discovery-advarsel.
- Generatorens rent kosmetiske ændring af fire blanklinjer i routeTree.gen.ts
  er tilbageført efter diffkontrol; ingen route eller brugerændring er fjernet.

S01's kode og lokale automatiske kontroller er leveret. Fysisk/hosted
brugerprøve er åben. De efterfølgende dokumentations-/testplaceringsændringer
ændrer ikke den byggede applikationskode. Onlineappen er ikke opdateret.

## S02/D03 — opgave, gemt feltregistrering og verificeret original

2. november 2026: `codex/work-order-evidence-v1`, applikationscommit
`5739c85b59376478d2ff39770808d3942eb487df`.
[PR36](https://github.com/JESRI-C/freyra-hub/pull/36) er kladde oven på
[PR35](https://github.com/JESRI-C/freyra-hub/pull/35), der nu også er afleveret
som navigationskladde. Ingen merge eller deploy.

Dokumentation er samlet under projektets arbejdsopgave og som læseindgang i
Mine opgaver. Immutable jobkortversioner og eksisterende serverkvitteringer
genbruges. En ny koblingshistorik fastholder skema, observation, filidentitet,
checksum, begrundelse og audit. Rettelser overskriver ikke historik. Præcis
serverkontrolleret originaladgang udløber efter 60 sekunder; projektets
Storage-adgang åbnes ikke for eksterne.

Typecheck, ændrede filers lint, 69 målrettede tests i fem filer og
staging-build med korrekt SHA i metadata bestod. Det udvidede eksisterende
samtidighedsscripts JavaScript-syntaks er kontrolleret. Browserbundlen er
kontrolleret uden signer/admin-markører. Databasemigration og nye pgTAP- og
samtidighedsprøver er endnu **ikke kørt**: lokal database mangler, og de to
CI-jobs står i kø. Migrationen er ikke anvendt på hosted staging.

[Detaljer, diagram og næste acceptpunkter](OPGAVE_DOKUMENTATION_SAMLING.md).
S02/D03 er delvis; generiske observationer, droneoriginaler, ekstern
nyregistrering/upload, fysisk mobil/offline, udførelsesbinding i UI og
frosne afleverings-/rapportsnapshots er fortsat åbne. De to brugerændrede
Jobs/Geotag-dokumenters hashes er uændrede.

### Verificeret opfølgning og kobling til udført arbejde

CI-køen ovenfor blev afviklet. På `e716533` bestod hele kørsel
41421195287 med 3.353 app-tests og 1.458 databasekontroller. Ingen hosted
database blev ændret.

Applikationscommit `72d4c8486295848740d384c58006f545fb82f3f6` tilføjer et
udtrykkeligt valg af eksisterende faktisk udførelsesversion. Referencen er
immutable og opgave-/projekt-/organisationsafgrænset; planlagt arbejde kan
ikke ved direkte API-insert fremstilles som faktisk udførelse. Den valgte
historiske version indlæses først ved åbning. Udførelsesgemning opdaterer
kildelisten, og genforsøg bevarer den valgte versionsidentitet.

[CI 41423470242](https://github.com/JESRI-C/freyra-hub/actions/runs/41423470242)
bestod begge jobs: 3.367 tests i 249 app-filer, 1.471 databasekontroller i
22 filer, tom migration, 29 generelle + 21 job-/opgave- + seks foto-
samtidighedsscenarier, HTTP-konflikt, restore, databaselint, oprydning,
typecheck, lint, billeddekodning og build. Tests eller grænser blev ikke
svækket for at få grønt.

Lokalt bestod 108 målrettede tests i syv filer, typecheck, ændrede filers
lint og staging-build. Buildmetadata matcher præcis applikations-SHA.
Chrome-layout med syntetiske serverfunktioner og virkelig komponent/CSS
bestod i 320/390/1280 pixels; skærmbilleder er gennemgået. Dette er ikke
hosted end-to-end eller fysisk telefon-/offlineacceptance.

[Kandidatkvittering](opgave-dokumentation-kandidat-2026-11-02.json) og
[opdateret diagram/acceptplan](OPGAVE_DOKUMENTATION_SAMLING.md) fastholder
afgrænsningen. Udførelsesbinding i UI er nu implementeret. S02/D03 er
fortsat delvis, og frosne afleveringer/review/rapportkilder i S04/D05 og
S05/D07 er ikke lukket. PR36 er fortsat kladde; ingen merge, hosted
migration eller deploy. Brugerens to dokumentændringer er bevaret.

### Autoriseret staging-forløb og klargjort telefonprøve

2. november 2026: brugerens mandat er udvidet til hosted testmiljø og
telefonklargøring. Begge allerede afprøvede additive migrationer er anvendt
på staging `xdvqdzdpyceojbdknofi`; deres præcise SQL er sammenholdt før og
efter. Kun de to nye værktøjsgenererede migrationsversioner blev afstemt med
kildeversionsnumrene. Historiske migrationsrækker er uændrede.

Applikationskilde `46bf6dfc96b72866fafc1c1b0333e9ecc8aa2b4e` kører på
`gofreyra-p0-staging`, Worker-version
`e5bdd8e0-e004-475f-9133-e1fcfd0f06c2`. Dashboardvariabler/secrets er bevaret,
og offentlig buildmetadata matcher den præcise kilde. Produktionsappen og
den separate baggrundsbehandling er uændrede.

Den reelle browserprøve fandt og fik rettet en dobbelt Authorization-header
i eksisterende TUS-upload: XHR tilføjede gammelt og nyt token, hvilket Storage
afviste. En appendende transportregression fejlede før rettelsen. Kun ét
aktuelt token sættes nu i hooken. 34 målrettede tests i fire filer, typecheck,
ændrede filers lint og staging-build bestod lokalt.
[CI 41428951155](https://github.com/JESRI-C/freyra-hub/actions/runs/41428951155)
bestod begge jobs med **3.368 app-tests og 1.471 databasekontroller**, inklusive
frisk migration, samtidighed, HTTP-konflikt, restore, lint og build.

Hosted Chrome bestod login → plan → gemt jobkort med 0/Nej → separat faktisk
udførelse → lokal fotoqueue uden net → luk/genåbn feltside offline → virkelig
TUS-upload → serverkvittering → eksplicit kobling → historisk udførelse og
signeret original. Et bevidst mistet succesfuldt gemmesvar kunne genforsøges
uden dublet. Rettelser bevarede tidligere snapshots; forkert opgave og
originalåbning efter tilbagetrækning blev afvist. En afgrænset ekstern
testkonto kunne læse dokumentation og original, men ikke kildekatalog,
projektmedier eller anden opgave. Efter tilbagekaldelse afviste UI og RPC nye
original-links. Ingen mail/invitation blev sendt, og testtildelingen er lukket.

Den klargjorte prøvesag bevarer alle testversioner. Version 3 bruger et
synligt 160 × 96 PNG; bytehash, størrelse og faktisk billeddekodning er
kontrolleret. Den første lille tekniske PNG havde en ugyldig chunk-CRC og
blev bevaret; en ny original og koblingsversion blev oprettet. Identiske
filbytes er ikke i sig selv bevis på gyldig billedkodning.

Før/efter-ID/hash-kontrol bevarede alle 50 projekter, 16 opgaver, 32
workspaceversioner, 110 mediereferencer og 252 Storage-objektmetadata uden
ændringer eller sletninger. Kun nye, mærkede testdata er tilføjet. Kontrollen
er ikke en restore eller fuld genhashning af gamle originalbytes. De to
brugerændrede dokumenters SHA-256 er uændrede. Supabase-advisories har ingen
ny/ændret gruppe; eksisterende fund er stadig åbne.

[Telefonvejledning](TELEFONPROEVE_OPGAVER_2026-11-02.md) og
[hosted-kvittering](opgave-dokumentation-staging-2026-11-02.json) er afleveret.
`scripts/test-work-order-evidence-staging.mjs` fastholder den afgrænsede
prøve med private credentials i ignoreret tmp, uden secrets i leverancen.
Telefonbredde 390 pixels bestod; fysisk telefon/kamera/HEIC og faktisk
telefonbrowserlukning afventer Jespers prøve. S02/D03 er delvis. Frosne
afleveringer/review/rapportkilder er næste integration. PR36 er fortsat
kladde; ingen merge, produktionsændring, AI-kald eller betalt billedbehandling.

## Projektlederforløb og præciseret Skyhost-mål

2. november 2026: Jespers faktiske brugerprøve fandt fortsat formål og
betjening forvirrende. S01/S11's brugeraccept er genåbnet. Projektlederen
er valgt som primær bruger. Projektlisten åbner overblik frem for billeder,
formålet er flyttet frem ved oprettelse, og et fælles forløb forbinder
problem/mål, grundlag, plan, udførelse, vurdering og dokumentation.
Eksisterende beskrivelsestekst, værktøjer, opgaver og historik er bevaret.
Opgavens Videre-knapper genbruger de monterede editorer og bevarer kladder.

Kilde `c93ad0309da4a6b5fa1d43c9d7a278ae8945c510`, kladde
[PR37](https://github.com/JESRI-C/freyra-hub/pull/37) oven på PR36, bestod
[CI 41441077355](https://github.com/JESRI-C/freyra-hub/actions/runs/41441077355):
3.373 app-tests/250 filer, 1.471 databasekontroller/22 filer samt de fulde
type-/lint-/samtidigheds-/restore-/buildkontroller. Lokal fuld typecheck
ramte maskinens hukommelsesgrænse; den er kun markeret bestået via CI.
Lokal staging-build bestod med præcis kilde i buildmetadata. Den kosmetiske
routegenerators fire blanklinjeændringer er tilbageført efter diffkontrol.

Staging er deployet som Worker `081e2eeb-b7df-473e-80f7-19a83c0ffa02`, med
bevarede dashboardvariabler/secrets. Offentlig buildmetadata matcher.
Hosted browserprøve bestod formålsfelt ved oprettelse, gemt plan,
kladdebevarelse, opgaveidentitet gennem genveje og 320/390-pixel-visning.
Skærmbilleder er gennemgået. Ny mærket eksempelsag og tom
registreringsskabelon er klargjort; ingen virkelig udførelse eller
natureffekt er registreret. Se [forløb og brugeraccept](PROJEKTLEDER_FORLOEB_2026-11-02.md).
Tidligere testsager og originaler er bevaret. Ingen skemaændring, merge,
produktionsændring, ekstern besked eller betalt provideraktivering.

Jesper præciserede dernæst, at målet er at kunne det samme som Skyhost.
Den oprindelige kortlægning er genfundet i Drive og genlæst; dens 34.852 bytes
matcher det allerede registrerede SHA-256. Den eksisterende 68-kravsmatrix
genbruges. [Paritet og konkret restarbejde](SKYHOST_PARITET_OG_RESTARBEJDE_2026-11-02.md)
gør kalender, gentagne jobs, timer, materialer, booking, ruter og opsætning
til obligatoriske dele af den samlede leverance. S13–S16 er føjet til planen.
De områder er planlagt, ikke leveret af denne UI-ændring. Det gamle samlede
tidsestimat kan ikke bruges som løfte for det udvidede paritetsmål.

De to brugerændrede Jobs/Geotag-dokumenter bevares uændrede. Jespers nye
brugbarhedsaccept, fysisk telefon, fuld D03–D08 og Skyhost-paritet er fortsat
åbne. Ingen af disse lukkes af grøn CI eller en fungerende genvej.

## Afleveringsgrundlag — første implementering i S04/D05

Kilde `06c438b8f78fb4827a5f29a0b63173ac309847ce`, kladde
[PR38](https://github.com/JESRI-C/freyra-hub/pull/38), tilføjer Aflevering på
samme opgave og læsning i Mine opgaver. Præcis plan, tildeling, udførelse,
status, registreringer/skabeloner og originalreferencer fastholdes uden
filkopier eller ændring af tidligere versioner. Eksisterende roller,
operationel status, editorlåse, signer og audit genbruges.

[CI 41500655142](https://github.com/JESRI-C/freyra-hub/actions/runs/41500655142)
bestod 3.394 app-tests/252 filer og 1.516 databasekontroller/23 filer, fuld
type-/lint-/buildkontrol, frisk replay, reelle samtidigheds-/HTTP-prøver og
dump/restore. Lokal fuld typecheck og staging-build bestod. Additiv migration
`20261102180652` er anvendt og hashafstemt i staging, som nu har 45 migrationer.
RLS/grants er aflæst. Sikkerhedsadvisors har samme 21 enkeltfund før/efter.

Worker `bb911f1c-186f-4bc6-8641-d075d5f8c80d` har verificeret buildmetadata.
Hosted browser/API bestod afbrudt svar med idempotent genforsøg, bevaret
første aflevering efter rettelse, 0/Nej/ukendt, faktisk originaldownload
med SHA-256, tilbagetrækning, tre versioner og 390-pixel-visning. Syntetisk
ekstern konto læste gennem Mine opgaver og API; gemning blev afvist,
tilbagekaldelse fjernede browserhistorikken ved opdatering, og testadgangen
er lukket igen. Skærmbilleder er gennemgået.

Bevaringskontrol fandt nul ændrede/manglende gamle rækker blandt 52
projekter, 22 opgaver, 117 mediereferencer, 36 workspaceposter og 260
Storage-objekter. Én mærket testopgave og dens udførelsespost blev tilføjet.
Begge brugerændrede Jobs/Geotag-dokumenters SHA-256 er uændret. Ingen
original, gammel funktion, produktion eller ekstern besked er ændret.

[Leverance og restarbejde](OPGAVE_AFLEVERING_SAMLING.md),
[maskinlæsbar kvittering](submission-staging-receipt-2026-11-02.json) og
[telefonprøve](TELEFONPROEVE_OPGAVER_2026-11-02.md) fastholder beviserne.
**S04/D05 er delvis:** review/returnering, versionsbundne fagkrav og
rapportbinding mangler. Hele Skyhost-målet, fysisk telefon og Jespers
brugbarhedsaccept er fortsat åbne. Ingen merge, produktionsrelease,
mail/invitation eller aktivering af betalt udbyder er udført.

## Hele programkortet og samme præsentation

Jespers opfølgning om at kortlægge det hele og vise det på samme måde er
omsat til [Programoverblik](PROGRAMKORT_OG_ENSARTET_VISNING_2026-11-02.md)
i appen. Samme præsentationsregister forbinder 71 kanoniske sidevisninger,
20 projektværktøjer, fem opgavedele, de ti Skyhost-jobområder og alle 68
eksisterende krav. 115 kortpunkter skelner mellem eksisterende visning,
under udbygning, afventer samling og planlagt. De er ikke 115
færdigaccepterede funktioner. Fælles WorkspaceGuide beskriver formål,
arbejde og resultat i de eksisterende arbejdsrum. Søgning på jobkort,
Geotag og tjeklister finder de tilsvarende eksisterende opgavedele.

867 JS-/TS-filer, 93 routedefinitioner og lokale importrelationer er
inventeret. Ingen fundne produktsider er uden mapping. Tidligere
TypeScript-træer med 599/650/656 filer har ingen særskilte filstier, der
mangler i nyeste kode; indholdsforskelle er bevaret til review. Den gamle
JSX-prototype og alle tidligere træer er bevaret. 97 ikke-nåede
produktionsfiler er klassificeret som undersøgelseskandidater, aldrig
automatisk slettet eller erklæret færdige funktioner.

Kilde `92c638baa0cdabd8d09b12569b86afd35268a327`, kladde
[PR39](https://github.com/JESRI-C/freyra-hub/pull/39) oven på PR38,
bestod [CI 41510845863](https://github.com/JESRI-C/freyra-hub/actions/runs/41510845863):
3.404 app-tests/254 filer, 1.516 databasekontroller/23 filer og de fulde
type-/lint-/build-/samtidigheds-/restorekontroller. Den eksisterende
menutest er udvidet til at kontrollere alle 17 oprindelige links plus
Programoverblik. Ingen gamle indgange er fjernet.

Staging-Worker `4acbcaaa-83bb-4372-a13c-ed4286c0d667` og offentlig
buildmetadata matcher kilden. Hosted browser bestod de navngivne filtre,
tom søgning/nulstilling, Skyhost-søgning, korrekt naturprojekt, alle ti
jobområder, inaktive planlagte funktioner, 320/390-pixel-visning, direkte
Dokumentation/Aflevering-links og samme formål/resultat på repræsentative
projekt-/opgave-/globalsider. Browseren gav ingen JavaScript-sidefejl.
Skærmbilleder er gennemgået. Testscript og maskinkvittering er bevaret.

Der er ingen hosted databaseændring, merge, produktionsændring, besked,
AI-/Images-kald eller aktivering af betalt udbyder. Læseprøven genbrugte
den eksisterende syntetiske sag uden at skrive projektdata eller filer.
Begge brugerændrede Jobs/Geotag-dokumenters SHA-256 er uændret. Fysisk
telefon, brugbarhedsaccept og fuld Skyhost-paritet er fortsat åbne.

## Aflevering og uafhængig gennemgang — S04/D05b

Kilde `2e04787f13a042b36df44b3b3bb2a4bb4a25f6f3`, kladde
[PR40](https://github.com/JESRI-C/freyra-hub/pull/40) oven på PR39, forbinder
frosne afleveringer med samme opgaves eksisterende status og logbog.
Aflevering, uafhængig godkendelse/returnering, begrundet genåbning og ny
aflevering bevarer tidligere versioner. Review gælder registreret udførelse
og dokumentation; der erklæres ingen automatisk natureffekt. Selvreview,
ændrede kilder, forkert scope og tilbagekaldt adgang afvises i databasen.

[CI 41535229142](https://github.com/JESRI-C/freyra-hub/actions/runs/41535229142)
bestod 3.418 app-tests/256 filer og 1.568 databasekontroller/24 filer samt
typecheck, lint, build, frisk replay, reelle samtidigheds-/HTTP-prøver og
dump/restore. Samtidighed dækker nu reviewbeslutninger, genforsøg, præcist
originalobjekt og medlemskabstilbagekaldelse før commit. Additiv migration
`20261102213116` er anvendt/hashafstemt i staging, der nu har 46 migrationer.
Offentlig buildmetadata matcher kilden og Worker
`ade3d174-87f1-4d64-8f5f-bf668c88a93c`.

Hosted browser/API bestod aflevering → returnering → genåbning → udført →
ny aflevering → godkendelse. Et afbrudt succesfuldt svar blev genfundet med
samme request-ID: én godkendelsesversion og én audithændelse. Den første
aflevering er uændret, og originaldownload matcher SHA-256. Reviewerens
Mine opgaver virker uden udførelsesret. Tilbagekaldelse skjuler cache og
historik ved opdatering og afviser gammel kvittering. Midlertidige
reviewrettigheder er lukket. 1280/390/320 pixels og eksisterende logbog er
prøvet; skærmbilleder er gennemgået.

Ingen gamle rækker er ændret eller mistet i de kontrollerede projekter,
opgaver, medier, workspace, Storage, status-, afleverings- og adgangsversioner.
Én mærket testopgave og dens nye historik er tilføjet. Brugerens to
Jobs/Geotag-dokumenter har uændrede hashes og er ikke med i committen.
Sikkerhed har samme 21 advisorfund; performance har ét nyt ubrugt indeks,
der bevares som støtte for den nye FK. Ingen ny uindekseret FK.

[Leverance](OPGAVE_GENNEMGANG_SAMLING.md),
[maskinkvittering](review-staging-receipt-2026-11-02.json) og
[telefonprøve](TELEFONPROEVE_OPGAVER_2026-11-02.md) er opdateret.
Programkortet er genskabt med 873 filer, 68 krav, 13 planlagte områder og
ét delvist reviewområde. JOB-05/JOB-09 og QA-01–04 har konkrete henvisninger.
**S04/D05 er delvis:** næste mangel er versionsbundne profil-/kategorikrav,
derefter S05s rapportbinding. Fuld Skyhost-paritet, fysisk telefon, faglig
accept og Jespers brugbarhedsaccept er fortsat åbne. Ingen merge,
produktionsændring, besked eller aktivering af betalt udbyder er udført.

## Visningskontrol af hele programkortet — 3. november 2026

Kilde `e4d71ece56a9fbe333f7ad5d06c85aa14a504c9a`, kladde
[PR41](https://github.com/JESRI-C/freyra-hub/pull/41) oven på PR40, retter
fund fra en faktisk browsergennemgang af alle aktive destinationer.
Hovedmenuen bruger nu ét aktuelt punkt gennem den rigtige router og fælles
navne fra programkortet. Kildekatalogets kortlink følger det valgte projekt
frem for et fast pilotprojekt. Danske modulnavne, en samlet opgavetotal og
den særlige Haderslev-rapportskabelons faste modtager er synlige. Rapportens
historiske generator og gamle statusfelter ændres ikke. Strukturerede notater
åbnes i deres oprindelige arbejdsrum med bevaret historik. Datakilder,
regler og lavbundsprojektvalg har synlige knapper på telefon, og genbrugte
visninger bruger den aktuelle sides overskrift.

[CI 41548292311](https://github.com/JESRI-C/freyra-hub/actions/runs/41548292311)
bestod 3.441 app-tests/259 filer, 1.568 databasekontroller/24 filer og de
eksisterende type-/lint-/build-/replay-/samtidigheds-/restorekontroller.
Staging-Worker `c2afe922-81fe-446e-9823-056e1ae1511d` og offentlig
buildmetadata matcher kilden. Der er ingen databaseændring.

[Visningskontrollen](VISNINGSKONTROL_2026-11-03.md) og
[maskinkvitteringen](display-staging-receipt-2026-11-03.json) skelner mellem
115 kortpunkter, 97 aktive destinationer, 90 direkte kontrollerede
visninger og syv fagprojektafhængige indgange, som kontrolleres frem til
projektvalg. Testkontoen har ingen bygge-/lavbundsprojekter, så deres fulde
datavisning er fortsat åben. Målingerne dækker 1280, 390 og 320 pixels.
Tilbagekaldt opgaveadgang og anonyme visninger er prøvet uden rettighedsændring.

Programkortet er genskabt med 876 kilde-/testfiler og nul umappede
produktsider. Brugerens to Jobs/Geotag-dokumenter er uændrede og holdes
uden for committen. Fagmoduler, data, originaler og gamle links bevares.
S04s fagkrav, S05s generelle rapport-/reviewbinding, fuld Skyhost-paritet,
fysisk telefon og faglig/brugeraccept er fortsat åbne. Ingen merge,
produktion, besked eller betalt udbyder er aktiveret.
