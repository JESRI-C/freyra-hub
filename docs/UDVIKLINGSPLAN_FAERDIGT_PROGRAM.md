# Freyra: udviklingsplan til et færdigt kommunalt program

Udarbejdet 22. oktober 2026. Bygger på [produktgennemgangen](PRODUKTGENNEMGANG_2026-10-22.md), fund F01-F20 og [det fulde skærm-/inputkort](REDESIGN_MAP.md).

## 1. Det færdige resultat

En kommunal fagperson skal uden mundtlig instruktion kunne oprette eller genoptage en sag, samle Før/Efter-dokumentation, kontrollere kilder og fotos, registrere faglige vurderinger og hente en godkendt, versionsfast leverance. Hver begrænsning skal være synlig og have et forståeligt næste skridt.

Det er den første produktleverance. Øvrige eksisterende moduler bevares og har deres eget færdiggørelsesforløb. De skal ikke forhindre, at den kommunale kerne bliver brugbar.

Der er to arbejdsrammer. **A er den allerede bestilte UI-opgave:** præsentation, navigation, hjælpetekster og placering af eksisterende felter. Motor, parametre, standardværdier, database, Supabase, RLS og API er uændrede. **B er efterfølgende funktionel færdiggørelse:** nye gemme-/godkendelsesfunktioner, datatilslutninger, Før/Efter og drift. Denne plan beskriver B; den iværksætter eller godkender ikke backendændringer under UI-opgaven.

Arbejd i rækkefølgen nedenfor. Hver pakke leveres som en konkret, afprøvet ændring, før næste afhængige pakke frigives. En ny P0-fejl i demo-flowet standser videre ændringer og udløser rapportering.

## 2. Samlet rækkefølge og afhængigheder

| Pakke | Leverance | Afhænger af | Fund / ramme |
|---|---|---|---|
| 0 | Fast udgangspunkt, sand status og genkørbar demo | Intet nyt | F20 / A |
| 1 | Forståeligt, genoptageligt sagsforløb | 0 | F01-F04, F17 / A |
| 2 | Resultater, parametre, hjælp og mangelliste | 1 | F05, F11 / A med markerede B-opgaver |
| 3 | Reel faglig godkendelse og aflevering | 2 + funktionelt scope | F06-F07 / B |
| 4 | Komplet Før/Efter og brugbar beplantningsopgave | 3 + fagligt materiale | F08-F09 / B |
| 5 | Kundeadgang, fejlhåndtering og drift | 1; endelig prøve efter 3-4 | F12-F13, F15-F16 / B |
| 6 | Uafhængig brugeraccept og produktrelease | 0-5 | Alle kernefund / A+B |
| 7 | Færdiggørelse af øvrige moduler | Eget kundebehov og krav; efter kerneaccept | F14-F19 / B |

AI er et særskilt kvalificeringsspor. En manuel kommunal arbejdsgang skal kunne være færdig og nyttig uden automatisk billedanalyse. Eventuel AI frigives først efter faglig validering.

## 3. Pakke 0: fastfrys sandheden om produktet

**Leverance:** Et aktuelt acceptregnskab med releasecommit, miljø, åbne mangler og beviser. Det skal skelne mellem teknisk bestået, fagligt accepteret, kundeaccepteret og driftsgodkendt.

1. Fasthold `6257819` som udgangspunkt for UI-grenen `codex/redesign-2710`. Bevar main og demogrenen.
2. Brug `REDESIGN_MAP.md` som bevaringsliste for samtlige skærme, felter og standarder. Registrér alle flytninger før frigivelse.
3. Registrér status for hvert fund F01-F20 med ansvarlig rolle, acceptprøve, dokumentation og releasecommit. Sæt ikke "løst" efter layout alene.
4. Bevar den eksisterende generalprøve og et kendt eksempel på PDF/ZIP. Kør slut-til-slut-prøver på en separat teknisk sag; skriv ikke prøvebeslutninger i den rigtige Bykær-historik.
5. Hold den ene aftalte stagingadresse som reference. Lokale forslag og designpreview må ikke præsenteres som leveret program.

**Færdig når:** En anden udvikler kan finde korrekt version, reproducere demoen og se præcis, hvad den beviser og ikke beviser. Ingen ældre statusfil bruges som aktuel produktgodkendelse.

## 4. Pakke 1: brugeren skal kunne begynde og fortsætte

**Leverance:** Hjemmesiden "Hvad vil du gøre?", enkel navigation og en sag med seks tydelige trin. UI-opgave; genbrug alle eksisterende handlinger.

1. Vis fem store valg: Start en ny sag, Upload dronefotos, Se baseline, Find steder at plante træer, Hent rapport. Forklar hvert valg med én sætning og vis det konkrete output.
2. Kræv et forståeligt sagsvalg for handlinger på eksisterende materiale. Gæt ikke en vilkårlig sag. En læser må ikke præsenteres for en oprettelseshandling som mulig.
3. Vis Sager og Kilder i hovedmenuen. Bevar adgang til eksisterende tilgængelige værktøjer på en sekundær, tydeligt navngiven placering. Frigiv ikke demoens allerede skjulte prototyper.
4. Vis 1 Billeder, 2 Datagrundlag, 3 Verificering, 4 Baseline, 5 Beplantning, 6 Rapport.
5. Gør undersøgelsesvalget synligt: "Fortsæt undersøgelse fra 24.08.2026" eller "Vælg undersøgelse". Hold sag, undersøgelse og kildeversion synkroniseret ved navigation og genåbning.
6. Vis status baseret på gemte data: færdigt teknisk delresultat, i gang, venter på dig, manglende grundlag eller fejl. Indlæsning og ukendt må ikke blive til færdig.
7. Vis én primær næste handling med forklaring. Bevar muligheden for at se senere trin, men forklar, hvilke input der mangler.
8. Gør forskellen på "ny kildeversion" og "ny undersøgelse" tydelig. Genoptagelse skal være det naturlige valg, når materialet allerede findes.

**Acceptprøver:**

- En førstegangsbruger kan inden for 10 sekunder sige, hvad Freyra hjælper med, og pege på næste relevante handling. Testes ved observation; en udviklers vurdering er ikke nok.
- Den eksisterende Bykær-sag kan åbnes fra Sager, og brugeren kan finde de seks fotopunkter uden at kende et direkte link eller et undersøgelses-ID.
- Reload og et bogmærke genåbner samme valgte undersøgelse. Et ugyldigt eller fremmed ID giver en forståelig fejl og viser ikke en anden undersøgelses data.
- Historiske kilde- og rapportversioner erstattes ikke lydløst af den nyeste. At besøge Verificering giver ingen faglig godkendelse.
- Forløbet kan betjenes med tastatur og på mobil; intet vandret siderul, skjulte primære knapper eller tekstafhængig farvestatus.

## 5. Pakke 2: resultat først, detaljer og hjælp ved behov

**Leverance:** Hvert trin viser et forståeligt delresultat, dets begrænsning og en tydelig handling. Eksisterende parametre bevares under Avancerede indstillinger.

1. Vis fx "Seks originaler kontrolleret", "Dateret grundlag gemt" eller "Rapportversion 2 - afventer faglig gennemgang" med en kort forklaring.
2. Flyt eksisterende konfiguration til sammenklappede indstillinger. Bevar felter, standarder, enheder, validering og handlinger. Tilføj forklaring pr. parameter.
3. "Nulstil til standard" ændrer kun lokal konfiguration. Det må ikke slette historik, ændre en gemt version eller godkende fotos. Hvor standarden er et gemt udgangspunkt, skal teksten forklare det.
4. Bevar vigtige datamangler og krav om eksplicit bekræftelse synligt. Visning af en kortere formular må ikke skjule manglende faglig accept.
5. Saml "Det venter på dig" med handlinger til eksisterende funktioner. Den læsende aktivitetsbakke skal vise faktiske læsninger, skrivninger og kendte ventepunkter; den må ikke opfinde job eller global baggrundsstatus.
6. Tilføj tomme tilstande for ny sag, ingen fotos, ingen undersøgelse, ingen kildedækning, manglende adgang, kildefejl, ingen rapport og afbrudt download. Forklar årsag, konsekvens og næste handling.
7. Brug Freyra-tokens konsekvent: #27543D, #66A182, beige oklch(0.965 0.008 90), tekst #2A2E35, Source Serif 4, Helvetica Neue og radius 6 px. Kontrollér kontrast; mellemgrøn må ikke ukritisk bruges til lille tekst.
8. Login skal vise: "Sporbar dokumentation af naturprojekter – fra dronefoto til godkendt baseline." Indtil den funktionelle godkendelse er leveret, skal kladdestatus på baseline/rapport stå tydeligt i produktet. Markedsføringslinjen er ikke bevis for, at godkendelsen findes.

**Markeret funktionel restopgave:** Hvis brugeren skal kunne tildele en mangel, vedhæfte nyt fagmateriale eller gemme en begrundet accept af et forbehold, kræver det en reel gemmefunktion. Den må ikke simuleres som del af UI-opgaven. Opret dette i pakke 3 med defineret datakontrakt.

**Færdig når:** Alle gamle felter og funktioner kan findes via kortet, ingen standard eller beregning er ændret, og nye/tomme/fejlbehæftede sager giver en vej videre. Skærmbilleder, scopekontrol, eksisterende tests og fuld demo er grønne på den konkrete UI-release.

## 6. Pakke 3: fra rapportkladde til godkendt leverance

**Leverance:** En faktisk godkendelsesproces for den kommunale leverance. Dette er funktionel udvikling uden for det gældende UI-only-arbejde.

1. Aftal med fagligt ansvarlig og kommunen, hvad der godkendes: baseline, de enkelte vurderinger, beplantningsskitse og endelig rapport. Beskriv hvilke mangler der kan accepteres med forbehold, og hvilke der blokerer.
2. Udform en tilstandsmodel med eksplicitte overgange, fx kladde, til faglig gennemgang, returneret, godkendt og afløst. En status skal knyttes til præcis input-/rapportversion, ikke kun sagen.
3. Definér hvem der må skrive, sende til gennemgang og godkende. Et indtastet navn i et felt er ikke i sig selv en godkendelsesrettighed.
4. Gem vurdering, begrundelse, ansvarlig identitet, tidspunkt og inputbinding i revisionssporet. Lav adgangs-/samtidighedsprøver før UI'et tilsluttes.
5. Gør mangler handlingsbare: supplér kilde/materiale, ret data, returnér til fagperson eller gem en begrundet accept, hvor reglerne tillader det.
6. Dan en ny, versionsfast leverance efter godkendelse. Tidligere kladder og filer bevares. Nye input må ikke arve gammel godkendelse uden en eksplicit regel.
7. Vis afleveringsstatus og den præcise godkendte PDF/ZIP. Download må ikke oprette en skjult ny version. Leverance til kommunen eller offentliggørelse er en særskilt, autoriseret handling.

**Acceptprøver:** En forkert rolle og en fremmed organisation afvises via både UI og direkte kald. To samtidige godkendelser skaber ikke modstridende historik. Ændret input kan ikke fremstå godkendt på gammel signatur. Godkendt rapport genhentes identisk af autoriseret læser; kladde og godkendt kan skelnes i både PDF og app. Alle åbne blokeringer enten løses eller forhindrer godkendelse efter de aftalte regler.

**Kræver før implementering:** Aftalt godkendelsesbetydning, ejer af de faglige regler og særskilt funktionelt scope. Den nuværende rapports `false`-felter må ikke blot ændres til `true` for at få grønt UI.

## 7. Pakke 4: dokumenteret Før/Efter og beplantning

**Leverance A: fuld Før/Efter-sag.** Genbrug eksisterende undersøgelsesrunder, medier, noter og versionsbindinger. Byg en tydelig parring af fotopunkter og vis Før/Efter side om side med dato, placering og metode. Vis når forskellig kameravinkel, sæson, kildedækning eller metadata begrænser sammenligningen. Observation og beregnet effekt skal kunne skelnes.

**Færdig når:** En ny bruger kan oprette to runder, parre relevante fotos, gemme vurdering med metode/enhed/usikkerhed, genåbne sammenligningen og hente en rapport, der henviser til netop disse input. Hvis eftermateriale mangler, er tilstanden forklaret og systemet opfinder ingen ændring.

**Leverance B: anvendelig beplantningsafklaring.** Indhent godkendte kommunale delstrækningspolygoner eller opbyg en kontrolleret import-/redigeringsvej. Fastlæg faglige regler for kilde-/geometridækning og dokumentér reference, enheder og grænser. Genbrug den eksisterende 10/20 m screening og parametre uændret indtil et særskilt beregningsscope er aftalt.

**Færdig når:** Hver delstrækning har kontrolleret identitet og arealgrundlag. Hektartal kan reproduceres fra gemt geometri og version. Manglende dækning vises som ukendt. Brugeren kan forstå forskellen på kandidat, betinget område, fradrag og fagligt accepteret plan. Lokale temperatur-, næringsstof- eller CO2-effekter må først leveres med en aftalt og valideret metode.

Indhentning af regulativ og fysisk afgrænsning kan ske, mens udviklingen foregår. Det er et leveranceinput fra fagperson/kommune, ikke noget en udvikler kan erstatte med kamerapunkter.

## 8. Pakke 5: kunden skal kunne komme ind og bruge det sikkert

**Leverance:** Kommunens egen adgang og et dokumenteret driftsforløb. De mest nødvendige administrationsfunktioner færdiggøres først.

1. Tilslut invitation, medlemskab, projekttildeling og nødvendige organisationsindstillinger til den reelle adgangsmodel. Genbrug eksisterende auth og RLS; den statiske rolleoversigt må ikke behandles som faktisk rettighedskontrol.
2. Afprøv aktivering, nulstilling, udløbet invitation/session og logout med kommunens egen bruger og en læsebruger. Ingen skjult teknisk testkonto i acceptprøven.
3. Vis fejlet gemning som fejl. Vis først "Gemt" efter bekræftet lagring og genlæsning. Reload, nyt login og anden autoriseret bruger skal vise det aftalte resultat.
4. Afprøv netværksudfald, timeout, dobbeltklik, afbrudt upload/download og genforsøg. Historik og originaler skal bevares, og brugeren skal vide, om en handling blev gemt.
5. Dokumentér backup og en virkelig genopretningsprøve for database og relevante storagefiler, inklusive identitet og kontrolsummer.
6. Udpeg driftsansvarlig, supportvej, alarmsmodtager, opbevaringsregel og procedure for fejl/rollback. Prøv en kontrolleret fejl hele vejen til alarmens modtagelse.
7. Registrér releasecommit og miljø ved hver release. Hold kundens adgang og den godkendte tidligere leverance tilgængelig ved rollback.

**Færdig når:** Kommunen gennemfører egen loginprøve, ejer/læser/anden organisation er afprøvet, og en anden person end udvikleren kan følge driftsvejledningen og genfinde en gendannet fil. Historisk grøn CI er ikke nok.

Betaling, generel API-nøgleadministration og brede organisationsmoduler får ikke forrang for denne adgangs-/driftsleverance. Offentlig afsendelse, betalingsaktivering og produktionsdeploy følger deres særskilte godkendelsesgrænser.

## 9. Pakke 6: én samlet acceptprøve før produktrelease

**Leverance:** Et afleveringsbevis for den præcise version, som kunden får. Test først den nye brugeroplevelse med en frisk brugerprofil uden vejledning.

| Prøve | Krav for bestået |
|---|---|
| Ny bruger og 10-sekunders forståelse | Brugeren forstår formål og vælger næste handling. Registrér observeret adfærd og konkrete steder, hvor hjælp kræves. |
| Ny sag til rapport | Oprettelse, geometri, fotos, kildeversion, undersøgelse, vurdering og leverance gennemføres uden direkte udviklerlinks. |
| Eksisterende sag | Brugeren genoptager korrekt undersøgelse og genfinder tidligere rapport uden dubletter eller tab af versionskontekst. |
| Før/Efter | Parring, metode, begrænsning og vurdering fremgår af både app og versionsfast rapport. |
| Mangler og fejl | Ingen skjult blokering eller falsk succes; hver fejl har konsekvens og genoptagelsesvej. |
| Godkendelse | Kun rette rolle kan godkende korrekt version. Ændringer ugyldiggør eller kræver ny accept efter aftalte regler. |
| Filer | PDF/ZIP findes, kan åbnes, har forventede bilag og hashes, og læseren henter samme godkendte fil. |
| Adgang | Fremmed organisation og læserens skriveforsøg afvises i UI, API og storage. |
| Mobil og tastatur | Centrale handlinger, tabeller og status er læselige og betjenelige. |
| Teknik og drift | Typekontrol, lint, build, relevante unit/integrations-/database-/browserprøver, backup/restore og alarm er dokumenteret. |
| Kundeaccept | Fagligt ansvarlig accepterer indhold og kendte forbehold. Kommunen accepterer den aftalte leverance. |

**Releasebeslutning:** GO kræver alle relevante punkter bestået på samme releaseversion eller en eksplicit accepteret, navngiven undtagelse inden for aftalt scope. En manglende prøvekørsel er ukendt, ikke bestået. En teknisk demo kan være GO, samtidig med at produktion stadig er NO-GO; de to beslutninger skal stå hver for sig.

## 10. Pakke 7: de øvrige moduler færdiggøres uden falske løfter

Bevar alle eksisterende routes, funktioner og parametre. Registrér for hvert modul: konkret brugeropgave, reelle input, handling, gemt resultat, genåbning, roller, fejlvej og acceptprøve. Prototypegrænser må ikke fjernes, før hele kæden virker.

| Område | Næste konkrete leverance | Krav før frigivelse |
|---|---|---|
| Tværmodulhandlinger | Erstat alle 16 `actionToast`-kald med faktiske operationer eller ærlig tilgængelighedsstatus. | Modtagende modul kan genåbne det oprettede objekt; ingen succes ved fejl eller manglende implementering. |
| Indstillinger | Faktisk lagring af nødvendige organisations-/adgangsfelter. | Genlæsning efter nyt login, adgangsafvisning og forståelig fejl. |
| Overvågning og kilder | Færdiggør en konkret sensor-/kildeintegration inkl. kvalitet og alarm. | Rigtige observationer fra kendt enhed og en afprøvet alarm; ingen eksempeltal som drift. |
| Beslutninger | Én sagsbaseret anbefaling med dokumenterede input og en faktisk gemt opgave. | Fagperson kan se begrundelse, usikkerhed og opfølgning. |
| Ledger/centralt rapportbibliotek | Saml sagens reelle revisionsspor og godkendte rapporter. | Rettigheder, kildebinding og versionsgenåbning fungerer; genbrug rapportmotoren. |
| Effekt, credits og portefølje | Aftal et verificeret kundebehov og metode før implementering. | Faktiske data, valideret metode og godkendt visning; hardkodede KPI'er fjernes fra kundetilstand. |
| Byggeri/natur | Afgrænset byggeprojektsag fra oprettelse til dokumentation. | Selvstændig slut-til-slut-prøve med rigtige data og roller. |
| Offentlig effekt | Reel publicerings-/tilbagetrækningsproces med versions- og privatlivskontrol. | Intet er offentligt, før den konkrete version er godkendt til offentliggørelse. |
| Generelt katalog, søgning og hjælp | Et faktisk sags-/kildeindeks og hjælp til de tilgængelige opgaver. | Søgning finder reelle tilgængelige objekter og afslører ingen andres data. |

Automatisk AI kræver et repræsentativt evalueringssæt, navngivne faglige bedømmere og kriterier for nyttige fund, forkerte fund og afvisninger. Mål både skemafejl og faglig brugbarhed. Brug den manuelle vej, når billedkvalitet eller sikkerhed ikke rækker. En større batch er ikke en løsning på de nuværende kvalitetsproblemer.

## 11. Praktisk styring og ansvar

Udvikleren ejer teknisk gennemførelse og testbeviser. Produktansvarlig ejer scope og prioritering. En navngiven fagperson ejer metode, godkendelseskriterier og fortolkning. Kommunen leverer/afklarer eget materiale og accepterer leverancen. Driftsansvarlig ejer adgang, backup, alarm og support. Der er endnu ikke udpeget personer i denne plan.

Hver ændring skal have ét problem fra fejllisten, afgrænset løsning, acceptprøve og kontrol af det eksisterende flow. Commit løbende. Gem skærmbilleder af vigtige tilstande uden private bilag. Kør nødvendige tests og build før sammenlægning; en ny demo-blokering stopper videre arbejde og rapporteres.

Den oprindelige deadline 26.10 kl. 12 fastholdes som mål for den isolerede UI-leverance, men denne audit giver ikke grundlag for at love, at alle funktionelle pakker er færdige til samme tidspunkt. Planen bruger beviselige milepæle frem for en udokumenteret færdigprocent.

**Næste leverance er pakke 0-2 på den eksisterende redesigngren**, efterfulgt af fuld kontrol og en PR mod `codex/haderslev-demo-2710`. Derefter behandles det særskilte funktionelle scope for pakke 3-6. Ingen backendændring, deploy eller produktionsgodkendelse er udført ved at skrive denne plan.
