// Corridor-based candidate selection. Given a start A and end B, picks database
// records that lie along the A→B corridor (ellipse with foci at A/B and semi-
// minor axis = widthMiles), then returns the top N or as many as fit inside a
// time budget. The Route tab still does the actual sequencing via RouteXL —
// this module only *selects*.
//
// Shared storage keys with RouteTab so the "corridor plan → optimize route"
// flow works without re-entering start/end:
//   vs_rxl_start_choice, vs_rxl_end_choice, vs_rxl_home_addr, vs_rxl_work_addr,
//   vs_rxl_home_coords, vs_rxl_work_coords, vs_rxl_custom_start, vs_rxl_custom_end

import { haversine } from './clustering.js'

// BUSINESS RULE: per-stop visit time. Most canvass stops are under 3 min
// (door-knock, quick pitch, leave or advance). 5 is the realistic max for a
// stop that turns into a brief conversation. Bump only if the rep reports
// consistently longer visits.
const DEFAULT_VISIT_MIN = 3
const DEFAULT_AVG_MPH = 25

// Ellipse test: point is in corridor iff (dist_to_A + dist_to_B) ≤ A↔B + 2·width.
// Equivalent to "perpendicular distance from the A→B line ≤ width" for points
// between A and B, but also catches points slightly past either endpoint.
export function filterCorridor(records, a, b, widthMiles) {
  const baseLine = haversine(a.lat, a.lng, b.lat, b.lng)
  const maxSum = baseLine + 2 * Math.max(0.1, widthMiles)
  return records.filter(r => {
    if (typeof r.lt !== 'number' || typeof r.lg !== 'number') return false
    const da = haversine(a.lat, a.lng, r.lt, r.lg)
    const db = haversine(b.lat, b.lng, r.lt, r.lg)
    return (da + db) <= maxSum
  })
}

// Scalar projection of point p onto the A→B line, in miles from A.
// Uses law-of-cosines inversion — no planar approximation so it stays accurate
// over the distances we care about (single city/region).
function projectOnLine(a, b, p) {
  const total = haversine(a.lat, a.lng, b.lat, b.lng)
  if (total === 0) return 0
  const da = haversine(a.lat, a.lng, p.lt, p.lg)
  const db = haversine(b.lat, b.lng, p.lt, p.lg)
  const cosA = (da * da + total * total - db * db) / (2 * da * total)
  return da * Math.max(-1, Math.min(1, cosA))
}

function driveMinutes(fromLat, fromLng, toLat, toLng, avgMph) {
  const miles = haversine(fromLat, fromLng, toLat, toLng)
  return (miles / avgMph) * 60
}

/**
 * Select corridor stops. Returns { stops, estMinutes, rejected }.
 *
 * `mode === 'count'`: sort by static score desc, take top N. Then re-order by
 *   projection so the time estimate reflects a sensible traversal.
 * `mode === 'budget'`: sort by projection (A→B order), greedy pick until the
 *   minute budget is exhausted. Records are kept or dropped in corridor order;
 *   we don't re-sort by score because that would jump the rep back and forth.
 */
export function selectCorridorStops(records, a, b, opts = {}) {
  const {
    widthMiles = 2,
    mode = 'count',
    count = 10,
    minutes = 120,
    visitMin = DEFAULT_VISIT_MIN,
    avgMph = DEFAULT_AVG_MPH,
    scoreTieBreaker = r => (r.sc || 0),
  } = opts

  const inCorridor = filterCorridor(records, a, b, widthMiles)
  const rejected = records.length - inCorridor.length

  if (mode === 'count') {
    const ranked = [...inCorridor].sort((x, y) => scoreTieBreaker(y) - scoreTieBreaker(x)).slice(0, count)
    const ordered = ranked
      .map(r => ({ r, proj: projectOnLine(a, b, r) }))
      .sort((x, y) => x.proj - y.proj)
      .map(e => e.r)
    return { stops: ordered, estMinutes: estimateTotal(a, b, ordered, visitMin, avgMph), rejected }
  }

  // budget mode
  const ordered = inCorridor
    .map(r => ({ r, proj: projectOnLine(a, b, r) }))
    .sort((x, y) => x.proj - y.proj)
    .map(e => e.r)
  const picked = []
  let totalMin = 0
  let prev = { lat: a.lat, lng: a.lng }
  for (const r of ordered) {
    const cost = driveMinutes(prev.lat, prev.lng, r.lt, r.lg, avgMph) + visitMin
    const tailDrive = driveMinutes(r.lt, r.lg, b.lat, b.lng, avgMph)
    // Reserve the tail drive so we don't exceed the budget including the
    // trip back to the end waypoint.
    if (totalMin + cost + tailDrive > minutes) break
    picked.push(r)
    totalMin += cost
    prev = { lat: r.lt, lng: r.lg }
  }
  return { stops: picked, estMinutes: estimateTotal(a, b, picked, visitMin, avgMph), rejected }
}

function estimateTotal(a, b, stops, visitMin, avgMph) {
  if (stops.length === 0) return Math.round(driveMinutes(a.lat, a.lng, b.lat, b.lng, avgMph))
  let total = 0
  let prev = { lat: a.lat, lng: a.lng }
  for (const r of stops) {
    total += driveMinutes(prev.lat, prev.lng, r.lt, r.lg, avgMph) + visitMin
    prev = { lat: r.lt, lng: r.lg }
  }
  total += driveMinutes(prev.lat, prev.lng, b.lat, b.lng, avgMph)
  return Math.round(total)
}
