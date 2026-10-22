# Freyra til Haderslev Kommune — 27. oktober 2026

Dette er afleveringen af Freyra med Bykær Bæk som rigtig sag. Mødet varer cirka 15 minutter. Kommunen skal kunne logge ind og genåbne sin dokumentation bagefter. En teknisk test eller en åben skitse er ikke en faglig godkendelse.

## Før mødet

Åbn [staging](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev) med den aftalte driftsversion og `VITE_DEMO_MODE=true`. Vælg **Bykær Bæk – Haderslev**. Brug ikke en sag med `TEKNISK E2E` eller `SYNTHETISK` i navnet.

Kontrollér de seks originaler fra 24.08.2026 (DJI FC3411): P02/DJI_0040, P06/DJI_0060, P11/DJI_0103, P14/DJI_0123, P17/DJI_0135 og P20/DJI_0149. Originalerne er evidens; nedskalerede PDF-illustrationer er kun til læsning. Brug `seed:haderslev` efter README. Genoptag via **Kontrollér og åbn de gemte originaler**. Bekræft den officielle vandløbsreference og lokal optagedato. Kameraets GPS er ikke et dokumenteret billedfootprint.

Hav den seneste gennemgåede PDF/ZIP og tilhørende SHA-256 lokalt. Test dem uden netværk. Hav kommunens læselogin klar i en separat browserprofil. Adgangskoder må ikke ligge i denne fil, Git, præsentationen eller PR'en.

## Klik for klik — cirka 15 minutter

Ved første klargøring vælges **Datagrundlag → Billedgruppe → Alle seriens fotopunkter — 6 fotos**. De seks GPS-positioner fordeler sig på to grupper. Vælg den officielle **Bykær Bæk** og kræv **6 af seriens 6 fotos**, før området bekræftes. Det samlede GPS-søgeområde er ikke en fagligt godkendt strækningsgrænse. Genåbn den gemte undersøgelse ved senere gennemgang.

| Tid | Klik og forklaring | Plan B |
|---|---|---|
| 0:00–1:00 | Log ind → Sager → **Bykær Bæk – Haderslev**. Vis de fem trin og forklar, at samme sag bevarer billeder, kilder, faglige beslutninger og rapporter. | Åbn det gemte direkte sagslink. Ved loginfejl: vis lokal pakke, registrér adgangsfejlen og undlad at erklære selvbetjening afleveret. |
| 1:00–3:30 | **Billeder** → vis de seks kerneoriginaler. Upload eventuelt ét aftalt originalfoto. Vis GPS, optagedato og filkontrol. **Videre til datagrundlag**. | Genåbn de seks allerede serverkontrollerede originaler. Ingen rapportillustration må uploades som erstatning. Ved manglende GPS vises manglen og manuel stedafklaring. |
| 3:30–6:00 | **Datagrundlag** → bekræft område, officiel Bykær-reference og 24.08.2026 → hent data. Vis hentedato og hentet/delvist/ikke tilgængelig. Vis ortofoto, natur/vandløb, jord/markblokke, DMI og nærmeste tilgængelige Sentinel-billede. Forklar optagedato og skyandel; et satellitbillede er ikke en lokal måling. | Åbn den præcise gemte kildeversion. Sig dens hentedato og eventuelle mangler. Ingen tilgængelig skyfri scene betyder netop det; en scene med lav skyandel må ikke kaldes skyfri. |
| 6:00–9:00 | **Gennemgang** → åbn et fotopunkt → **Vis originalfoto**. Sammenhold billedet med det offentlige grundlag ved siden af. Læs AI-forslaget og dets usikkerhed. Den udpegede fagperson vælger bekræftet/afvist, navn/rolle og begrundelse → **Gem faglig vurdering i revisionssporet**. Vis hændelsen. | Brug **gemt vurdering**, hvis der findes et gyldigt resultat for præcis dette foto og denne kildeversion. Ellers gennemgå manuelt; oplys at AI-resultat mangler. Hvis gemning fejler, genprøv samme handling og kontroller revisionssporet før ny version. |
| 9:00–11:00 | **Beplantning** → skift mellem 10 og 20 m → vis egnet/betinget/uegnet, fratrukket §3/skov og lavbundsmarkering. Vis **Skitse – kræver faglig validering** og litteraturens afgrænsning. A–E vises kun med faktisk godkendte geometrier. | Åbn det gemte grundlag og gennemgå reglerne. Mangler A–E eller dækkende lag, står arealer som ukendte. Ingen grønne arealer eller effektberegninger opfindes. Ustabil kortfunktion skjules ved fastfrysning og står i roadmap. |
| 11:00–13:30 | **Rapport og aflevering** → vælg undersøgelsen → kontrollér mangler → **Dan rapport og hent afleveringspakke**. Åbn ZIP og PDF. Vis rapportversion, kildehentedatoer, beplantningsafsnit og SHA-256 i filmanifestet. Nye oplysninger giver en ny rapportversion. | Hent den allerede gemte version igen. Ved netværksudfald åbn præcis den lokalt gemte pakke og dens kontrolsum. Kald ikke en ældre pakke opdateret. |
| 13:30–15:00 | Log ind med kommunens læsebruger i separat profil → åbn samme sag → genhent samme rapport. Vis, at upload/redigering ikke er tilladt, og at fremmede sager er utilgængelige. Aftal kontaktperson, faglig opfølgning og drift. | Hvis læselogin eller RLS-prøve fejler, er kommunal selvbetjening NO-GO. Dokumentpakken kan gennemgås, men adgangsleverancen skal færdiggøres før accept. |

## Go/no-go kl. 12 den 26. oktober

Registrér faktisk dato, ansvarlig, versions-ID og bevislink for hver kontrol. Tomme felter er ikke godkendelser.

| Kontrol | GO kræver | Status ved kodeleverancen |
|---|---|---|
| Databasebackup | Aktuel backup med tidsstempel og dokumenteret genopretning til isoleret miljø; private Storage-originaler indgår i særskilt backup | Kræver driftsansvarligs dokumentation; en SQL-migration eller filhash er ikke backup |
| Kommunal RLS | Eget login kan læse tildelte sager og rapporter; fremmed sag og alle skrivninger afvises, også ved direkte API-kald | Eksisterende læsetestkonto tilknyttet og RLS-prøvet 22.10, se [kvittering](HADERSLEV_READER_RLS_2026-10-22.md). Rapportdownload og rigtige kommunebrugere prøves på endelig release |
| Seks originaler | Servervalideret GPS/dato, readback-hash, korrekt sag og ingen rapportbilleder som evidens | Lokal originalkontrol og staging-upload gennemført 22.10; browser-/serverforløb dokumenteres separat |
| Kilder og AI | Kildestatus pr. lag og dateret fallback; AI returnerer gyldigt resultat eller ærlig manuel/gemt status | Nye automatiske kontroller er ikke faglig accept |
| Faglig afgrænsning | Kommunen har udpeget reviewer og faktisk strækning; A–E og mangler er eksplicit afklaret | Må ikke erstattes af en automatisk ligedeling eller den tidligere uafklarede 83 m-oplysning |
| Rapportpakke | Faktisk browserdownload, PDF kan åbnes, ZIP-filernes SHA-256 matcher, rapport genåbnes uændret | Skal gentages på valgt release og kommunelogin |
| Fejlovervågning | Workers-fejl og Supabase-adgangsfejl kan ses af ansvarlig; kendt kontakt og afprøvet alarm-/håndteringsvej | Aktiv logning alene beviser ikke en afprøvet alarm |
| Kvalitet | Alle eksisterende tests, ændrede filers lint, typekontrol, build, DB/RLS og Playwright-forløb på PR-head består | Se PR'ens konkrete checkresultater; et skip tæller ikke som PASS |
| Varig drift | Navngiven driftsansvarlig, kendt stagingadresse, aftalt opbevaring og support efter mødet | Afklares med Jesper før aflevering |

**Anbefaling: staging**, betinget af ovenstående. Produktion er fortsat NO-GO. Der skiftes ikke til produktion, og der merges ikke til main i dette arbejde.

Ved fastfrysning skjules ustabile funktioner med `DEMO_MODE`/en konkret featureafgrænsning og flyttes til roadmap. Datahuller, manglende faglig accept og adgangsfejl skjules aldrig. Hvis det krævede grundflow, rapportgenhentning eller læseadgangen ikke består, er leverancen ikke klar; mødet ændrer ikke den status.

## Det Jesper selv skal afklare

1. Bekræft kommunens faktiske strækning, A–E-geometrier, faglige reviewer og accept af rapportens konklusioner.
2. Opret de rigtige kommunebrugere via den dokumenterede Auth-/læserprocedure og prøv deres login. Del adgangskoder via en sikker kanal.
3. Sørg for påkrævede servernøgler og adgang til kilder; en manglende nøgle må aldrig erstattes af browserindlejrede hemmeligheder.
4. Dokumentér backup/genopretning, driftsansvar, fejlalarm og den valgte release. Gem endelig PDF/ZIP lokalt før mødet.

## Roadmap

NDVI-pixelanalyse, lokale beregnede effektstørrelser, arts-/antal-/plejeplan, sensorer og generel produktionslancering indgår ikke. En beplantningsskitse er ikke en myndighedsafgørelse. CO₂-effekt vises som manglende, indtil relevant interval og systemgrænse kan dokumenteres. Litteraturintervaller for temperatur, N og P er kontekst fra studierne og multipliceres aldrig med lokale ha.

Designretningen er gennemgået i [Freyra-projektet i Lovable](https://lovable.dev/projects/7ec0fad1-a130-4304-819c-d085c76dc4bd). Den lokale implementering genbruger de eksisterende evidensfunktioner og ændrer ikke rapporternes historiske versioner.
