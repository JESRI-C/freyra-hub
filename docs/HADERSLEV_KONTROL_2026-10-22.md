# Haderslev – tekniske kontrolbeviser 22.10.2026

Denne kvittering skelner mellem kodekontrol, faktiske stagingprøver og faglig accept. En grøn test er ikke en kommunal godkendelse. Leverancen er fortsat 27.10.2026; fastfrysning er 26.10 kl. 12 dansk tid.

## Miljø og ændringsspor

- PR: [#16](https://github.com/JESRI-C/freyra-hub/pull/16), `codex/haderslev-demo-2710` mod `codex/haderslev-delivery`.
- Staging: [Freyra](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev), Supabase-projekt `xdvqdzdpyceojbdknofi`.
- Der er ikke merged til main eller skiftet til produktion.
- Migrationerne `20261022125300_photo_point_review_versions` og `20261022125302_municipal_report_v2` er anvendt på staging og genlæst. Tidligere rapporter forbliver uændrede.

## Kode og database

[CI-kørsel 49](https://github.com/JESRI-C/freyra-hub/actions/runs/39789364457) på `6ea2ef0ed85a3b026ec60ffe5e6499622e8376de` bestod:

| Kontrol | Observeret resultat |
|---|---|
| Typekontrol og build | Bestået |
| Hele Vitest-suiten | 161 filer, 2.673 tests bestået |
| Global lint | 0 fejl, 23 eksisterende advarsler |
| Migrationer fra tom database og pgTAP | 12 filer, 806 tests bestået |
| Samtidige databaseoperationer | 29 scenarier bestået |
| Databasefunktioner og oprydning af prøvemiljø | Bestået |

En lokal Windows-kørsel med bygning og browser samtidig ramte maskinens hukommelsesgrænse og blev afbrudt. Den tæller ikke som PASS. De samlede kontroller ovenfor er udført i CI. Browserprøver gennemføres særskilt på staging.

CI-beviset gælder det angivne commit. Senere ændringer kræver egen kontrol på den valgte release; historisk grøn CI er ikke dokumentation for en nyere build.

## Supplerende kildekontrol

Commits `74ade0e`, `5d70cb1` og `09f3b40` tilslutter faktiske Matriklen2- og GEUS-jordartspolygoner, fryser Sentinel-billedpixels med SHA-256 og viser gemte DMI-døgnværdier for periodens sidste dato. Målrettet lokal kontrol bestod 8 testfiler / 126 tests samt lint i de ændrede TS/TSX-filer. En efterfølgende præcisering af timeout-mockens TypeScript-type er committet som `d001558`; den målrettede lintkontrol bestod.

Read-only adapterprøver på små offentlige testområder hentede 8 matrikelgeometrier, 2 GEUS-jordartspolygoner med versionsangivelsen v7.1/januar 2026 og et faktisk Sentinel-JPEG på 31.353 bytes. Billedpixels og hash blev fastholdt i adapterresultatet. Det er format- og integrationsbevis, ikke bevis for den konkrete Bykær-sags dækning, faglige egnethed eller komplette aflevering. Samlet live-accept af den rigtige sag med seks fotos afventer fortsat sin særskilte kontrol. Se [kildeoversigten](HADERSLEV_KILDER_2710.md) for blandt andet ukendt lokal skyfrihed, manglende temperatur/vind og DHM-filmetadata uden terrænpixels.

## Rigtige originaler og læseadgang

De seks kerneoriginaler fra 24.08.2026 er kontrolleret, uploadet og genhentet med identisk SHA-256. Genkørsel af seedet gav samme sag, upload-ID'er og filhashes. Originalerne er ikke lagt i Git. De er efterfølgende servervalideret og tilknyttet sagen gennem brugerfladen.

Sagen hedder **Bykær Bæk – Haderslev**, ID `7f187dba-0bc2-5342-a049-d9974d100d69`. Fotopunkterne er P02, P06, P11, P14, P17 og P20. Det kombinerede GPS-søgeområde kræver et eksplicit valg af alle seks fotos og officiel Bykær-reference; det er ikke en opmålt strækning.

Den eksisterende læsetestkonto er genbrugt efter Jespers valg. Direkte RLS-prøver er dokumenteret i [læseprøven](HADERSLEV_READER_RLS_2026-10-22.md). Rigtige kommunebrugere, sikker aktivering og deres egen loginprøve er stadig en afleveringsopgave.

## Geometriske begrænsninger

De tidligere lokale GIS-filer blev kontrolleret som mulig kilde til A–E. `report_sections.geojson` indeholder B01–B07 som grupper af kamerapositioner, ikke godkendte delstrækningspolygoner. Observations- og beplantningsfilerne har heller ikke godkendt fysisk afgrænsning. De kan derfor ikke bruges til at opfinde A–E eller hektartotaler. Ukendte A–E-hektar er accepteret indtil senere faglig afgrænsning og står derfor som ukendte.

## Accept, der fortsat kræver en ansvarlig

Faglig gennemgang af fotos og beplantning, navngiven reviewer og accept af synlige datamangler, backup med genopretningsprøve, fejlalarm, kommunens egne login og varig drift af staging er selvstændige go/no-go-krav. A–E-afgrænsningen kan følge senere og er ikke i sig selv en blokering, når hektartotalerne fortsat vises som ukendte. Se [mødemanuskriptet](HADERSLEV_DEMO_2710.md). Produktion er fortsat NO-GO.
