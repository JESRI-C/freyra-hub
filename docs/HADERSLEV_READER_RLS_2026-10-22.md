# Kommunal læseprøve på staging · 22.10.2026

Kontrolleret 22.10.2026 kl. 14.42 dansk tid mod stagingprojektet `xdvqdzdpyceojbdknofi`.

Efter brugerens valg er den **eksisterende syntetiske læsetestkonto** tilknyttet sagen **Bykær Bæk – Haderslev** (`7f187dba-0bc2-5342-a049-d9974d100d69`) med projektrollen `viewer`. Kontoen har også `viewer` i sagens organisation. Tilknytningen blev udført gennem den eksisterende ejers almindelige login og RLS-beskyttede medlemskabs-API. Der blev ikke brugt en administrationsnøgle, ændret RLS eller sendt en invitation.

Den tidligere adgang til den syntetiske QA-sag er bevaret som aftalt. Testkontoen ser derfor to tildelte sager. Det er en teknisk testkonto; kommunens rigtige konti skal have deres egne login og kun de relevante kommunale sager.

| Kontrol med almindeligt login | Resultat |
| --- | --- |
| Eksisterende læsetestkonto logger ind | Bestået |
| Ny Haderslev-sag kan læses | Bestået |
| Tidligere QA-sag kan fortsat læses | Bestået |
| Forsøg på at gemme uændret beskrivelse i begge sager | Afvist af RLS; ingen opdateret række |
| Læserens adgang til Haderslevs modtagne originaler | 6 uploadrækker synlige |
| Læserens adgang til Haderslevs revisionsspor | 12 hændelser synlige på prøvetidspunktet |
| Fremmed syntetisk konto: Haderslev-sag, uploads og revisionsspor | 0 rækker synlige |
| Fremmed syntetisk konto: projektoversigt | 0 sager synlige |

Prøven kontrollerede projekter, uploads, projektmedier, offentlige kildeversioner, rapportversioner og revisionsspor. På prøvetidspunktet var de seks originaler endnu ikke servervalideret/tilknyttet; der var derfor **0 projektmedier, 0 offentlige kildeversioner og 0 rapportversioner** i Haderslev-sagen. Læsning og download af den endelige rapport med læsekontoen skal gentages efter klargøring. Denne kvittering beviser ikke, at hele leveranceflowet er bestået.

Saniterede lokale maskinkvitteringer findes i `tmp/haderslev-reader-membership.json` og `tmp/qa-viewer-readback.json`. Loginoplysninger findes kun i den ignorerede lokale QA-kvittering; ingen adgangskoder eller tokens er medtaget her eller i Git.

Den lokale maskine har ikke Docker til rådighed, så databasens pgTAP-prøver er ikke kørt lokalt. CI-jobbet `database-gates` opretter en lokal engangsdatabase, genafspiller migrationerne og kører hele `supabase/tests/database`. Dette skal være grønt før GO.

## Supplerende rapportprøve kl. 17.38 dansk tid

På stagingversion `cf1f0318-ffa7-43ed-801d-24530ad7f32b` blev den rigtige seksfotorundes første rapportkladde oprettet: rapport `71b51dd2-fbb2-4f56-9a81-1f4ae3921175`, version 1, undersøgelse `f382ec74-a1a8-4634-be37-7b06bbd4e340`. Den eksisterende læser kunne genhente præcis samme PDF som ejeren og ZIP-pakken; alle tre PDF-filer havde SHA-256 `25e396e43912f9e03faa33a531c492c871b2554e2c7957208cbe80d4c7ad609e`.

Læserens rapportoprettelse var deaktiveret. De seks originalers hashes, 19 fastlåste referencer, 10 kildepayloads og alle pakkefiler blev kontrolleret. Ingen faglige beslutninger blev oprettet eller ændret. Prøven beviser adgang og genhentning af denne kladde, ikke faglig accept eller kommunens endnu ikke oprettede egne login.

Den private kvittering ligger under `tmp/private-haderslev/report-package/8e020d1c-b5b0-4f02-8dbc-90f1ac8af64e/`. En senere rapportgenerator eller release skal kontrolleres særskilt.

## Afsluttende læseprøve kl. 18.20 dansk tid

På Worker-version `67b1aafd-5e72-46c6-b337-54a62d924152` blev rapportversion 2 med generator v3 kontrolleret: `128ce502-e262-4093-9d8b-ba9b4db2ae95`, undersøgelse `43600233-a99b-48e6-8a3e-05f6d727d759`. ZIP-pakkens PDF, ejerens særskilte PDF og læsetestkontoens PDF havde alle SHA-256 `a07aec981f2a2868be75d93e99b8b701a7742dd5ff5724160300397d708441b5`.

Læserens oprettelsesknap var deaktiveret. Seks originaler, 12 kildepayloads, 15 fastlåste referencer og samtlige pakkefilers kontrolsummer bestod. Den nye undersøgelse har ingen AI-forsøg, og prøven skrev ingen faglige beslutninger. Historiske kvitteringer og den tidligere undersøgelse er bevaret. De 12 PDF-sider er visuelt gennemgået. Kvitteringen findes privat i `tmp/private-haderslev/report-package/e05711a2-ee5c-494a-aeff-0acd457f8bc1/`.

Den samlede databasekontrol på kodeversion `2102a02` bestod 814 pgTAP-tests og 29 samtidighedsscenarier i [CI 52](https://github.com/JESRI-C/freyra-hub/actions/runs/39811151437). Kommunens egne konti og deres konkrete sagstildeling skal fortsat oprettes og prøves før aflevering; den syntetiske læsetestkonto er ikke kommunens identitet.
