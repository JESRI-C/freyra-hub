# Skyhost-paritet: samlet mål og resterende arbejde

2. november 2026 · Produktejerens præcisering: Freyra skal kunne det samme
som den kortlagte Jobs-/Geotag-løsning i Skyhost. Eksisterende Freyra-kode
og fagmoduler bevares. Den første pilot er en etape i denne samlede leverance.

## Grundlag og anvendelse

[Skyhost Jobs og Geotag – funktionskortlægning, 29. oktober](https://drive.google.com/file/d/1hDgbtkI4Zh7fHE4FLqfUQFuvH3bcjlBx/view?usp=drivesdk)
er genfundet og læst fra Drive 2. november. Den lokale kildes 34.852 bytes
matcher det registrerede SHA-256
`ba23c8dfab5270d30824c4ba3c93b8e38dd533e38e3636d8baa8c13cb15437a1`.

Den tilhørende kravspecifikation er allerede omsat til 68 krav i
[jobs-geotag-requirements.json](jobs-geotag-requirements.json). D01/D02 og
dele af D03 er siden videreudviklet og prøvet. De eksisterende dokumenter
og historiske testbeviser bevares; to brugerændrede dokumenter er ikke
omskrevet i denne opfølgning.

Dette dokument præciserer **hele leverancens omfang og rækkefølge**. D09/D10
er etaper med senere implementering; de kortlagte funktioner er påkrævede
før fuld paritet. Krav fra opsætningssider, som endnu ikke har en dækkende
linje i 68-kravsregisteret, skal tilføjes som sporbare supplerende krav.
En kalenderkontrol til datovalg tæller ikke som kapacitetsplanlægning.

Skyhost-kilden er en funktionskortlægning ud fra læste skærme og hjælp,
med særskilt angivne uafprøvede funktioner. Den beskriver ingen skjult
serverkode. Kontrolpanel, kalender, komplette importformater, ZIP-indhold,
økonomiintegration og andre brugerroller skal afklares ved deres respektive
implementering; deres funktionelle formål er fortsat med i leverancen.
Selvstændige GPS-/Beacon-/Intranet-moduler er ikke kortlagt i denne kilde.

## Dækning og restarbejde

Status gælder Freyra. **Delvist samlet** betyder, at konkrete eksisterende
dele og prøver findes. **Åbent forløb** betyder, at en tilsvarende operationel
arbejdsgang endnu ikke er dokumenteret færdig. Det er ikke en påstand om,
at der ingen genbrugelig kode findes.

| Område fra kortlægningen | Freyras grundlag og konkrete rest | Pakker |
|---|---|---|
| Sager, kunde og lokation | Projektidentitet, beskrivelse, adgang og steder genbruges. Kundekort, sagsopgaver, kontakter, reference-/nummerserier og komplette stedregistre skal afstemmes som sammenhængende administration. | D01/D02, S16 |
| Jobkort og instruktion | Delvist samlet: samme opgave, plan, fagprofil, datoer, ansvar og historik. Saml fuldt operationelt jobkort med relevante ekstra felter, kontakter, dokumentkrav og synlige afklaringer. | D02, S01/S02 |
| Tildeling og medarbejderoverblik | Personer, grupper, puljeovertagelse, status og logbog har eksisterende kontrakter. Modtagerspecifik indbakke/notifikation og hele den eksterne skrive-/filvej er stadig åbne. | D02/D03/D08 |
| Planlægningskalender, gentagelse og delopgaver | Delvist leveret. Kalender, arbejdsfordeling og kildebundne opfølgninger er samlet i arbejdsopgaverne. Serier med 2–12 opgaver kan på staging gentages dagligt, ugentligt, hver anden uge eller månedligt. Samlet flytning med kalenderdage og samlet aflysning er verificeret på staging. Op til 12 versionsførte forudsætninger for start understøttes. Afventende opgaver er synlige i kalender og planoversigt. | D09 JOB-07/08/10, OPS-05, S13 |
| Geotag, fotos og jobrelation | Delvist samlet: originaler, lokal kø, checksum, immutable jobkort og eksplicit opgavekobling findes. Generiske observationer, flere billeder, kategorier, faser, eksternt feltarbejde og alle originaltyper skal samles. Nærhed og direkte jobrelation er adskilte begreber. | D03, OBS-01–09, S02 |
| Kategorier, GPS og billedbehandling | Udbyg hierarki, ansvar/deling, arkivering/genåbning, kategoriens GPS-/jobkrav, positionskilde og nøjagtighed, begrundet GPS-undtagelse samt kontrolleret markørflytning. Tegning/anonymisering skal bevare originalen. | D03/D05/D09, S02/S16 |
| Skemaer og tjeklister | Grundlæggende versionerede skemaer findes. Flere felttyper, min/max, heltal, flervalg, dato/tid, billedkrav, ukendt/ikke undersøgt og relevante fagprofiler skal færdiggøres. Krav skal håndhæves ved den konkrete aflevering/status. | D05/D09 FORM-01–06 |
| Kort, liste og søgning | Kort/atlas findes. Fælles filtre, samme poster/totaler, serverbaseret kortudsnit, kategori-/periode-/statusvalg, polygonvalg og massehandlinger skal prøves samlet. Udvalgte observationer skal kunne blive til eller tilknyttes jobs. | D03/D04/D09, MAP/OBS-09, S03 |
| Afslutning, kontrol og logbog | Plan, tildeling, udført arbejde, blokering og logbog genbruges. Frosne afleveringer og uafhængig godkendelse/returnering/genåbning er prøvet med roller, begrundelser og bevaret historik i S04/D05b. Versionsbundne profil-/kategorikrav, selvstændige afvigelsers fulde livscyklus og samlet accept mangler. | D02/D05, QA-01–04, S04; [leverance](OPGAVE_GENNEMGANG_SAMLING.md) |
| Timer og aktiviteter | Åbent forløb: aktivitetsstruktur, planlagte/faktiske timer, rest/progress, indtastningsbegrænsninger og historik skal afstemmes og leveres på samme job. Start/stop er en registrering, ikke alene en statusknap. | D09 OPS-01, S14 |
| Materialer og faktureringsgrundlag | Åbent forløb: materialekatalog, mængder/enheder, forbrug pr. job og relevante pris-/aktivitetsreferencer. Arbejdsdata skal kunne danne kontrollerbart faktureringsgrundlag; fakturering og bogføring skal have særskilte kvitteringer. | D09 OPS-02, D10 OPS-07, S14/S16 |
| Booking, besøg og ruter | Åbent forløb: maskiner/køretøjer/værktøj, reservationer og konflikter, flere lokaliteter, besøgskrav/serviceintervaller, rækkefølge, kørsel og kilometer. Ruteoptimering kræver faktisk afprøvet udbyder og kendt pris. | D09 LOC-02/03, D10 OPS-03/04, S15 |
| Import, eksport og filer | Eksisterende importer/rapporter genbruges. Forhåndsvisning, stabil ekstern identitet, genimport/konflikter og originale filer mangler som samlet Skyhost-overgang. Dataeksport og billedpakke skal kontrolleres særskilt. | D06 IMP-01–04, D07, S05/S16 |
| Rapport og aflevering | Eksisterende PDF-/ZIP-/rapportversioner genbruges. Knyt den fulde job-/registrerings-/afleverings-/reviewrevision til samme rapport og originalmanifest. Store eksporter skal have vedvarende jobstatus og kunne genoptages. | D07 REP-01/02/03/05, S05 |
| Opsætning og integration | Jobtyper, ekstra felter, kunder/leverandører, løn-/aktivitetstyper, nummerserier, materialer, deling og beskedopsætning skal kortlægges til eksisterende modeller. Økonomi-/lønsystemer og dagsrapport har egne afprøvningskrav. Der er ikke aktiveret mail/SMS eller betalte integrationer. | D09/D10, S16 |
| Mobil og drift | Browserprøver, adgangskontrol, samtidighed og CI-restore findes. Rigtig telefon/kamera/HEIC, fysisk browserlukning/offline, belastning, samlet fil+DB-gendannelse, fejlalarmer, support og kundeprøve er fortsat åbne. | D08, S11/S12 |

## Rækkefølge for arbejdet

1. **Forståeligt projekt og samlet jobkort.** Brug projektlederens nye
   indgang og prøv den på en konkret opgave. Bevar alle værktøjer. Luk
   observerede brugerbrud sammen med den modtagerspecifikke opgaveindbakke.
2. **Geotag i samme jobforløb.** Saml registreringer, skabeloner, kategorier,
   positioner, fotos og den afgrænsede eksterne skrivevej. Gør direkte
   jobrelation og geografiske forslag tydelige.
3. **Fælles kort/liste og aflevering.** Samme udvalg og tællinger,
   obligatoriske oplysninger, afvigelser, returnering og godkendelse på
   fastholdte versioner.
4. **Rapport, import og fuld filpakke.** Genbrug rapportmotorerne og
   originalerne. Lever genoptagelig eksport. En repræsentativ Skyhost-
   data-/billedpakke er stadig nødvendig for at acceptere importadapteren.
5. **Driftsplanlægning.** Kalender, kapacitet, gentagelser og afhængigheder
   kobles på samme job, tildeling, status og revisioner.
6. **Timer, materialer, booking og ruter.** Leveres som afgrænsede
   arbejdspakker med egne prøver, fælles jobidentitet og konsistente summer.
7. **Fuld opsætning og integration samt kunde-/driftsaccept.** Saml
   kundestamdata, nummerserier, administratorfunktioner og dokumenterede
   connectorer. Afprøv de faktiske roller og data på computer og telefon.

Etaper kan undersøges ved siden af hinanden, men data- og rollekontrakterne
genbruges. En færdig etape lukker ikke den samlede paritetsleverance.
AI, sensorer, lavbund og andre eksisterende Freyra-fagmoduler bevares og
tilkobles den fælles kerne uden at forsvinde i denne prioritering.

## Hvornår kan vi sige, at Freyra kan det samme?

Hver kortlagt funktion skal have en destination i Freyra, en identificeret
kodeejer, synlig adfærd, en konkret prøve og faktisk accept på de relevante
roller/enheder. Status skal skelne mellem fundet kode, implementeret,
automatisk afprøvet, prøvet i staging og accepteret af brugeren.

En hel sag skal kunne gennemføres med planlægning, tildeling, stedfæstede
registreringer, de aftalte driftsregistreringer, kontrol og aflevering uden
dobbeltindtastning eller tabte originaler. Gamle jobs, filer og rapporter
skal fortsat kunne genåbnes. Funktionen **Faktureret** alene er ikke en
kvittering for gennemført økonomiintegration.

Det tidligere samlede 26–50-dages skøn dækkede den tidligere samlingsplan.
Det må ikke genbruges som et tidsløfte for fuld Skyhost-paritet. S13–S16 og
de åbne opsætningsområder skal have genbrugskontrol og egne estimater først.
