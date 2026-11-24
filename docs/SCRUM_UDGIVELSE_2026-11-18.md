# GoFreyra · Scrum og samlet udgivelse

Opdateret 24. november 2026. Status: klargøring; den eksisterende side er endnu ikke erstattet.

## Samlet mål

Byg hele den kortlagte Skyhost-funktionalitet som et sammenhængende GoFreyra-værktøj med enkel betjening og GoFreyras grafik. Brug det eksisterende RES-framework til at undersøge arbejdsgange og regler. Bevar alle registrerede funktionsområder i planen, også hvor adgang eller integration endnu mangler. Udgiv på den eksisterende GoFreyra-side, når de nødvendige kontroller og den samlede accept består.

## Sprintmål

Saml de byggede GoFreyra-moduler på den eksisterende app. En medarbejder skal kunne logge ind på mobilen, finde et tildelt job på kortet, dokumentere arbejdet med billeder og færdigmelde jobbet uden en turpakke. Leder og administrator skal kunne se status og dokumentation i GoFreyra.

Sager indeholder flere jobs. Jobkortet samler steder, billeder, timer og materialer, som kan indgå i godkendte rapporter og senere fakturagrundlag. Roller afgrænser, hvem der kan se og ændre hvad.

## Prioriteret sprint

| Prioritet | Opgave | Status | Accept |
| --- | --- | --- | --- |
| P0 | Saml eksisterende app og byggede moduler | Samlet udgivelsesforslag oprettet | Bevar eksisterende design, funktioner og kundedata. |
| P0 | Enkel planlægning på tværs af sager | Flettet og observeret i preview | Direkte indgang, planlagte perioder, synlige manglende datoer og adgang til den eksisterende planeditor. Bevar kladder og håndhæv adgang. |
| P0 | Klargør den samlede kodepakke | I gang | Obligatoriske kode-, sikkerheds- og byggekontroller skal være godkendt. |
| P0 | Afstem produktionsdatabase og serveropsætning | Database opgraderet; serverklargøring i gang | Gennemgå opgradering, adgang, billedlager og mulighed for gendannelse før ændring. |
| P0 | Erstat den eksisterende GoFreyra-side | Afventer teknisk afklaring | Verificér den nye version på den eksisterende adresse, inklusive login og genindlæsning. |
| P0 | Medarbejderens mobile jobforløb | Afventer accept på udgivet version | Åbn sag og job, find stedet på kortet, tag billeder og færdigmeld. |
| P0 | Lederens godkendelse og dokumentation | Afventer accept på udgivet version | Se status og originaler, returnér eller godkend arbejdet og åbn rapporten. |
| P0 | Kort, datakilder og eksport | Afventer accept på udgivet version | Verificér lag, sagsskift, kildestatus og adgangsafgrænset eksport. |
| P1 | Timer, materialer og fakturagrundlag | Fortsat udvikling og accept | Bevar historik; kun godkendte registreringer må danne fakturagrundlag. |
| P1 | Enhedsmålinger i låste rapporter | Åben | Fastfrys de valgte målinger med enhed, tid, kvalitet og kilde. |
| P0 | Hele Skyhost-produktet | Kortlægning og udvikling fortsætter | Brug det eksisterende reverse engineering-framework til fuld modul- og rollekortlægning og særskilt accept. |

## Leverancer i det samlede mål

1. Fælles arbejdsrum med planlægning, sager, jobs, tildeling og overblik.
2. Sammenhængende jobkort med steder, krav, status, historik og gentaget arbejde.
3. Mobil dokumentation med originalfotos, GeoTag, formularer og sikker synkronisering.
4. Timer, aktiviteter og materialer med rettelser og godkendelse.
5. Gennemgang, rapporter, eksport og versionsbundet fakturagrundlag.
6. Udstyr, udlån, booking, service, GPS og kørebog.
7. Øvrige kortlagte moduler, administration og integrationer med deres egne acceptkrav.
8. Samlet test og udgivelse på den eksisterende adresse, efterfulgt af kontrol af login og jobforløbet.

Rækkefølgen ændrer ikke omfanget. Synlige menuer og kodefiler er ikke dokumentation for færdige arbejdsgange.

## Aktuel udvikling

Ugeplanen bruger den eksisterende adgangsafgrænsede arbejdsordreoversigt og planeditor. Planlagt start og slut placerer opgaverne i kalenderen; opgaver med manglende datoer bevares i en særskilt kø. De 43 målrettede prøver i tre filer består, inklusive datoer, adgangstab og beskyttelse af en åben kladde.

På b385ef28 består den fulde CI: 4116 appprøver, 2257 databaseprøver, gendannelse, TypeScript, lint, sikkerhedskontrol og produktionsbuild. To browserforløb med fiktive login består også: gem en planændring gennem serveren og genindlæs den; afvis en medarbejder uden planlægningsadgang. Desktop og mobilbredde er kontrolleret. Resultaterne følges pr. kildeversion i [PR #52](https://github.com/JESRI-C/freyra-hub/pull/52). Accept af den udgivne produktionsversion er fortsat åben.

PR #52 er flettet som 8f5fcd39. Lovable viser samme kildeversion med status ready, og den nye ugeplan er observeret efter genindlæsning. Produktionsdatabasen er opgraderet; den ejerbegrænsede sikkerhedsrettelse og produktionsserverens accept er fortsat åbne.

Startregistreringen afprøves nu med serverens aktuelle tidspunkt, så en forskel på telefonens ur ikke spærrer knappen Indsæt tidspunkt nu. Medarbejderen kontrollerer tidspunktet før gemning; manuel indtastning og registreringens kilde bevares. Tre nye komponentprøver består, inklusive præcis tid, tabt svar og mislykket tidsopslag. En browserprøve med et ur, der går to minutter foran, indgår i den fulde kontrol.

Mine opgaver udbygges med et kort over de indlæste, tildelte jobs og en liste til opgaver uden koordinater. Kort og kildestatus afprøves med samme adgang som opgavelisten. Den samlede browserprøve forbinder kortvalg, originalfoto, krævede jobkort, timer, materialer, udførelse, aflevering og uafhængig gennemgang samt rapport/PDF og originalpakke. Teknisk accept følges pr. kildeversion i udgivelsesforslaget; samlet hosted accept er fortsat åben.

Kunderegister, kontaktpersoner og sagsreferencer er identificeret som åbne leverancer i det samlede sagsforløb. De tælles ikke som færdige alene på grund af projektoversigten.

## Kanban og færdigkriterium

Udviklingstavlen viser funktionsområder, kodehenvisninger og acceptkrav. En funktion afsluttes først efter den konkrete accept på den angivne udgivelse. En kodehenvisning alene er ikke en færdig funktion. Den realistiske demosag skal indeholde flere jobs og kunne vises til Dalgas.

Udgivelsesforslag: [PR #51](https://github.com/JESRI-C/freyra-hub/pull/51).

## Offentlighed

Kun kode og Scrum-plan offentliggøres. Interne projekt- og testnoter, prøvekvitteringer, skærmbilleder og servernøgler holdes private. Detaljerede kontrolresultater opbevares i det private arbejdsrum.
