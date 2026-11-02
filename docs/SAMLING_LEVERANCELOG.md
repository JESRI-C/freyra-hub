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
