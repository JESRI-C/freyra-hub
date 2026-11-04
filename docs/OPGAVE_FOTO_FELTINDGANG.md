# Opgavefoto fra den fælles feltindgang

4. november 2026 · S02/D03 · Gren `codex/field-task-photos`.

Status: app- og database-CI består på kilde `4be325d`. Databasedelen er på staging som migration `20261104064006`, SQL-fingerprint `ac712439ec632085a9d47aa8ebb45ebf`. Appkilde `4be325d` er på staging som Worker `94906bdf-e10d-4847-98c2-ad183b625b0f`. [Hosted-prøven](field-task-photo-staging-receipt-2026-11-04.json) består på samme kilde og databasefunktioner.

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
| ORG-02/ORG-04, adgang | Test forkert sag, opgave, plan, læser, ekstern opgavelæser og tilbagekaldt adgang. | 38 nye capturekontroller og hele database-CI består. |
| Samtidighed | To identiske uploads giver én hensigt; samtidig omretning afvises; medlemskabstilbagekaldelse serialiseres før ny upload. | Alle tre nye scenarier med faktiske PostgreSQL-låse består. |

Migrationen blev genereret med den eksisterende Supabase CLI som `20261104054235` og er afstemt til stagingværktøjets registrerede version `20261104064006_field_photo_work_order_context.sql`. Det normaliserede SQL-indhold har samme MD5-fingerprint som stagingkvitteringen. Den tilføjer capturekolonner og afgrænsede funktioner; eksisterende originaler, relationer og historik ændres ikke.

## Åbent før accept af pakken

- Bestået på [CI 41785790191](https://github.com/JESRI-C/freyra-hub/actions/runs/41785790191): 3.587 appprøver i 267 filer, 1.910 databasekontroller i 28 filer, migrationsreplay, faktisk samtidighed, database-restore, databaselint og build. Tidligere fejlede snapshot- og testciteringsprøver er bevaret i CI 41784780797 og 41785277633.
- Bestået: kandidatens stagingversion og migrationsfingerprint er kontrolleret før prøven; appversionen er kontrolleret igen efter PDF-download. Fire egne Auth-sessioner, feltmedlemskabet og det midlertidige reviewergrant er læst tilbage som lukket/ikke aktive.
- Bestået som teknisk browser-/API-forløb: samme opgave gennem syntetisk foto, to jobkort, offline luk/genåbn med synlig opgave/svar/kø, mistet uploadkvittering og genforsøg, udførelse, dokumentation, eksplicit aflevering, uafhængigt teknisk review og rapport/PDF. Fotoets oprindelige planreference og SHA-256 er bevaret. Browser- og SDK-trin er angivet særskilt i kvitteringen. Fysisk kamera og et uassisteret forløb fra Mine opgaver afventes.
- Kontroller computer og fysisk telefon. Browserbredde beviser ikke fysisk kamera, GPS, HEIC eller telefonens lagring.
- Eksterne uden projektets bidragsadgang kan læse deres opgavefotos, men denne pakke giver dem ikke projektbred offline-download eller ny upload. Det særskilte eksterne skriveforløb er fortsat åbent.

Den eksisterende stagingkvittering for krævede jobkort beskriver den tidligere offlinepakke og genbruges som tidligere bevis. Den gælder ikke automatisk denne nye fotokobling.

Sikkerhedsadvisors er kørt efter migrationen. De fem berørte offentlige funktioner er invoker-funktioner. Eksisterende PostGIS-/Auth-/definer-fund er fortsat åbne; denne pakke er ingen generel sikkerheds- eller produktionsgodkendelse.

## Næste integration og visningsrester

Mine opgavers eksisterende fotolink bevarer task-id, men vores aktuelle basis viser handlingsgruppen ved can_plan. Den allerede committede parallelle MyWorkOrders fra 3af288a giver feltbrugeren adgang via et aktør-/projektafgrænset getFieldJobAccess og bevarer afvisningen for eksterne uden project-contribute. Denne indgang og dens prøver er næste integrationsarbejde; PR46s nyere FieldOfflineWorkspace skal bevares. Mediefejlisolationen i 5228aade er afleveret fra den anden chat og følger derefter.

Rapportens afsenderidentitet vises fortsat som et teknisk bruger-id, og arbejdsgrundlagets generiske Ikke målt-etiket bør afklares i den fælles præsentation. De to konkrete visningsfund tæller som åbne brugeroplevelseskrav. Fuldproduktsaccept er ikke givet.

## Klar til telefonprøven

Den særskilte [telefonopgave](field-task-phone-ready-2026-11-04.json) er klargjort til den eksisterende testkonto. Projekt, opgave, instruktion og egen tildeling er gemt; der er ingen feltsvar eller fotos. En browser har genåbnet sagen uden net og kontrolleret opgavevalget og et aktivt kamera ved 390 px. Fire faktiske viewportoptagelser ligger i `screens/field-task-photos/phone-*.png`; de viser en tom telefonprøve. Rapportoptagelserne stammer fra den gennemførte v8-prøve.
