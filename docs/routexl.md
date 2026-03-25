# RouteXL API

## Auth
HTTP Basic Auth with username + password. Free tier: up to 20 stops per route.

Register at: https://www.routexl.com/register

## Endpoint
- `POST https://api.routexl.com/tour/` — optimize a route

## Request
Content-Type: `application/x-www-form-urlencoded`

Body param `locations` is a JSON string of numbered waypoints:
```json
{
  "0": { "address": "123 Main St", "lat": 34.05, "lng": -80.95 },
  "1": { "address": "456 Oak Ave", "lat": 34.06, "lng": -80.94 }
}
```

## Response
```json
{
  "route": {
    "0": { "name": "123 Main St", "arrival": 0, "distance": 0, ... },
    "1": { "name": "456 Oak Ave", "arrival": 300, "distance": 2.5, ... }
  },
  "count": 2
}
```

Route keys are the optimized order (0 = first stop). Each entry has arrival time in seconds and distance.

## Usage in app
- Stops geocoded via Nominatim first, then sent to RouteXL
- Credentials stored in localStorage (`vs_rxl_user`, `vs_rxl_pass`)
- Used in RouteTab for single "Navigate" button that opens optimized Google Maps directions
