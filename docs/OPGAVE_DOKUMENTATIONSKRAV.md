# Versionsbundne dokumentationskrav på arbejdsopgaven

4. november 2026 · S04/D05c · Status: teknisk afprøvet på staging for de beskrevne scenarier; faglig og kommunal accept er åben.

Kravkilde: GoFreyras slutmål og udviklingsplanens S04/D05c samt FORM-03 (Tjekliste ved aflevering) og QA-01 (Versioneret review) i Jobs/Geotag-registret. Produktreglen er valgt til GoFreyra. Der er ingen ny observation af Skyhosts brugerflade i denne leverance.

Projektlederen vælger op til ti eksisterende jobkort under **Arbejdsgrundlag → Rediger plan → Dokumentationskrav**. Valget gemmer den præcise skabelonidentitet, version og definition i planversionen. Valgfri og nødvendige felter fremgår også i den gemte plan og afleveringshistorikken. En ny skabelonversion erstatter ikke et tidligere valg.

Den tildelte feltmedarbejder kan vælge de krævede versioner i **Feltregistrering**, også før en redaktør har gemt den første registrering. Eksisterende bidragsadgang og opgavens udførelsesadgang er fortsat nødvendige. Projektlederen kan vælge andre skabeloner som hidtil; feltmedarbejderen får alene den ekstra binding, planen udtrykkeligt kræver.

Ved aflevering skal hvert valgt jobkort være repræsenteret i opgavens aktive dokumentation med den præcise version, udfyldte nødvendige felter og verificeret originalfoto. Et andet jobkort med samme titel eller felter opfylder ikke kravet. Et gemt svar skal tilknyttes under **Dokumentation**. Mangler fører brugeren tilbage til dette område.

## Kode, data og adgang

| Del | Genbrug og ændring |
|---|---|
| Plan og skabeloner | `work-order-plan.ts`, `field-job-cards.ts`, `WorkOrderPlansPanel.tsx`; valgfri `requiredJobCards` i den eksisterende plan |
| Fælles visning | `RequiredJobCards.tsx`, planoversigt, feltregistrering og afleveringshistorik læser samme gemte definition |
| Feltadgang | Eksisterende `validate_field_job_insert` og `save_field_job_version`; eksplicit påkrævet skabelon kan bindes af en autoriseret udfører |
| Aflevering | Eksisterende builder, roller, originalkontrol og låse genbruges; skabelonversion kontrolleres via den immutable registrering |
| Historik | Nye krav fastholdes med `freyra.submission-requirements/v1`; planer uden krav bruger fortsat det hidtidige snapshot og hash |
| Migration | `20261104024837_work_order_required_job_cards.sql`; ingen omskrivning af gemte planer, registreringer, originaler eller afleveringer |

Planens kopierede definition kontrolleres mod den eksisterende skabelon i samme organisation og projekt. Direkte tabelindsættelse har samme kontrol som RPC. Opgavelåsen tages før registreringslåsen i både RPC og trigger, så et planskift og valg af en påkrævet skabelon serialiseres.

## Gentagelig prøve

1. Gem en plan med en eksisterende skabelonversion. Kontrollér den gemte definition og genåbn på computer og telefonbredde.
2. Lad den tildelte feltmedarbejder gemme den valgte version uden redaktøradgang. Afvis en anden version og en opgave uden tildeling.
3. Knyt en registrering med samme felter fra et andet jobkort til dokumentationen. Afleveringen skal vise den konkrete mangel og afvise gemning.
4. Knyt den valgte versions komplette svar og originalfoto. Gem afleveringen, gentag request og kontrollér én version.
5. Gem en nyere skabelonversion. Den gamle plans krav og afleveringsgrundlag skal være uændrede.
6. Vælg den nye version i en ny plan. Kontrollér ændret grundlag, manglende ny dokumentation og bevaret gammel aflevering.

Appprøver: `required-job-cards.test.ts`, `WorkOrderPlansPanel.test.tsx`, `FieldJobCardsPanel.test.tsx` samt eksisterende plan-/afleveringsprøver. Databaseprøve: `supabase/tests/database/work_order_required_job_cards.test.sql`, kørt på disponibel CI-database med frisk migrationsafspilning. 85 målrettede appprøver består lokalt, inklusive rapporteditorens regression. Databasekontrollen på kandidat `fcf3f8f` i [CI 41766083814](https://github.com/JESRI-C/freyra-hub/actions/runs/41766083814) består med frisk afspilning, 1.847 kontroller, samtidighed, restore og lint. Den samlede appgate består med 3.543 prøver i 264 filer. [Stagingkvitteringen](work-order-required-cards-staging-receipt-2026-11-04.json) identificerer app, Worker, migration og den syntetiske prøve.

## Hosted prøve og genkørsel

På appkilde fcf3f8f og Worker 378972d6-1d4b-4c5f-8811-409fe899058f bestod forkert/rigtigt jobkort, tabt svar og genforsøg, bevaret historik, originaldownload, tilbagetrækning og tilbagekaldt ekstern læsning. En ny skabelonversion ændrede ikke den gemte plans krav eller afleveringshash. Ved 390 og 1280 px viste planeditoren versionsvalget og bevarede den gemte plan efter Fortryd. Den nye kravvisning er også visuelt gennemset ved 390 px.

En særskilt testkonto gennemførte teknisk review af afleveringsversion 3. Rapportkaldet returnerede samme rapport ved genforsøg. Browseren genåbnede rapporten ved 1280 og 390 px, hentede en PDF og fulgte genvejen tilbage til samme afleveringsversion med dens fastholdte krav. PDF-hashen står i kvitteringen. Dette er en syntetisk softwareprøve. Faglig naturvurdering er ikke udført. Første binding fra en tildelt feltmedarbejder er prøvet i komponent og database; en fysisk feltprøve mangler.

Genprøven følger rettelser af migrationens SQL-notation og bevaring af den eksisterende PT409-kontrakt. En manglende servermock i rapporteditorens test blev også rettet. Browserprøvernes markører er tilpasset det konkrete valgfelt og rapportens versionsafsnit med et indlejret link. Den første indsendelse uden begrundelse blev korrekt afvist; den endelige prøve bruger den krævede begrundelse. Ingen af disse indledende fejl er registreret som beståede prøver.

Sæt FREYRA_TEST_REVISION til den apprevision, der faktisk testes. Brug den eksisterende private stagingopsætning og en separat tom fixturemappe ved en ny samlet prøve. Afleveringsscriptet opretter og bevarer en mærket syntetisk opgave. Planprøven ændrer kun en kladde og fortryder. Reviewprøven afslutter opgaven; dens midlertidige grant tilbagekaldes også ved fejl. Efter den afsluttede prøve viste databasen 0 aktive eksplicitte reviewgrants på testopgaven.

1. node scripts/test-work-order-submission-staging.mjs --staging --required-job-cards
2. node scripts/test-required-job-card-plan-staging.mjs --staging
3. node scripts/test-required-job-card-review-staging.mjs --staging

De private fixtures ligger under tmp/submission-required-hosted og er ikke i Git. Gem eksisterende prøvebevis særskilt, før en ny fixture oprettes. Sikkerhedsadvisors er genlæst efter migrationen med samme fund som før ændringen; tidligere PostGIS-/Auth-/driftspunkter er fortsat åbne i sikkerhedsplanen.

## Fortsat åbent

Fagpersonen skal fortsat fastlægge, hvilke jobkort og bilag en bestemt faglig metode kræver. Denne funktion gemmer projektlederens konkrete valg og tillægger det ingen faglig godkendelse. Kategoriregler, yderligere bilagstyper, samlet offlineprøve med flere krævede jobkort og fysisk telefonaccept indgår i det resterende arbejde. Ekstern nyregistrering uden projektbidragsadgang udvides ikke af denne migration.

## Offlinepakken under samling

4. november 2026 · `codex/offline-required-job-cards`, [draft PR45](https://github.com/JESRI-C/freyra-hub/pull/45). Appkilde `8aff043` er på staging som Worker `72343e37-de79-4fd5-b936-918f9c6a8ca3`. Hosted-forløbet er delvist efterprøvet og har fundet en adgangsklassifikation, som er rettet lokalt. Ny kandidat og fysisk mobilaccept afventes.

Den eksisterende feltpakke henter nu den gemte plan med instruktioner og alle de præcise krævede jobkortversioner. Første registrering kræver dermed ikke længere et jobkort, som en redaktør allerede har udfyldt. Hvert jobkort viser sine egne seneste svar. Køen bruger fortsat én versionsrækkefølge på samme arbejdsopgave og bevarer eksisterende pakker, originalfiler og kladder.

En lokal registrering af et krævet jobkort medsender den planversion, medarbejderen arbejdede efter. Den nye RPC `save_field_job_version_for_plan` og den eksisterende RPC deler samme kontrollerede gemmefunktion. Migration `20261104034102_offline_required_job_card_plan_binding.sql` tilføjer en valgfri, uforanderlig planreference med organisation-, projekt- og opgavebinding. En ny registrering under en ændret plan afvises som konflikt; et identisk genforsøg kan genhente en allerede gemt kvittering med sin oprindelige planreference, så længe brugeren stadig har adgang.

Efter pakkeopdatering kan medarbejderen læse den aktuelle instruktion og sammenligne den bevarede lokale registrering med serverens svar. Genbrug kræver en udtrykkelig handling og en begrundelse. Originalkladden bevares. Først når en præcist matchende serverkvittering er kontrolleret, kædes den tidligere kladde lokalt til rettelsen og udgår af antallet af afventende registreringer. Den gamle registrerings tilstand, værdier og planreference overskrives ikke.

37 lokale prøver består i offlinearbejdsrummet, service, IndexedDB-lager og synkronisering. De dækker adskilte svar på to krævede kort, nul/nej, manglende kilder, læseadgang, første registrering, versionsrækkefølge, planhenvisning i kvittering og atomisk bevaring af konfliktkladde og rettelse. Typecheck, målrettet lint, JavaScript-syntaks og diffkontrol består.

[CI 41773137955](https://github.com/JESRI-C/freyra-hub/actions/runs/41773137955) består på `016a8a1`: 3.556 appprøver i 265 filer og 1.872 databasekontroller i 27 filer, frisk afspilning, faktisk samtidighed, database-restore, lint og build. Database-scenariet `offline_required_plan_change` bekræfter både ventende planskift og ventende feltregistrering mod den samme opgavelås samt genhentning af det oprindeligt accepterede svar. CI-revisionen ændrer alene to testfiler i forhold til den byggede appkilde `8aff043`; runtimekoden er identisk. Første CI-kørsel fejlede på en forkert forventning om fejlkode og en for tidlig UI-assertion; begge rettelser og genprøven er bevaret i Git.

Stagingmigrationen er afstemt til det lokale versionsnummer `20261104034102`. Den eksisterende RPC og den nye planbundne RPC er invoker-funktioner. Sikkerhedsadvisors har samme fundkategorier før og efter; de kendte PostGIS-/Auth-/driftspunkter er fortsat åbne.

Den gentagelige hosted-prøve skal omfatte to krævede jobkort uden tidligere svar, netafbrydelse, browserluk/genåbning, mistet serversvar, planskift, udtrykkeligt genbrug og adgangstilbagekaldelse. Kontroller antal rækker, planreferencer, bevarede kladder og nul/nej efter genforbindelse. Fotoets eksisterende manuelle kobling til opgaven og fysisk GPS/kamera er fortsat særskilt restarbejde. En ældre appversion kan ikke behandle den nye strikte køpayload; rollback kræver en kompatibel læser eller sikret genoptagelse af køen og må ikke slette den.

Efterfølgende lokal UX-rettelse: Genbrug af et allerede modtaget jobkort efter planskift opretter nu en almindelig ny registrering. Den modtagne version behandles ikke som en uløst konflikt. En blokeret registrerings svar kan læses ved siden af opgavepakken, og en usendt registrering under en gammel plan kræver synkronisering, før der tilbydes en konfliktrettelse. Tre nye prøver fejlede før rettelsen; alle 40 afgrænsede offlineprøver består efter den. Disse sidste UI-ændringer er endnu ikke på staging og kræver ny CI-/browserkontrol.

Hosted-genprøven findes i `scripts/test-offline-required-cards-staging.mjs --staging`. Angiv den præcise apprevision i `FREYRA_TEST_REVISION`; `FREYRA_OFFLINE_QA_DIR` kan vælge en ny mappe under ignoreret `tmp`. Scriptet bruger et særskilt mærket projekt, to krævede kort og en anden eksisterende testkonto som feltmedarbejder. Feltmedlemskabet tilbagekaldes og læses tilbage; egne sessioner lukkes. Private fixtures og Chrome-profiler må ikke lægges i Git.

De første browserkørsler er ikke bestået som samlet forløb. Den lange Windows-profilsti kunne ikke åbne IndexedDB. En kort profil gemte og genåbnede begge kort, deres særskilte svar, nul/nej og instruktionen, men nåede ikke et kontrolleret serversvar. En efterfølgende kold offline-navigation fik timeout; den fastlåste, præcist identificerede testbrowser blev lukket, så testens oprydning kunne afsluttes. Ingen af disse fejl lukkes af de grønne enhedsprøver. Den instrumenterede genprøve af offlineopstart og genforbindelse fortsætter.

Den næste browserkørsel gennemførte kold offline-genåbning, to modtagne jobkort, mistet serversvar med byteidentisk genforsøg, afvist gammel plan, ny instruktion og udtrykkelig rettelse med bevaret originalkladde. Tre serverversioner og fem lokale registreringer blev bevaret. Slutprøven fandt en reel fejl: Efter tilbagekaldt projektadgang blev kladden sikkert bevaret uden ny serverskrivning, men fejlen blev vist som genforsøg i stedet for blokeret adgang. Feltmedlemskabet blev fjernet og egne sessioner lukket af testens afsluttende oprydning. Køens forkerte fejlklasse er førbevis, ikke en bestået slutprøve.

Rettelsen bekræfter nu et uklart serverfunktionssvar med et læsende, aktørbundet RLS-opslag. En vellykket læsning uden adgang til projektet blokerer køposten. Et utilgængeligt opslag eller fortsat synligt projekt giver genforsøg; dette kontrolopslag giver aldrig skriveadgang. Tre nye serviceprøver fejlede før rettelsen og består efter den. Alle 43 afgrænsede offlineprøver består. Kør `--accepted-plan-change` i den næste hosted-prøve for også at kontrollere genbrug af allerede modtagne svar under en efterfølgende plan og synlig læsning af blokerede svar. Den nye kandidat skal bygges, gennem CI og afprøves på staging før accept.
