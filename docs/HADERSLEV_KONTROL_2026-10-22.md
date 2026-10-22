# Haderslev – tekniske kontrolbeviser 22.10.2026

Denne kvittering skelner mellem kodekontrol, faktiske stagingprøver og faglig accept. En grøn test er ikke en kommunal godkendelse. Leverancen er fortsat 27.10.2026; fastfrysning er 26.10 kl. 12 dansk tid.

## Miljø og ændringsspor

- PR: [#16](https://github.com/JESRI-C/freyra-hub/pull/16), `codex/haderslev-demo-2710` mod `codex/haderslev-delivery`.
- Staging: [Freyra](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev), Supabase-projekt `xdvqdzdpyceojbdknofi`.
- Der er ikke merged til main eller skiftet til produktion.
- Migrationerne `20261022125300_photo_point_review_versions`, `20261022125302_municipal_report_v2` og `20261022160418_municipal_report_v3_danish` er anvendt på staging og genlæst. Tidligere rapporter forbliver uændrede.
- Aktuel staging blev opdateret 22.10 kl. 18.39 dansk tid til Worker-version `3d08217c-faf9-457f-b060-b4fb2e6a30c8`, bygget fra `33e8be04192a2e8dff1495477362bf640d4c8649`. Bygningen er kontrolleret med `viteMode: staging` og `municipalDemo: true`. DEMO_MODE bruger manuel fotogennemgang uden automatiske AI-kald. Den foregående Worker `67b1aafd-5e72-46c6-b337-54a62d924152` blev brugt til seks-fotoprøven og rapportpakken nedenfor; sidste kodeændring gør alene mobiltabellen læselig.

## Kode og database

[CI-kørsel 53](https://github.com/JESRI-C/freyra-hub/actions/runs/39815093653) på den deployede kodeversion `33e8be04192a2e8dff1495477362bf640d4c8649` bestod. Den foregående [CI-kørsel 52](https://github.com/JESRI-C/freyra-hub/actions/runs/39811151437) på `2102a02` bestod også med samme antal:

| Kontrol | Observeret resultat |
|---|---|
| Typekontrol og build | Bestået |
| Hele Vitest-suiten | 172 filer, 2.788 tests bestået |
| Global lint | 0 fejl, 23 eksisterende advarsler |
| Migrationer fra tom database og pgTAP | 12 filer, 814 tests bestået |
| Samtidige databaseoperationer | 29 scenarier bestået |
| Databasefunktioner og oprydning af prøvemiljø | Bestået |

En lokal Windows-kørsel med bygning og browser samtidig ramte maskinens hukommelsesgrænse og blev afbrudt. Den tæller ikke som PASS. De samlede kontroller ovenfor er udført i CI. Browserprøver gennemføres særskilt på staging.

CI-beviset gælder det angivne commit. Senere ændringer kræver egen kontrol på den valgte release; historisk grøn CI er ikke dokumentation for en nyere build.

## Supplerende kildekontrol

Commits `74ade0e`, `5d70cb1` og `09f3b40` tilslutter faktiske Matriklen2- og GEUS-jordartspolygoner, fryser Sentinel-billedpixels med SHA-256 og viser gemte DMI-døgnværdier for periodens sidste dato. Målrettet lokal kontrol bestod 8 testfiler / 126 tests samt lint i de ændrede TS/TSX-filer. En efterfølgende præcisering af timeout-mockens TypeScript-type er committet som `d001558`; den målrettede lintkontrol bestod.

Read-only adapterprøver på små offentlige testområder hentede 8 matrikelgeometrier, 2 GEUS-jordartspolygoner med versionsangivelsen v7.1/januar 2026 og et faktisk Sentinel-JPEG på 31.353 bytes. Billedpixels og hash blev fastholdt i adapterresultatet. Det er format- og integrationsbevis; den konkrete seksfotosag beskrives særskilt nedenfor. Se [kildeoversigten](HADERSLEV_KILDER_2710.md) for blandt andet ukendt lokal skyfrihed, manglende temperatur/vind og DHM-filmetadata uden terrænpixels.

## Rigtige originaler og læseadgang

De seks kerneoriginaler fra 24.08.2026 er kontrolleret, uploadet og genhentet med identisk SHA-256. Genkørsel af seedet gav samme sag, upload-ID'er og filhashes. Originalerne er ikke lagt i Git. De er efterfølgende servervalideret og tilknyttet sagen gennem brugerfladen.

Sagen hedder **Bykær Bæk – Haderslev**, ID `7f187dba-0bc2-5342-a049-d9974d100d69`. Fotopunkterne er P02, P06, P11, P14, P17 og P20. Det kombinerede GPS-søgeområde kræver et eksplicit valg af alle seks fotos og officiel Bykær-reference; det er ikke en opmålt strækning.

Den eksisterende læsetestkonto er genbrugt efter Jespers valg. Direkte RLS-prøver er dokumenteret i [læseprøven](HADERSLEV_READER_RLS_2026-10-22.md). Rigtige kommunebrugere, sikker aktivering og deres egen loginprøve er stadig en afleveringsopgave.

## Samlet browser- og rapportprøve på cf1f0318

Den rigtige seksfotorunde `f382ec74-a1a8-4634-be37-7b06bbd4e340` blev oprettet gennem appen 22.10. Alle seks originaler blev vist og kontrolleret mod seedets SHA-256. Baseline `7ba712f5-24b2-45ab-8b05-f6b9ea4bf33a` indeholder blandt andet 143 matrikelgeometrier, 45 markblokke, 38 lavbundsgeometrier og 18 Sentinel-scener. Det gemte Sentinel-billede er fra flyvedagen med 0,59 % global skyandel; det er ikke dokumenteret skyfrit lokalt.

AI gav fire skemagyldige resultater og to afviste resultater efter ét genforsøg pr. foto. **Alle fire gyldige resultater klassificerede selv billedkvaliteten som ubrugelig og gav ingen billedfund.** Skemagyldighed er derfor ikke dokumentation for nyttig visuel verifikation. P14/P17 står som manglende AI-vurdering; ingen fotopunkter er fagligt godkendt. De afviste svar var gyldig JSON, men selvmodsigende om billedkvalitet og fund.

Rapportversion 1 blev hentet som PDF og ZIP med én handling. Kontrol af alle pakkefilers hashes, seks originaler, 19 referencer og læserens identiske PDF bestod. Se [læseprøven](HADERSLEV_READER_RLS_2026-10-22.md). Alle 14 PDF-sider er visuelt gennemgået uden beskæring eller overlap; engelsk AI-prosa på side 5 og to manglende kildelag kræver en ny version før den endelige aflevering. Den gamle kladde bevares uændret.

En separat teknisk Playwright-sag gennemførte upload → kildeversion → billedvurdering → eksplicit teknisk afvisning i revisionssporet → beplantning → PDF/ZIP og genåbning på 58,675 sekunder. Én test bestod, ingen blev sprunget over. E2E-rapporten er `fc064d80-545f-4c0c-9ff7-4cb08f89fa6f`; testen ændrede ikke den rigtige Bykær-sags faglige historik. Læserens fem trin blev også kontrolleret ved 1440 og 375 pixels uden vandret overflow.

## Afsluttende manuel generalprøve på 67b1aafd

Den nye undersøgelse `43600233-a99b-48e6-8a3e-05f6d727d759` og baseline `950af95e-3eb9-48e6-abbb-18bf06efc756` blev oprettet gennem appen kl. 18.12 dansk tid. Alle seks originaler blev genåbnet og hashkontrolleret; hver viste manglende AI-vurdering og ingen faglig beslutning. Databasen indeholdt **nul AI-forsøg for den nye baseline**. Den tidligere undersøgelse og dens kvitteringer blev kontrolleret uændret. Et første stop skyldtes, at prøvescriptet ikke havde åbnet det sammenklappede revisionsspor; genoptagelsen rettede alene scriptet og oprettede ikke en ny undersøgelse.

Workerens gemte datagrundlag indeholder 143 matrikler, 45 markblokke, 8 skovgeometrier, 30 gyldige lavbundsgeometrier og 19 gyldige jordartspolygoner. Henholdsvis 8 lavbunds- og 1 jordartspolygon blev udeladt som ugyldige og registreret som dækningsmangler. Der er 18 Sentinel-scener og et gemt preview; lokal skyfrihed er ikke dokumenteret. DMI-visningens valgte dato er 24.08.2026 og bruger station 05384, interval 24.08 kl. 00:00:00.001 til 25.08 kl. 00:00 dansk tid. Temperatur og vind er fortsat ikke med.

**Rapportversion 2**, generator v3, ID `128ce502-e262-4093-9d8b-ba9b4db2ae95`, blev dannet med én handling. Alle seks pakkefiler, 12 kildepayloads og 15 fastlåste referencer inklusive seks originaler blev kontrolleret. ZIP, ejerens særskilte PDF og læserens PDF blev genhentet; PDF-indholdet er byteidentisk. Ingen faglige beslutninger blev skrevet. Den eksisterende læser kunne ikke oprette en rapport.

| Kontrolsum | SHA-256 |
|---|---|
| Rapportgrundlag | `917d43c080b39376f438d9719e7193deda8f39dd611f7f4fed5281eb777ffae4` |
| PDF | `a07aec981f2a2868be75d93e99b8b701a7742dd5ff5724160300397d708441b5` |
| ZIP | `130a1fa76c483c20cbe990b138bbbdc6057aebce5fa93e918a8da4f1d2304177` |

Alle 12 PDF-sider er renderet og visuelt gennemgået. Seks fotoillustrationer, dansk tekst, kladdemarkering, beplantningsafsnit, ukendte A–E-hektar, litteratur, hentedatoer og kontrolsummer er læselige uden overlap eller beskæring. To korte bemærkninger fortsætter over et sideskift; indholdet er bevaret. Dette er en teknisk godkendt **kladde**, ikke faglig eller kommunal accept.

Den afsluttende Playwright-prøve på samme Worker-version gennemførte upload → automatisk lokalisering → kildeversion og fototilknytning → manuel teknisk afvisning med revisionsspor → beplantning → PDF/ZIP og genåbning på **55,225 sekunder**. Én test bestod, nul fejl, skips eller ustabile genkørsler. Testen kontrollerede nul AI-forsøg både efter fototilknytning og efter rapporten. Den brugte en separat `TEKNISK E2E`-sag og skrev ingen faglige beslutninger i Bykær-sagen.

Private beviser: `tmp/private-haderslev/rehearsal-receipts/18983e93-825b-4bf3-97a3-be2828fcb66a.json`, `tmp/private-haderslev/report-package/e05711a2-ee5c-494a-aeff-0acd457f8bc1/` og `tmp/private-haderslev/e2e/2026-10-22T16-20-48-252Z/`. De indeholder sagsmateriale og skal ikke lægges i Git.

## Afsluttende kontrol på 3d08217c

Den sidste kodeændring `33e8be0` giver arealtabellen minimumsbredde, læsbar afstand mellem kolonner, fokusbar rulleregion og dansk mobilvejledning. Kortet og tabellen er genprøvet med læsetestkontoen ved 1440 og 375 pixels samt begge bufferafstande. Officiel vandløbslinje og faktiske skitsepolygoner vises; der er ingen arealer i klassen egnet og alle 15 A–E-hektarceller står som ukendte pr. afstand. Skiftet fra 10 til 20 m ændrer geometrien. Der var nul browserfejl og intet vandret overflow på selve siden. Mobilens venstre kolonner og højre grundlagskolonne er visuelt gennemgået efter vandret rulning; tabellen har mindst 24 pixels mellem overskrifterne. Prøven ændrede ingen sagsdata.

Det fulde Playwright-forløb er gentaget på denne Worker-version kl. 18.40–18.41 dansk tid: **65,381 sekunder, én bestået test, nul fejl, skips eller ustabile genkørsler**. Upload, GPS, kildegrundlag, manuelt revisionsspor, beplantning, én handling til PDF/ZIP, filhashes og genåbning bestod. Nul AI-forsøg blev kontrolleret. Testen brugte en separat teknisk sag. Den rigtige Bykær-sags rapportversion 2 og dens kontrolsummer er uændrede.

Private beviser: `tmp/private-haderslev/planting-map-qa/2026-10-22T16-39-50-441Z/proof.json` med 12 skærmbilleder og `tmp/private-haderslev/e2e/2026-10-22T16-40-33-316Z/status.json`. Lokal plan B er gemt under `leverance/Freyra-Haderslev-2710-teknisk-kontrol-2026-10-22` i arbejdsområdets rod med PDF, ZIP, SHA256SUMS og en læsevejledning. Disse sagsfiler ligger uden for Git.

## Geometriske begrænsninger

De tidligere lokale GIS-filer blev kontrolleret som mulig kilde til A–E. `report_sections.geojson` indeholder B01–B07 som grupper af kamerapositioner, ikke godkendte delstrækningspolygoner. Observations- og beplantningsfilerne har heller ikke godkendt fysisk afgrænsning. De kan derfor ikke bruges til at opfinde A–E eller hektartotaler. Ukendte A–E-hektar er accepteret indtil senere faglig afgrænsning og står derfor som ukendte.

## Accept, der fortsat kræver en ansvarlig

Faglig gennemgang af fotos og beplantning, navngiven reviewer og accept af synlige datamangler, backup med genopretningsprøve, fejlalarm, kommunens egne login og varig drift af staging er selvstændige go/no-go-krav. A–E-afgrænsningen kan følge senere og er ikke i sig selv en blokering, når hektartotalerne fortsat vises som ukendte. Se [mødemanuskriptet](HADERSLEV_DEMO_2710.md). Produktion er fortsat NO-GO.
