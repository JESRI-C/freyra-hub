# Haderslev — status 14. oktober 2026

## Aktuelt rapport- og originalcheckpoint — 15. oktober 2026

**En samlet rapportkladde med PDF og bilag er nu i testmiljøet. Den endelige kommunale aflevering afventer fortsat afgrænsning og faglig godkendelse.** Rapportversionen fastholder kilder, plan, runde, originalhenvisninger, noter, billedforslag og svar. Nye svar giver en ny rapport; tidligere versioner kan genåbnes uændret. Rapport og levering har én samlet indgang.

**Aktuel PDF-eksportrelease (5):** kode `baaeb95ceeeb26c4e9c1f13c46021c693cf0e830`, Worker `b9a64de1-5059-4310-8c13-80b1f5d4908d`. [CI43](https://github.com/JESRI-C/freyra-hub/actions/runs/38810110355) består: **148 filer / 2484 tests**, typekontrol, build, faktorgrundlag og lint (0 fejl / 23 kendte advarsler); **12 SQL-filer / 762 kontroller**, **29 samtidighedsscenarier** og oprydning. Rapportmigration og faktisk stagingbuild/nøglescan er verificeret. Denne release retter PDF-layoutet.

**Realdatagrundlag og AI-genprøve (release 4):** kode `bcdb98f837bdea166f1c464d6cceb7a276ff223d`, Worker `9a345640-41ca-4e53-8867-2c9627dbe778`. De private pilot4-data genbruges uændret: samme tre originaler, baseline og det ene gyldige analyseresultat fra pilot3. PDF-eksporten under release 5 udløser ingen nye modelkald og ændrer ikke de gemte resultater.

**Teknisk syntetisk prøve:** 17 kontroller består med gemning/genforsøg, læsebrugerens genåbning, afvist forkert adgang og uændret tidligere rapport efter nye svar. **Særskilt realdataprøve:** 3 checksumkontrollerede Drive-originaler er ført gennem privat upload, stedkontrol, datagrundlag, runde og gemt rapport. 1 af 3 billedvurderinger indgår. Ingen faglige svar er opdigtet. Kameraposition og lokal optagedato er adskilt fra UTC og kommunalt godkendt delstrækning.

**Billed-AI før og efter formatrettelsen:** Før rettelsen var 1 af 3 fotos gyldigt behandlet. De 2 andre fotos gav tilsammen 4 mislykkede kald: 2 sikkert observerede `invalid_output`-fejl og 2 genforsøg med ubekræftet fejlkode. Den nye prøve genbruger samme private sag, 3 originaler, datagrundlag og det ene gyldige analyseresultat. Efter rettelsen blev der startet 2 nye kald (højst 2; tredje forsøg på de tidligere fejlede fotos): 0 nye gyldige resultater og 2 forsøg uden et gyldigt resultat, heraf 2 med ny serverbekræftet `invalid_output`. Resultatet er fortsat 1 af 3; formatrettelsen var ikke tilstrækkelig. Samlet indgår 1 af 3 billedvurderinger. Genforsøget er ikke dokumentation for generel driftssikkerhed eller faglig nøjagtighed.

**Faktisk PDF:** 7 sider med 3 illustrationer er genereret og visuelt gennemgået. Gentagen generering giver samme filhash. ZIP indeholder PDF, rapportgrundlag, fotoregister, kamerapositioner og filmanifest; CRC, størrelser, hashes og alle billedspørgsmål er kontrolleret. Dette er lokal/API-prøve, ikke accept af hosted browserdownload.

**Kilder:** DMI viser særskilt summen for præcist dækkede, kvalitetskontrollerede døgn; manglende randdøgn bliver ikke til en helperiodesum. Sentinel bevarer allerede hentede katalogscener ved senere hentefejl. Den nye pilots præcise kildestatusser og datoer står i beviset. Gamle kildeversioner bliver ikke omskrevet. Katalogscener er ikke analyserede satellitpixels; stationer er ikke lokale vandføringsmålinger.

**Prioriteret videre arbejde:** 1) **P0 før større billedbatches:** tilføj lukket og værdifri fejlkategorisering; justér derefter prompten med korrekt versionshistorik og gennemfør en særskilt afgrænset prøve. Den præcise afvisningsregel er endnu ukendt; schema og faglige kontroller bevares, og der foretages ikke flere blinde genforsøg; 2) egne UI-uploads og afbrudte 10/120-batches; 3) kommunens konkrete delstrækning/formål, regulativ og faglig godkender; 4) relevante kildehuller og feltverificering; 5) faglig gennemgang og accept af den genhentelige aflevering før 10. november. Fem brugerperspektiver er simuleret, men fem faktiske brugeraccepter mangler stadig.

[Afgrænset rapportbevis](haderslev-audit/staging-municipal-report-checkpoint-2026-10-15.json), SHA-256 `e4c1af660f3197233b5b4d8491a1ad20cfba30cfbdf61df837a84afa78f639e5`. Ældre afsnit nedenfor beskriver deres daterede versioner; tidligere beviser bevares.


## Opfølgning 15. oktober 2026 — automatisk lokalisering og billedspørgsmål

Arbejdsgangen er nu i testmiljøet: upload → serverkontrolleret GPS og vandløbsforslag → bekræft sted/dato → offentligt datagrundlag → gemt undersøgelse og præcise billedreferencer → billed-AI med den konkrete kildeversion → gemte svar og tekstkladde til rapportgrundlag.

**Release:** kode `e1fc83db2f4c7386245f8ffa8f72655322034269` på staging-Worker `0ac20aec-7540-4a54-a60a-3d3c595a732b`. [CI33](https://github.com/JESRI-C/freyra-hub/actions/runs/38705505371) består med **142 testfiler / 2378 tests**, typekontrol, faktorgrundlag, build og lint (0 fejl / 23 eksisterende advarsler). Databasen består med **11 SQL-filer / 675 kontroller**, **25 samtidighedsscenarier** og oprydning. Billed- og modelkompatibilitetsmigrationerne er anvendt i staging; faktisk bygning og nøglescan består.

**Faktiske stagingprøver:** **26 kontroller består** i kæden fra en tydeligt mærket syntetisk JPEG til gemt kildeversion, billedkladde og svar. GPS og optagetid aflæses uden browserfunktioner; denne BBOX-søgning har status complete og 0 nære kandidater. Gemma lykkes på forsøg 1; billedvurderingen har 0 foreslåede visuelle fund og fører sammen med kildekonteksten til 4 faste opfølgende spørgsmål. Gemte svar, læsebrugerens genåbning, afvist fremmed adgang og genforsøg uden ny analyse består. Historiske Qwen-resultater og svar kan genåbnes uden ommærkning eller nye versioner; gamle rækker i den afgrænsede inputgraf er bevaret.

En **særskilt positiv lokalisering med 16 kontroller består** med syntetisk tildelt GPS: registergeometrien findes, og kamera-til-vandløbsafstanden er 0 m. Den prøve kalder ikke billed-AI og er ikke en måling af en virkelig flyvnings nøjagtighed. Den vælger heller ikke kommunens delstrækning. Begge prøver er teknisk API-accept på samme release. Den normale brugers Undersøgelse- og Rapport og levering-faner samt synlig/aktiv uploadknap er læst i browseren på denne version; egne fotos, faktisk UI-upload og hosted tekstdownload er endnu ikke brugeraccepteret. [Afgrænset bevis](haderslev-audit/staging-drone-intake-checkpoint-2026-10-15.json), SHA-256 `43121842b451383d3e963aa7cf37fd8fbbd338738ac0f9f38a3a1fb1cde46c21`.

**Kildedækning er fortsat delvis:** officiel reference: komplet; regulativ: ikke tilsluttet; ortofoto/terræn: delvist; DMI: delvist; vandplan/natur: delvist; Sentinel: tidsgrænse; undersøgelsessteder: delvist; måleserier er ikke hentet. Tidsgrænser og mangler bevares i den gemte kildeversion og må ikke beskrives som fuld datadækning eller faglig accept. Satellitkataloger er ikke analyserede satellitpixels.

Der analyseres højst **12 fotos ad gangen** efter kildehentning og tilknytning. JPEG-originaler over 20 MB bevares og tilknyttes, men afventer billed-AI. Testdriftens grænser er 40 analyseforsøg pr. projekt / 200 samlet pr. døgn på tværs af modeller og 3 forsøg pr. præcist billede/model/prompt/metode/kildeversion. Genforsøg i samme model genbruger samme analyse; et modelskift får egne forsøgsnumre og ændrer ikke historiske resultater.

Tidligere Qwen-forsøg ramte tidsgrænser på 65 og 100 sekunder. Et særskilt genforsøg på den første release lykkedes; på en senere release blev svaret efter 64.392 ms afvist som `invalid_output`. Tokenudtømning og koldstart er ikke bevist. Den nye release bruger `@cf/google/gemma-4-26b-a4b-it`, konfigureret med thinking deaktiveret og en tidsgrænse på 100 sekunder. Minimerede fasetider indeholder ingen billeddata eller identifikatorer. Kamera-GPS og søgeområde er ikke et footprint eller en kommunalt godkendt delstrækning.

**Fortsat åbent:** egne optagelser og reel 10/120-batch, fem faktiske brugerafprøvninger, Bykærs delstrækning/formål, regulativ og faglig godkender samt en samlet godkendt kommunerapport/PDF og genhentelig afleveringspakke. Tekstgrundlaget er en kladde. Satellitkataloger er ikke analyserede satellitpixels eller dokumenteret naturtilstand. Tidligere daterede beviser nedenfor bevares på deres oprindelige versioner.

**En enklere arbejdsflade er lagt i testmiljøet. Hele leverancen til mødet 10. november er endnu ikke færdig.**

[Åbn Undersøgelse i din testsag](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/ae3012ca-662e-4ae0-9f84-234d08428ec9?tab=arbejde). Du bruger dit eksisterende login. Vælg Tilføj dronebilleder og upload først 1–3 originale JPEG-fotos på højst 20 MB hver. Bekræft derefter stedforslag og optagedato med Bekræft sted, hent data og tilknyt billeder. Ved manglende GPS vælges stedet på kortet. Et testområde udpeger ikke kommunens endelige delstrækning.

## Ændret efter gennemgang af fem brugerperspektiver

Droneoperatør, vandløbsfaglig medarbejder, kommunal sagsbehandler, projektleder og rapportmodtager er gennemgået som simulerede brugerrejser. Browsernavigation, kodegennemgang og tekniske tests er kombineret; der er endnu ikke gennemført interviews og accept med fem virkelige brugere. [Fund, prioritet og resterende accept for hver gruppe](HADERSLEV_BRUGERTEST.md).

- Projektet åbner nu i **Undersøgelse** med direkte droneupload. De øvrige værktøjer ligger samlet under Flere værktøjer og historik.
- Upload originalerne under **Tilføj dronebilleder**. Handlingen **Bekræft sted, hent data og tilknyt billeder** gemmer offentligt datagrundlag og en undersøgelsesrunde, tilknytter den bekræftede billedgruppe og starter højst 12 billedanalyser. Se kilde- og billedmangler, gennemgå spørgsmålene og gem dine svar; resultatet er fortsat en kladde.
- Flere kontrollerede originaler kan vælges og knyttes til en gemt undersøgelse samlet. Kort, reference, foto og manuel kladdenote er samlet i arbejdsområdet. Et enkelt faktisk spørgsmål kræver ikke et ekstra valg; den faglige vurdering skal stadig angives manuelt.
- **Rapport og levering** samler rapportoversigten og PDF-kladden. Valgt fane og præcis undersøgelse kan genåbnes via adressen. En kladde er tydeligt adskilt fra en færdig aflevering.
- En fejl, hvor koordinater kunne følge med fra et tidligere valgt foto, er rettet. Midlertidig genindlæsning af adgang vises ikke længere som bekræftet læseadgang.

## Det næste, der skal færdiggøres

1. **Rigtige billeder:** ét eget originalfoto, derefter 10 og 120 fotos med afbrydelse og genoptagelse. Billedvalg indlæses stadig i sider på 30; direkte valg af en konkret flyvning mangler.
2. **Relevant data og observationer:** afprøv automatiske stedforslag og billedkladder med egne originaler. De faste opfølgende spørgsmål afhænger af billed- og kildekonteksten. Lokal satellit-/pixelanalyse, fuld relevant kildedækning og faglig vurdering mangler stadig.
3. **Faglig gennemgang og brugbar rapport:** konkrete fund med foto og placering, kildedato, usikkerhed og underbygget opfølgning. Det delvise kildeinventar skal suppleres eller fremgå som mangler.
4. **Fast aflevering:** en godkendt, genhentelig PDF med tilhørende manifest, CSV og GeoJSON. Den nuværende PDF-kladde opfylder ikke dette krav.
5. **Pilot og samlet mødeprøve:** en reel sag fra start til genåbnede afleveringsfiler, med tid til rettelser før 10. november.

Bykær Bæk er én af flere cases. Konkret delstrækning, kommunens formål, regulativ og faglig godkender er stadig uafklaret; de omtalte 83 meter er ikke valgt. Kameraets GPS er ikke automatisk placeringen af et synligt fund.

## Historisk kontrol — 14. oktober 2026

CI26 består med 130 testfiler/2.111 tests, typekontrol, beregningskilder, build og lint uden fejl (23 eksisterende advarsler). Den isolerede databaseprøve består med 10 SQL-filer/601 kontroller og 25 samtidighedsscenarier samt oprydning. Stagingbuild og nøglescan består; de fire eksisterende hemmelige indstillingers navne er verificeret.

Den nye navigation, rapportindgang og uploaddialog er prøvet i browseren med den eksisterende syntetiske testsag. Der blev ikke uploadet nye billeder, valgt kommunal strækning eller gemt faglige registreringer under denne prøve. Egne fotos, storbatch og færdig kommunal aflevering er fortsat åbne accepter. Produktion og kundedata er ikke ændret.

[Nyt afgrænset bevis](haderslev-audit/staging-workflow-checkpoint-2026-10-14.json) · [CI26](https://github.com/JESRI-C/freyra-hub/actions/runs/38603055037) · [Brugertest](HADERSLEV_BRUGERTEST.md) · [Opgaveliste](HADERSLEV_OPGAVER.md) · [Plan](HADERSLEV_PLAN_2026-11-10.md).

De tidligere 40/81/68/67-kontroller bevares som daterede beviser på deres oprindelige versioner. De er ikke genmærket som nye tests af arbejdsfladen. [Historisk notebevis](haderslev-audit/staging-round-note-checkpoint-2026-10-14.json).
