# Feltfotos og versionsgemte placeringer

Byggepakke B udvider den eksisterende feltupload og fotoatlas uden at erstatte gamle foto- eller rapportreferencer. Koden ligger på `codex/field-photo-positions-v1`, baseret på jobkortpakken. Ingen hosted migration eller udgivelse er udført i denne pakke.

## Adfærd

- Nye billeder fra feltupload bevarer filens oprindelige GPS separat fra et eventuelt manuelt observationssted. Den valgte fil uploades uden nedskalering eller ændring af originalbytes.
- En manuel afvigelse ved upload kræver begrundelse. Databasen gemmer observationsstedet som en separat første version i samme transaktion som fotoregistreringen.
- Uden original GPS er originalkoordinaterne fortsat tomme. En manuel placering markeres `manual_unverified`; ukendt afstand bliver ikke nul.
- Rettelser indeholder aktør, serverregistreringstid, årsag, afstand og et snapshot af afstandsreglen. Afstanden beregnes altid fra originalpunktet.
- Standardreglen er 50 meter. Redaktør kan versionere en projektspecifik regel mellem 0 og 10.000 hele meter med begrundelse. En regelændring ændrer ikke gamle rettelsers status eller radius.
- Over grænsen gemmes placeringen som `needs_review`, så øvrigt feltarbejde kan fortsætte. Status er ikke en faglig godkendelse.
- Læsere kan inspicere historikken. Feltbidragydere kan tilføje placeringsversioner, mens kun projektredaktører kan ændre afstandsreglen. Eksisterende rettigheder til selve filupload udvides ikke i denne pakke.
- Titel, beskrivelse, tags og eksisterende gennemgangsstatus kan fortsat ændres. Originalens kilde-/fil-/positionsgrundlag og placeringshistorik kan ikke overskrives eller slettes gennem appadgangen.

## Brugerflade

Feltuploadens koordinatfelter hedder nu Observationssted og har et begrundelsesfelt. I fotoatlas åbnes **Feltfotos – placering og historik**. Her kan brugeren vælge blandt de seneste 50 nye feltfotos, se originalpunktet og den seneste registrerede placering samt gemme en ny version. Historikvisningen viser de seneste 100 versioner med tydelig afgrænsning. Opdater-knappen genhenter fotos og historik efter upload.

Eksisterende kort og rapportspor bruger fortsat kameraets originalpunkt. Den separate observationsposition vises i det nye panel og bliver ikke lydløst blandet ind i eksisterende målinger eller rapporter. En senere rapportintegration skal binde en bestemt placeringsversion eksplicit.

Historiske fotos får ikke efterkonstrueret optagehistorik. Nye fotos identificeres ved metadataformatet `freyra.field-photo/v1`; ældre fotos og droneoriginaler bevarer deres eksisterende spor.

## Integritet og begrænsninger

Databasen tildeler aktør, modtagetid og den faktiske Storage-objektreference. Sammenhæng mellem Storage-sti, størrelse og projektreference kontrolleres. Restriktive Storage-regler beskytter det registrerede objekt og dets sti mod almindelig appadgangs overskrivning og sletning. Særligt privilegeret driftsadgang er fortsat en separat administrativ tillidsgrænse.

EXIF/GPS og filhash er i denne pakke uploaderens erklærede oplysninger, der fastholdes som dokumentation. Hashstatus er udtrykkeligt `uploader_declared`. Selvstændig serverberegning af hash og billedkontrol hører til efterbehandlingspakken C. Der loves derfor ikke verificeret optagelsessted, optagetid eller serververificerede originalbytes her.

Upload kræver netforbindelse. Vedvarende offlinekø, genoptagelig feltupload, automatisk nedskalering og serverworker er ikke leveret af B.

## Databasekontrakter

`field_photo_policy_versions` og `field_photo_position_versions` er append-only med projektscope, RLS og forventet versionsnummer. RPC'erne kontrollerer aktuel adgang ved hvert kald. Stabile request-ID'er giver mulighed for at genfinde en kvittering efter et tabt svar; genbrug af ID med ændret input afvises. En ændret position eller regel giver konflikt frem for lydløs overskrivning.

Direkte tabelindsættelser gennemgår også validering. Policyversion, afstand, radius, status og registreringstid fastlægges af databasen. En klient kan ikke indsætte en falsk `within_limit`-status. De eksisterende foto-ID'er genbruges; der oprettes ingen parallel billeddatabase.

## Verifikation

Målrettede kontrakt-, upload-, service- og interaktive brugerfladeprøver er tilføjet. Databaseprøver dækker blandt andet oprindelig position, manglende GPS, regelændringer, direkte API-skrivning, roller, genforsøg og historikbeskyttelse. De køres i CI på en disponibel database; lokal PostgreSQL/Docker er ikke tilgængelig.

Hosted filadgang, faktiske telefonfotos, Storage API-kald og brugerforløbet på telefon skal afprøves i staging efter databasekontrollen. Lokale mocks og CI's syntetiske filer erstatter ikke disse acceptprøver.
