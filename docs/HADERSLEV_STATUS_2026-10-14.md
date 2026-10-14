# Haderslev — status 14. oktober 2026

**En enklere arbejdsflade er lagt i testmiljøet. Hele leverancen til mødet 10. november er endnu ikke færdig.**

[Åbn Undersøgelse i din testsag](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/ae3012ca-662e-4ae0-9f84-234d08428ec9?tab=arbejde). Du bruger dit eksisterende login. Vælg et testområde og en officiel vandløbsreference, hvis det ikke allerede er gjort. Et testområde udpeger ikke kommunens endelige delstrækning.

## Ændret efter gennemgang af fem brugerperspektiver

Droneoperatør, vandløbsfaglig medarbejder, kommunal sagsbehandler, projektleder og rapportmodtager er gennemgået som simulerede brugerrejser. Browsernavigation, kodegennemgang og tekniske tests er kombineret; der er endnu ikke gennemført interviews og accept med fem virkelige brugere. [Fund, prioritet og resterende accept for hver gruppe](HADERSLEV_BRUGERTEST.md).

- Projektet åbner nu i **Undersøgelse** med direkte droneupload. De øvrige værktøjer ligger samlet under Flere værktøjer og historik.
- Når sted og periode er bekræftet, forbereder **Hent data og forbered undersøgelse** datagrundlag, faktisk genererede spørgsmål og en FØR-runde i samme forløb. Afbrudte gemninger genbruger deres præcise identiteter.
- Flere kontrollerede originaler kan vælges og knyttes til en gemt undersøgelse samlet. Kort, reference, foto og manuel kladdenote er samlet i arbejdsområdet. Et enkelt faktisk spørgsmål kræver ikke et ekstra valg; den faglige vurdering skal stadig angives manuelt.
- **Rapport og levering** samler rapportoversigten og PDF-kladden. Valgt fane og præcis undersøgelse kan genåbnes via adressen. En kladde er tydeligt adskilt fra en færdig aflevering.
- En fejl, hvor koordinater kunne følge med fra et tidligere valgt foto, er rettet. Midlertidig genindlæsning af adgang vises ikke længere som bekræftet læseadgang.

## Det næste, der skal færdiggøres

1. **Rigtige billeder:** ét eget originalfoto, derefter 10 og 120 fotos med afbrydelse og genoptagelse. Billedvalg indlæses stadig i sider på 30; direkte valg af en konkret flyvning mangler.
2. **Relevant data og observationer:** mere automatisk stedforslag og afprøvet billed-/satellitanalyse. Den nuværende plan danner højst ét regelbaseret referencespørgsmål. Den indeholder endnu ikke adaptive AI-spørgsmål eller automatisk fortolkning af dronebilleder.
3. **Faglig gennemgang og brugbar rapport:** konkrete fund med foto og placering, kildedato, usikkerhed og underbygget opfølgning. Det delvise kildeinventar skal suppleres eller fremgå som mangler.
4. **Fast aflevering:** en godkendt, genhentelig PDF med tilhørende manifest, CSV og GeoJSON. Den nuværende PDF-kladde opfylder ikke dette krav.
5. **Pilot og samlet mødeprøve:** en reel sag fra start til genåbnede afleveringsfiler, med tid til rettelser før 10. november.

Bykær Bæk er én af flere cases. Konkret delstrækning, kommunens formål, regulativ og faglig godkender er stadig uafklaret; de omtalte 83 meter er ikke valgt. Kameraets GPS er ikke automatisk placeringen af et synligt fund.

## Hvad der er verificeret

CI26 består med 130 testfiler/2.111 tests, typekontrol, beregningskilder, build og lint uden fejl (23 eksisterende advarsler). Den isolerede databaseprøve består med 10 SQL-filer/601 kontroller og 25 samtidighedsscenarier samt oprydning. Stagingbuild og nøglescan består; de fire eksisterende hemmelige indstillingers navne er verificeret.

Den nye navigation, rapportindgang og uploaddialog er prøvet i browseren med den eksisterende syntetiske testsag. Der blev ikke uploadet nye billeder, valgt kommunal strækning eller gemt faglige registreringer under denne prøve. Egne fotos, storbatch og færdig kommunal aflevering er fortsat åbne accepter. Produktion og kundedata er ikke ændret.

[Nyt afgrænset bevis](haderslev-audit/staging-workflow-checkpoint-2026-10-14.json) · [CI26](https://github.com/JESRI-C/freyra-hub/actions/runs/38603055037) · [Brugertest](HADERSLEV_BRUGERTEST.md) · [Opgaveliste](HADERSLEV_OPGAVER.md) · [Plan](HADERSLEV_PLAN_2026-11-10.md).

De tidligere 40/81/68/67-kontroller bevares som daterede beviser på deres oprindelige versioner. De er ikke genmærket som nye tests af arbejdsfladen. [Historisk notebevis](haderslev-audit/staging-round-note-checkpoint-2026-10-14.json).
