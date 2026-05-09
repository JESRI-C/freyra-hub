# GoFreyra Geo Service

## What it does

The geo service provides coordinate math, geometry validation and buffer metadata
for project polygons.

## Functions

- `validateGeoJSONPolygon(input)` — type guard for GeoJSON Polygon
- `computeCentroid(polygon)` — arithmetic mean of outer ring vertices
- `computeAreaHa(polygon)` — Shoelace formula, flat-earth, <1% error for areas <50km²
- `haversineDistance(a, b)` — great-circle distance in metres
- `buildBufferZonesMeta()` — metadata flags for 100/500/1000m buffers
- `parseProjectGeometry(raw)` — parse string/object into ProjectGeometry
- `getProjectGeometrySeed(projectId)` — look up seed geometry by project ID

## Geometry in seed data

`SEED_PROJECT_GEOMETRIES` in `platform-seed.ts`:

- Project 1 (Skallebæk): valid polygon, 7.3 ha
- Project 2 (Nordic Coastal): valid polygon, 840 ha
- Project 3 (Urban Water): centroid only, no polygon
- Project 4 (Danish Wetland): no geometry

## Next steps: turf.js integration

Real buffer polygons, spatial intersection with nature layers, and
area-weighted environmental scores require turf.js:

```bash
npm install @turf/turf
```

Functions to upgrade:

- `buildBufferZones(polygon, distances)` → real GeoJSON buffers
- `intersectWithNatureLayers(buffer, natureLayers)` → overlap %
- `distanceToFeature(centroid, feature)` → accurate point-to-polygon distance

## GIS map view

Polygon display on a map requires maplibre-gl or leaflet. Planned for next sprint.
