# VAL GEO — Charleston

**Point at a place. Ask anything.**

VAL GEO is a location-intelligence application for Charleston, South Carolina. It combines a real interactive map with first-party public GIS evidence from the City of Charleston and Charleston County. A click on the map resolves the location and pulls zoning, future land use, flood zone, historic-district status, parcel/property signals, permits, new development, new construction, parking/transit, and nearby OpenStreetMap places in parallel.

The app deliberately separates **facts** from **judgment**:

- GIS adapters retrieve the evidence.
- A deterministic, inspectable `Location Signal Score` summarizes the evidence.
- Val can explain the location using the same evidence bundle when `OPENAI_API_KEY` is configured.
- Every evidence card links back to its source service.

## Data sources

- City of Charleston GIS — zoning / overlays / Mapnet / applications
- Charleston County GIS — parcel boundaries
- City of Charleston address locator — geocoding and reverse geocoding
- OpenStreetMap Overpass — nearby POIs (best-effort supplementary source)

## Environment variables

Optional:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-terra
```

Without an OpenAI key, the map, GIS evidence, scoring, geocoding, geometry drawing, and deterministic location briefing still work. The `/api/ask` endpoint falls back to an evidence-only response.

## Local validation

```bash
npm test
npm run check
```

## Product rule

VAL GEO never treats a model-generated statement as source data. Zoning, parcel, flood, permit and development facts must originate in the evidence adapters or be marked unavailable.
