# Arbejdsgang på computer og mobil

Brugerens seneste afgrænsning er hele forløbet på begge enheder: planlægning → tildeling → feltarbejde og billeder → gennemgang → rapport. En enklere mobilskærm alene opfylder ikke dette. Udgangspunktet for ændringen er `aa2b285365aa29c59fc3eb2455b2a426bac82251` på D02e-linjen. Arbejdet ligger på `codex/work-order-ux-v1` og bevarer den stablede leverance.

## Fund i den eksisterende kode

- Udførelsessiden monterede tre selvstændige paneler med hver sin opgavevælger. Et link fra Mine opgaver angav kun projektet, så brugeren skulle finde opgaven igen.
- Projektet har både den fulde fanenavigation og et separat guidet forløb. Et queryparameter vælger mellem de to. Det er stadig en åben del af oprydningen.
- Mine opgaver viste instruktion, status og logbog som flere udvidelige sektioner på hver listepost. Man manglede en tydelig overgang fra liste til én opgave.
- Foto-upload og offlinekø findes på projektniveau. En genvej fra en opgave giver ikke i sig selv en verificeret relation mellem foto og opgave. Den relation hører til D03.

## Fælles forløb og rækkefølge

| Del | Arbejde og ønsket adfærd | Aktuel evidens og rest |
| --- | --- | --- |
| Én valgt opgave | Opgavens identitet følger instruktion, plan, feltregistrering og faktisk udførelse. | Implementeret i `ProjectWorkOrdersWorkspace` og projektets to eksisterende indgange. `task` valideres i URLen. `work` er et indgangsvalg til plan/felt/udførelse; lokale visningsskift bevarer åbne kladder. |
| Liste → opgave | Mine opgaver viser et overskueligt udvalg; åbning viser instruktionen straks. | Implementeret. Liste og opgave bevarer kortets tilstand og et usikkert overtagelsesforsøg, når man går tilbage. En åben status-/notekladde låser skift og opdatering. |
| Planlæg og tildel | Ansvarlig, område, instruktion og modtagere samles i arbejdsgrundlaget. | Eksisterende plan-, adgangs- og tildelingsversioner genbruges. Ny oprettelse bruger en stabil klientgenereret opgave-ID ved genforsøg; recovery læser kun samme projekt, ID og oprindelige payload, uden upsert. Modtagerspecifik tildelingsindbakke er fortsat åben. |
| Fælles projektnavigation | Planlægning, dokumentation, faglig vurdering og rapport skal være lette at finde på begge enheder. Alle eksisterende kategorier og parametre skal kunne nås. | Fortsat åben: de to projektnavigationer skal samles omkring brugerens hensigt. Der er ikke fjernet ruter, kategorier eller felter i denne ændring. |
| Feltarbejde og fotos | Man åbner sin opgave, ser kravene, tager originalfotos og gemmer observationer også uden net. | Eksisterende kamera-/filvalg og lokal feltkø kan åbnes for projektet. D03 mangler den strukturerede, rettighedskontrollerede opgave-/observations-/originalrelation og den afgrænsede eksterne filvej. Linket hedder derfor **Tag fotos på projektet**. Det må ikke tælles som opgavedokumentation alene på grund af en titel, tag eller URL. |
| Gennemgang | Afleveringen fryser de konkrete skema-, plan-, udførelses- og filversioner. Reviewer godkender eller returnerer med begrundelse. | D05 er åben. Eksisterende operationel status/logbog genbruges; Afleveret/Godkendt/Returneret/Genåbnet bliver ikke aktiveret gennem en UI-genvej. Udført arbejde beviser ikke naturens effekt. |
| Rapport og aflevering | Samme versionsbundne grundlag følger rapport, originalpakke og manifest. | Eksisterende rapporter bevares. D07 mangler den komplette opgave-/afleveringsbinding og filpakke. D06-import må ikke blokere egne originaler. |
| Samlet accept | Samme projekt prøves fra planlægning på computer til feltarbejde, retursag og rapport. | D08 og fysisk telefonprøve er åbne. Den klikbare skitse med eksempeldata er afprøvet separat og er ikke runtime- eller pilotbevis. |

## Beskyttelse af igangværende arbejde

Opgavens tre visninger indlæses først ved åbning og forbliver derefter monteret. Visningsskift flytter derfor ikke brugerens kladde til en ny opgave og nulstiller ikke et genforsøg efter et mistet svar. Skift til en anden opgave er låst, mens et af panelerne har en kladde eller et igangværende kald. Kladder i jobkort kan nu fortrydes eksplicit. Gemte versioner bevares.

En midlertidig fejl i en tidligere kontrolleret adgangs-/opgaveliste skjuler arbejdsrummet og tilbyder nyt læseforsøg. Den samme aktørs monterede kladde bevares. Kontoskift eller projektskift opretter et nyt arbejdsrum. Ingen cache eller URL giver udvidede database- eller filrettigheder.

## Kontrolgrundlag

`ProjectWorkOrdersWorkspace.test.tsx` dækker præcis opgave, direkte udførelsesindgang, bevarede kladder mellem visninger, separate editorlåse, forkert projektlink, afvist adgang, fejl/genlæsning og oprettelse med stabil identitet. De eksisterende plan-, jobkort-, udførelses- og Mine opgaver-prøver dækker også de nye indgange. Servicetesten dækker, at oprettelses-recovery ikke overskriver eller accepterer en anden payload/projekt.

Der er ingen skemaændringer i denne pakke. De tidligere installerede migrationer ændres ikke. API-/databasebeviser fra D02e er fortsat historisk evidens for samme kontrakter, ikke bevis for det nye klikforløb.

Browserens tidligere adgangsafvisning gælder stadig, og Jesper afprøver appen selv. Der må ikke udledes mobil-, kamera-, HEIC-, offline-luk/genåbn- eller kundegodkendelse af typecheck, komponentprøver eller en staging-build. Denne fil lukker ingen af de 68 krav alene på baggrund af skitsen eller den nye komponentstruktur.
