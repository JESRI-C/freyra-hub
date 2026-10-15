# Din afprøvning før Haderslev-mødet

## Opfølgning 15. oktober 2026 — automatisk lokalisering og billedspørgsmål

Arbejdsgangen er nu i testmiljøet: upload → serverkontrolleret GPS og vandløbsforslag → bekræft sted/dato → offentligt datagrundlag → gemt undersøgelse og præcise billedreferencer → billed-AI med den konkrete kildeversion → gemte svar og tekstkladde til rapportgrundlag.

**Release:** kode `e1fc83db2f4c7386245f8ffa8f72655322034269` på staging-Worker `0ac20aec-7540-4a54-a60a-3d3c595a732b`. [CI33](https://github.com/JESRI-C/freyra-hub/actions/runs/38705505371) består med **142 testfiler / 2378 tests**, typekontrol, faktorgrundlag, build og lint (0 fejl / 23 eksisterende advarsler). Databasen består med **11 SQL-filer / 675 kontroller**, **25 samtidighedsscenarier** og oprydning. Billed- og modelkompatibilitetsmigrationerne er anvendt i staging; faktisk bygning og nøglescan består.

**Faktiske stagingprøver:** **26 kontroller består** i kæden fra en tydeligt mærket syntetisk JPEG til gemt kildeversion, billedkladde og svar. GPS og optagetid aflæses uden browserfunktioner; denne BBOX-søgning har status complete og 0 nære kandidater. Gemma lykkes på forsøg 1; billedvurderingen har 0 foreslåede visuelle fund og fører sammen med kildekonteksten til 4 faste opfølgende spørgsmål. Gemte svar, læsebrugerens genåbning, afvist fremmed adgang og genforsøg uden ny analyse består. Historiske Qwen-resultater og svar kan genåbnes uden ommærkning eller nye versioner; gamle rækker i den afgrænsede inputgraf er bevaret.

En **særskilt positiv lokalisering med 16 kontroller består** med syntetisk tildelt GPS: registergeometrien findes, og kamera-til-vandløbsafstanden er 0 m. Den prøve kalder ikke billed-AI og er ikke en måling af en virkelig flyvnings nøjagtighed. Den vælger heller ikke kommunens delstrækning. Begge prøver er teknisk API-accept på samme release. Den normale brugers Undersøgelse- og Rapport og levering-faner samt synlig/aktiv uploadknap er læst i browseren på denne version; egne fotos, faktisk UI-upload og hosted tekstdownload er endnu ikke brugeraccepteret. [Afgrænset bevis](haderslev-audit/staging-drone-intake-checkpoint-2026-10-15.json), SHA-256 `43121842b451383d3e963aa7cf37fd8fbbd338738ac0f9f38a3a1fb1cde46c21`.

**Kildedækning er fortsat delvis:** officiel reference: komplet; regulativ: ikke tilsluttet; ortofoto/terræn: delvist; DMI: delvist; vandplan/natur: delvist; Sentinel: tidsgrænse; måledata: delvist. Tidsgrænser og mangler bevares i den gemte kildeversion og må ikke beskrives som fuld datadækning eller faglig accept. Satellitkataloger er ikke analyserede satellitpixels.

Der analyseres højst **12 fotos ad gangen** efter kildehentning og tilknytning. JPEG-originaler over 20 MB bevares og tilknyttes, men afventer billed-AI. Testdriftens grænser er 40 analyseforsøg pr. projekt / 200 samlet pr. døgn på tværs af modeller og 3 forsøg pr. præcist billede/model/prompt/metode/kildeversion. Genforsøg i samme model genbruger samme analyse; et modelskift får egne forsøgsnumre og ændrer ikke historiske resultater.

Tidligere Qwen-forsøg ramte tidsgrænser på 65 og 100 sekunder. Et særskilt genforsøg på den første release lykkedes; på en senere release blev svaret efter 64.392 ms afvist som `invalid_output`. Tokenudtømning og koldstart er ikke bevist. Den nye release bruger `@cf/google/gemma-4-26b-a4b-it`, konfigureret med thinking deaktiveret og en tidsgrænse på 100 sekunder. Minimerede fasetider indeholder ingen billeddata eller identifikatorer. Kamera-GPS og søgeområde er ikke et footprint eller en kommunalt godkendt delstrækning.

**Fortsat åbent:** egne optagelser og reel 10/120-batch, fem faktiske brugerafprøvninger, Bykærs delstrækning/formål, regulativ og faglig godkender samt en samlet godkendt kommunerapport/PDF og genhentelig afleveringspakke. Tekstgrundlaget er en kladde. Satellitkataloger er ikke analyserede satellitpixels eller dokumenteret naturtilstand. Tidligere daterede beviser nedenfor bevares på deres oprindelige versioner.


## Fem brugerperspektiver — gennemgang 14. oktober

Gennemgangen kombinerer konkrete browseropgaver i den eksisterende syntetiske testsag med gennemgang af kode og isolerede tests af rettelserne. Det er simulerede brugerperspektiver med den eksisterende bruger, ikke interviews med fem personer eller fem nye loginroller. Den konkrete kommunale strækning er ikke valgt ved testen.

Browserfundene i tabellen gælder versionen før rettelserne. Den nye navigation, rapportindgang og uploaddialog er efterfølgende browserafprøvet i testmiljøet. Arbejdsgangen er endnu ikke accepteret med egne fotos eller en reel 120-billedbatch.

| Brugergruppe | Opgave og faktisk fund | Prioritet og rettelse | Resterende accept |
| --- | --- | --- | --- |
| Droneoperatør / feltmedarbejder | Fra projektets startside ligger upload under en af 13 ligeværdige faner. Dronebatch findes særskilt under Overblik/Medier/Uploadcenter; enkeltfilformularen viser flere metadatafelter og en Rapportklar-knap. Kodegennemgangen fandt desuden, at et foto uden GPS kunne overtage tidligere valgte koordinater. | P0: direkte droneupload i Undersøgelse, flere fotos kan tilknyttes i samme handling, og koordinater ryddes ved fil-/sagsskift. Nye uploads afventer gennemgang. | Ét eget originalfoto, derefter 10 og 120 fotos, herunder afbrudt upload. Ingen reel batch er godkendt af denne gennemgang. |
| Vandløbsfaglig medarbejder | Stedvalg er en særskilt side. En faktisk søgning finder Bykær Bæk, men resultatet angiver ingen kommune. Datagrundlag, spørgsmål, runde, foto og note er adskilte trin. Den nuværende plan danner højst ét regelbaseret referencespørgsmål; billed-AI og satellitfortolkning findes ikke i kæden. | P0: ét eksplicit klik forbereder datagrundlag, faktisk genererede spørgsmål og FØR-runde; gemt kort, reference, originalfoto og manuel note samles på arbejdsfladen. Når præcis ét reelt spørgsmål findes, vælges det automatisk, mens vurderingen skal angives manuelt. | Aftalt undersøgelsesområde, relevante data og regulativ, faglig fortolkning og godkender. Kamera-GPS er ikke et georefereret fund. |
| Kommunal sagsbehandler | Rapportfanen viser kladde og manglende review; der findes ingen samlet godkendt kommunal leverance. Indikatorer og antal registreringer kan ikke dokumentere faglig rapportparathed. | P0: Rapport og levering samler den eksisterende oversigt og PDF-kladden med tydelig mangelstatus. Næste-handlingsforslag må ikke konkludere Rapportklar ud fra gamle flag eller simulerede sensorer. | Sammenhængende FØR-rapport med daterede kilder, fotonoter, usikkerhed, underbygget prioritering og faglig godkendelse. |
| Projektleder / koordinator | En faktisk genindlæsning fra Dokumentation vender tilbage til Grundlag. Den valgte opgave er ikke bevaret i adressen. | P0: fane og præcis undersøgelsesversion bevares i URL. Afbrudt forberedelse og fototilknytning bevarer samme anmodnings-ID'er; genåbning foretager kun læsning. Aktuelt bruger-/sagsskift stopper det gamle forløb. | Reel afbrydelse og genoptagelse i browser med egne fotos samt godkendt statusoversigt for en hel sag. |
| Rapportmodtager / kommunal leder | PDF-knappen findes under Dokumentation, mens rapportregistreringerne ligger under Rapporter. Testsagen havde ingen rapportregistreringer; fast, godkendt aflevering er endnu ikke implementeret og afprøvet. | P0: én indgang til Rapport og levering; PDF-knappen er tydeligt en projektkladde. Det globale rapportcenter åbner den rigtige projektfane. | Faktisk gemt og genhentet PDF/manifest/CSV/GeoJSON, forståeligt indhold og accept hos en virkelig modtager. |

**Arbejdsgangen prioriteres nu sådan:** (1) kort vej fra billeder til en gemt undersøgelse, (2) relevant datagrundlag og forståelige observationer, (3) faglig gennemgang og brugbar rapport, (4) låst afleveringspakke, (5) reel pilot og genprøve før mødet. En pæn formular eller en bestået teknisk test erstatter ikke disse leverancer.

Ved gennemgangen 14. oktober samlede arbejdsgangen eksisterende funktioner. Automatisk stedforslag fra billeder, faktisk satellit-/billedanalyse og adaptive AI-spørgsmål var på det tidspunkt særskilte udviklingsopgaver og var ikke accepteret som fungerende. Det aktuelle tekniske checkpoint 15. oktober står ovenfor. Den eksisterende tomme testsag bruges kun til navigation og læsning under browsergennemgangen; der blev ikke valgt strækning, uploadet nye filer eller ændret kundenoter. Prøven fandt også en midlertidig, misvisende læseadgangsbesked; den er rettet med en målrettet regression. Uploaddialogens tekniske introduktion er forkortet, og rapportens gamle henvisning til Grundlag peger nu på Undersøgelse. Områdevalg og valg af en faktisk flyvning skal fortsat forenkles.

Målet er at finde både fejl og situationer, hvor programmet fungerer teknisk, men ikke giver dig et brugbart resultat. Din første test skal begynde, når den relevante arbejdsgang er frigivet i testmiljøet. Vi venter ikke på, at alle funktioner er færdige.

[Åbn din testsag: Brugertest Haderslev – 14. oktober 2026](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/ae3012ca-662e-4ae0-9f84-234d08428ec9). Den er oprettet gennem den almindelige formular med din eksisterende bruger. Den er tom og tydeligt syntetisk. Første trin er nu Tilføj dronebilleder: upload 1–3 originale JPEG-fotos på højst 20 MB hver, gennemgå stedforslag og optagedato, og vælg Bekræft sted, hent data og tilknyt billeder. Ved manglende GPS vælges stedet på kortet. Derefter hentes kilderne, billederne tilknyttes, og billed-AI giver kladdefund og faste opfølgende spørgsmål, som du gennemgår og besvarer. Egne fotos og dette UI-forløb er endnu ikke brugeraccepteret. Et testområde er ikke en godkendt kommunal delstrækning.

## Historisk testplan fra 14. oktober — runder og mål

| Runde | Indhold | Aktuel status 14. oktober | Mål for din test |
| --- | --- | --- | --- |
| A | Sagsområde, offentligt datagrundlag, plan og undersøgelsesrunder | Klar til din første afprøvning i den nye tomme testsag. Begynd med testområde/reference. Den tidligere syntetiske kæde er teknisk afprøvet. | 14.–16. oktober; første lille test 30–45 minutter |
| B | Egne dronebilleder, kobling til spørgsmål, dubletter og genoptagelse | Den tekniske draftbinding er nu udrullet i staging og bestod 68 kontroller med en syntetisk miniature. Din afprøvning med ét faktisk foto og derefter 10/120-batch mangler. | 19.–23. oktober, efter A og med egne originalfotos til rådighed |
| C | Manuelle kladdenoter, faglig gennemgang, forståelig rapport og genåbning af afleveringsfiler | Noter er teknisk API-afprøvet i en særskilt syntetisk sag. Din noteformular med egne fotos er endnu ikke afprøvet; fagligt review, færdig rapport og arkiv er stadig åbne. | 26.–30. oktober, når den relevante del er klar til afprøvning |
| D | Hele forløbet igen med en ny sag og realistiske billeder | Slutprøve efter rettelser, med tid til en sidste rettelsesrunde før 10. november. | 2.–3. november; samlet prøve senest 3. november |

Datoerne er testmål, afhængige af de nævnte forudsætninger; de er ikke en påstand om, at rapportdelen allerede er klar. Første A-test kan begynde nu i den tomme testsag. Vi sigter mod rettelser og genprøve **5.–6. november** og en aftalt, frosset mødeversion **9. november** før mødet den 10. november.

Vi gennemgår resultaterne efter hver runde og retter fejl, før vi regner arbejdsgangen som færdig. Ændrede dele prøves igen. Den tekniske adgangs- og samtidighedstest fortsætter ved siden af din afprøvning.

## Historiske scenarier fra planen 14. oktober

### A1 — En helt ny testsag

Brug den klargjorte testsag ovenfor og afgræns et aftalt testområde. Vælg vandløbsreference og periode. Tryk Hent data og forbered undersøgelse; programmet gemmer datagrundlag, de faktisk genererede spørgsmål og en FØR-runde. En eventuel ekstra testsag oprettes særskilt under A3.

**Det skal lykkes:** Du kan forstå, hvilke oplysninger programmet har hentet, hvorfra og for hvilken periode. Du kan se, hvad der mangler, og genåbne de samme gemte versioner. Et testområde ved Bykær må ikke forveksles med en valgt kommunal delstrækning.

### A2 — Ufuldstændige kilder

Gennemgå en sag, hvor regulativ eller måledata mangler, eller en kilde kun dækker en del af perioden.

**Det skal lykkes:** Mangler står tydeligt. Ukendt fremstår ikke som nul, og et generisk undersøgelsessted fremstår ikke som en verificeret målestation. Programmet giver ikke en sikker konklusion alene, fordi et katalogsvar er hentet.

### A3 — To sager og flere gemte versioner

Skift mellem to testsager og mellem deres gemte datagrundlag, planer og runder. Genindlæs siden undervejs.

**Det skal lykkes:** Du kan altid se, hvilken sag og version du arbejder i. Indhold fra den anden sag vises ikke som det valgte input. Tidligere versioner ændres ikke, når du opretter nye.

### B1 — Ét rigtigt dronebillede

Når runde A er gennemgået, brug ét originalt billede fra en af jeres flyvninger i testsagen. Upload det, vælg den rigtige gemte runde, og knyt det til et konkret spørgsmål. Den udrullede binding genbruger en original i forskellige runder; den gør ikke billedet til en fagligt godkendt observation. Meld en eventuel blokering, før du går videre til batchtesten.

**Det skal lykkes:** Originalen kan genåbnes. Filnavn, status og faktisk tilgængelige optageoplysninger er forståelige. Ukendt tidspunkt eller manglende GPS markeres som ukendt. Kameraets position er ikke automatisk det sted, hvor et fund ligger.

### B2 — Først 10, derefter 120 billeder

Lav en lille batch, kontrollér resultatet, og prøv derefter en realistisk større batch, når den lille er bestået.

**Det skal lykkes:** Du kan følge den enkelte fils status, se eventuelle fejl og finde billederne igen i den rette sag og runde. Billeder bliver ikke fagligt godkendt alene ved upload. Den store batch vurderes med rigtige billeder; en teknisk miniature er ikke tilstrækkelig brugeraccept.

### B3 — Afbrudt upload og genoptagelse

Afbryd eller genindlæs en uploadende testside, og vend tilbage til samme sag. Gennemfør også et forsøg, hvor forbindelsen kortvarigt er væk.

**Det skal lykkes:** Du får en forståelig status og kan fortsætte eller gentage sikkert. En gentagelse opretter ikke skjulte ekstra sager, runder eller fejlagtige dubletregistreringer. En fejl må ikke vises som en gennemført upload.

### B4 — Dubletter og forkerte filer

Prøv samme billede igen, et billede med manglende optageoplysninger og en filtype, uploaden ikke understøtter.

**Det skal lykkes:** Dubletter behandles forståeligt, og den oprindelige dokumentation bevares. Uunderstøttede eller beskadigede filer afvises med en brugbar besked. Manglende oplysninger bliver ikke opfundet. Testfilerne ændrer ikke eksisterende kundesager.

### C1 — En manuel kladdenote og en usikker vurdering

Manuelle kladdenoter er teknisk afprøvet med to syntetiske API-noter. Når din testsag har en gemt runde, et originalfoto og en billedbinding, afprøv selve formularen: besvar referencespørgsmålet manuelt og beskriv usikkerhed og foreslået opfølgning. Prøv også en situation, hvor billedet ikke giver en konklusion. Denne brugerafprøvning med egne fotos er endnu ikke gennemført.

**Det skal lykkes:** Du kan gemme og genåbne en manuel kladdenote med usikkerhed eller behov for besigtigelse. Det fremgår, hvem der skrev den, og hvilket gemt billede, spørgsmål og datagrundlag den vedrører. Noten giver ingen automatisk billedfortolkning eller fagligt godkendt observation; faglig godkendelse er stadig et særskilt, ufærdigt trin.

### C2 — En rapport, som kommunen skal kunne bruge

Når den faktiske rapport og det faglige review er klar, gennemgå rapporten uden en mundtlig forklaring fra udvikleren. Den nuværende rapportarbejdsflade er et udkast; C2 er endnu ikke accepteret.

**Det skal lykkes:** Du kan finde sagens afgrænsning, datagrundlagets datoer og mangler, underbyggede observationer, relevante fotos og foreslået opfølgning. Det er tydeligt, hvad der er gennemgået, af hvem, og hvad der stadig er usikkert. Ingen eksempelperson eller statisk vurdering fremstår som en faktisk godkendelse.

### C3 — Luk, genåbn og aflever

Når faktisk lagrede afleveringsfiler er klar, hent rapport og bilag, luk siden, og hent den samme gemte rapportversion igen. Åbn PDF og relevante datafiler uden for programmet. Hosted PDF-download og arkiv er endnu ikke accepteret; C3 afventer denne funktion.

**Det skal lykkes:** De faktiske filer findes, kan åbnes og svarer til den valgte rapportversion. Kort, billeder, tekst, datoer og danske tegn er læselige. Et dokumentlink eller en metadatarække tæller ikke som en arkiveret PDF.

### D1 — En samlet prøve med en ny sag

Gennemfør forløbet fra en ny sag til en genåbnet afleveringspakke, efter de tidligere fejl er rettet. En selvstændig FØR-rapport testes først; en før/efter-sammenligning kræver faktiske, forskellige optagelser og sammenlignelig dokumentation.

**Det skal lykkes:** Du kan udføre forløbet uden udviklerhjælp og forklare kommunens modtager, hvad leverancen dokumenterer, og hvad den ikke kan konkludere.

## Sådan melder du et problem tilbage

Skriv eksempelvis: **B3 — jeg genindlæste under upload af 10 billeder. Jeg forventede at kunne fortsætte, men fire filer forsvandt fra listen. Sag: …**

Vi registrerer scenarie, handling, forventet resultat, faktisk resultat og konsekvens. Et skærmbillede kan hjælpe, når du selv vælger at dele det. Stopper fejlen arbejdet, giver den forkerte data eller en misvisende rapport, retter vi den før leveranceaccept. Rent kosmetiske forhold prioriteres efter de fejl, der påvirker resultatet.

Den konkrete kommunale strækning ved Bykær og den faglige godkender er stadig uafklaret. Vi afprøver programmet i tydeligt adskilte testsager, indtil scope er valgt.

[Det tekniske 68-checks bevis og dets afgrænsning](haderslev-audit/staging-round-media-checkpoint-2026-10-14.json). Faktisk brugeraccept med egne billeder registreres særskilt.

[Teknisk afprøvning af de manuelle kladdenoter](haderslev-audit/staging-round-note-checkpoint-2026-10-14.json). API-test er ikke brugeraccept af formularen eller faglig godkendelse.
