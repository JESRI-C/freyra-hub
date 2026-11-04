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
| Feltbruger uden can_plan finder feltindgangen med præcis opgaveidentitet | MyWorkOrders.test.tsx og hosted prøve fra /opgaver | Komponentprøve består; hosted afventer |
| Aktør-/projektmismatch, fejl og tilbagekaldt adgang lukker feltlinket | MyWorkOrders.test.tsx: fejl, genforsøg og baggrundsgenkontrol | Består lokalt |
| Kladde, paginering og igangværende overtagelse er beskyttet | MyWorkOrders.test.tsx: routeblokering og tabt overtagelsessvar | Består lokalt |
| Status opfindes ikke | Liste/tavle med faktisk og manglende status | Består lokalt |
| Syntetisk udførelse bevares som syntetisk | ActionExecutionPanel.test.tsx: valg og tidligere version | Består lokalt |
| Mediefejl lukker ikke opgaven og opfinder ikke tomt rapportgrundlag | project-media-isolation, customer-project-route-integrity og ProjectPhotoAtlasAvailability | Består lokalt |
| Mine opgaver → foto/jobkort → offline genåbning → udførelse → dokumentation → aflevering | scripts/test-field-task-photos-staging.mjs på eksakt kandidat | Udvidet prøveprogram skrevet; hosted afventer |

105 målrettede prøver i syv filer består lokalt. Strict typecheck består.
Første lint fandt kun formatering i prøveprogrammet; formateringen er rettet,
og lint-genprøven afventes. Fuld CI, stagingbuild og browserkvittering
registreres efter faktisk kørsel. Aktive staginglinks viser fortsat 4be325d.

## Åbne grænser

Pakken er under efterprøvning. Fysisk kamera/GPS/HEIC, et uassisteret
kommunalt brugerforløb, faglig metodegodkendelse, fuld Skyhost-paritet og
drifts-/salgsaccept er fortsat åbne. En samlet kandidat skal også medtage og
efterprøve den parallelle gren. Kommunens og sagens navn i den personlige
opgaveliste kræver stadig en snæver, autoriseret præsentationskilde;
der indlæses ikke projektbrede data for eksterne alene for at vise en label.

Ingen merge eller produktionsændring. En separat stagingversions-URL bruges
først, så den klargjorte telefonprøve på den aktive version kan fortsætte.
