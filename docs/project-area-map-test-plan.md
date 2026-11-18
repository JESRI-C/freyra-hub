# Projektområde-kort — testplan

## Manuel test på `/app/projects/geometry/$slug`

### Adressesøgning
1. Indtast "Rådhuspladsen 1, København". Forslag skal vises inden for 500 ms.
2. Vælg forslag → kortet flyver til stedet, marker + popup vises, zoom ≥ 17.
3. Test tastaturnavigation (piletaster, Enter, Escape).
4. Test stednavn "Skallebæk Å" → kortet centrerer, marker vises.
5. Rens søgning med X-knappen.

### Tegn projektgrænse (manuelt)
1. Klik "Tegn manuelt".
2. Sæt ≥ 5 punkter. Verificér: tegningen lukker IKKE efter 3 punkter.
3. Live-tæller viser antal punkter og løbende areal.
4. Klik "Fortryd sidste punkt" → seneste vertex fjernes.
5. Klik "Afslut flade" → polygonen lukker, areal + omkreds vises.
6. Klik "Annuller" i stedet → tegningen forsvinder.
7. Verificér at dobbeltklik ikke afslutter uventet.

### Vælg markblok
1. Zoom ind til landbrugsområde (fx Haderslev-området).
2. Klik "Vælg markblok" i venstre panel.
3. Klik på en markblok. Info-popup skal vise markblok-id + areal + kilde.
4. Klik "Brug som projektgrænse" → gemmes med `geometry_source = "markblok"`.
5. Reload siden — geometrien er stadig gemt.

### Vælg matrikel
1. Uden `DATAFORDELER_USER/PASS`: knappen er disabled og viser hjælpetekst.
2. Med credentials: samme flow som markblok, men mod Datafordelerens WFS.

### Upload GeoJSON
1. Upload gyldig `.geojson` med Polygon → preview vises, "Brug som projektgrænse" bekræfter.
2. Upload en fil med invalid JSON → tydelig fejlbesked.
3. Upload en fil med LineString → afvises med "ikke en gyldig Polygon".

### Kortlag
1. Toggle "Matrikelskel" — WMS-tiles vises (visuel reference).
2. Toggle "Markblokke" — WMS-tiles vises.
3. Toggle "§3 beskyttet natur" — vises.
4. Lag-skift må ikke slette igangværende tegning eller ændre gemt grænse.
5. Baggrundsskift (Satellit/Kort/Terræn/Topografi) må heller ikke.

### Persistens og reload
1. Gem en grænse. Reload. Grænsen skal stadig være der.
2. Naviger til `/app/projects/$slug` — analyse-kortene (NDVI, biodiversitet) skal nu vises fordi `hasRealGeometry` er sand.

### Mobil (viewport 375×812)
1. Panelerne stakker vertikalt over kortet.
2. Pinch-zoom fungerer.
3. Tegn-værktøjslinjen er stadig tilgængelig.

## Automatiseret

- Der køres ikke unit-tests på interaktive Leaflet-flows i denne omgang. `parseProjectGeometry` er dækket af eksisterende tests i `src/components/maps/__tests__/map-geometry.test.ts`.

## Regressionscheck

- `pnpm build` skal passere uden nye TS-fejl.
- `/app/projects/$slug` uden geometri viser stadig "Definér projektområde"-banner.
