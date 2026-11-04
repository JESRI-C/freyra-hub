# Opgavefoto fra den fælles feltindgang

4. november 2026 · S02/D03 · Gren `codex/field-task-photos`.

Status: fungerende kode under teknisk efterprøvning. Ikke en stagingkvittering eller samlet produktgodkendelse.

Den valgte opgave vises før kameraet. Opgavefoto er standard, når en opgave er valgt; et generelt sagsfoto kræver et tydeligt valg. En manglende opgave erstattes ikke af en anden eller af et sagsfoto. Ældre pakker kræver opdateret opgaveadgang før nye opgavefotos. Opdateringen gemmes kun, hvis hele pakken kan verificeres.

Den eksisterende uploader bevares. Den uforanderlige uploadhensigt indeholder kommune, opgave og den planversion, der var grundlaget ved optagelsen. Serveren kontrollerer opgaven og aktuel adgang under de eksisterende opgave- og medlemskabslåse. Originalens bytes, filsti og kontrolsum genbruges. En nyere plan omskriver ikke fotoets historiske optagelsesgrundlag. En ny optagelse efter aflysning afvises; en allerede accepteret, identisk upload kan genoptages med fortsat gyldig adgang. Fjernet opgaveadgang afviser også gamle genforsøg.

Under Dokumentation vises modtagne, bytekontrollerede fotos fra netop opgaven. Læsere med opgaveafgrænset adgang får kun disse originaler gennem et kontrolleret opslag. Den eksisterende signer bruges med samme korte levetid og genkontrol af adgang. Valget Knyt til registrering åbner den eksisterende dokumentationsformular med fotoet valgt. En feltregistrering vælges udtrykkeligt; systemet opfinder ingen observation, udførelse eller faglig godkendelse.

Fotokøen bevarer opgavekontekst og originalbytes ved afvisning eller manglende kvittering. Originalen frigives først, når både filkvittering og serverens opgavekolonner stemmer overens. En hentet offlineversion skal kunne læse køformat 2, før nye registreringer aktiveres. Reader-commit `3ae95141f8b2f3d18419d71c4e0984de1f4f7b04` kan læse gamle og nye fotoposter. En tilbagerulning til en ældre læser må ikke bruges efter aktivering af det nye format.

## Krav og prøver

| Krav | Gentagelig prøve | Aktuelt bevis |
|---|---|---|
| OBS-02, valgt opgave | Skift opgave og kontroller fotokontekst samt genveje; prøv et manglende og et ældre opgave-id. | Komponent- og ruteprøver består lokalt. |
| OBS-04/OBS-10, lokal bevaring | Afvis lokal gemning, genforsøg og opgaveadgang; sammenlign originalbytes og opgavekontekst. | Kø-, store-, service- og komponentprøver består lokalt. |
| OBS-06, original og kildespor | Serverkvittering med forkert eller manglende opgave afvises; præcis capture original signeres først efter autorisation. | Parser-, signer- og køprøver består lokalt. |
| ORG-02/ORG-04, adgang | Test forkert sag, opgave, plan, læser, ekstern opgavelæser og tilbagekaldt adgang. | Ny SQL-prøve er skrevet; disponibel database-CI afventes. |
| Samtidighed | To identiske uploads giver én hensigt; samtidig omretning afvises; medlemskabstilbagekaldelse serialiseres før ny upload. | Tre nye scenarier med faktiske PostgreSQL-låse er skrevet; CI afventes. |

Migrationen er genereret med den eksisterende Supabase CLI som `20261104054235_field_photo_work_order_context.sql`. Den tilføjer capturekolonner og afgrænsede funktioner; eksisterende originaler, relationer og historik ændres ikke.

## Åbent før accept af pakken

- Frisk migration, SQL/RLS, faktiske samtidighedsprøver, database-restore og hele appens CI skal bestå på kandidaten.
- Udrul den afprøvede kandidat i det autoriserede testmiljø, og kontroller database- og appversion.
- Kør samme opgave gennem kamera/foto, luk/genåbn uden net, genforsøg, registrering, udførelse, dokumentationskobling, aflevering, uafhængig gennemgang og rapport. Kontroller den fastholdte foto-/planreference og kontrolsum.
- Kontroller computer og fysisk telefon. Browserbredde beviser ikke fysisk kamera, GPS, HEIC eller telefonens lagring.
- Eksterne uden projektets bidragsadgang kan læse deres opgavefotos, men denne pakke giver dem ikke projektbred offline-download eller ny upload. Det særskilte eksterne skriveforløb er fortsat åbent.

Den eksisterende stagingkvittering for krævede jobkort beskriver den tidligere offlinepakke og genbruges som tidligere bevis. Den gælder ikke automatisk denne nye fotokobling.
