export function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dlat = (lat2 - lat1) * Math.PI / 180
  const dlng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dlng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}
