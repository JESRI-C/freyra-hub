# Mine opgaver: samlet feltforløb

4. november 2026 · S03–S05/S11 · ORG-03/04, JOB-04 og SYS-07.

## Problem og løsning

Aktiv staging `4be325d` binder originalfoto, opgave og planversion og bevarer
offlinekøen. Mine opgaver viste kun linket til feltregistrering og udførelse
for `can_plan`. En tildelt feltmedarbejder uden planlægningsret kunne derfor
ikke følge den almindelige indgang til de eksisterende funktioner.

Pakken genbruger MyWorkOrders fra den parallelle gren `d7bd290` (oprindelig
handoff `3af288a`) og mediefejlisolation `5228aad`. PR46's nyere
FieldOfflineWorkspace, task-parametre, køformat og fotobinding ændres ikke.
Der er ingen ny opgaveidentitet, uploader eller migration. Den parallelle
chats kompakte projektvisning ejes fortsat dér.

Den åbne opgave viser instruktion, gemt planversion og faktisk status.
En bidragende feltbruger får Fotos og jobkort på opgaven, Registrér udført
arbejde og Gå til aflevering. Samme projekt og `actions.id` følger linkene.
Dokumentation og aflevering bruger eksisterende paneler og versionshistorik.
Observationskoblingen er fortsat et eksplicit valg.

Feltlinket kræver en vellykket adgangskontrol for samme aktør og projekt,
bidragsadgang og opgavens udførelsesadgang. Det lukkes under genkontrol og ved
fejl, som har en konkret genforsøgsknap. Eksterne med kun opgaveadgang får
ingen aktiv projektfotohandling eller evidensskrivning. Annullerede opgaver
og ventende forudsætninger åbner ikke feltoptagelse. Planlæggeren kan fortsat
åbne arbejdsgrundlaget på en endnu ikke overtaget puljeopgave.

Liste og Kanban bruger serverens livscyklus. Manglende status vises som
Status ikke oplyst; optællinger siger antal **vist**, da listen er pagineret.
Kladder og igangværende overtagelse spærrer navigation og listeopdatering.
Indlæste paneler bevares gennem liste-/tavleskift.

Udførelsesmodellens eksisterende `dataBasis` bliver tilgængelig som
Registreringstype, så en softwareprøve kan gemmes som Syntetisk prøve eller
Demonstration. Tidligere versioner bevares. Dette udvider ikke modellen til
AI-beregninger, måleusikkerhed eller faglig effektvurdering.

Mediefejlisolation holder billedfejl inde i medieområdet. Opgaven og dens
kladder kan fortsat bruges. Uafklarede medier behandles ikke som tom
dokumentation i rapportforhåndsvisningen.

## Accept og bevis

| Regel | Gentagelig prøve | Status |
| --- | --- | --- |
| Feltbruger uden can_plan finder feltindgangen med præcis opgaveidentitet | MyWorkOrders.test.tsx og hosted prøve fra /opgaver | Består på kandidat 3ba51b1 |
| Aktør-/projektmismatch, fejl og tilbagekaldt adgang lukker feltlinket | MyWorkOrders.test.tsx: fejl, genforsøg og baggrundsgenkontrol | Består lokalt |
| Kladde, paginering og igangværende overtagelse er beskyttet | MyWorkOrders.test.tsx: routeblokering og tabt overtagelsessvar | Består lokalt |
| Status opfindes ikke | Liste/tavle med faktisk og manglende status | Består lokalt |
| Syntetisk udførelse bevares som syntetisk | ActionExecutionPanel.test.tsx: valg og tidligere version | Består lokalt |
| Mediefejl lukker ikke opgaven og opfinder ikke tomt rapportgrundlag | project-media-isolation, customer-project-route-integrity og ProjectPhotoAtlasAvailability | Består lokalt |
| Mine opgaver → foto/jobkort → offline genåbning → udførelse → dokumentation → aflevering | scripts/test-field-task-photos-staging.mjs på eksakt kandidat | Hosted 2ebb507c består |

105 målrettede prøver i syv filer, strict typecheck og lint består lokalt.
Første lint fandt kun formatering i prøveprogrammet; genprøven består efter
rettelsen. [CI 41798870264](https://github.com/JESRI-C/freyra-hub/actions/runs/41798870264)
består på `3ba51b16f4c34128613972e5fe5708fdc76e2e3b`: 3.607 appprøver i 269
filer, 1.910 databasekontroller i 28 filer, faktisk samtidighed, frisk
migrationsafspilning og database-restore. Runtime-audit viser nul kendte
sårbarheder. Det er afgrænset bevis på denne gren; den parallelle grens
supplerende ACL-/P9-gendannelsesprøver er endnu ikke integreret her.

Stagingbuild med GOMAXPROCS=2 består. Den separate Worker-version
`0ebf0053-0e34-438c-9b02-b43297da20c7` viser samme kilde.
[Prøv Mine opgaver](https://0ebf0053-gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/opgaver)
efter normalt login på samme adresse. Aktiv deployment `700e62c8` og
Worker `94906bdf` er læst uændret tilbage på 100 % før og efter upload.
Ingen `versions deploy` er udført.

Den [hosted kvittering](field-task-handoff-staging-receipt-2026-11-04.json)
viser præcise id'er og browser-/SDK-afgrænsning. Browseren fandt opgaven
gennem Mine opgaver som feltbruger uden can_plan, fulgte feltlinket og
bevarede originalen og to krævede jobkort gennem kold offline genåbning og
tabt uploadsvar. Genforsøg gav én original. Den samme browser åbnede
originalen med identisk SHA-256, gemte syntetisk udførelse, oprettede to
eksplicitte dokumentationskoblinger og gemte og indsendte afleveringen.
Planlægningens livscyklusovergange, uafhængigt teknisk review og idempotent
rapportoprettelse blev udført gennem SDK. Rapportvisning ved 390/1280 px og
PDF-download består. Fire viewportoptagelser er visuelt kontrolleret under
`docs/screens/field-task-handoff`.

Database-readback bekræfter én original, to koblinger, synthetic i den frosne
udførelse, nul egne testsessioner, nul midlertidige feltmedlemskaber og en
inaktiv reviewgrant version 2. Historik og syntetiske testresultater bevares.

**Fund til næste rettelse:** Rapportgeneratoren fører ikke udførelsens
dataBasis videre. Den gemte testaflevering har synthetic, mens rapporten
hverken har workflowSnapshot eller en synlig syntetisk markering. Dette er
bekræftet ved database-readback på rapport `c0533856` og ved kildekontrol af
`20261103191842_show_frozen_indicator_target_in_work_order_report.sql`.
Browserprøvens PASS godkender teknikforløbet, ikke rapportens faglige eller
datamæssige godkendelse. Ret mærkning i ny rapportgenerering/visning med
bevaret historik og reproducerbar eksport før samlet produktaccept.

**Efterfølgende rettelse på denne gren:** [Rapportens registreringstype](RAPPORT_REGISTRERINGSTYPE_2026-11-04.md)
er nu efterprøvet på `12d348b1`/Worker `6b7b1177`, migration `20261104091051`.
Nye rapporter viser den frosne type, og den tidligere rapport/PDF er genåbnet
med uændret indhold og identiske bytes. Kvitteringen ovenfor bevarer det
oprindelige fund fra 3ba51b1; den omskrives ikke til en historisk PASS.

## Åbne grænser

Teknikforløbet er efterprøvet; den samlede produktaccept er åben. Fysisk kamera/GPS/HEIC, et uassisteret
kommunalt brugerforløb, faglig metodegodkendelse, fuld Skyhost-paritet og
drifts-/salgsaccept er fortsat åbne. En samlet kandidat skal også medtage og
efterprøve den parallelle gren. Kommunens og sagens navn i den personlige
opgaveliste kræver stadig en snæver, autoriseret præsentationskilde;
der indlæses ikke projektbrede data for eksterne alene for at vise en label.
Dokumentationskoblingen bør også være et selvstændigt næste trin før
Aflevering; den ligger nu under Dokumentation. Det skal indgå i næste
brugeroplevelsesprøve sammen med forståelige rapportstatusser og kildenavne.

Ingen merge eller produktionsændring. En separat stagingversions-URL bruges
først, så den klargjorte telefonprøve på den aktive version kan fortsætte.
