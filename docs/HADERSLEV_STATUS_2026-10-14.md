# Haderslev — status 14. oktober 2026

**Hele leverancen til mødet 10. november er endnu ikke færdig.** Den tekniske kæde fra offentligt datagrundlag til gemte undersøgelsesrunder er nu afprøvet i den syntetiske testsag. Den brugbare kommunerapport og faglige accept mangler stadig.

## Det er gennemført i testmiljøet

- Offentlige kilder gemmes som et dateret, versionsfast datagrundlag med kildehenvisninger og kendte datamangler. Seneste testsag har baselineversion 4.
- Planversion 3 og to separate udkast til før- og kontrolrunde er gemt med de præcise inputversioner og spørgsmål.
- Datagrundlaget bestod 40 kontroller. Rundekæden bestod 81 kontroller, herunder genlæsning, gentagne gemninger og adgang, der tilbagekaldes og genetableres.
- Tidligere datagrundlag, planer og originale medier er bevaret. Genoptagelsen oprettede ingen ekstra runder.
- Den konstaterede CPU-fejl er diagnosticeret. Brugeren har gennemført Cloudflare-opgraderingen; seks efterfølgende læsekald og den fulde rundetest gennemførtes uden fejlen.

Dette dokumenterer systemets tekniske udkastkæde. Det dokumenterer ikke vandløbets tilstand eller en godkendt kommunal sag.

## Arbejdet fortsætter i denne rækkefølge

1. **Dronebilleder til runder og spørgsmål.** Privat original, optageoplysninger og valgt spørgsmål skal følge den præcise gemte runde. Kode og skærmbilleder er lagt ind lokalt; samlet kontrol, faktisk databaseafprøvning og udrulning skal afsluttes.
2. **Manuelle observationer og faglig gennemgang.** Registrér, hvad et konkret foto viser, hvad der er usikkert, og hvad der kræver kontrol på stedet. Gem ansvarlig person og vurdering som selvstændige versioner.
3. **En brugbar FØR-rapport i programmet.** Saml afgrænsning, kort, udvalgte fotos, underbyggede fund, datamangler og foreslået opfølgning. Fjern statiske eksempelresultater fra den reelle sagsleverance.
4. **En rapport, der kan genåbnes og afleveres.** Gem rapportversionen og de faktiske PDF-, CSV-, GeoJSON- og manifestfiler med checksums. En genereret PDF skal kunne hentes igen efter genindlæsning.
5. **Reel pilot og aflevering.** Afprøv med jeres egne billeder, afbrudt upload/genoptagelse og fagligt godkendte observationer. Gennemgå hele brugerrejsen og afleveringspakken før mødet.

En lokal optimering reducerer samtidig gentagen kontrol af samme datagrundlag fra 11 gennemløb til ét pr. læsning. Den skal gennem de samlede kontroller og afprøves i testdriften, før den regnes som leveret.

## Datagrundlaget er stadig delvist

Testsagen indeholder rasterfilmetadata, natur-/vandplanskandidater, satellitsceners katalogoplysninger, DMI-døgnværdier og syv generiske undersøgelsessteder. Det er endnu ikke færdige terrænanalyser, lokal satellitverifikation eller verificerede hydrometriske målestationer. Rasterpixels, relevante optagedatoer, lokal dækning, oplandsrelevans, eventuelle måleserier og kommunalt regulativ skal færdiggøres eller beskrives som konkrete datamangler.

## Sagens afgrænsning er åben

Bykær Bæk er én af flere cases. Den konkrete delstrækning, projektområde, kommunens formål, faglig godkender og øvrige cases er ikke endeligt valgt. Den omtalte strækning på 83 meter er fortsat uafklaret. Eksisterende kundedata ændres ikke til at passe en antagelse.

[Detaljeret opgaveliste](HADERSLEV_OPGAVER.md) · [Plan frem mod mødet](HADERSLEV_PLAN_2026-11-10.md) · [Tekniske beviser](haderslev-audit/staging-source13-survey-round-checkpoint-2026-10-14.json)
