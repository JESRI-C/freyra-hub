# Live Data Setup

## Overview

The live data layer connects GoFreyra to real Danish and European environmental APIs. All connectors fall back to preview/seed data when keys are absent — the app never crashes.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values you have:

```
VITE_ENABLE_LIVE_DATA=false        # Set to "true" to activate live fetching
VITE_DMI_API_KEY=                  # DMI Open Data API key
VITE_DATAFORDELER_KEY=             # Datafordeler password (used with username ANONYMOUS)
VITE_COPERNICUS_TOKEN=             # Copernicus Data Space bearer token
```

Setting `VITE_ENABLE_LIVE_DATA=false` (the default) always uses preview data regardless of which keys are present. Set it to `"true"` to enable real API calls for any key that is present.

## How to Get Each Key

### DMI Open Data (`VITE_DMI_API_KEY`)

1. Go to https://open.dmi.dk
2. Create a free user account
3. Navigate to "API-nøgler" in your profile
4. Create a key for the **Meteorological Observations** product
5. Paste the key into `VITE_DMI_API_KEY`

No cost for basic observation data. Rate limit: 100 requests/minute.

### Datafordeler (`VITE_DATAFORDELER_KEY`)

1. Go to https://datafordeler.dk
2. Click "Opret bruger" and register with a Danish NemID/MitID or organisation
3. Under "Tjenester", request access to **STEDNAVNE / Stednavne**
4. Your account password becomes the API password — use it as `VITE_DATAFORDELER_KEY`
5. The connector sends username `ANONYMOUS` and your password to the REST endpoint

Note: Datafordeler uses a username/password pattern rather than a single API key. Only the password is needed here.

### Copernicus Data Space (`VITE_COPERNICUS_TOKEN`)

1. Go to https://dataspace.copernicus.eu
2. Register for a free account
3. The STAC catalogue (`/stac/collections/SENTINEL-2/items`) is accessible with a Bearer token
4. Obtain a token from the Identity Provider: POST to `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`
5. For development, you can get a short-lived token via the Copernicus Browser after login

Note: The STAC search API is open for discovery. Actual scene download (Processing API) requires OAuth and is not implemented in this layer.

## Preview Mode (Default)

Without any keys or with `VITE_ENABLE_LIVE_DATA=false`:

- DMI: returns sample weather data (12.4°C, 5.1 m/s wind, 78% humidity)
- Miljøportal: returns 3 sample protected species registrations
- Datafordeler: returns 2 sample place names near Haderslev
- Copernicus: returns 2 sample Sentinel-2 scene entries with NDVI estimate 0.68

Preview data is stable and deterministic — useful for UI development without API costs.

## Activating Live Mode

```bash
# .env.local
VITE_ENABLE_LIVE_DATA=true
VITE_DMI_API_KEY=your-key-here
```

Only connectors with a valid key will fetch live. Connectors without a key automatically return preview data. The mode badge in the Miljødata tab reflects the actual state.

## Diagnostics

Navigate to `/app/system-test` to see:

- Which keys are configured
- Which connectors are in live vs preview vs missing-key state
- Current mode

## Known Limitations

- **Datafordeler** uses an unusual `username/password` REST pattern — not a standard Bearer token. If Datafordeler changes their auth scheme, update `dataforsyningen-client.ts`.
- **Copernicus STAC** is open for metadata search, but scene download requires the Processing API (OGC WPS) with OAuth2. NDVI calculation from raw bands is not implemented here.
- **Miljøportal Naturdatabasen** REST API endpoint (`/api/Species`) is undocumented and may change. The WFS alternative (`GetFeature`) is more stable but requires BBOX polygon encoding.
- Fetch logs are written to the `connector_fetch_logs` Supabase table only when Supabase is configured. In DEV without Supabase, logs appear in the browser console.

## Next Data Sources to Add

1. **GEUS Jupiter boreholes** — already scaffolded in connector-service; open API, no key needed. Wire up `https://data.geus.dk/geusapi/borehole`
2. **EU-Hydro watercourses** — placeholder `watercourseContext` exists in `ProjectEnvironmentalContext`
3. **Datafordeler DHM terrain** — terrain elevation tiles; add `dataforsyningen-client` DHM variant
4. **DAWA (Danmarks Adressers Web API)** — free, no key, for municipality/region lookup from coordinates
