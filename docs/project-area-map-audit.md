# Projektområde-kort — audit

Dato: 2026-07-05
Rute: `/app/projects/geometry/$slug`
Filer: `src/routes/app.projects.geometry.$slug.tsx`, `src/components/maps/MapEditorMap.tsx`, `src/components/maps/AddressSearch.tsx`, `src/hooks/useMapEditor.ts`, `src/services/geo-service.ts`, `src/services/projects-service.ts`

## Hvad virker i dag

- Leaflet-kort med 4 baggrundslag (Satellit / Kort / Terræn / Topografi) — reelt skift mellem lag, aktiv-visualisering ok.
- Adressesøgning via Dataforsyningens autocomplete-endpoint (`api.dataforsyningen.dk/autocomplete`) med debounce, tastaturvalg, kortcentrering med `flyTo`.
- Tegn projektgrænse via `leaflet-draw` (Draw.Polygon). Efter Leaflet 1.8-patch for `readableArea` crasher tegningen ikke længere ved 2. punkt.
- Upload af GeoJSON: `parseProjectGeometry` validerer Polygon / Feature-wrapper og beregner centroid + areal i ha.
- Gem af tegnet grænse til `projects.geometry_polygon / _area_ha / _centroid_* / _source` via `updateProjectDetails`.
- WMS-overlays som checkbokse: matrikel (Dataforsyningen — kræver token), markblokke (Landbrugsstyrelsen — åbne data), §3-natur (Miljøportalen).
- Zoom-kontroller, scroll-zoom, pinch-zoom (Leaflet default).
- Reload-holdbar geometri: gemmes i Supabase eller seed-fallback via `projects-service`.

## Hvad kun er UI eller mock

- **Matrikel- og markblok-lag** er kun visuelle WMS-tiles. Brugeren kan ikke klikke på en flade for at vælge den som projektgrænse — det er kernefunktionaliteten der mangler.
- **Adressemarkør på kort**: efter valg af søgeresultat flyves der til stedet, men der placeres ingen marker/popup — brugeren mister den visuelle reference.
- **Live areal under tegning**: Leaflet.Draw viser sin egen indbyggede tooltip, men vi eksponerer ikke arealet i vores egen UI før tegningen er afsluttet.
- **Tegn-værktøjslinje**: Der er ingen synlige knapper for "Fortryd punkt", "Afslut flade" eller "Annuller" — brugeren skal kende Leaflet.Draw's tastaturgenveje eller ramme første punkt.
- **Versionshistorik**: kun ét geometri-felt på `projects`. Ingen `project_boundaries`-tabel, ingen versionsnumre, ingen kilde-metadata ud over det simple `geometry_source`-felt.
- Kort-popup ved gemt grænse viser kun navn + areal, ikke kilde/version.

## Knapper uden reel funktion

- "Vælg matrikel" / "Vælg markblok" som selvstændige værktøjer eksisterer ikke endnu (kun som passive WMS-toggles).
- "Se historik" i sidepanelet er ikke implementeret.
- "Ryd tegninger"-knappen i `MapEditorMap`-toolbar sletter uden bekræftelse — kan overraske brugeren.

## Hårdkodede data / referencer

- `DK_FALLBACK = { lat: 56.0, lng: 10.5 }` — fallback-center hvis projekt mangler koordinater. Ok.
- WMS-URL'er hårdkodet i route-filen med `VITE_DATAFORSYNINGEN_TOKEN` som klient-env — token-eksponering er acceptabel for Dataforsyningens WMS (er tiltænkt browserbrug), men matrikel-WFS til klik-vælg skal gå via server for at holde credentials væk fra klient.

## API'er / datakilder i brug

| Kilde | Type | Nøgle | Formål |
| --- | --- | --- | --- |
| Dataforsyningen `/autocomplete` | REST | Nej | Adresse/stednavne-autocomplete |
| Dataforsyningen `/reverse` | REST | Nej | Reverse geocoding (kommune/region) |
| Dataforsyningen `wms/matrikel` | WMS | Ja (token) | Matrikelskel visuelt lag |
| Landbrugsstyrelsen `kort.lbst.dk` | WMS/WFS | Nej | Markblokke |
| Miljøportalen `arealdata-api` | WMS | Nej | §3-natur |
| Esri / OSM / OpenTopoMap | Tiles | Nej | Baggrundskort |

Note: brugeren nævnte at "DAWA er lukket". Dataforsyningens autocomplete-endpoint (`api.dataforsyningen.dk`) kører fortsat og er den officielt anbefalede efterfølger til det tidligere DAWA-brand. Vi flytter kaldet bag en server-fn så vi kan skifte kilde uden UI-ændring, og fjerner "DAWA" fra hjælpetekst.

## Ændringer implementeret i denne omgang

Se `docs/project-area-map-implementation.md`.

## Kendte begrænsninger efter denne omgang

- **Matrikel-klik-vælg**: kræver Datafordeler service-bruger (username + password). Værktøjet er tilføjet men disabled indtil credentials sættes som `DATAFORDELER_USER` / `DATAFORDELER_PASS` server-secrets. Se `docs/project-area-map-implementation.md`.
- **Versionshistorik-tabel** (`project_boundaries`): ikke oprettet endnu — kræver DB-migration + user approval. Aktuel gem-flow overskriver stadig `projects.geometry_*`.
- **Self-intersection-validering** af tegnede polygoner: baseres på Leaflet.Draw's `allowIntersection: false` — der er ingen ekstra Turf-baseret validering før gem.
