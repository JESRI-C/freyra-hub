# Mobil feltadgang og offlinekø

Pakke D tilføjer `/felt` og en synlig indgang fra sagens fire feltgenveje. Den samme sag, bruger og skabelonversion bruges i dashboard og feltadgang. Denne klient ændrer ingen databasetabeller. Den bygger på de allerede installerede jobkort og serverkontrollerede fotokvitteringer.

## Brug på telefonen

1. Log ind i testappen med net. Åbn en sag og vælg **Gem feltarbejdet på telefonen til offlinebrug**.
2. Tryk **Klargør sagen til offlinebrug**. Vent på bekræftelsen om både sag og programfiler. Bogmærk feltsiden.
3. Slå flytilstand til. Tag et foto eller vælg originalfotos. Vent på beskeden om lokal lagring. Udfyld et eksisterende jobkort, skriv begrundelsen, og gem på telefonen.
4. Luk fanen og genåbn bogmærket uden net. Kontrollér opgaven og køen. Dette trin skal efterprøves på både iPhone og Android, før offlineadgangen accepteres som driftsklar.
5. Slå net til, og behold feltsiden åben med samme brugers aktive login. Køen fortsætter automatisk. Log om nødvendigt ind igen gennem dashboardet. Originalen frigives kun lokalt efter en matchende serverkontrol.

En lukket eller suspenderet browser lover ikke baggrundsupload. Køen er gemt til næste åbning. Sletning af browserdata, privat tilstand, lagerpres og browserens egen oprydning kan fjerne lokalt indhold. Bevar originalerne uden for browseren indtil kvittering. Ingen lokal prøve erstatter den fysiske telefonprøve.

## Data og konfliktadfærd

- IndexedDB gemmer oprindelig Blob, filnavn, type, størrelse, tidspunkt, SHA-256, tilgængelig EXIF/GPS og den faste uploadidentitet. Originalen komprimeres ikke. Manglende GPS vises som manglende; koordinater opfindes ikke.
- Fotos har et fælles loft på 2 GiB usendte originaler på enheden, højst 50 MiB pr. original og kontrol af browserens oplyste frie plads. En atomisk transaktion gemmer metadata, original og forbrug samlet. En fejl giver ingen gemmebekræftelse. Afviste kamerafiler bevares i den åbne side med download og genforsøg; de er først varigt gemt efter lokal commit. Navigation og sagsskift blokeres, indtil de er gemt eller brugeren udtrykkeligt rydder valget efter at have gemt originalerne andetsteds.
- Kølister læser metadata uden at indlæse alle fotofiler. Filer behandles sekventielt. Lokal lease og fornyelse forhindrer normalt samtidige overførsler i flere faner; serverens eksisterende idempotens er den endelige sikring mod dubletter.
- Uploadidentitet og payload ændres ikke ved genforsøg. En mistet serverrespons kan derfor undersøges og gentages med samme objektbinding. Filens lokale checksum kontrolleres igen før overførsel. Kun matchende, verificeret modtagelse frigiver Blob og lokalt byteforbrug i én transaktion.
- Jobkort låses til den gemte skabelonversion og den forventede serverversion. Flere lokale registreringer får en afhængighedskæde. Serverkonflikter bevarer kladden og gør afhængige registreringer synlige til gennemgang. Andre fotos og opgaver fortsætter.
- Efter opdatering af sagen vises serverversionen. En bevaret konflikt kan sammenlignes og bevidst genbruges som ny kladde, hvis skabelonen stadig matcher. Der foretages ingen skjult overskrivning eller automatisk sammenfletning.
- Begrænsede genforsøg med stigende ventetid stopper efter fem forsøg. Brugeren kan prøve samme registrering igen eller hente original/registrering. Konflikter nulstilles ikke automatisk.

## Adgang og programfiler

Offlineadgang bruger en lokal bruger-ID som enhedens oplåsning. Det er ikke en serverrettighed eller en ekstra loginmetode. Lokal dataisolering er ikke kryptering eller beskyttelse mod en person med adgang til browserprofilen. Eksplicit logout/lås fjerner oplåsningen, men bevarer usendte data for den oprindelige bruger. Brugerskift stopper overførsel. Ny afsendelse kræver frisk bruger- og projektrettighedskontrol; hver API-anmodning får kun token til den oprindelige bruger. Serverkontrollen af fotoet binder også den forventede bruger.

En service worker med scope `/felt` gemmer en neutral HTML-side og en tilladt liste med byggede JS-/CSS-/fontfiler. Installationen kræver succesfulde svar og de rette indholdstyper for alle filer. Klargøring venter på aktivering og en cachekontrol. CacheStorage gemmer ingen API-svar, tokens, Storage-links eller projektdokumenter. Opgavepakkerne ligger separat i IndexedDB under bruger og sag. Browserens ønske om vedvarende lager er et ønske, ikke en bevaringsgaranti.

Grundlag: [MDN om service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [lagerkvoter og oprydning](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) samt [Supabases token-callback](https://supabase.com/docs/guides/auth/jwts).

## Teknisk kontrol og udeståender

Målrettede prøver dækker genåbning, brugerisolering, atomisk pladsbudget på tværs af forbindelser, kvotefejl, lease-overtagelse, forkerte kvitteringer, bevaret original, mistet serversvar, tilbagekaldt adgang, brugerskift, lokal filkorruption, tidsbegrænset autorisation, jobkortafhængigheder og konflikter samt cachegrænser og fejlagtige HTML-svar på en JS-sti. UI-prøver kontrollerer gemmebekræftelse efter lokal commit og bevaret formular ved pladsmangel.

Aktuel build, revision, CI og stagingudgivelse registreres i [stagingkvitteringen](field-staging-delivery.json). Fysisk iPhone/Android, HEIC, kamera/GPS, offlinegenstart og faktisk hosted TUS/serverfunktion står åbne. Browserens adgangskontrol afviste tidligere både testadressen og lokal kodevisning; brugeren har valgt selv at prøve. Ingen afvisning omgås.

Pakke E's belastningsprøve med 200 fotos pr. sag og samlet 1.000 pr. dag er ikke leveret af D. Automatisk preview-worker er fortsat slukket. Artsvurdering, sensorer, fuld filgendannelse og faglig godkendelse har deres egne åbne pakker. Produktion er ikke ændret.
