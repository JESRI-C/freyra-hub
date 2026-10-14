# Haderslev — status 14. oktober 2026

**Du kan begynde at afprøve programmet i en særskilt testsag. Hele leverancen til mødet 10. november er endnu ikke færdig.**

[Åbn Brugertest Haderslev – 14. oktober 2026](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/ae3012ca-662e-4ae0-9f84-234d08428ec9). Sagen er oprettet med din eksisterende bruger gennem den almindelige projektformular. Den er tom og tydeligt mærket som test. Vælg først et testområde og en vandløbsreference; der er endnu ikke valgt område eller egne fotos. Følg [brugertesten](HADERSLEV_BRUGERTEST.md).

## Det virker nu i testmiljøet

- Offentligt datagrundlag, plan og før-/kontrolrunder kan gemmes som bestemte versioner. De tidligere 40 og 81 kontroller er bevarede beviser på den daværende version.
- En privat original kan nu knyttes til den præcise gemte runde og dens spørgsmål. Samme original kan bruges i en anden runde uden en ny filkopi.
- Den nye mediekæde bestod 68 kontroller i det kørende testmiljø, blandt andet gentagne gemninger, genåbning, privat hentning og afvist adgang. Kun to draftbindinger blev oprettet; gamle data blev bevaret.
- Den aktuelle version har bestået 1.812 apptests, 534 databasekontroller og 18 samtidighedscases. Optimeringen af gentagen datakontrol er med i denne version; ingen påstand om varig hastighed eller tilgængelighed følger af testen.

Medietesten brugte en eksisterende syntetisk fil på 137 bytes. Dine egne fotos og en rigtig 10/120-billedbatch er endnu ikke accepteret.

## Næste arbejde

1. **Din afprøvning:** vælg testområde/reference, gennemgå datagrundlag og runder, og prøv derefter ét eget originalfoto før en større batch. Notér også, når resultatet er svært at bruge.
2. **Observationer og faglig gennemgang:** gem, hvad et konkret billede viser, usikkerhed og behov for kontrol på stedet. Notedelen er endnu en kladde. M1 er samlet lokalt efter review; de fulde kontroller kører, mens SQL-, 25-samtidigheds- og hostedaccept afventer.
3. **Brugbar rapport og aflevering:** rapportarbejdsfladen er nu opdateret i testsystemet og viser tydelig kladdestatus, ukendt periode og manglende faglig gennemgang. Gemt FØR-rapport, faglig godkendelse og faktisk arkiveret PDF/manifest/CSV/GeoJSON mangler.
4. **Reel pilot og slutprøve:** egne billeder, afbrydelse/genoptagelse, faglig accept og hele forløbet frem til genåbnede afleveringsfiler skal prøves før mødet.

## Datagrundlag og kommunal afgrænsning

Testsagens kilder er stadig delvise: rastermetadata, natur-/vandplanskandidater, satellitkatalog, DMI-døgnværdier og syv generiske undersøgelsessteder. Det er endnu ikke terrænanalyser, lokal satellitverifikation eller verificerede hydrometriske målestationer. Relevante datoer, lokal dækning, måleserier og regulativ skal færdiggøres eller fremgå som datamangler.

Bykær Bæk er én af flere cases. Den konkrete delstrækning, kommunens formål, godkender og øvrige cases er åbne; de omtalte 83 meter er stadig uafklaret. En testmarkering vælger ingen kommunal strækning. Ingen faglig eller kommunal godkendelse er afledt af de tekniske tests; produktion og kundedata er uændrede.

[Opgaveliste](HADERSLEV_OPGAVER.md) · [Plan](HADERSLEV_PLAN_2026-11-10.md) · [Nyt teknisk bevis](haderslev-audit/staging-round-media-checkpoint-2026-10-14.json)

Rapportcenteret og testsagens rapportfane er kontrolleret i den kørende version. [Bevis for rapportvisningen](haderslev-audit/staging-report-ui-checkpoint-2026-10-14.json).
