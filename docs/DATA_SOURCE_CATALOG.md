# Datakildekatalog

Senest opdateret: 2026-08-27. Tabellen er en kode- og P0-inventering, ikke bevis for at en live kilde virker. `AFVENTER` betyder, at GetCapabilities/API, vilkår eller svar endnu ikke er verificeret i denne cyklus.

| Kilde              | Ejer                                           | Endpoint/type fundet                                                          | P0-formål                               | Version/CRS/licens                                                                  | Verificeret status                                    |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| MARS WMS           | SGAV, udviklet sammen med Danmarks Miljøportal | `https://mars.sgav.dk/geo/wms`                                                | Visning af relevante MARS-lag           | WMS-version, lag-id, CRS og vilkår **AFVENTER** GetCapabilities                     | Ikke integreret; live smoke **AFVENTER**              |
| MARS WFS           | SGAV, udviklet sammen med Danmarks Miljøportal | `https://mars.sgav.dk/geo/wfs?version=1.0.0`                                  | Features/proveniens til tilladt analyse | WFS 1.0.0 oplyst; lag-id, CRS og vilkår **AFVENTER**                                | Ikke integreret; live smoke **AFVENTER**              |
| Arealdata WFS      | Danmarks Miljøportal                           | `https://arealdata.miljoeportal.dk/gis/ows` og alternativ kodevej `/api/wfs`  | §3-natur og vandløb                     | Koden anmoder WFS 2.0.0/EPSG:4326 i én adapter; aktuelle lag/vilkår **AFVENTER**    | Adaptere findes; live svar og persistens **AFVENTER** |
| Adresse/reverse    | Dataforsyningen                                | `https://api.dataforsyningen.dk/autocomplete` og `/reverse`                   | Find lokalitet og centrér kort          | REST; svar-CRS/vilkår/version **AFVENTER**                                          | Kode findes; live browserrejse **AFVENTER**           |
| Matrikel/stednavne | Datafordeleren                                 | `https://services.datafordeler.dk`                                            | Matrikelvisning og kontekst             | Credentials kræves i dele af flowet; konkrete tjenester, CRS og vilkår **AFVENTER** | Credential-containment er P0-sikkerhedsgate           |
| Sentinel-2 STAC    | Copernicus Data Space                          | `https://catalogue.dataspace.copernicus.eu/stac/collections/SENTINEL-2/items` | Satellitkatalog og senere afledte lag   | STAC/produktmetadata, licens og anvendt CRS **AFVENTER** live validering            | Adapter findes; P0-datasæt og token **AFVENTER**      |
| DMI Open Data      | DMI                                            | standardbase `https://opendataapi.dmi.dk`                                     | Vejr-/nedbørskontekst, hvis nødvendig   | Collection/version/licens **AFVENTER**                                              | Adapter findes; ikke P0-verificeret                   |
| GEUS WFS           | GEUS                                           | `https://data.geus.dk/geusmap/ows/48.jsp`                                     | Geologi/grundvand, hvis nødvendig       | WFS-lag, CRS og vilkår **AFVENTER**                                                 | Servicekode findes; ikke P0-verificeret               |
| Baggrundskort      | Esri, OpenStreetMap, OpenTopoMap               | Tile-URL'er i `MapEditorMap.tsx`                                              | Orientering i arbejdsfladen             | Attribution er konfigureret; rapport-/cachevilkår **AFVENTER**                      | Visningskode findes; browser smoke **AFVENTER**       |

## MARS P0-gate

Relevante kandidater er Skitseprojekter, Naturpotentiale og Projekter - samlet, men navnene må ikke hardcodes som gyldige lag-id'er. Før integration skal adapteren:

1. hente og gemme capabilities-metadata uden credentials i klienten;
2. registrere tjenestetype, endpoint, faktisk lag-id, titel, ejer, CRS, format, vilkår/licens, hentet tidspunkt og driftsstatus;
3. vise kildeinfo i UI og rapport;
4. have kontrollerede mocks og mindst én live smoke-test i dev/test;
5. fejle synligt uden at erstatte live data med previewdata.

## Proveniens pr. snapshot

For hver anvendt kilde gemmes som minimum: katalog-id, endpoint og lag/collection, kildeejer, upstream-version eller hentet tidspunkt, forespørgselsparametre/område, CRS, licens/vilkårsversion, checksum hvor muligt, job/request-id og den rapportversion som anvendte snapshot'et.

Ingen af tabellens `AFVENTER`-felter må vises som valideret i produktet.
