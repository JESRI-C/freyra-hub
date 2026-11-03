# Freyra: 50-brugerprøve og beslutning om kundedrift

3. november 2026 · Testkørsel `f09aefd4` · [Testmiljø](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev) · [Maskinkvittering](saas-50-users-receipt-2026-11-03.json).

**Det afprøvede projektforløb er bestået. Freyra er endnu ikke godkendt til fuld SaaS-kundedrift.** Otte projekter med adskilte organisationer nåede fra oprettelse og tildeling til uafhængig, versionsbundet gennemgang. Den generelle rapport fra godkendt opgavegrundlag og de åbne driftskrav mangler stadig.

## Brugere og udfald

50 adskilte, syntetiske Auth-konti og sessioner: otte ejere, otte projektledere, otte feltmedarbejdere, otte reviewere, otte læsere, otte eksterne og to uden projektadgang. Alle loggede faktisk ind. Testopsætningen brugte reserverede `example.test`-adresser, autentificering med separate adgangskoder og eksisterende opgavemodeller. Roller blev klargjort som testdata. Prøven efterviser ikke den kundevendte invitations- eller bekræftelsesproces.

| Del | Resultat |
|---|---|
| Login og projektoprettelse | 50 forskellige login; otte ejere oprettede og genåbnede eget projekt via den almindelige klientadgang. 14 af 64 adgangskodekald ramte Auths rategrænse; alle 50 lykkedes efter genforsøg. |
| Organisationer og roller | 268 kontroller på den rettede version, herunder 50 afviste fremmede projektskrivninger, 18 afviste metadata-baserede privilegieforhøjelser og tre samtidige læserunder med 50 konti. Ingen fremmed projektdata synlig. |
| Otte forløb | 32 indledende kontroller bestod, og otte feltudførelser blev afvist. Efter rettelsen bestod de 24 resterende trin i de samme forløb. Alle otte opgaver nåede uafhængig godkendelse. |
| Felt, originaler og historik | Otte TUS-overførsler med serverberegnet hash og identiske genhentede bytes. Kladde, nul og `false` blev bevaret. Registrering, udførelse, foto og aflevering peger på den samme opgave. Positionen er en syntetisk manuel placering. |
| Fejl og genforsøg | En rigtig udførelsesrettelse i telefonvisning, to forskellige samtidige skrivere med én version og én `PT409`, og én forældet aflevering returneret, genåbnet og genafleveret. Egen godkendelse afvist selv med eksplicit reviewadgang. Et identisk genforsøg opretter ingen ekstra version. |
| 50 browserprofiler | Alle 50 bestod deres rollevisning ved 320, 390 eller 1280 pixels. Eksterne kunne se den tildelte opgave uden almindelig projektadgang; læsere havde ingen gemmehandling. Ingen JavaScript-fejl eller fremmede testprojekter på de afprøvede flader. |
| Afsluttende sikkerhedsprøver | 75 kontroller bestod, herunder 50 afviste fremmede originaldownloads, otte afviste læser-genforsøg med en andens skriverequest, otte eksterne tilbagekaldelser og én rolleændring, der straks afviste det tidligere udførelsesgenforsøg. |

507 kontroller bestod på tværs af forløbet, med 1.125 registrerede SDK-kald i de valgte faser. De otte indledende afvisninger er beholdt som førbevis. 8 projekter, 8 verificerede originaler og 9 afleveringsversioner blev bevaret efter oprydning. Alle 50 testkonti er deaktiveret. Ingen aktive sessioner, uinddragede refresh-tokens, aktive skrivende roller eller opgavegrants er efterladt. Et repræsentativt login og refresh efter lukning blev afvist med `user_banned`. De midlertidige lokale adgangskoder og sessioner er fjernet.

| Samtidig læserunde | Klienter | Median | P95 | Maks. |
|---|---:|---:|---:|---:|
| 1 | 50 | 225 ms | 311 ms | 485 ms |
| 2 | 50 | 219 ms | 1.024 ms | 1.026 ms |
| 3 | 50 | 169 ms | 226 ms | 226 ms |

Målingen er tre korte puljer af afgrænsede læsninger fra én maskine. Browserprøven brugte 50 adskilte profiler med op til to åbne ad gangen. Den måler hverken langvarig kapacitet, en fysisk telefon eller 50 menneskers forståelse af appen.

## Kode og adgang

Før rettelsen krævede udførelses-RPC'en generel projektredigering, også når den konkrete feltmedarbejder allerede havde ret til at udføre opgaven. Rettelsen genbruger den eksisterende opgaveadgang, bidragsrollen, actor-id, medlemslåse og append-only bindinger. Feltmedarbejderen kan gemme sin egen udførelse på den valgte opgave; generel projektredigering, andre udførere, ubundne arbejdsrumsrækker og direkte audit-skrivning er fortsat afvist. Den eksisterende opgaveaudit binder den autentificerede bruger og versionen i samme transaktion.

Kilde `5cdb5ef6bd141482490cd4cbd4cfb799dc2ea229`, Worker `47f58571-d8a7-4bd9-8543-4af56f1571c1`, [draft PR43](https://github.com/JESRI-C/freyra-hub/pull/43). Migrationen er registreret som `20261103014500_assigned_field_execution_scope` på staging og afstemt til samme lokale filnavn. Offentlig RPC og den nye private kontrol er invoker-funktioner. Anonym udførelse er afvist. [CI 41561374289](https://github.com/JESRI-C/freyra-hub/actions/runs/41561374289) består med 3.450 app-tests, 1.583 databasekontroller, rigtig billedafkodning, frisk replay, samtidighed og dump/restore. Runtime-audit finder 0 kendte pakkeproblemer; 14 moderate udviklingsfund er stadig dokumenteret. Staging-headers og anonym MCP-afvisning er genprøvet.

## Frigivelseskriterier for hele SaaS-produktet

| Område | Kriterium for at lukke det | Aktuel status |
|---|---|---|
| Sammenhængende arbejdsforløb | En projektleder kan gå fra naturproblem til godkendt rapport på samme, genåbnelige version. Brugeren kan se hvad der mangler, og åbne det rigtige sted at rette det. | Bestået til godkendt afleveringsgrundlag i otte forløb. Generel rapportbinding S05 er åben. |
| Klar brugeroplevelse | Hver rolle kan se formål, næste handling og resultat; samme status- og ordvalg på mobil og computer. Kladder, fejl og konflikter viser hvordan man fortsætter. | Tekniske rollevisninger og genforsøg består. Uassisteret brugerprøve og fysisk telefon er åbne. |
| Datasikkerhed | Afvis fremmed organisation, fil og skrivning; genprøv tilbagekaldelse; dokumentér kendte fund og luk produktionsblokeringer. | Afprøvede adgangsgrænser består. PostGIS, leaked-password protection og managed Postgres-opgradering kræver driftshåndtering. |
| Drift og kommerciel brug | Konto, invitation, administration, eksport, support, hændelser, genoprettelse og en faktisk aftalt abonnements- eller fakturaproces. | Disponibel restoreprøve består. Kundens onboarding, betaling, produktionsdrift og længere belastning er åbne. |
| Faglig dækning | Alle kortlagte Skyhost-områder og Freyra-fagmoduler vises med deres faktiske status og prøves med relevante data og brugere. | Kortlægning bevares. 50-brugerprøven afgrænser sig til projekt-/opgavekæden. Fuld Skyhost-paritet og de syv fagprojektafhængige detailvisninger er åbne. |

Som brugeroplevelsesreference viser [Dineros guide til at komme i gang](https://dinero.dk/support/godt-i-gang/) konkrete opgaver i den rækkefølge, brugeren har brug for dem. Overført til Freyra betyder det at vise næste relevante handling og gemt resultat i arbejdsrummet, eksempelvis gå fra dokumentationsmangel direkte til den registrering, der skal rettes. Det er et produktprincip og en kommende brugerprøve, ikke en bestået sammenligning med Dinero.

Næste leverance er **S05: generel rapport på den præcise godkendte opgaveversion**, efterfulgt af en uassisteret telefon- og projektlederprøve. Mål om første handling findes, om opgaven kan afsluttes uden forklaring fra en udvikler, og om tidligere arbejde kan genåbnes på samme version. Udfør driftsopgaverne parallelt med den eksisterende ansvarlige; produktionsgodkendelse og betalte udbydere har deres eget mandat.

## Genkørsel og afgrænsning

`scripts/saas50` gemmer den reproducerbare prøve. Start en ny syntetisk kørsel i et tomt, ignoreret `tmp/saas50` og angiv præcis stagingrevision i `FREYRA_TEST_REVISION`. `prepare-fixture.mjs --staging` bruger en lokalt installeret `bcryptjs@3.0.3` i `tmp/saas50-tools`. Den forbereder kun data til det navngivne stagingprojekt. Autoriseret drift kører først den ene konto og derefter resten af det afgrænsede fixture-SQL. `authenticate`, `setup-tenants` og rollefixture etablerer de 50 sessioner og otte projekter. Kør `isolation`, `workflows`, `browser` og `final-boundaries` i rækkefølge; de anvender almindelige brugerrettigheder. Efter prøven afvikles det afgrænsede `prepare-cleanup`-SQL og læses tilbage. `render-report.py` bruger den sanerede kvittering til rapporten.

Hvis kontooprettelsen afbrydes, kan `prepare-cleanup.mjs --staging --partial-provisioning` generere særskilt oprydnings-SQL. Det kontrollerer eksakt konto-id, e-mail og testmærke samt projekt- og organisationsmedlemskaber. Den automatisk oprettede personlige organisation afgrænses af kontoen, typen og det forventede syntetiske navn. Kvitteringen angiver antal fundne og lukkede konti. Standardoprydningen kræver stadig alle 50 konti.

En rollback-prøve i staging oprettede én syntetisk konto med den normale oprettelsestrigger. Oprydningen lukkede kontoen og ændrede medlemskabet i den personlige organisation til læseadgang. Rollback fjernede testkontoen igen. En negativ prøve med et uventet organisationsnavn blev afvist. Standardoprydningen afviste også en kørsel med kun én konto.

Generér standardoprydningen fra den aktuelle fixture efter `setup-tenants`. Opsætningen erstatter de foreløbige organisations-id'er med de faktiske organisations-id'er, før projektrollerne oprettes. Den særskilte fil til afbrudt kontooprettelse kan genereres før dette trin.

Der er ikke ændret produktion, merget kode, sendt invitationer eller aktiveret en betalt udbyder. Brugerens to lokale Jobs/Geotag-dokumenter og eksisterende projekter er bevaret.

## Opfølgning efter 50-brugerprøven

S05 er teknisk verificeret på staging for den godkendte arbejdsopgave. Projektlederen kan danne og genåbne en rapport fra den konkrete godkendelse, eksportere PDF og følge forbindelsen tilbage til opgaven og originalerne. Browserprøven dækkede 320, 390 og 1280 px. Se udviklingsplanens S05-afsnit for revisioner og testbevis.

Projektets arbejdsopgaver har desuden fået plan- og kalenderoversigt, registrering af timer og materialer, kortlagte besøg med udførelseshistorik og udstyrsbooking. Se udviklingsplanen for de enkelte leverancer og deres teststatus. Ledighed inden reservation er implementeret i `6c3ddbb`. Databasetesten bestod, og Chrome-prøven på staging ved 390 px bekræftede, at en optaget periode blokerer gemning, og at aflysning frigiver perioden og bevarer historikken.

Tallene ovenfor gælder den oprindelige 50-brugerprøve. Der er stadig åbne frigivelseskriterier for fysisk telefon, uassisteret brug, fuld Skyhost-dækning og fagvisninger, længere belastning, kundens onboarding, betaling og produktionsdrift.

## Genprøve med 50 brugere efter samlingen

Kørsel ed583cee på staging, kilde 7a28b32e89a4b6eab3a4a4bf7e55baf05d0ba562 og Worker 6d270fda-160f-4365-bea2-88f95dea97d4. Alle 515 kontroller bestod på otte syntetiske projekter.

| Prøve | Bestået | Hvad blev kontrolleret |
|---|---:|---|
| Login | 50 af 50 | Særskilte konti og sessioner. 14 af 64 loginforsøg fik HTTP 429. Alle konti loggede ind efter genforsøg. |
| Projektoprettelse | 8 af 8 | Oprettelse og genåbning via den almindelige brugeradgang. |
| Isolation og samtidige læsninger | 268 af 268 | Tre samtidige læserunder med 50 klienter samt afvisning af fremmed projektskrivning og forsøg på at ændre rettigheder gennem metadata. |
| Arbejdsforløb | 56 af 56 | Plan, tildeling, feltregistrering, original, udførelse, versionsfast aflevering og uafhængig godkendelse. Samtidige skrivninger og genforsøg bevarede historikken. |
| Browserprofiler | 50 af 50 | Rollevisninger ved 320, 390 og 1280 px. Ingen fremmede testprojekter, JavaScript-fejl eller vandret rulning på de afprøvede flader. |
| Rapport og PDF | 8 af 8 | Projektlederen åbnede rapporten fra godkendelsen og genåbnede samme rapportversion. PDF-eksport virkede, og rapporten linkede til den præcise opgave og dens originalfotos. |
| Afsluttende adgangskontrol | 75 af 75 | Fremmede originaler, uautoriserede genforsøg, tilbagekaldt opgaveadgang og ændrede roller. |

Der blev registreret 1.067 SDK-kald i de målte faser. Browserkald er opgjort separat som scenarier. Kør genprøvens rapportfase med node scripts/saas50/reports.mjs --staging efter arbejdsforløbene og før kontolukning.

Rapportfasen bruger nu den forventede afleveringsversion fra det gennemførte arbejdsforløb. Den kontrollerer versionen på den aktuelle rapporthandling og i den åbnede rapport, kvitteringen efter klargøring, PDF, tastaturretur og JavaScript-sidefejl. Kontrollen af den viste kildeversion er efterprøvet på én eksisterende syntetisk stagingrapport. De historiske 50-brugertal ovenfor gælder fortsat den registrerede kørsel ed583cee.

Projektledernes browserprøve starter nu i Overblik uden valgt opgave og med kalenderen som tidligere visning. Den aktiverer afleveringsgenvejen med tastaturet, søger efter testopgaven og kontrollerer den præcise opgave og aflevering. En tilsvarende prøve bestod på eksisterende syntetiske stagingdata ved 390 og 1280 px. Den udvidede kørsel med alle projektlederkonti afventes.

Oprydningen lukkede alle 50 konti. Efter læsning på staging var der 0 aktive sessioner, 0 uinddragede refresh-tokens og 0 skrivende projekt- eller organisationsroller for kontiene. Login og refresh blev afvist for den repræsentative lukkede konto. De lokale testlegitimationsoplysninger blev fjernet. De otte projekter, otte verificerede originaler, ni afleveringsversioner og otte gemte rapporter er bevaret.

Den opdaterede genprøve dækker arbejdsforløbet til gemt rapport og PDF. Den samlede frigivelsesvurdering afventer uassisteret brug på fysisk telefon, fuld Skyhost-dækning og de resterende fagvisninger, længere belastning, kundeopstart, betaling og produktionsdrift.

Den efterfølgende S13-leverance tilføjer en afgrænset ugentlig serie fra Arbejdsopgaver → Arbejdsgrundlag. Stagingprøven ved 390 px oprettede to særskilte arbejdsopgaver, genåbnede deres datoer og verificerede den præcise kildeplan. Serien er testet separat fra 50-brugerprøven. Flere gentagelsesintervaller og samlet omplanlægning af en serie er åbne. Den første browserprøve efterlod to syntetiske poster med id-format, som appen afviser, i det oprindelige testprojekt. Genprøven bestod i et separat syntetisk projekt efter rettelsen.

## Genprøve af navigation og rapportens kildeversion

Kørsel `6e51f4bb` på staging, appkilde `596bdc5` og Worker `adf6fef4-4388-49f0-a8e7-03f0c6ccd29c`. Alle 515 kontroller bestod. Det omfatter 50 login, otte projektoprettelser, 268 isolationskontroller, 56 forløbskontroller, 50 browserprofiler, otte rapportprøver og 75 afsluttende adgangskontroller. Der blev registreret 1.066 SDK-kald. Alle otte projektledere fandt via tastaturet den korrekte aflevering fra Overblik. Alle otte rapportprøver viste den forventede godkendte afleveringsversion, åbnede samme rapport ved genforsøg, hentede PDF og vendte tilbage til samme opgave med tastaturet.

Standardoprydningen stoppede først på den gamle organisationsafgrænsning. Efter generering fra den afsluttede fixture blev alle 50 konti lukket. Aflæsningen viste 0 aktive sessioner, 0 aktive refresh-tokens og 0 medlemskaber med skriveadgang for kontiene. Login og refresh på en lukket konto blev afvist med `user_banned`. Lokale legitimationsoplysninger blev fjernet. Otte projekter, otte verificerede originaler og ni afleveringsversioner blev bevaret. En separat afbrudt opstart `56233511` blev lukket med én oprettet og én lukket konto.

Prøven er teknisk og syntetisk. Fysisk telefon, uassisteret kundebrug, vedvarende belastning og de øvrige åbne frigivelseskriterier afventes.
