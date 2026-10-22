# Freyra - aktivt acceptregnskab

**Brugerrettelse 22.10.2026:** Kategorierne skal kunne åbnes også i staging. Den første leverances tekniske tests kontrollerede ikke dette tilstrækkeligt. [Kategorirettelsen](CATEGORY_RESTORATION.md) genåbner accept af pakke 1-2 og tilføjer konkret browserkontrol af de eksisterende kategoriindgange.

**Aktuelt NO-GO:** Kategorirettelsen består build og 2.790 tests, men fejler browserkontrol af Byggeri og natur samt startside efter organisationsvalg. Arbejdet er standset efter brugerens instruks; status i pakketabellen nedenfor beskriver første UI-leverance og er ikke frigivelsesgodkendelse af den ufærdige kategorirettelse.

## Arbejdsmandat

Jesper har efter produktgennemgangen bedt om at udføre hele udviklingsplanen. Implementeringen omfatter derfor både UI-pakkerne og de funktionelle restopgaver. De leveres i afhængighedsrækkefølge og i adskilte commits. Den første UI-leverance bevarer motor, database, API og eksisterende parametre. Main og `codex/haderslev-demo-2710` forbliver referencegrene.

Faglig og kommunal accept kræver de ansvarliges faktiske vurdering; de kan ikke udledes af tests eller udføres på deres vegne af udviklingsagenten. Produktion er ikke frigivet ved denne instruktion.

## Pakker

| Pakke | Status | Bevis eller næste kontrol |
|---|---|---|
| 0: inventar og fast udgangspunkt | Inventar og audit gemt | `REDESIGN_MAP.md`, produktgennemgang og stagingkvittering. Base `6257819`. |
| 1: genoptageligt sagsforløb | Implementeret og teknisk bestået | Fem startvalg, seks trin, undersøgelsesvalg og genoptagelse efter ugyldigt bogmærke browserprøvet. Ny sag oprettet, nulstillet, gemt og genåbnet. 10-sekunders brugerprøve afventer. |
| 2: resultat, parametre og hjælp | Implementeret og teknisk bestået | Avancerede indstillinger, læsende aktivitet, kildekatalog, brand og tomme tilstande. Desktop, mobil og fuldt originalupload til PDF/ZIP bestået; 13 maskerede skærmbilleder. |
| 3: godkendt leverance | Afventer implementering | Versionsbundet godkendelse, roller og accepterede forbehold. Ingen eksisterende kladde er gjort godkendt. |
| 4: Før/Efter og beplantning | Afventer implementering og fagmateriale | Parrede fotos samt kontrollerede delstrækningspolygoner. Ukendt areal bevares som ukendt. |
| 5: kundeadgang og drift | Afventer implementering/prøver | Faktisk onboarding, genopretning inkl. filer, alarm og ansvarlig. |
| 6: samlet accept | Ikke bestået | Præcis releaseversion skal gennemgå udviklingsplanens acceptmatrix. |
| 7: øvrige moduler | Afventer kerneleverance | Alle eksisterende skærme bevares; prototypegrænser frigives kun efter reel funktionstest. |

## Kontroller under udførelse

- Bevaringskontrol bestået: eksisterende routes og 79 inputbindinger/handlers i redigerede skærme bevaret; ingen motor-, service-, API-, database- eller afhængighedsændring.
- Typekontrol bestået efter statusrettelsen.
- Global lint bestået: 0 fejl og 23 eksisterende advarsler.
- Samlet testsuite bestået: 172 filer og 2.790 tests, kørt serielt på redesignets UI-kode.
- Staging-build og kontrol af den byggede konfiguration bestået på applikationscommit `ebe8e86`; ingen publicering.
- Lokal maskine har været presset på hukommelse. Kontroller køres adskilt; en afbrudt kørsel tæller ikke som produktfejl eller PASS.
- Den lokale filkontrol fandt manglende serveradgang til originaler. Online staging genleverede uændret PDF med seks fotos. Efter Jespers udtrykkelige tilladelse blev en midlertidig Cloudflare-testsession startet; både navigation og identisk PDF bestod dér. Ingen erstatning af online staging.
- Den seneste genoptagelsesrettelse, identisk PDF med seks fotos og fuld originalupload til ZIP er bestået på samme UI-version `ebe8e86`. Ny sag gennem browseren er også bestået. Se `REDESIGN_GO_NO_GO.md` og den maskerede testkvittering.
- PR-CI på `e6cebd3` er grøn for både app og database/samtidighed; databaseprøven omfattede 814 pgTAP-tests. PR #17 er til gennemgang mod demogrenen, uden sammenlægning eller publicering.

## Fundregnskab

Status gælder UI-leverancen, ikke produktionsklarhed. Detaljer og oprindelige kodehenvisninger findes i produktgennemgangen.

| Fund | Status efter UI-arbejdet | Ansvar / resterende accept |
|---|---|---|
| F01: svært at forstå formålet | Ny startside og seks trin implementeret | Produktansvarlig: observeret 10-sekunders brugerprøve. |
| F02: undersøgelse svær at genoptage | Synligt valg; seks fotopunkter og ugyldigt bogmærkes genoptagelsesvej browserprøvet | Teknisk regression bestået; kommunal brugeraccept afventer. |
| F03: to oprettelsesveje | Eksisterende handlinger samlet under forløbet og avancerede indstillinger | Produktansvarlig: prøv ny sag uden vejledning. Ingen handling fjernet. |
| F04: uklar status | Gemt evidens, indlæsning og fejl adskilt | Udvikler: ingen besøgsbaseret godkendelse; fagperson godkender fortsat indhold særskilt. |
| F05: mangler svære at handle på | Ventepunkter og vejledning synliggjort | Faglig ansvarlig: definér tildeling og accept af forbehold i pakke 3. |
| F06: rapporten er altid kladde | Uændret og tydeligt vist | Faglig ansvarlig + udvikler: versionsbundet godkendelsesproces. |
| F07: fotobeslutning er ikke samlet accept | Skellet er forklaret | Faglig ansvarlig: aftal godkendelsesbetydning og roller. |
| F08: Før/Efter ikke færdig | Bevaret; ikke erklæret færdig | Kommune/fagperson: eftermateriale og metode; udvikler: parring og lagring. |
| F09: beplantning mangler geometri | Eksisterende 10/20 m-valg bevaret og browserprøvet | Kommune/fagperson: kontrollerede afgrænsninger; hektar forbliver ukendte. |
| F10: AI giver ikke nyttige fund | Eksisterende demoafgrænsning bevaret | Faglige bedømmere: evalueringssæt og kriterier før frigivelse. |
| F11: delvise datakilder | Kilder og baseline forklarer dækning og begrænsninger | Dataansvarlig: faktiske manglende kilder/pixels skal leveres særskilt. |
| F12: kundens egen adgang | Teknisk læsekonto browserprøvet | Kommune: egne konti og egen loginprøve. |
| F13: drift ikke dokumenteret færdig | Uændret | Driftsansvarlig: genopretning, alarm, opbevaring og support. |
| F14: tværmodulhandlinger er prototyper | Bevarede bag eksisterende demoafgrænsning | Produktansvarlig/udvikler: konkret brugeropgave og faktisk lagring før frigivelse. |
| F15: indstillinger gemmer ikke reelt | Ikke frigivet gennem redesignets hovedmenu | Udvikler: egentlig administration i funktionel pakke. |
| F16: sikkerhed/notifikation/betaling er mock | Bevarede; ikke gjort til drift | Produktansvarlig: separat scope og accept. |
| F17: inaktive topbarknapper | Kommunalt forløb har fungerende, læsende aktivitetsbakke | Bredere prototypetopbar kræver eget funktionelt arbejde. |
| F18: mange brede prototyper | Hovedmenu kun Sager/Kilder; øvrige eksisterende værktøjer bevaret sekundært | Produktansvarlig: modulvis færdiggørelse efter kerneaccept. |
| F19: integrationer/analyser er afgrænsede | Afgrænsninger og kildemangler bevaret | Data-/faglig ansvarlig og udvikler: faktisk ende-til-ende-integration. |
| F20: historisk grøn status kan misforstås | Aktuelt go/no-go og dette regnskab oprettet | Udvikler/drift/kommune: hver deres prøve på præcis releaseversion. |

## Afklaringer før de funktionelle pakker

Hele udviklingsplanen er bestilt, men godkendelsesreglerne er endnu ikke fastlagt. Før pakke 3 kan frigives, skal produktansvarlig og faglig ansvarlig vælge, hvem der må godkende, hvad en godkendelse omfatter, og hvilke datamangler der må accepteres med forbehold. Disse valg må ikke opfindes eller erstattes af grønne statusfelter.

Pakke 4 kræver faktisk eftermateriale og kontrollerede afgrænsninger. Pakke 5-6 kræver kommunens egne konti, en driftsansvarlig og menneskelig accept. Manglende input er eksplicitte afhængigheder, ikke programmerede eller beståede funktioner.
