# Vandløb Før/Efter — faglig metodekontrakt for P0

Status: researchbaseret produktkontrakt, opdateret 2026-08-31. Dokumentet adskiller kildebelagte forhold fra produktbeslutninger. GoFreyra yder ikke automatisk juridisk, biologisk eller hydraulisk afgørelse.

## Hvad RGB-dronefotos kan dokumentere

Efter georeferering og fagligt review kan P0 dokumentere synlige ændringer såsom:

- synligt vegetationsdække og skåret/uskåret korridor;
- bevarede grødeøer/refugier;
- synlig vand-/brinklinje og bredde under de aktuelle forhold;
- eksponeret bund, erosions- eller aflejringsindikatorer;
- reviewede change polygons pr. delstrækning/stationering;
- forskelle i optagelsernes dækning og observerbarhed.

Et primærstudie har vist, at RGB-UAV under gunstige, klare og relativt lavvandede forhold kan klassificere makrofytter/alger med over 70 % samlet nøjagtighed på mange lokaliteter, men solglimt og artsadskillelse er væsentlige begrænsninger. Resultatet kan derfor ikke generaliseres uden lokale ground-truth-data, confidence og review. [Remote Sensing 2020](https://www.mdpi.com/2072-4292/12/20/3332).

## Hvad systemet ikke må konkludere fra RGB alene

P0 må ikke automatisk udlede eller fremstille følgende som verificerede fakta:

- dybde eller bathymetri;
- vandstand, vandføring eller vandføringsevne;
- plantebiomasse eller sikker artsidentifikation;
- DVPI, DVFI, DFFV eller samlet økologisk tilstand;
- årsagssammenhængen “grødeskæring medførte X”.

RGB-bathymetri er særskilt modelarbejde, der påvirkes af brydning, uklarhed, bølger/refleksion, vegetation og bundsynlighed. Almindelige fotos er ikke valide dybdemålinger uden en dokumenteret model og kontrolmålinger. [Review/primær litteratur om UAV-bathymetri](https://pmc.ncbi.nlm.nih.gov/articles/PMC8914800/).

Økologisk tilstand vurderes gennem flere biologiske/fysiske elementer og længere tidsserier. DCE’s flerårige grødeskæringsforsøg målte fysiske forhold, vandføring, planter, fisk og smådyr; der var ikke en enkel samlet biologisk effekt, som kan aflæses af to luftfotos. [DCE Teknisk Rapport 248](https://dce.au.dk/udgivelser/tr/nr-201-250/abstracts/nr-248-evidensbaseret-og-omkostningseffektiv-groedeskaering-i-smaa-danske-vandloeb-dataopsummering-2021).

## Georefereringsgate

Et EXIF-GPS-tag er kameraets position, ikke pixelgeoreferering eller footprint. GoFreyra viser derfor tre adskilte niveauer:

1. **Rå/ikke valideret:** originalfoto, hash, kamera-position og metadata. Må vises som punkt med tydelig status.
2. **Processeret:** fotogrammetrisk produkt/footprint er genereret med dokumenterede input og softwareindstillinger.
3. **Kontrolleret:** georefereret ortofoto/COG eller footprint har CRS/transform, kontrolpunkter/checkpoints og dokumenteret nøjagtighed.

Kun niveau 3 er automatisk klar til pixelbaseret kortsammenligning. Projektcentroid bruges aldrig som fotoets position.

Fotogrammetrisk QA skal skelne GCP’er fra uafhængige checkpoints. RTK/PPK forbedrer direkte georeferering, men erstatter ikke automatisk kontrollen af slutproduktets nøjagtighed. Homogene vandoverflader giver desuden svage tie points, så flyvning og kontrolpunkter skal planlægges til den lineære vandløbsgeometri. [ASPRS Positional Accuracy Standards 2024](https://old.asprs.org/archives/asprs-approves-edition-2-version-2-of-the-asprs-positional-accuracy-standards-for-digital-geospatial-data-2024.html) og [USGS UAS-kalibreringsvejledning](https://pubs.usgs.gov/publication/ofr20231033).

## Gentagelig survey-kontrakt

En låst survey-template gemmer planlagt og faktisk:

- reach/AOI og stationering;
- kampagnefase: `BEFORE`, `IMMEDIATE_AFTER`, `FOLLOW_UP` eller `CONTROL`;
- flyvespor, AGL, GSD, forward/side overlap, hastighed og kameravinkel;
- kamera, sensor, linse, kalibrering, firmware, processingsoftware og versions-/jobindstillinger;
- CRS og vertikalt datum;
- GCP/checkpoints med målemetode, punktnøjagtighed, residualer og RMSE;
- vejrlig, vind, sol/skydække, vandets klarhed, vandstand/vandføring hvis målt og nylig nedbør;
- faktiske afvigelser fra template.

Dansk plan-/højdekontekst registreres eksplicit som eksempelvis ETRS89/UTM32N (EPSG:25832) og DVR90, når det er den valgte reference. Ellipsoidehøjde må ikke blandes med DVR90. [SDFI om DVR90](https://sdfi.dk/Media/638477285996407950/010-DVR90.pdf).

## Felt-ground-truth

P0 skal kunne knytte droneklassifikation til stabile delstrækninger og feltpunkter. NOVANA’s planteanvisning er et relevant metodeanker: 100 m strækning, faste transekter ved 0/20/40/60/80/100 m og systematiske dækningsregistreringer. Sigtbarhed, vanddybde og nedbør registreres som påvirkende forhold. GoFreyra kopierer ikke metoden blindt, men gør survey-template og feltmodel i stand til at repræsentere den. [AU Fagdatacenter for Ferskvand](https://ecos.au.dk/forskningraadgivning/fagdatacentre/ferskvand) og [V17 version 3.0](https://ecos.au.dk/fileadmin/ecos/Fagdatacentre/Ferskvand/V17_Revision_version3.0_final.pdf).

Klassifikationsresultater gemmer datasplit, model-/metodeversion, confusion matrix, klassevis precision/recall, synlighedsmaske for glare/skygge/uklart vand og `not observable`-areal.

## Tidsdesign og kausal forsigtighed

DCE’s gennemgang viser stor variation i vandstandseffekt efter grødeskæring og betydelig påvirkning fra klima/vandføring. Genvækst kan udligne en effekt på få uger. [DCE Scientific Report 188](https://dce.au.dk/udgivelser/vr/nr-151-200/abstracts/nr-188-faglig-udredning-om-groedeskaering-i-vandloeb/) og [Miljøstyrelsens grødeskæringsvejledning](https://www2.mst.dk/Udgiv/publikationer/2017/12/978-87-7175-604-3.pdf).

Produktbeslutning:

- minimum før + umiddelbart efter dokumenterer udført skæreomfang;
- en opfølgning omkring 3–4 uger understøttes for genvækst, men præcis timing er en projektbeslutning;
- økologiske/hydrauliske effekter kræver længere serie, relevante felt-/sensordata og helst kontrol-/referencereach;
- uden kontroller/kovariater bruger rapporten formuleringen “observeret ændring mellem datoerne”, ikke en kausal konklusion.

## Canonical vandløbsdomæne

4DM-målmodellen skal kunne repræsentere:

- `watercourse_reach`: stabil centerlinje, stationering og projektboundary;
- `survey_campaign`: phase, template, periode og ansvarlig;
- `intervention`: faktisk grødeskæring med metode, udfører, start/slut, korridor og regulativreference;
- `drone_flight`, `raw_image`, `control_point`, `checkpoint` og `processed_asset`;
- `field_visit`, `field_observation` og relevante hydrometriske målinger;
- `derived_metric`, `change_event`, `review_decision` og versionsfast evidens/proveniens.

De generiske 4DM-tabeller konsolideres med eksisterende `projects`, `actions`, `uploads`, `project_media`, `drone_flights`, `drone_assets`, observationstabeller, evidence og audit; der oprettes ikke parallelle fil-/taskmodeller.

## Før/Efter-UI og rapport

Sammenligningen viser samme målestok/extent, stationering, datovælger, datakilde, QA-badge, opacity og synkroniseret swipe/side-by-side. Klik på et change polygon åbner råfotos, processeringsrapport, feltmåling, reviewer og audit trail.

Rapporten adskiller:

- **observeret** — synlig/målt råændring;
- **beregnet** — metode- eller modeloutput;
- **valideret** — reviewerbeslutning og kontrolresultat;
- **fortolket** — faglig konklusion med forudsætninger.

Den medtager operations-/metodeinfo, hydrologiske forhold, glare/water masks, geospatial RMSE, klassifikationsconfidence, begrænsninger, inputhashes og regulativ-/tilladelsesreference. Vandløbslov/regulativ og droneoperationsklasse er projektinput og reviewpunkter; GoFreyra udsteder ikke tilladelse. [Vandløbsloven](https://www.retsinformation.dk/eli/lta/2019/1217), [Trafikstyrelsens drone-FAQ](https://www.droneregler.dk/faq) og [specifik kategori](https://www.droneregler.dk/erhvervsdroneflyvning/overblik-over-den-specifikke-kategori/overblik-over-den-specifikke-kategori).

## Eksterne referencekort

Danmarks Arealinformation og MARS bruges som read-only kontekst med service-URL, layer-id, hentetid, upstream-opdatering, licens og cache-status. MARS er arealomlægnings-/grøn-trepart-kontekst, ikke system of record for grødeskæring eller droneevidens. [SGAV om GIS-adgang](https://sgav.dk/alle-nyheder/nyheder/2026/feb/saadan-finder-du-de-lokale-treparters-skitseprojekter) og [SGAV om MARS](https://sgav.dk/groen-trepart/lokale-treparter/mars).
