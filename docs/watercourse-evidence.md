# Watercourse evidence implementation

Centerline versions and manual observations are append-only. Original media, project polygons, photo locations and centerlines remain separate. Station zero is the first coordinate; direction is an explicit label, never inferred from coordinates. Length uses WGS84 geodesic segments; it is not a field survey. Database trigger recomputes length and validates stationing.

The map supports drawing a LineString, or importing one through existing GeoJSON/KML/GPX parsers. Exactly one WGS84 LineString is accepted; projected coordinates must be transformed before import. Saving creates a new immutable version with non-overlapping segments. Original versions remain available through the service. Concurrent version-number conflicts fail visibly and require reloading.

Map photo points use each original's own valid GPS, never a centroid. Unpositioned photos are counted and remain available in the before/after selector. Comparison flags cover position, direction, lighting, missing data and source quality. They do not constitute quantitative change measurement. Manual observations require a source, segment, version and stable object key. Species remain suggestions until a separately recorded explicit review. No biomass, hydraulic capacity or NDVI is inferred from RGB photographs.

## Official layer live dependency

On 2026-10-26 the previous hardcoded `https://arealdata.miljoeportal.dk/gis/ows?service=WFS&request=GetCapabilities` returned the Arealdata HTML application rather than WFS. The implementation therefore no longer silently treats this as a successful empty dataset.

Obtain the current WFS distribution URL and type names from the official Arealdata dataset pages, following https://support.miljoeportal.dk/hc/da/articles/360016780777-Arealdata-Udstilling-af-data. Configure public (non-secret) `VITE_DMP_WFS_URL`, `VITE_DMP_WFS_NAMESPACE` and `VITE_DMP_PROTECTED_WATERCOURSE_TYPENAME`. Current §3 type codes in the adapter need verification against that distribution before live release. Do not place credentials in VITE variables. If the distribution requires authentication, use an authorized server adapter instead.

A missing provider, partial layer failure, malformed response, or a capped 50-feature result is an error, not zero. §3 overlap requires the actual project polygon, queries its full bounding box, unions source polygons to avoid double counting, and intersects with the project polygon. Layer source and fetch time are displayed; output is screening, not a legal determination. Provider pagination remains a live integration follow-up.

## Validation boundaries

Unit tests cover coordinate rejection, line roundtrip, station lengths, overlap/duplicate segments, unsuitable measurement bases, photo pair flags, species suggestion status, duplicate photo IDs, provider errors and full-polygon bounding box. Migration must be tested in isolated PostgreSQL with two organizations before release. No live migrations, mail, provider charge, production deploy or customer-data mutation performed.
