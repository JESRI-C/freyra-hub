# Offentlige kilder til leverancen 27. oktober 2026

Kodegrundlag kontrolleret 22. oktober 2026. Kilder hentes først efter projektadgang og gemmes i en version med SHA-256. Genåbning foretager ingen nye kildekald. Nye kilder omskriver ikke historiske rapporter.

## Hentning og fallback

Hver adapter har en tidsgrænse og størrelsesgrænse; en ekstra grænse på 25 sekunder forhindrer, at én kilde standser de øvrige. Kildestatus vises som **hentet**, **delvist** eller **ikke tilgængelig** med konkret begrænsning og hentedato.

Hele dataversionen skal også holde sig under databasens grænse på 2 MiB, inklusive det indlejrede ortofoto og JSON-formatets lagerplads. Hvis summen bliver for stor, udelades de største supplerende kildeindhold enkeltvis med tydelig fejlstatus og ukendt dækning. De øvrige kilder og den officielle vandløbsreference bevares. Dette omskriver aldrig tidligere gemte versioner.

Validerede offentlige svar for samme projekt, geometri og datoperiode genbruges i op til 15 minutter. Den seneste autoriserede gemte kildeversion kan fylde cachen efter en Worker-genstart. Ved midlertidig fejl kan et svar højst 24 timer gammelt bruges som **Gemt kilde** med delvis status og oprindelig hentedato. Adgangsfejl og ugyldige svar skjules ikke med en gammel grøn status. Cachen er begrænset til 24 poster / 4 MiB pr. Worker; den permanente dokumentation er de gemte snapshots. Fejlede hentninger bliver aldrig til nulværdier.

## Kilder og præcise begrænsninger

| Kilde                      | Implementeret                                                                                                                   | Forbehold                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Officiel vandløbsreference | Eksisterende registerlinje fastholdt i baseline                                                                                 | Danske Stednavne er ikke kommunalt godkendt stationering.                                                                                                              |
| Ortofoto                   | Faktisk WMS-JPEG, hentet på server og frosset med filhash i baseline                                                            | Billedet er et oversigtsbillede. Præcis optagedato og lokal NoData-dækning oplyses ikke i svaret; ingen opmålingspåstand.                                              |
| DHM                        | Eksisterende filkatalog                                                                                                         | Rasterpixels og terrænanalyse mangler; metadata er ikke højdemålinger.                                                                                                 |
| §3 og vandplan             | Eksisterende versionerede WFS-geometrier                                                                                        | Registreringer skal stadig fagligt gennemgås.                                                                                                                          |
| Markblokke                 | Markblokke 2026, CRS84-polygoner fra officiel WFS                                                                               | Registerudtræk ved laglukning 4. maj 2026, ikke en ejendomsgrænse eller ny kontrol på flyvedagen.                                                                      |
| Lavbund                    | Kulstof2022-polygoner med 6–12 % og over 12 % kulstof                                                                           | Kortlægning, ikke jordprøver. Den offentlige katalogpost angiver ingen særskilt licens; vilkår for videre aflevering skal afklares.                                    |
| Skov                       | GeoDanmark `skov_current` via Datafordeleren                                                                                    | Som udgangspunkt skov fra 2.500 m². Små træer/træbælter er ikke fuldt dækket, derfor delvis status.                                                                    |
| DMI                        | Eksisterende historiske stationsnedbørsdata for den valgte periode                                                              | En station er ikke en lokal måling ved vandløbet. Kvalitet og præcise døgnintervaller bevares; ingen opdigtet samlet vejrvurdering.                                    |
| Sentinel-2                 | Scenekatalog og faktisk udbyder-thumbnail; nærmeste scene med 0 % global skydækning prioriteres, ellers nærmeste med højst 10 % | Lokal skyfrihed er ikke verificeret. Ved én flyvedag søges ±30 dage, klart mærket. Et ufuldstændigt katalog kan mangle en nærmere scene. NDVI-pixelanalyse er roadmap. |
| Matrikel                   | Synligt kildehul                                                                                                                | Det gamle DAWA-API blev lukket 1. oktober 2026. Ny Matriklen2-geometri blev ikke etableret i denne ændring.                                                            |
| Jordart                    | Synligt kildehul                                                                                                                | Eksisterende GEUS-endpoint bestod ikke den afgrænsede formatprøve; ingen normværdier bruges som virkelige data.                                                        |

Polygonadapterne henter højst 200 kandidater og 384 KiB pr. kilde. Hvis det fulde antal er større, gemmes delvis dækning. Kortgeometrier bevarer huller og multipolygoner. Et område uden modtaget data klassificeres ikke som frit for begrænsninger.

## Adgang og kontrollen 22. oktober

Ortofoto og skov bruger den eksisterende servervariabel `DATAFORDELER_API_KEY`. Nøglen indgår aldrig i baseline, klient-URL eller fejltekst. Markblokke, Kulstof2022 og Sentinel-kataloget kræver ingen ny nøgle. Der er ikke foretaget produktionsændringer.

Read-only formatprøver mod udbyderne gav: ortofoto HTTP 200 med JPEG; skov, markblokke og Kulstof2022 returnerede GeoJSON med CRS84 og polygon/multipolygon. Sentinel leverede en `thumbnail`-asset fra `datahub.creodias.eu`. Prøverne brugte små offentlige testområder og er **ikke** accept af dækning, billedkvalitet eller faglig egnethed for den konkrete Bykær-sag. Aktuel Bykær-version skal hentes og gennemgås i staging før levering.

## Primære kilder

- [Datafordeleren: Ortofoto forår WMS](https://datafordeler.dk/dataoversigt/geodanmark-ortofoto/ortofoto-foraar-wms/)
- [Miljøportalens offentlige API-kontrakt](https://datakatalog.miljoeportal.dk/api/swagger/index.html) og katalogposterne [Markblokke 2026](https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:markblokke-2026), [Kulstof2022](https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:kulstof-2022-lavbundskort), [Skove, GeoDanmark](https://arealdata.miljoeportal.dk/datasets/urn:dmp:ds:skove-geodanmark)
- [Copernicus: STAC API](https://documentation.dataspace.copernicus.eu/APIs/STAC.html)
- [Dataforsyningen: DAWA, opdateret 1. oktober 2026](https://dataforsyningen.dk/data/4924)
- [Datafordeleren: Matriklen2 WFS](https://datafordeler.dk/dataoversigt/matriklen-mat/matriklen2-gaeldende-og-foreloebig-wfs/)
