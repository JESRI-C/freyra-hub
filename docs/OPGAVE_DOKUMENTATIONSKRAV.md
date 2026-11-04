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

4. november 2026 · S02/S04/D05c · [Draft PR45](https://github.com/JESRI-C/freyra-hub/pull/45). Den beskrevne offlinepakke er teknisk efterprøvet på staging. Samlet opgave-/fotoforløb, faglig accept og fysisk telefon er fortsat åbne.

Den eksisterende feltpakke henter nu planens instruktioner og op til ti præcise krævede jobkortversioner. Første registrering kræver ingen tidligere udfyldelse fra en redaktør. Hvert kort har sine egne svar. Køen bruger fortsat samme opgaves versionsrækkefølge og genbruger IndexedDB, synkronisering og den kanoniske originalkø.

Nye offlinebesvarelser af krævede kort medsender den planversion, medarbejderen arbejdede efter. Migration 20261104034102_offline_required_job_card_plan_binding.sql tilføjer en valgfri, uforanderlig planreference med organisation-, projekt- og opgavebinding. Den nye save_field_job_version_for_plan og den eksisterende RPC deler samme invoker-funktion. En ny registrering under en forældet plan afvises. Et identisk, allerede accepteret request kan genhente sin oprindelige kvittering, så længe brugeren fortsat har adgang. Gamle klienter og registreringer bevarer den eksisterende API og får ingen opdigtet planreference.

Ved konflikt kan medarbejderen læse den aktuelle instruktion, sammenligne svar og udtrykkeligt genbruge dem med en begrundelse. Originalkladden bevares. Først efter en præcist matchende serverkvittering knyttes den til rettelsen og udgår af det afventende antal. Allerede modtagne svar kan genbruges på en ny plan uden at blive behandlet som en uløst konflikt. Usendte svar skal først synkroniseres. Blokerede svar vises og kan eksporteres.

Hvis et serverfunktionssvar ikke længere giver et pålideligt adgangssignal, bekræftes det med et aktørbundet, læsende RLS-opslag. Vellykket opslag uden projektadgang blokerer køposten. Et utilgængeligt opslag eller fortsat synligt projekt giver genforsøg. Kontrollen giver aldrig adgang til at skrive.

### Afprøvning på den leverede version

Appkilde **90f0196b7c8927b02b23b2b660df39c8f2b30887**, Worker **4e90dcd9-055a-44c5-a336-36bc2f7e512c** og stagingmigration **20261104034102**. [Maskinkvitteringen](offline-required-cards-staging-receipt-2026-11-04.json) har kilde, planreferencer, bevis og afgrænsning.

| Prøve | Resultat og afgrænsning |
|---|---|
| Lokale offlineprøver | 43 bestået: komponent, service, IndexedDB og synkronisering. Nul/nej, to kort, første registrering, fejlkvittering, konflikt, læseadgang og tilbagekaldelse. |
| Fuld CI | [41777119984](https://github.com/JESRI-C/freyra-hub/actions/runs/41777119984): 3.562 appprøver i 265 filer, 1.872 databasekontroller i 27 filer, typecheck, lint og build. |
| Database | Frisk migrationsafspilning, faktisk låsekonkurrence mellem plan og registrering, idempotens, adgang og immutable historik består. Disponibel database-restore består; dette er ikke en samlet gendannelse af originalfiler. |
| Hosted Chrome | Separat feltkonto, to kort uden tidligere svar, offline gemning, fuld browserlukning, offline genåbning, mistet svar med identisk genforsøg, forældet plan, eksplicit rettelse, modtagne svar under endnu en plan og tilbagekaldt adgang består. |
| Visning | 390 og 1280 px uden vandret overløb eller JavaScript-sidefejl. Blokerede svar er synlige. Fysisk telefon og uassisteret brugeraccept er åbne. |
| Bevaring og oprydning | Fire serverversioner og seks lokale registreringer bevaret. Én original konfliktkladde er knyttet til sin modtagne rettelse. Én med vilje afvist registrering er blokeret og bevaret efter tilbagekaldelse. Nul midlertidige feltmedlemskaber; egne testsessioner logget ud. |

Førbeviset er bevaret. Tre UI-fejl i genbrug og læsning af kladder blev fundet af nye prøver. En faktisk hosted-fejl viste tilbagekaldt adgang som genforsøg; den er rettet og genprøvet. De tidligere fejl i testforventninger, Windows' lange profilsti og Chromiums opstartsadfærd tæller ikke som beståede prøver. Private fixtures og skærmbilleder ligger i ignoreret tmp. Browserens persistente profil bruger en kort Windows-tempsti.

Prøven lukker fra en neutral browserside og åbner derefter den cachede feltside med offlineindstillingen aktiveret. Det forhindrer, at Chromium genstarter en appfane, før Playwright har anvendt offline-emuleringen. IndexedDB, cache, login og registreringer bevares under browserlukningen; profilen og data nulstilles ikke. Dette afgrænser en gentagelig softwareprøve, og er ingen fysisk flytilstands- eller kamera-/GPS-prøve.

Genkør med en tom fixturemappe under ignoreret tmp, den faktiske stagingrevision i FREYRA_TEST_REVISION og eventuelt FREYRA_OFFLINE_QA_DIR. Kommando: node scripts/test-offline-required-cards-staging.mjs --staging --accepted-plan-change. Scriptet kontrollerer miljøet og opretter et særskilt TEST-projekt. Den eksisterende testkonto får kun midlertidig feltrolle i dette projekt; rollen fjernes og læses tilbage. Egne sessioner gemmes privat til afgrænset oprydning og fjernes fra fixturen efter logout. Der sendes ingen invitationer eller beskeder.

Sikkerhedsadvisors har samme fundkategorier før og efter migrationen. De tidligere PostGIS-/Auth-/driftspunkter er fortsat åbne. Originalcheckoutets seks lokale ændringer er bevaret; denne pakke er udviklet i en isoleret gren.

### Resterende integration og accept

Fotoets direkte binding til den valgte opgave og registrering skal stadig samles i feltindgangen; den eksisterende manuelle dokumentationskobling og originalkø bevares. Før samme offlinegrundlag gennem udførelse, aflevering, særskilt review og rapport på denne kandidat. Fagpersonen skal fortsat definere metode-/kategorikrav og yderligere bilagstyper. Fysisk kamera/GPS og kommunens egen brugerprøve afventes.

En ældre app før den nye strikte køpayload kan ikke behandle den. En rollback skal bruge en kompatibel læser eller sikre genoptagelse af køen og må ikke slette den. Samlet rollback, gendannelse af originalfiler, fuld Skyhost-dækning og SaaS-frigivelse er åbne. Ingen produktion, merge eller betalt udbyder er aktiveret.
