// RouteXL API integration
// POST https://api.routexl.com/tour
// Free tier: max 20 stops

export interface RxlStop {
  name: string
  lat: number
  lng: number
}

export interface RxlResult {
  route: Record<string, RxlStop & { departure?: number; arrival?: number }>
  error?: string
}

/**
 * Optimize a route using the RouteXL API.
 * Stops are keyed "0", "1", ... in the request payload.
 * The API returns them re-ordered in its response route object.
 */
export async function optimizeRoute(
  stops: RxlStop[],
  username: string,
  password: string,
): Promise<RxlResult> {
  if (stops.length > 20) {
    console.warn('[routeXL] Free tier supports max 20 stops. Received:', stops.length)
  }

  // Build locations object: { "0": { name, lat, lng }, "1": {...}, ... }
  const locations: Record<string, RxlStop> = {}
  stops.forEach((stop, i) => {
    locations[String(i)] = { name: stop.name, lat: stop.lat, lng: stop.lng }
  })

  const credentials = btoa(`${username}:${password}`)

  const response = await fetch('https://api.routexl.com/tour', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ locations }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    return { route: {}, error: `RouteXL error ${response.status}: ${text}` }
  }

  const data = await response.json() as RxlResult
  return data
}

/**
 * Geocode an address using Nominatim (OpenStreetMap).
 * Returns { lat, lng } or null if not found.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ProspectTracker/1.0',
    },
  })

  if (!response.ok) return null

  const results = await response.json() as Array<{ lat: string; lon: string }>
  if (!results.length) return null

  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
  }
}
