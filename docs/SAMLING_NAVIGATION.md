# S00–S01 og første feltforbindelse

Dato: 2. november 2026. Gren: `codex/project-navigation-integration-v1`.
Grundlag og miljøstatus: [baselinekvittering](samling-baseline-2026-11-02.json).

## Versionsvalg

Integrationsgrenen er oprettet fra PR34's verificerede head `2b122fe`.
Remote main, PR18's evidensforløb og PR33's livscyklus er verificerede ancestors.
PR34's CI-kørsel 40960050035 er success; den er bevis for grundlaget,
ikke de nye ændringer. De to eksisterende Jobs/Geotag-dokumentændringer
er bevaret og sikkerhedskopieret som patch i ignoreret tmp.

Stagingdatabasen har 42 migrationer til og med 20261029203920.
De syv arbejdsordremigrationer er sammenholdt med lokal kode.
Den første rå hash afveg på linjeskift: læst kilde og lokal kilde er identiske
linje for linje efter CRLF/LF-normalisering. Historikken beviser ikke alene
fuld aktuel skemaparitet. Der er ikke ændret noget i databasen.

Den aktuelle hosted apprevision og produktionsrevision kunne ikke hentes.
Historiske kvitteringer er bevaret som historiske. Ingen deployment er udført.

## Én projektnavigation

De tidligere projektfaner og det guidede forløb åbnes under samme
`ProjectWorkspaceShell` og `ProjectNavigation`. Sideparametre valideres stadig
af den eksisterende route. `project-navigation.ts` er præsentationsmetadata,
ikke en ny rettighedsmodel.

| Arbejdsområde | Bevarede destinations-ID'er |
|---|---|
| Overblik | tab:overblik, tab:audit, tab:roller |
| Plan og opgaver | tab:handlinger; gammelt step:udfoerelse åbner samme arbejdsrum |
| Kort og grundlag | tab:grundlag/livekort/sites/datakilder/miljodata; step:baseline |
| Felt og dokumentation | tab:medier/arbejde/dokumentation; step:billeder/datagrundlag |
| Vurdering og effekt | step:gennemgang/sammenligning/beplantning; tab:indikatorer |
| Rapport og opfølgning | tab:rapporter; gammelt step:rapport åbner samme arbejdsrum |

Alle 14 faner og otte guidede trin har en destination eller en konkret
kompatibilitetsmapping. Ingen af de 17 hovedmenuindgange er fjernet.
Round, task og work følger navigationsskift. Den nye navigation bruger
browserhistorikken; valget af opgave genbruger fortsat den eksisterende
kontrollerede opgaveidentitet og kladdelåse.

Kun besøgte paneler monteres. De bevares under internt navigationsskift,
så lokale redigeringer ikke forsvinder ved et almindeligt visningsskift.
Konto eller projektroute skifter shellens nøgle og fjerner tidligere paneler.
Dette er hukommelsesbaseret bevarelse, ikke ny varig lagring af alle formularer.
Eksisterende offlinekø og serverrevisioner har deres egne garantier.

Hver værktøjsgruppe har en indlæsnings-/fejlgrænse med genforsøg;
navigationen bliver stående ved fejl. En fejl, der nedtager en komponent,
kan stadig afbryde dens ikke-gemte tilstand; det er ikke en backupmekanisme.
De eksisterende database-/serverkontroller og adgangsafslag er bevaret.

Kortkomponenterne får ResizeObserver-baseret størrelseskontrol: visning
efter skjult panel og mobilstørrelsesskift kalder Leaflets invalidateSize
uden automatisk panorering. Et skjult kort med nul størrelse ignoreres.

## Eksisterende rapportdele forbundet

Projektets rapportområde viser nu også WorkflowReportPanel og
WorkflowFollowupPanel fra det eksisterende før/efter-forløb.
MunicipalReportPanel, billedinspektion, rapportarkiv, preview og
øvrige dokumenter er bevaret. Valgt undersøgelsesrunde følger link og panel.
Dette færdiggør ikke D05's aflevering eller D07's opgave-/fil-snapshot.

## Første del af S02: samme jobkort i feltarbejdet

Mine opgaver, opgavearbejdsrummet og projektets offlineindgang sender nu
en valideret task-reference sammen med projekt/runde til `/felt`.
Offlinevisningen åbner kun jobkortet, hvis det findes i den gemte pakke
for den valgte bruger og det valgte projekt. Et manglende ID giver en
synlig afklaring og vælger ikke et andet jobkort. Returlinket bevarer
opgave/runde og åbner feltregistreringen i samme projektarbejdsrum.

Ingen ny opgave- eller filadgang gives af et URL-parameter. Eksterne
udførere får ikke projektbred offlineadgang gennem denne ændring.
Fotos i køen er fortsat projektbundne. Dette står udtrykkeligt ved
opgavevalget; de tælles ikke som opgavebevis på grund af linket.

## Næste konkrete udvikling

1. Afprøv denne navigation på den valgte testrelease med computer/telefon,
   gamle links, refresh, tilbage/frem, reviewer og viewer.
2. S02/D03: tilføj databasehåndhævet relation mellem konkret opgave,
   observation, udførelsesrevision og originalfil med afgrænset ekstern
   adgang. Genbrug eksisterende uploadkvittering og canonical media.
3. Test konto-/opgaveskift, tilbagekaldelse, ukendt filposition og
   afbrudt/gentaget upload. En gammel køpost omklassificeres ikke ved gæt.
4. Fortsæt D05's frosne aflevering og D07's rapport-/filbinding efter
   [samlingsplanen](UDVIKLINGSPLAN_SAMLING_2026-11-02.md).

De faktiske kontroller og begrænsninger for denne ændring registreres i
[leveranceloggen](SAMLING_LEVERANCELOG.md). Der foreligger ingen ny
fysisk telefonprøve, hosted browserprøve eller kundeaccept.
