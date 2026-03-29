const EARTH_RADIUS_MILES = 3958.8

/**
 * Haversine formula — great-circle distance between two lat/lng points in miles.
 */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dlat = (lat2 - lat1) * (Math.PI / 180)
  const dlng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dlng / 2) ** 2
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(a))
}
