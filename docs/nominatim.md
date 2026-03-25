# Nominatim API (OpenStreetMap)

## Overview
Free geocoding service from OpenStreetMap. No API key required. Rate limit: 1 request/second.

## Endpoint
- `GET https://nominatim.openstreetmap.org/search`

## Parameters
- `q` — address string to geocode
- `format=json` — response format
- `limit=1` — number of results

## Headers
- `Accept-Language: en` — return English place names

## Response
```json
[
  {
    "lat": "34.0007",
    "lon": "-81.0348",
    "display_name": "123 Main St, Columbia, SC 29201, USA",
    ...
  }
]
```

## Usage in app
- `CanvassCard.jsx` — geocode individual stops for Google Maps links
- `RouteTab.jsx` — batch geocode all stops before sending to RouteXL
- No API key needed, but must respect 1 req/sec rate limit
