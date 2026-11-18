# GoFreyra · Scrum og samlet udgivelse

Opdateret 18. november 2026. Status: klargøring; den eksisterende side er endnu ikke erstattet.

## Sprintmål

Saml de byggede GoFreyra-moduler på den eksisterende app. En medarbejder skal kunne logge ind på mobilen, finde et tildelt job på kortet, dokumentere arbejdet med billeder og færdigmelde jobbet uden en turpakke. Leder og administrator skal kunne se status og dokumentation i GoFreyra.

Sager indeholder flere jobs. Jobkortet samler steder, billeder, timer og materialer, som kan indgå i godkendte rapporter og senere fakturagrundlag. Roller afgrænser, hvem der kan se og ændre hvad.

## Prioriteret sprint

| Prioritet | Opgave | Status | Accept |
| --- | --- | --- | --- |
| P0 | Saml eksisterende app og byggede moduler | Samlet udgivelsesforslag oprettet | Bevar eksisterende design, funktioner og kundedata. |
| P0 | Klargør den samlede kodepakke | I gang | Obligatoriske kode-, sikkerheds- og byggekontroller skal være godkendt. |
| P0 | Afstem produktionsdatabase og serveropsætning | Åben | Gennemgå opgradering, adgang, billedlager og mulighed for gendannelse før ændring. |
| P0 | Erstat den eksisterende GoFreyra-side | Afventer teknisk afklaring | Verificér den nye version på den eksisterende adresse, inklusive login og genindlæsning. |
| P0 | Medarbejderens mobile jobforløb | Afventer accept på udgivet version | Åbn sag og job, find stedet på kortet, tag billeder og færdigmeld. |
| P0 | Lederens godkendelse og dokumentation | Afventer accept på udgivet version | Se status og originaler, returnér eller godkend arbejdet og åbn rapporten. |
| P0 | Kort, datakilder og eksport | Afventer accept på udgivet version | Verificér lag, sagsskift, kildestatus og adgangsafgrænset eksport. |
| P1 | Timer, materialer og fakturagrundlag | Fortsat udvikling og accept | Bevar historik; kun godkendte registreringer må danne fakturagrundlag. |
| P1 | Enhedsmålinger i låste rapporter | Åben | Fastfrys de valgte målinger med enhed, tid, kvalitet og kilde. |
| P1 | Hele Skyhost-produktet | Kortlægning og udvikling fortsætter | Brug det eksisterende reverse engineering-framework til fuld modul- og rollekortlægning og særskilt accept. |

## Kanban og færdigkriterium

Udviklingstavlen viser funktionsområder, kodehenvisninger og acceptkrav. En funktion afsluttes først efter den konkrete accept på den angivne udgivelse. En kodehenvisning alene er ikke en færdig funktion. Den realistiske demosag skal indeholde flere jobs og kunne vises til Dalgas.

Udgivelsesforslag: [PR #51](https://github.com/JESRI-C/freyra-hub/pull/51).

## Offentlighed

Kun kode og Scrum-plan offentliggøres. Interne projekt- og testnoter, prøvekvitteringer, skærmbilleder og servernøgler holdes private. Detaljerede kontrolresultater opbevares i det private arbejdsrum.
