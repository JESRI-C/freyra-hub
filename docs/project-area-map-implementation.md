# Projektområde-kort — implementering (2026-07-05)

## Nye / ændrede filer

- `src/lib/geo-search.functions.ts` (ny) — server-side proxy til Dataforsyningens adresse-API + `getFeatureAtPoint` til WFS-opslag (markblok nu, matrikel når credentials tilføjes).
- `src/components/maps/AddressSearch.tsx` — bruger server-fn `searchPlaces` / `resolvePlace`. DAWA-branding fjernet, tekst opdateret til "Dataforsyningens adressetjeneste".
- `src/components/maps/MapEditorMap.tsx` — tilføjet:
  - Tegn-værktøjslinje under kortet med "Fortryd sidste punkt", "Afslut flade", "Annuller".
  - Live punkt-tæller + løbende areal under tegning.
  - `addressMarker` prop — viser en marker + popup ved valgt søgeresultat.
  - `pickMode` prop + `onFeaturePicked` callback — klik på kortet i pick-mode kalder callback med lat/lng.
- `src/routes/app.projects.geometry.$slug.tsx` — reorganiseret venstre panel i 4 sektioner (Find sted / Vælg projektgrænse / Kortlag / Aktuelt område), tilføjet knapperne "Tegn manuelt", "Vælg matrikel", "Vælg markblok", "Upload GeoJSON", tydelig kildeoprindelse i "Aktuelt område".

## Nye API-routes / server-funktioner

`src/lib/geo-search.functions.ts` eksporterer:

- `searchPlaces({ q })` — proxy til `api.dataforsyningen.dk/autocomplete`. Fjerner CORS-risiko og gør det trivielt at swappe til Datafordeler senere.
- `resolvePlace({ href })` — henter koordinater for adgangsadresse/stednavn.
- `pickMarkblok({ lat, lng })` — WFS GetFeature mod `kort.lbst.dk` med `INTERSECTS(POINT lng lat)`. Returnerer markblok-polygon + metadata (id, areal, opdateringsdato hvis tilgængelig).
- `pickMatrikel({ lat, lng })` — samme mønster mod Datafordelerens Matrikel-WFS. Kaster `unauthorized` hvis `DATAFORDELER_USER` / `DATAFORDELER_PASS` ikke er sat.

Alle funktioner er offentlige (ingen `requireSupabaseAuth`) da endpoints er offentlige geodata — men de kører server-side så credentials holdes ude af klienten.

## Nødvendige miljøvariabler

Ingen nye krav for at bruge markblok-vælg. For matrikel-vælg skal følgende server-secrets sættes:

- `DATAFORDELER_USER` — service-bruger navn hos Datafordeleren
- `DATAFORDELER_PASS` — service-bruger password

Tilføjes med `add_secret`-tool når credentials er tilgængelige. Uden dem er "Vælg matrikel"-knappen disabled med en tydelig hjælpetekst.

## Eksterne tjenester der skal være aktive

- Dataforsyningen autocomplete + reverse (åbne endpoints, ingen aktivering).
- Landbrugsstyrelsens markblok-WFS (`kort.lbst.dk`, åbne data).
- Datafordelerens Matrikel-WFS (kræver oprettet service-bruger).

## Kendte begrænsninger

- Versionshistorik: ikke implementeret som separat tabel endnu. Aktuel gem overskriver `projects.geometry_polygon`. Migration til `project_boundaries` foreslås som næste skridt.
- Vælg-flere-matrikler / MultiPolygon: modellen understøtter kun én Polygon pr. projekt indtil `project_boundaries` findes.
- Turf-baseret self-intersection validering ved GeoJSON-upload er ikke tilføjet — vi accepterer alt der parser som Polygon.

## Test

Se `docs/project-area-map-test-plan.md`.
