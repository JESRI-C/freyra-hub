# GoFreyra Data Foundation

Data Foundation er det første lag i GoFreyras dataorkestreringsarkitektur — det forbinder projektområder med danske og EU-baserede åbne miljødatakilder.

---

## 1. Formål

Data Foundation giver GoFreyra-platformen adgang til autoritative, åbne geodata til:

- Naturkontekstanalyse (§3-natur, Natura 2000, vandløb, søer)
- Terrænanalyse og afstrømningsmodellering
- Klimadata og nedbørsstatistik
- Grundvandsrisikovurdering
- Satellitbaseret vegetationsanalyse
- EU-reference (Natura 2000 netværk, EU-Hydro, jordbundsdata)

Alle data vises som preview-analyse uden nettrafik, medmindre API-nøgler er konfigureret.

---

## 2. Arkitektur

```
CONNECTOR_REGISTRY (statisk TS-fil)
        ↓
connector-service.ts (fetch-funktioner pr. connector)
        ↓
buildProjectEnvironmentalContext() (aggregerer alle resultater)
        ↓
ProjectEnvironmentalContext (typed result object)
        ↓
ProjectEnvironmentalDashboard (React UI-komponent)
```

Connector Registry (`src/data/connectors-registry.ts`) er en ren TypeScript-fil — ingen DB, ingen netværkskald. Service-laget (`src/services/connector-service.ts`) indeholder individuelle fetch-funktioner der returnerer `EnvironmentalContextResult`.

---

## 3. Danske datakilder

| Connector                                 | ID                       | Kategori  | API-nøgle |
| ----------------------------------------- | ------------------------ | --------- | --------- |
| Danmarks Miljøportal — Arealdata          | `miljoeportal-arealdata` | nature    | Nej       |
| Naturdatabasen / Danmarks Naturdata       | `naturdatabasen`         | nature    | Nej       |
| Datafordeleren — Matrikel og ejendomsdata | `datafordeler-matrikel`  | authority | Ja        |
| Datafordeleren — Danmarks Højdemodel      | `datafordeler-dhm`       | terrain   | Ja        |
| DMI Open Data                             | `dmi-opendata`           | weather   | Ja        |
| GEUS Jupiter — Boringer og grundvand      | `geus-jupiter`           | water     | Nej       |

### Danmarks Miljøportal — Arealdata

Primær kilde til §3-beskyttet natur i Danmark. Dækker enge, moser, søer, vandløb og heder samt Natura 2000-grænser og beskyttelseslinjer. API bruger OGC WFS/WMS standard.

### DMI Open Data

Klimanormaler, stationsobservationer og historiske nedbørsdata til afstrømningsberegning. Kræver API-nøgle fra `opendatadocs.dmi.govcloud.dk`.

### GEUS Jupiter

Åben boringsdatabase med grundvandsdata fra alle danske boringer. Ingen API-nøgle påkrævet. Data bruges til grundvandsrisikovurdering og drikkevandsinteresse.

### Datafordeleren

Leverer matrikeldata, ejendomsgrænser og Danmarks Højdemodel (DHM). Kræver registrering og API-nøgle fra `datafordeler.dk`.

---

## 4. EU-datakilder

| Connector                          | ID                           | Kategori     | API-nøgle |
| ---------------------------------- | ---------------------------- | ------------ | --------- |
| Copernicus Sentinel-2              | `copernicus-sentinel-2`      | satellite    | Ja        |
| Copernicus Land Monitoring Service | `copernicus-land-monitoring` | satellite    | Nej       |
| Natura 2000 (EEA)                  | `natura2000-eea`             | eu_reference | Nej       |
| EU-Hydro                           | `euhydro`                    | water        | Nej       |
| ESDAC — European Soil Data         | `esdac-soil`                 | soil         | Nej       |

### Copernicus Sentinel-2

Multispektrale satellitbilleder med 10m opløsning og 5-dages revisit. Bruges til NDVI-beregning, arealanvendelseskortlægning og vegetationsovervågning. Kræver token fra Copernicus Dataspace.

### Natura 2000 (EEA)

EU's netværk af beskyttede naturområder under Habitatdirektivet og Fuglebeskyttelsesdirektivet. Bruges til afstands- og overlapanalyse for projekter.

### ESDAC — European Soil Data

Jordtekstur, permeabilitet, erosionsrisiko og organisk kulstofindhold fra JRC/ESDAC. Bruges til afstrømningskurvenummer (CN) beregning.

---

## 5. Fallback/preview-tilstand

Når API-nøgler ikke er konfigureret, returnerer alle fetch-funktioner `status: "fallback"` med geografisk realistiske eksempeldata baseret på typiske danske/europæiske værdier:

- Nedbør: 612 mm/år, 10-årsregn 14.2 mm/t (typisk for det meste af Jylland og Fyn)
- NDVI: 0.42 (stabil, semi-urban)
- Grundvand: 2.8 m under terræn
- Terrænhældning: maks 3.2%, afstrømning mod nord-nordvest
- Natura 2000: nærmeste område 4.2 km (simulerer Vadehavet)
- Jordbund: lerjord, CN=74

Platformen fejler aldrig pga. manglende API-nøgler — alle funktioner har `.catch(() => null)`-beskyttelse i `buildProjectEnvironmentalContext()`.

---

## 6. API keys

| Env-variabel            | Connector                     | Kilde                                                      |
| ----------------------- | ----------------------------- | ---------------------------------------------------------- |
| `VITE_COPERNICUS_TOKEN` | Sentinel-2                    | https://dataspace.copernicus.eu (gratis registrering)      |
| `VITE_DMI_API_KEY`      | DMI Open Data                 | https://opendatadocs.dmi.govcloud.dk (gratis registrering) |
| `VITE_DATAFORDELER_KEY` | Datafordeler (DHM + Matrikel) | https://datafordeler.dk (gratis, kræver CVR)               |

Tilføj variablerne til `.env.local` i projektets rod:

```
VITE_COPERNICUS_TOKEN=...
VITE_DMI_API_KEY=...
VITE_DATAFORDELER_KEY=...
```

---

## 7. Scoring

### Nature Sensitivity Score

Beregnes ud fra tre faktorer:

- **critical**: Natura 2000-område < 2 km fra projekt
- **high**: Vandløb < 100 m OG grundvand < 3 m u.t.
- **medium**: Vandløb < 100 m ELLER grundvand < 3 m u.t.
- **low**: Ingen af ovenstående

### Runoff Risk Score

Beregnes ud fra terrænhældning og afstrømningskurvenummer (CN):

- **critical**: Vandløb < 100 m OG CN > 70 OG hældning > 5%
- **high**: Vandløb < 100 m OG CN > 65
- **medium**: CN > 65 ELLER hældning > 3%
- **low**: Ingen af ovenstående

### Data Completeness

Procentdel af de 7 connector-resultater der returnerede data (inkl. fallback):

- **complete**: ≥ 80%
- **partial**: 40-79%
- **pending**: < 40%

---

## 8. Næste integrationsfase

For at aktivere rigtige API-kald skal følgende implementeres:

1. **DMI Open Data**: Erstat `previewResult` i `fetchRainfallContext()` med et `fetch()`-kald til `https://dmigw.govcloud.dk/v2/climateData/collections/stationValue/items?api-key=${key}&...`

2. **Copernicus Sentinel-2**: Implementér Process API-kald til Copernicus Dataspace med en BBOX baseret på projektets koordinater og NDVI evalscript.

3. **Danmarks Miljøportal**: Erstat `previewResult` i `fetchNatureContext()` med et WFS GetFeature-kald: `https://arealdata.miljoeportal.dk/api/collections/beskyttet_natur/items?bbox=...`

4. **GEUS Jupiter**: Tilføj bounding box-parameter til API-kaldet: `https://data.geus.dk/geusapi/api/boringer?bbox=...`

5. **Datafordeler DHM**: Kræver WCS-kald (Web Coverage Service) til højdemodellen.

---

## 9. GIS-integration plan

For geografisk præcise resultater kræves projektpolygoner:

1. Tilføj `geometry_geojson`-felt til `Project`-typen (allerede defineret på `Site`-niveau)
2. Beregn BBOX fra projektets polygon
3. Brug BBOX i alle WFS/WCS-forespørgsler
4. Implementér proximity-beregning (punkt-til-punkt afstande) med Turf.js eller PostGIS
5. Overvej at gemme analyseresultater i `connector_fetch_logs`-tabellen for cache og audit

---

## 10. Begrænsninger

- Alle data er i preview-tilstand — ingen rigtige API-kald uden konfigurerede nøgler
- Geometri er ikke implementeret — afstande er eksempelværdier, ikke beregnet fra projektpolygoner
- `watercourseContext` er `null` indtil EU-Hydro-connector implementeres
- Ingen caching — `buildProjectEnvironmentalContext()` kører alle kald ved hver sideindlæsning
- `connector_fetch_logs`-tabellen er oprettet i SQL men ikke brugt i service-laget endnu
