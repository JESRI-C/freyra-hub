# Din afprøvning før Haderslev-mødet

Målet er at finde både fejl og situationer, hvor programmet fungerer teknisk, men ikke giver dig et brugbart resultat. Din første test skal begynde, når den relevante arbejdsgang er frigivet i testmiljøet. Vi venter ikke på, at alle funktioner er færdige.

[Åbn din testsag: Brugertest Haderslev – 14. oktober 2026](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/ae3012ca-662e-4ae0-9f84-234d08428ec9). Den er oprettet gennem den almindelige formular med din eksisterende bruger. Den er tom og tydeligt syntetisk. Første trin er at vælge et testområde og en reference; der er endnu ikke valgt AOI/reference eller uploadet egne fotos i denne sag. Et testområde er ikke en godkendt kommunal delstrækning.

## Hvornår du tester hvad

| Runde | Indhold | Aktuel status 14. oktober | Mål for din test |
| --- | --- | --- | --- |
| A | Sagsområde, offentligt datagrundlag, plan og undersøgelsesrunder | Klar til din første afprøvning i den nye tomme testsag. Begynd med testområde/reference. Den tidligere syntetiske kæde er teknisk afprøvet. | 14.–16. oktober; første lille test 30–45 minutter |
| B | Egne dronebilleder, kobling til spørgsmål, dubletter og genoptagelse | Den tekniske draftbinding er nu udrullet i staging og bestod 68 kontroller med en syntetisk miniature. Din afprøvning med ét faktisk foto og derefter 10/120-batch mangler. | 19.–23. oktober, efter A og med egne originalfotos til rådighed |
| C | Observationer, faglig gennemgang, forståelig rapport og genåbning af afleveringsfiler | Noter er en uaccepteret kladde; rapportarbejdsfladen er reviewet og kopieret lokalt, men ikke udrullet. Faglig rapport og arkiverede afleveringsfiler er ikke klar til accept. | 26.–30. oktober, når observationer og rapport er klar til afprøvning |
| D | Hele forløbet igen med en ny sag og realistiske billeder | Slutprøve efter rettelser, med tid til en sidste rettelsesrunde før 10. november. | 2.–3. november; samlet prøve senest 3. november |

Datoerne er testmål, afhængige af de nævnte forudsætninger; de er ikke en påstand om, at rapportdelen allerede er klar. Første A-test kan begynde nu i den tomme testsag. Vi sigter mod rettelser og genprøve **5.–6. november** og en aftalt, frosset mødeversion **9. november** før mødet den 10. november.

Vi gennemgår resultaterne efter hver runde og retter fejl, før vi regner arbejdsgangen som færdig. Ændrede dele prøves igen. Den tekniske adgangs- og samtidighedstest fortsætter ved siden af din afprøvning.

## Scenarier

### A1 — En helt ny testsag

Brug den klargjorte testsag ovenfor og afgræns et aftalt testområde. Vælg vandløbsreference og periode, hent datagrundlaget, og opret en plan og en undersøgelsesrunde. En eventuel ekstra testsag oprettes særskilt under A3.

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

### C1 — En observation og en usikker vurdering

Når observationer er frigivet, besvar et spørgsmål ud fra et konkret billede. Prøv også en situation, hvor billedet ikke er godt nok til en konklusion.

**Det skal lykkes:** Du kan dokumentere både en observation og usikkerhed eller behov for besigtigelse. Det fremgår, hvem der har skrevet vurderingen, og hvilket billede, spørgsmål og datagrundlag den vedrører. Faglig godkendelse er et særskilt trin.

### C2 — En rapport, som kommunen skal kunne bruge

Gennemgå rapporten uden at få en mundtlig forklaring fra udvikleren.

**Det skal lykkes:** Du kan finde sagens afgrænsning, datagrundlagets datoer og mangler, underbyggede observationer, relevante fotos og foreslået opfølgning. Det er tydeligt, hvad der er gennemgået, af hvem, og hvad der stadig er usikkert. Ingen eksempelperson eller statisk vurdering fremstår som en faktisk godkendelse.

### C3 — Luk, genåbn og aflever

Hent rapport og bilag, luk siden, og hent den samme gemte rapportversion igen. Åbn PDF og relevante datafiler uden for programmet.

**Det skal lykkes:** De faktiske filer findes, kan åbnes og svarer til den valgte rapportversion. Kort, billeder, tekst, datoer og danske tegn er læselige. Et dokumentlink eller en metadatarække tæller ikke som en arkiveret PDF.

### D1 — En samlet prøve med en ny sag

Gennemfør forløbet fra en ny sag til en genåbnet afleveringspakke, efter de tidligere fejl er rettet. En selvstændig FØR-rapport testes først; en før/efter-sammenligning kræver faktiske, forskellige optagelser og sammenlignelig dokumentation.

**Det skal lykkes:** Du kan udføre forløbet uden udviklerhjælp og forklare kommunens modtager, hvad leverancen dokumenterer, og hvad den ikke kan konkludere.

## Sådan melder du et problem tilbage

Skriv eksempelvis: **B3 — jeg genindlæste under upload af 10 billeder. Jeg forventede at kunne fortsætte, men fire filer forsvandt fra listen. Sag: …**

Vi registrerer scenarie, handling, forventet resultat, faktisk resultat og konsekvens. Et skærmbillede kan hjælpe, når du selv vælger at dele det. Stopper fejlen arbejdet, giver den forkerte data eller en misvisende rapport, retter vi den før leveranceaccept. Rent kosmetiske forhold prioriteres efter de fejl, der påvirker resultatet.

Den konkrete kommunale strækning ved Bykær og den faglige godkender er stadig uafklaret. Vi afprøver programmet i tydeligt adskilte testsager, indtil scope er valgt.

[Det tekniske 68-checks bevis og dets afgrænsning](haderslev-audit/staging-round-media-checkpoint-2026-10-14.json). Faktisk brugeraccept med egne billeder registreres særskilt.
