# Udviklingsplan for jobkort og feltdokumentation

Planen omsætter [produktanalysen](FELTDOKUMENTATION_ANALYSE.md) til afhængighedsordnet udvikling. Brugeren har igangsat implementeringen. Grundlag: `62fa6c7`, udviklingsgren `codex/field-jobcards-v1`. Eksisterende ændringer bevares. Produktion, main og e-mailudsendelse indgår ikke i denne udviklingskørsel.

## Byggepakker og accept

| Pakke | Leverance                                                                                                  | Accept og afhængighed                                                                                                                                 | Status                         |
| ----- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A     | Versionsgemte jobkort på eksisterende actions; fire basiskabeloner, egne felter, svar og rettelseshistorik | Adgangskontrol i database; feltrolle udfylder eksisterende binding, editor konfigurerer. Samtidige rettelser giver konflikt, genforsøg er idempotente | CI bestået; staging udestår    |
| B     | Fælles fotooriginal og separate positionsrettelser med justerbar 50-meterstandard                          | Råfil, position, rettelse, årsag og politikversion kan efterprøves; historiske referencer bevares                                                     | Implementeret; staging udestår |
| C     | Direkte genoptagelig upload, serverkvittering og vedvarende efterbehandling                                | Afbrudte og gentagne overførsler giver hverken datatab eller dubletter; afledninger ændrer ikke original                                              | C1 implementeret; C2 udestår    |
| D     | Mobilklient med varig lokal kø, pladsstyring og opgavepakker                                               | Fysiske iPhone-/Android-prøver med netudfald og genstart; original frigives først efter verificeret modtagelse                                        | Afventer C                     |
| E     | Skalerbare medielister og fotokort                                                                         | 200 fotos/opgave og samlet 1.000/dag afprøves; begrænset hukommelse og ingen skjulte resultatlofter                                                   | Afventer C                     |
| F     | Artsadapter, før/efter, dokumentationskontrol og rapportbinding                                            | Navngivet faglig gennemgang af repræsentativt materiale; usikkerhed bevares, ekstra review stopper ikke øvrigt arbejde                                | Afventer A–E                   |
| G     | Loggerimport og sensoradapter                                                                              | Faktisk loggereksempel, tidsreference, enheder, kalibrering og rådata; genimport er idempotent                                                        | Afventer A og konkret logger   |
| H     | Modulrettigheder, forbrug og samlet genoprettelse                                                          | Organisationens tilvalg giver ingen ekstra projektadgang; database og originaler gendannes samlet i isoleret miljø                                    | Afventer relevante moduler     |

En faktisk Skyhost-Excel-eksport fastlægger importmapping. Den manglende eksport stopper alene den adapter, ikke øvrige pakker. Bykær før/efter grødeskæring er første samlede pilot. Natur, byggeri og græsningspleje genbruger samme kerne.

## Første vertikale leverance

Den eksisterende opgave er jobkortets identitet. Projektbundne skabelonversioner og registreringsversioner er append-only. Svar låses til en bestemt skabelonversion. Nødvendige, men ubesvarede felter vises som mangler og kan gemmes. Typer og gyldige valgmuligheder håndhæves både i klient og database. `0` og `false` er gyldige registreringer.

UI findes i Handlinger og kommuneforløbets Udførelse; eksisterende udførelsesregistrering og rapporter bevares. Første version kræver net. Offline, fotokø, automatisk artsbestemmelse og sensorintegration er ikke leveret af denne pakke.

## Udvikling og release

1. Baseline: staging-preflight og typecheck; ingen hemmeligheder i kvitteringer.
2. Målrettede kontrakt-, service- og brugerfladeprøver samt databaseprøver for isolation, rettigheder, samtidighed og genforsøg.
3. Typecheck, lint og build efter integration. Databasemigration skal afprøves i disponibel lokal/CI-database før hosted anvendelse.
4. Stagingmigration og stagingbuild efter grøn teknisk kontrol. Browserforløb på telefon og computer skal vise oprettelse, gemning, genåbning, rettelse og læseradgang.
5. Faglig pilotaccept og drift/genoprettelse er særskilte beviser. Produktion kræver særskilt releasegodkendelse.

Ved fejl i staging slås det nye panel fra gennem en fremadrettet kodeændring; der foretages ikke destruktiv tilbagerulning af dokumentationsversioner. Ingen migration anvendes automatisk ved appstart. Eksisterende miljøer uden migration viser en forståelig fejl.

## Arbejdslog

- C1 er implementeret i [draft-PR 24](https://github.com/JESRI-C/freyra-hub/pull/24): projekt-/brugerbundet uploadidentitet, TUS uden overskrivning, atomisk modtagelse og holdbar kontrolopgave, serverberegnet streaming-SHA-256 og uforanderlig objektbundet kvittering. Brugerfladen viser fremdrift, bevarer genforsøgsidentitet og tilbyder kontrol af modtagne fotos. Adgangsændringer og filversion kontrolleres igen før kvittering. Se [leverance og acceptgrænser](FELTFOTO_UPLOADS.md).
- C2 omfatter automatisk baggrundsbehandling, afledte previews og oprydningspolitik. De dele samt fysiske telefon-/Storage-prøver udestår; C kaldes derfor ikke driftsklar. Telefonens holdbare offlinekø er fortsat pakke D. Produktion og hosted staging er ikke ændret.
- Pakke A har nu bestået både applikations- og database-CI på revision `b1f09cc`, run `40836591472`. Hosted brugerforløb er fortsat ikke afprøvet for jobkortpakken.
- Pakke B er implementeret på sin egen gren: [feltfotos og placeringshistorik](FELTFOTO_POSITIONER.md). Det omfatter bevaret original GPS, separate placeringsversioner, justerbar 50-meterregel og brugerflade i fotoatlas. Serverhash, offlinekø og hosted accept udestår som beskrevet i pakkerne.
- Pakke B bestod begge CI-kontroller på `636104f`, run `40853719560`, inklusive 932 databaseassertions, samtidighed og genoprettelse. Se [draft-PR 23](https://github.com/JESRI-C/freyra-hub/pull/23). Hosted fil-/telefonprøve er fortsat åben; næste kodepakke er C.

- Miljøkontrol bestod mod det kendte stagingprojekt; typecheck bestod på baseline.
- Ny udviklingsgren oprettet fra den gennemgåede kode.
- Første kontrakt og fire blanke domæneskabeloner implementeret; målrettede kontraktprøver bestod.
- Databasekontrakt, services og brugerflade er implementeret på udviklingsgrenen. Jobkort findes under Handlinger og Udførelse. Fire skabeloner kan tilpasses med egne felter; registreringer fastholder deres skabelonversion og rettelseshistorik.
- 24 målrettede kontrakt-, service- og interaktive brugerfladeprøver bestod. Samlet testsuite: 2.990 tests i 215 filer bestod. Typecheck, fuld lint (0 fejl, 24 eksisterende advarsler) og stagingbuild bestod.
- 70 databaseassertions og et separat scenarie med samtidige PostgreSQL-forbindelser blev afprøvet i CI som dokumenteret ovenfor. De er ikke kørt lokalt, da PostgreSQL/Docker ikke er tilgængelig. Migrationen er ikke anvendt hosted; stagingaccept udestår.
- Arbejdet er til review i [draft-PR 22](https://github.com/JESRI-C/freyra-hub/pull/22), målrettet den eksisterende pilotgren. Der er ikke merged eller udgivet.
