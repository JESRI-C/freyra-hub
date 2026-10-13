# Rapport og drone: status og kommunalt output

Audit 13.10.2026. Read-only gennemgang af arbejdsdokumenter, rapportekstraktion, produktion og udvalgte leverede tekstregistre. Originaler og eksisterende leverancer er uændrede. Ingen ny feltkontrol, fagpersonsgodkendelse, fuld hashing eller visuel genkontrol af PDF udført i denne audit. Tidligere QA er beskrevet som eksisterende dokumentation.

## Det, der faktisk er færdigt

Der ligger en afsluttet billedbaseret leverance dateret 28.09.2026 i `leverance/Bykaer_Baek_v1.0`: PDF, DOCX og ZIP-datapakke. Rapporten *Vegetation og grundlag for træplantning* er 20 sider. Produktionsnoterne registrerer gennemgang af alle 20 sider og ZIP-integritet; den uafhængige eksportkontrol beskriver konsistente datareferencer og ingen blokerende faglige fund. Dette er et færdigt dokumentprodukt, ikke i sig selv bevis for et tilsvarende fungerende programflow. [1–4]

Datagrundlaget er 420 kildefiler, heraf 397 JPEG svarende til 274 unikke fotos og 123 ekstra kopier, samt fire videoer og fire SRT-filer. De tre optagedatoer er 24.08, 07.09 og 16.09.2026. Registre indeholder 20 vegetationsafsnit, 22 bevoksningsafsnit, 29 fotoafsnit og fire plantningsvurderinger. Bykær-konteksten alene er ni vegetationsafsnit og syv bevoksningsafsnit; øvrige poster er Ørsted Å, Barsbøl Bæk eller sammenløbet. Enhederne er hverken antal bestande eller enkelttræer. [1, 4–6]

Rapporten giver kommunen tre konkrete anvendelser:

1. Planlæg en målrettet besigtigelse: PL02/VB02 og PL03/VB03 er første prioritet; PL05/VB05 og PL13/VB13 er anden prioritet. Hver post beskriver observation, formål, anbefaling og nødvendige lokale kontroller. PL05 anbefaler at bevare passage og åbent udgangspunkt. PL13 anbefaler at bevare eksisterende kronegrupper og undersøge enkelte mellemrum. [5]
2. Find den daterede billedevidens bag en vurdering gennem foto-ID, register, fotoatlas og GIS-fotoreference. [4, 6]
3. Gentag fotografering ved R0089 og R0108. To af 24 kandidatpar har stærk stedkobling og understøtter kvalitative ændringsobservationer: mere synlig vandflade i september, samt liggende lysere vegetation ved svinget. [4, 7]

Det er således et brugbart **besigtigelses- og dokumentationsgrundlag**. Det er endnu ikke et plantningsprojekt, et dokumenteret effektregnskab for grødeskæring eller en samlet offentligt-data-baseret tilstandsvurdering.

## Hvad konklusionerne ikke kan bære endnu

Ingen arter er verificeret. Pindsvineknop, rødel og eg må derfor ikke præsenteres som bekræftede fund eller færdige artsvalg. Der er ingen dokumenteret bestandspolygon, ortomosaik, terrænmodel, kontrolpunkter eller opmålt centerlinje. Kamerapunkter er reference til billeder, ikke objektpositioner. Areal, biomasse, fjernet grødemængde, vandføring, hydraulisk kapacitet, træantal og sæsonbeskygning er ikke målt. Rapporten er ikke en V17-undersøgelse og beregner ikke DVPI. [1, 7–8]

Arbejdsperioden 26.–28.08.2026 er fortsat foreløbig, og indsatsens omfang pr. delstrækning er ikke verificeret. Vandstand og belysning er ikke standardiseret. Det senere materiale fra 16.09 er hovedsageligt fra andre vandløb og dokumenterer ikke en sikker tredje observation af de to stærke Bykær-steder. Mere synlig vandflade er en observation; den beviser ikke alene årsag eller forbedring. [1–2, 7]

Den aktuelle rapport bruger OSM som topografisk orienteringsgrundlag og DTU Aqua til navneafgrænsning, samt generelle metodekilder. Kommunens regulativgeometri, matrikulære bindinger, §3-screening, satellittidsserier og vejrobservationer indgår ikke som et samlet hentet og analyseret stedgrundlag. En historisk kildematrix beskriver de planlagte myndigheds- og kortlag; det er ikke dokumentation for, at disse er indlæst i den aktuelle leverance. [7, 9–10]

## Afklaring af navnet

Det auditerede projekt og alle aktuelle leverancer hedder **Bykær Bæk**. Geografisk navngivning er kontrolleret mod OSM og DTU Aquas beskrivelse: Bykær frem til sammenløbet med Barsbøl, derefter Ørsted Å. Der blev ikke fundet `Byskov` i tekst-, kode- eller JSON-filer ved målrettet søgning i dette workspace, eksklusive dependencies/runtime. Det afklarer det eksisterende projektnavn, men kan ikke fastslå, om brugerens eksempel “Byskov Bæk” refererer til et andet nyt projekt. [1, 9]

## Afstanden fra dokumentprodukt til program

Den aktuelle rapport produceres i en lokal Python-kæde: `build_final.py` læser lokale JSON-registre og skriver datapakke/DOCX; `render_final.py` kalder en lokal DOCX-renderer; `package_final.py` pakker eksporten. Plantningsposter og betydelige rapportafsnit står direkte i byggeren. Rapporten demonstrerer derfor et fagligt output, men byggeren er ikke en generisk rapportmotor knyttet til et projekts reviewflow. Kundepakken indeholder nedskalerede fotos; originale checksums er interne. [3, 11]

Der findes allerede et relevant implementeringsgrundlag: datakontrakten angiver `project → survey → drone_flight → imagery_dataset → photo_asset → photo_observation → analysis_run → report_version`, privat opbevaring af originaler, SHA-256, tenant-adskillelse og låste rapportinput. Dokumentet siger udtrykkeligt “ingen produktionsmigration udført”. Modulspecifikationen kræver adskillelse af dokumenteret, observeret, screening og ikke målt. UI-blueprint beskriver import, kort, før/efter, review og rapportversioner. Disse filer bør omsættes til én sammenhængende programleverance og kontrolleres mod den aktuelle app-audit. [12–14]

## Foreslået første leverance gennem programmet

| Trin | Kommunens output | Acceptkriterium før mødedemo |
|---|---|---|
| 1. Sted og offentlige data | Et dateret stedgrundlag for valgt vandløb og delstrækning med offentlige kort-/miljølag, relevante satellitobservationer og vejrhistorik | Projektgrænse er valgt og bekræftet. Hvert lag har kilde, hentetid, dataperiode, CRS, licens, dækning og kvalitetsflag. Manglende/adgangsbegrænsede data vises eksplicit. Screening omskrives ikke til fund. |
| 2. Spørgsmål til dronen | En konkret verifikationsliste og flyve-/feltplan | Hvert punkt viser den offentlige indikation, hvad der skal kontrolleres, stedreference og ønsket dokumentation. Egnet datametode vælges; usynlige forhold under kroner kan kræve feltkontrol. |
| 3. Upload og kontrol | Et projekttilknyttet survey med originaler, fotokort og synlig importstatus | Batch-upload af originale JPEG kan gennemføres og genoptages via TUS uden ekstra originalkopier. Afledte thumbnails gemmes særskilt. Checksum, optagetid, metadatafejl og dubletter vises. Kamera- og objektgeometri er adskilt. ZIP-import er sekundært scope. |
| 4. Verifikation og review | En vurdering pr. indikation: understøttet, afkræftet eller fortsat uafklaret | Offentlig kilde, dronefoto, lokal observation, usikkerhed, reviewer og tidspunkt kan følges. Før/efter kræver vurderbar fælles scene og godkendelse. Arts- eller målingspåstande kræver passende evidens. |
| 5. Beslutningsrapport | Kort resumé, prioriterede steder og handlinger, evidensbilag, PDF/DOCX og GIS/CSV | Hvert forslag angiver hvorfor, hvor, næste handling, hvem der skal afklare den og hvilke data der mangler. Tal og billeder kan spores til låst inputmanifest. Ny kilde eller review giver ny version. Program og eksport viser samme godkendte resultater. |

For Bykær kan eksisterende fotoregistre, VB/TB-ID'er, fire besigtigelsesposter og to genfotoreferencer genbruges som første reelle datasæt. Bevar den afleverede v1.0; et nyt programforløb bør have ny version og tydelig angivelse af tilføjede data. Det første møde bør vise et afsluttet gennemløb fra valgt sted til kommunens næste beslutning, inklusive de mangler der skal afklares før udførelse.

Mødet er nu afklaret til **10. november 2026** gennem brugerens oplysning 13.10.2026. Før planen låses, mangler især afleveringskrav, kommunens konkrete beslutningsspørgsmål, autoritativ strækning/geometri, verificeret indsatslog og krav til faglig godkendelse. `INTERVIEW.md` har den historiske uafklarede deadline/afleveringskrav; mødedatoen ovenfor erstatter denne del af det gamle interview. De resterende afklaringer bør behandles som produktkrav, ikke gemmes i et generelt metodebilag. [2]

## Filgrundlag

1. `arbejde/PROJECT_STATUS.md`
2. `arbejde/INTERVIEW.md`
3. `arbejde/final_production/final_delivery_qa.json`
4. `arbejde/final_ecology/eksportkontrol_v1.0.md`; `arbejde/final_production/package_qa.json`
5. `leverance/Bykaer_Baek_v1.0/Datapakke/Plantning_v1.0.csv`
6. `leverance/Bykaer_Baek_v1.0/Datapakke/LAES_MIG.md`
7. `arbejde/final_ecology/export_text.txt` (aktuel rapportekstraktion, især s. 2–3 og 17–20)
8. `arbejde/final_ecology/fagligt_grundlag.md`; `arbejde/final_ecology/geografisk_review.md`
9. `arbejde/final_gis/GIS_SOURCES_AND_FINDINGS.md`
10. `arbejde/extracted/218373d8a29f_open_data_source_matrix.md.txt` (historisk integrationsplan; links/regler er ikke genverificeret i denne audit)
11. `arbejde/final_production/build_final.py`; `render_final.py`; `package_final.py`; `arbejde/README.md`
12. `arbejde/extracted/92564379412b_app_data_contract.md.txt`
13. `arbejde/extracted/bd9665e8d15a_GoFreyra_4DM_report_module_spec_v0.2.md.txt`
14. `arbejde/extracted/7d71ccde7977_ui_blueprint.md.txt`; `arbejde/extracted/8040f8a6cdc1_after_flight_protocol.md.txt`
