# Freyra: produktgennemgang

Status 22. oktober 2026. Grundlag: Haderslev-staging og `JESRI-C/freyra-hub` på `625781906a4f49d120b6b3581261279dd889e6de`. Rapporten beskriver den eksisterende version; det lokale redesign regnes ikke som leveret.

## 1. Konklusion

Freyra har en fungerende kerne til at samle dokumentation for en natursag: originale dronefotos, daterede offentlige kilder, manuel fotogennemgang og en versionsfast rapportpakke. Det er et brugbart teknisk fundament. Det er endnu ikke et færdigt program, som en kommunal fagperson sikkert kan bruge fra start til slut uden hjælp.

Din oplevelse af døde ender har to forskellige årsager. På Haderslev-staging findes funktionerne ofte, men forbindelsen mellem sag, undersøgelse og næste handling er for utydelig. I den bredere kode findes desuden skærme, der ligner færdige moduler, men bruger eksempeldata eller knapper uden en bagvedliggende handling. De fleste af disse moduler er allerede skjult i Haderslev-staging. De er derfor ikke forklaringen på alle problemer i den version, du bruger.

Et nyt design kan gøre den eksisterende kerne forståelig. Det kan ikke alene levere den manglende godkendelsesproces, en fuld Før/Efter-arbejdsgang, nyttig automatisk billedanalyse eller dokumenteret produktionsdrift. De opgaver kræver en særskilt udviklingsindsats efter UI-arbejdet.

**Anbefaling:** Færdiggør først én sammenhængende kommunal arbejdsgang og afprøv den med en ny bruger. Bevar de øvrige moduler og parametre i kode og inventar, men frigiv kun en funktion som færdig, når handlingen, de gemte data og genåbningen er kontrolleret. Byg videre på den fungerende kerne.

## 2. Hvilken version har vi undersøgt?

Den ene bekræftede online driftsversion er [Haderslev-staging](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/login). Staging er ikke det samme som en produktionsgodkendelse.

| Del | Status |
|---|---|
| Online Haderslev-staging | Kontrolleret med læsende browsergennemgang 22.10. Sagen, seks fotopunkter og en gemt rapport kan åbnes. |
| `codex/haderslev-demo-2710` | Fast udgangspunkt `6257819`. Grenen er ikke ændret af dette arbejde. |
| `codex/redesign-2710` | Isoleret lokal arbejdsgren fra det aftalte udgangspunkt. UI-arbejde er undervejs og ikke udgivet. |
| Lovable | Bruges til designråd. En tilgængelig selvstændig online version blev ikke bekræftet og tæller ikke som en anden driftsversion. |
| Det gamle dashboard i den overordnede mappe | Historisk prototype i et andet repository. Det er ikke Haderslev-staging og indgår ikke som aktuel Freyra-funktionalitet. |

### Metode og grænser

Skærm- og inputinventaret omfatter alle 80 eksisterende produktskærme/layouts i redesignkortet. Det registrerer 268 forekomster af inputkomponenter og 477 lokale `useState`-initialiseringer. Det er kodeforekomster, ikke 268 forskellige faglige parametre eller 477 færdige funktioner. OAuth-samtykkeskærmen er desuden registreret i den tekniske scanning. Se [det fulde redesignkort](REDESIGN_MAP.md).

Rapporten kombinerer inventaret med målrettet sporing af funktioner, datakilder, gemmehandlinger og adgangsbegrænsninger. Den er ikke en ny fuldstændig sikkerhedsrevision eller en manuel prøve af alle 80 skærme.

Den aktuelle browserkontrol var læsende med den eksisterende tekniske testkonto: ingen nye sager, uploads, faglige beslutninger eller rapportversioner. Billedgennemgang og gemt rapport blev åbnet med en eksplicit undersøgelse. Direkte adgang til brugeradministration blev sendt tilbage til Sager, som demoafgrænsningen kræver. Der blev observeret nul browserfejl i denne prøve. Tidligere fulde skriveprøver og databasekontroller er særskilt dokumentation fra generalprøven, ikke genudført af denne audit. [K1, K2]

Den eksisterende PDF blev desuden genhentet gennem appen: 2.163.225 bytes, identisk SHA-256 med generalprøvens version 2 (`a07aec98...08441b5`; fuld hash i K2). Det bekræfter genåbning og filadgang til netop denne rapport. Der blev ikke oprettet en ny rapport.

En indledende browserassertion ventede kun fem sekunder og standsede under indlæsning. Med korrekt ventetid blev alle seks fotopunkter vist. Det tælles ikke som en produktfejl.

## 3. Hvad hjælper Freyra reelt med i dag?

Freyra kan hjælpe en fagperson med at svare på: **Hvilket materiale bygger denne sag på, hvad viser kilderne, hvad har vi selv gennemgået, og hvilken dokumentation sendte vi videre?**

| Brugerens opgave | Eksisterende hjælp | Grænse |
|---|---|---|
| Samle billeder for en sag | Upload, serverkontrol af originaler, optagemetadata og kontrolsummer. Seks faktiske Bykær-originaler er dokumenteret. | En kameraposition er ikke en opmålt billedflade eller kommunal delstrækning. |
| Finde offentligt grundlag | Gemte, daterede kildeversioner med proveniens og dækningsstatus. | En modtaget kilde kan være delvis. Katalogmetadata er ikke nødvendigvis analyserede billed- eller terrænpixels. |
| Gennemgå billeder fagligt | Fotopunkter, originalvisning, spørgsmål, egne svar og eksplicit bekræftelse/afvisning med revisionsspor. | Fagpersonen skal selv vurdere indholdet. Den aktuelle manuelle runde har ingen AI-vurderinger. |
| Screene beplantning | Faktisk geometri omkring vandløbet, 10/20 m buffer og fradrag/forbehold fra kilder. | Skitse med datamangler; ikke en færdig plantningsplan eller beregnet lokal miljøeffekt. |
| Dokumentere leverancen | Gemt rapportversion med PDF, manifest, CSV, GeoJSON og hashes i en ZIP-pakke. | Den kommunale rapport er stadig en kladde. Faglig og kommunal accept er ikke leveret af downloadknappen. |

Den konkrete rapportversion 2 viser seks fotos, nul gemte manuelle noter, nul billedvurderinger og nul gemte svarversioner. Den viser 13 daterede kilder, hvoraf 12 har delvist eller manglende datagrundlag, samt 21 opfølgningspunkter og 15 mangler før aflevering. Det er de viste tal i den genåbnede rapport, ikke generelle tal for alle sager. [K2]

Systemets værdi er derfor i dag mest **samling, sporbarhed og dokumentation**. Det kan endnu ikke generelt besvare: "Hvilket indgreb bør kommunen vælge, hvad bliver den lokale effekt, og er projektet fagligt godkendt?"

## 4. Den vigtigste blinde ende i staging

På sagen Bykær Bæk viser sidepanelet seks kontrollerede originaler, et gemt projektområde og kildeversion v2. Går brugeren til Gennemgang uden en valgt undersøgelse, står der:

> Vælg eller forbered en undersøgelse under Datagrundlag for at gennemgå fotopunkterne.

Der er samtidig en knap til at gå videre til beplantning. Der findes altså materiale, men brugeren skal selv forstå, at sagen ikke er det samme som den valgte undersøgelse. Åbnes den gemte undersøgelse eksplicit, vises alle seks fotopunkter. [K2, K3]

Det forklarer, hvorfor en bestået generalprøve godt kan sameksistere med en dårlig brugeroplevelse. Prøven ved, hvad den skal vælge. En ny bruger gør ikke.

Datagrundlag har desuden to oprettelsesveje: "Hent data og forbered undersøgelse" og "Hent og gem ny version". Den første opretter også en undersøgelsesrunde; den anden er en kildeversion. Begge er teknisk meningsfulde, men forskellen og konsekvensen er ikke tydelig nok. Tidligere undersøgelser ligger under en sammenklappet sektion. [K3]

## 5. Prioriteret fejlliste og produktmangler

P0 betyder stop for det aftalte demo-flow. P1 betyder blokering for en færdig kommunal selvbetjeningsversion. P2 betyder senere udbygning. Der er ikke påvist en ny P0-nedbrudsfunktion i den læsende kontrol; den fulde skriveprøve er ikke gentaget her.

| ID / prioritet | Fund og konsekvens | Belæg / accept af løsning |
|---|---|---|
| F01 / P1 | Indgangen forklarer ikke hurtigt nok værdien og næste handling. Brugeren møder en sagsoversigt frem for en tydelig opgave. | Staging og skærminventar. Ny bruger kan efter højst 10 sekunder forklare formål og vælge relevant start. |
| F02 / P1 | En sag med fotos og grundlag kan åbne en tom Gennemgang, fordi ingen undersøgelse er valgt. | Live reproduceret. Vis eksisterende undersøgelsesvalg og Fortsæt direkte; forklar kontekst uden at oprette dubletter. |
| F03 / P1 | Kildeoprettelse og undersøgelsesoprettelse konkurrerer i samme trin. | K3. Brugeren vælger bevidst mellem genoptagelse og en ny version; en kildeversion må ikke præsenteres som en færdig undersøgelse. |
| F04 / P1 | Fem eksisterende trin og en generel afleveringsadvarsel viser ikke klart, hvad der er færdigt, mangler eller kræver handling. Baseline har ikke sit eget trin. | K3. Seks trin, status fra de rigtige gemte data og en konkret næste handling. Besøg må ikke give godkendelsesstatus. |
| F05 / P1 | Mange kilde-/afleveringsmangler er forklaret, men ikke samlet som et tydeligt arbejdsforløb med ansvar, løsning eller accepteret forbehold. | Genåbnet rapport, K4. Hver mangel fører til et sted at rette, supplere eller dokumentere faglig accept. |
| F06 / P1 | Den kommunale rapport har ikke en afsluttende godkendelsestilstand: skemaet fastholder kladde og false for faglig/kommunal godkendelse. | K5. En særskilt, adgangsstyret godkendelsesproces skal knyttes til præcis version og input. Kan ikke løses alene med UI. |
| F07 / P1 | Faglig fotosignering findes, men er ikke det samme som samlet godkendelse af baseline, beplantning eller rapport. | K3, K5. Hver type accept skal have entydig betydning, ansvarlig og revisionsspor. |
| F08 / P1 | Før/Efter-runder og bindinger findes, men det samlede kommunale forløb med parrede fotos, sammenligning og genåbning er ikke dokumenteret som færdigt. | K6 og P0-scope. Afprøv en ægte Før/Efter-sag; målbare forskelle skal angive metode og usikkerhed. |
| F09 / P1 | Beplantning har fungerende geometri, men A-E er ikke godkendte delstrækningspolygoner. Hektar og lokal effekt er derfor ukendte. | K7. Tilføj kontrolleret afgrænsning og dækningsprøve før arealtal; bevar ukendt ved manglende grundlag. |
| F10 / P1 | Den automatiske billedanalyse har ikke dokumenteret nyttige fund på seksfotoprøven. Manuel tilstand er den fungerende leverancevej. | K1. Før AI frigives: repræsentativt billedsæt, fagligt mål for brugbarhed og kontrolleret fejlhåndtering. Skemagyldigt svar er utilstrækkeligt. |
| F11 / P1 | Regulativer, fuldt terrængrundlag og nogle øvrige kilder er ikke tilsluttet eller har begrænset dækning. | K4. Vis betydning for opgaven og en reel suppleringsvej; en tom kilde må ikke blokere alt ukritisk. |
| F12 / P1 | Faktiske kommunebrugeres adgang, faglig accept og drift er ikke dokumenteret afsluttet. Teknisk testkonto er ikke kundeaccept. | K1. Kommunens egen loginprøve, rolleprøver, navngiven ansvarlig og underskrevet accept af leverance/forbehold. |
| F13 / P1 før produktion | Backup/genopretning, fejlalarm, supportansvar og varig drift mangler afsluttende beviser i leverancegrundlaget. | K1. Gennemfør og dokumentér genopretning inkl. filer samt en kontrolleret alarm fra fejl til modtager. |
| F14 / P1 før bred frigivelse | 16 kald på seks skærmfiler viser succesbeskeder via `actionToast` uden at udføre den lovede overførsel, opgave eller eksport. | K8. Erstat hvert kald med en faktisk operation og genlæsning eller tydelig tilgængelighedsstatus. Skjult i Haderslev-demoen. |
| F15 / P1 før bred frigivelse | Organisationsindstillinger kan vise "Gemt", selv om ændringen kun ligger lokalt. Brugerinvitation lukker blot dialogen. Roller vises fra lokal matrix. | K9. Reelle handlinger med rettighedskontrol, fejl og genåbning. Demoens blokering skal bevares indtil da. |
| F16 / P1 før bred frigivelse | Sikkerhed, notifikationer og abonnement viser statiske data eller lokal state. Visning er ikke dokumentation for 2FA, nøglehåndtering eller en sendt alarm. | K9. Kontrollér faktisk backend-tilstand; implementér kun nødvendige administrationsopgaver først. |
| F17 / P2, P1 hvis vist som aktiv | Topbjælkens generelle søgning, datointerval, klokke og hjælp er ikke færdige arbejdsfunktioner. Søgning har ingen søgehandling; perioden påvirker kun lokal tekst. | K10. Tilslut handlinger og data eller vis klart afgrænset status. `showWorkspaceTools` styrer synlighed; ikke alle vises i demoen. |
| F18 / P1 før bred frigivelse | Beslutnings-, effekt-, ledger-, datakatalog- og publiceringsflader blander prototypeværdier med enkelte virkelige integrationer. Det giver et for stort produktløfte. | K11. Ens datakontrakt og sporbarhed pr. visning; ingen eksempel-KPI må fremstå som kundedata. |
| F19 / P2 | Bredere connector-/naturmoduler har uimplementerede eller beskyttede analysetrin. | K12. Genbrug reelle adaptere. Demonstrationsberegninger må ikke genbruges som dokumenterede resultater. |
| F20 / P1 | Der mangler ét aktuelt acceptregnskab. Ældre statusdokumenter og det nye demo-bevis beskriver forskellige tidspunkter og leverancer. | K1, K6. Ét versionsbundet statusdokument skal eje klar/ikke-klar, brugerprøver og beviser. |

## 6. Hele produktet: modenhed og placering

"Reel del" betyder, at kode eller aktuelle beviser viser en faktisk funktion. Det er ikke en samlet godkendelse af modulet. "Prototype" gælder de nævnte flader; det er ikke en påstand om, at al kode i modulet er ubrugelig.

| Område | Vurdering | Hvad der skal ske |
|---|---|---|
| Login, nulstilling, arbejdspladsvalg | Reelle auth-funktioner. Kundens egen onboarding ikke afsluttet. | Afprøv hele invitation-til-login-kæden med en rigtig kommunebruger. |
| Sager, projekter, geometri og adgang | Reel kerne med lagring og adgangskontrol. | Gør sag/undersøgelse/version forståelig; bevar og prøv redigering, historik og genåbning. |
| Droneupload og manuel verifikation | Reel og generalprøvet. Automatisk AI ikke kvalificeret. | Gør manuel proces færdig, tydelig og tilstrækkelig i sig selv. |
| Offentlig baseline og kildedækning | Reelle daterede data og gemte kildeversioner. Ujævn dækning. | Skeln mellem hentet, anvendeligt, verificeret og fagligt accepteret. |
| Beplantning og lavbund | Reel geometrisk screening og eksisterende beregningsværktøjer. Samlet faglig plantningsplan ikke færdig. | Bevar alle faktorer og parametre. Saml dokumentation og krav før lokale effektpåstande. |
| Kommunal sagsrapport | Reel versionering, PDF/ZIP og genåbning. Kladde frem for godkendt slutprodukt. | Afslut godkendelse og afleveringsstatus med versionsbinding. |
| Global rapportbygger, bibliotek, skabeloner og godkendelsesflade | Prototype-/eksempelvisninger er beskyttet af datatilstand; normal kundetilstand viser afgrænset rapportbesked. | Genbrug sagens virkelige rapportmotor, når et centralt bibliotek skal frigives. To konkurrerende rapportforløb bør undgås. |
| Overvågning/feltdata: enheder, kilder, upload, kvalitet og alarmer | Blandede, reelle services og ikke-afsluttede dele. Live/integrationssider viser afventende modul uden offline-demo. | Afprøv nødvendige sensor-/alarmfunktioner hver for sig. Succes-toast er ikke en integration. |
| Beslutninger: anbefalinger, risiko, scenarier, noter og assistent | Prototypeværdier og ufuldstændige tværmodulhandlinger. | Kræv sagsbaserede input og en gemt begrundet handling før frigivelse. |
| Effekt/portefølje/credits/organisationer | Omfattende prototypeflader og lokal interaktion. | Frigives efter et konkret kundebehov og eget acceptforløb; ikke krav for Haderslev-kernen. |
| Ledger: audit, CO2, CSRD, dokumenter, rapportering og kilder | Blandede flader: statiske KPI'er/gaps og nogle live aktivitetsdata. Sagens faktiske revisionsspor findes særskilt. | Bevar sagens reelle audit. Udbyg ikke brede ESG-løfter før datagrundlag og opgave er afklaret. |
| Byggeri og natur | Separate UI/services med reel databasekode og udviklingsdata. Ikke dokumenteret færdig kommunal kerne. | Eget scope og slut-til-slut-prøve før frigivelse. Ikke genimplementeres på baggrund af layout alene. |
| Datakatalog og offentlig effekt | Hardkodede katalogtal og publiceringsmetadata på de undersøgte flader. | Bind til faktiske kilder/publicering eller bevar som afgrænset prototype. |
| Organisation, brugere, roller, sikkerhed, alarmer, abonnement, moduler og frameworks | Mange lokale/statisk baserede administrationsflader. Underliggende adgangskontrol eksisterer særskilt. | Færdiggør medlemskab/adgang først. Betalingssystem og markedsmoduler er senere behov. |
| Systemtest, API og MCP | Tekniske grænseflader findes. Denne audit ændrer dem ikke og er ikke en fuld protokol-/sikkerhedsrevision. | Medtag relevante endpoints i releasekontrol; det er ikke almindelige brugertrin. |

Alle skærmes destinationer og eksisterende felter står i [REDESIGN_MAP.md](REDESIGN_MAP.md). Modenhedsopdelingen sletter ikke funktioner eller ændrer den oprindelige UI-afgrænsning.

## 7. Datamangler er ikke alle programmeringsfejl

Bykær-grundlaget indeholder bl.a. 143 matrikelgeometrier, 45 markblokke, otte skovgeometrier, 30 gyldige lavbundsgeometrier, 19 gyldige jordartspolygoner og 18 Sentinel-scener. Otte lavbunds- og én jordartspolygon blev frasorteret som ugyldige og registreret som mangler. Der findes et gemt Sentinel-preview, men global skyandel er ikke dokumentation for lokal skyfrihed. [K1, K4]

Der findes DMI-nedbør fra en målestation. Det er ikke lokal temperatur, vind eller en måling i selve vandløbet. DHM-filkatalog er ikke det samme som indlæste terrænhøjder. Regulativer og godkendte kommunale delstrækninger mangler. A-E-hektar er derfor korrekt ukendte, ikke nul. [K4, K7]

Der er tre forskellige løsninger: tilslut en manglende datakilde, indhent fagligt materiale/afgrænsning, eller dokumentér et accepteret forbehold. Et grønt ikon eller ændret ordlyd er ikke en løsning på de to første.

## 8. Hvad betyder "færdigt program"?

Første færdige produkt bør være: **En kommunal fagperson kan selv oprette eller genoptage en sag, samle Før/Efter-dokumentation, kontrollere grundlaget, registrere vurderinger, få en versionsbestemt faglig godkendelse og hente den aftalte rapport - med synlige begrænsninger og sikker adgang.**

Det kræver både en brugbar arbejdsgang, reelle gemme-/genåbningshandlinger, relevant fagligt indhold og driftsbeviser. Det kræver ikke, at betaling, credits, brede ESG-moduler og alle markedsprototyper bygges færdige før kommunen får værdi.

Den oprindelige UI-deadline 26.10 kl. 12 gælder ikke automatisk alle de nye funktionelle mangler. En samlet færdigdato kan ikke fastsættes ansvarligt ud fra antallet af eksisterende skærme. Udviklingsplanen opdeler derfor arbejdet i leverancer med afhængigheder og klare acceptprøver.

## 9. Kontrolstatus ved denne rapport

| Kontrol | Status og gyldighed |
|---|---|
| Basens tests kørt lokalt i denne opgave | 172 filer / 2.788 tests bestået, serielt. Gælder før UI-ændringer. |
| Dokumenteret generalprøve og CI | K1 angiver typekontrol, build, lint, 2.788 tests, 814 databaseassertions og 29 samtidighedsscenarier. Historisk releasebevis, ikke ny kørsel her. |
| Aktuel læsende stagingkontrol | Seks fotopunkter og eksisterende rapport åbnet; prototypeadgang blokeret; nul observerede browserfejl. Ingen sagsdata ændret. |
| Lokalt redesign | Ikke releasegodkendt. Målrettede tests er bestået efter rettelser; fuldt afsluttende build, samlet test, browserprøve og go/no-go mangler endnu. |
| Faglig/kommunal accept og produktion | Ikke dokumenteret opnået. Produktion er fortsat NO-GO efter K1. |

Der er ikke ændret motor, beregninger, database, Supabase, RLS eller API i denne audit. Der er ikke lagt en ny version online. Skærmbilleder fra staging ligger under [docs/screens](screens/README.md); originalfotos, legitimationsoplysninger og rapportindhold med private bilag ligger uden for Git.

## 10. Kilder og sporbarhed

Alle kodelinks nedenfor er fastlåst til basecommit. De dokumenterer den undersøgte version og må ikke forveksles med senere redesignkode.

- K1: [Tekniske kontrolbeviser 22.10](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/docs/HADERSLEV_KONTROL_2026-10-22.md). Generalprøve, release, rapporthashes, AI-resultater og åbne acceptkrav.
- K2: Læsende stagingkontrol 22.10.2026, eksisterende Bykær-sag og undersøgelsesversion 2. Sanitiseret kvittering: [audit-staging-2026-10-22.json](screens/audit-staging-2026-10-22.json). Private tekstudtræk og billeder er ikke vedlagt Git. [Skærmbilledindeks](screens/README.md).
- K3: [MunicipalCaseWorkspace](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/project/MunicipalCaseWorkspace.tsx), [DroneSurveyWorkspace](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/project/DroneSurveyWorkspace.tsx), [PublicBaselinePanel](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/project/PublicBaselinePanel.tsx).
- K4: [Kilder og faktiske begrænsninger](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/docs/HADERSLEV_KILDER_2710.md).
- K5: [Kommunalt rapportskema, linje 204-207](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/services/monitoring/municipal-report.ts#L204), [rapportlagring](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/services/monitoring/municipal-report-persistence.ts), [rapportpanel](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/reports/MunicipalReportPanel.tsx).
- K6: [Produktscope 27.08 - kun som kravgrundlag, ikke aktuel status](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/docs/PRODUCT_SCOPE.md), [SurveyRoundPanel](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/project/SurveyRoundPanel.tsx).
- K7: [Beplantning og A-E](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/docs/HADERSLEV_BEPLANTNING.md).
- K8: [actionToast](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/platform/Primitives.tsx), og kald i `app.connect.index`, `app.decisions.index`, `app.decisions.recommendations`, `app.impact.index`, `app.ledger.index`, `app.reports.index` under `src/routes/`.
- K9: [Organisationsindstillinger](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/routes/app.settings.index.tsx), [brugere](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/routes/app.settings.users.tsx), [roller](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/routes/app.settings.access.tsx), [sikkerhed](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/routes/app.settings.security.tsx), [indstillingsprimitiver](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/settings/Primitives.tsx).
- K10: [AppTopbar](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/AppTopbar.tsx), [ConnectTopbar](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/components/connect/ConnectTopbar.tsx).
- K11: [Beslutningsdata](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/lib/decisions-data.ts), [effektdata](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/lib/impact-data.ts), [ledger-overblik](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/routes/app.ledger.index.tsx), [datakatalog](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/routes/app.data.tsx), [offentlig effekt](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/routes/app.public-impact.tsx).
- K12: [Connectorservice](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/services/connector-service.ts), [biodiversitetsmotor med adgangsstop](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/services/nature/biodiversity-engine.ts), [datatilstand](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/lib/data-mode.ts), [kommunal routeafgrænsning](https://github.com/JESRI-C/freyra-hub/blob/625781906a4f49d120b6b3581261279dd889e6de/src/lib/demo-mode.ts).
