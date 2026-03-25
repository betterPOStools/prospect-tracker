import { haversine } from './clustering.js'

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// Returns { assignments: [{ id, da }], skippedNoCoords: number }
export function autoAssignDay(dbRecords, day, n, areaFilter = 'all', excludeIds = null) {
  const todayISO = new Date().toISOString().slice(0, 10)
  let skippedNoCoords = 0
  const pool = dbRecords.filter(r => {
    if (r.st !== 'unworked' || r.da) return false
    if (r.co && r.co > todayISO) return false
    if (areaFilter !== 'all' && r.ar !== areaFilter) return false
    if (excludeIds && excludeIds.has(r.id)) return false
    if (!r.lt || !r.lg) { skippedNoCoords++; return false }
    return true
  })
  if (!pool.length) return { assignments: [], skippedNoCoords }

  const ZONE_RADIUS = 0.75

  // Anchor = record with most neighbors in radius (pure density)
  const anchorScores = pool.map(r => {
    const neighbors = pool.filter(nb =>
      nb.id !== r.id && haversine(r.lt, r.lg, nb.lt, nb.lg) <= ZONE_RADIUS
    ).length
    return { r, neighbors }
  }).sort((a, b) => b.neighbors - a.neighbors)

  const anchor = anchorScores[0].r

  // Fill by distance from anchor — closest first
  const inZone = pool
    .filter(r => haversine(anchor.lt, anchor.lg, r.lt, r.lg) <= ZONE_RADIUS)
    .sort((a, b) =>
      haversine(anchor.lt, anchor.lg, a.lt, a.lg) -
      haversine(anchor.lt, anchor.lg, b.lt, b.lg)
    )

  let toAssign = inZone.slice(0, n)

  // Wider fill — 1.5 mile radius, sorted by distance
  if (toAssign.length < n) {
    const inWider = pool
      .filter(r => !inZone.find(x => x.id === r.id) && haversine(anchor.lt, anchor.lg, r.lt, r.lg) <= 1.5)
      .sort((a, b) =>
        haversine(anchor.lt, anchor.lg, a.lt, a.lg) -
        haversine(anchor.lt, anchor.lg, b.lt, b.lg)
      )
    toAssign = [...toAssign, ...inWider.slice(0, n - toAssign.length)]
  }

  // Fallback — any remaining, sorted by distance
  if (toAssign.length < n) {
    const used = new Set(toAssign.map(r => r.id))
    const extras = pool
      .filter(r => !used.has(r.id))
      .sort((a, b) =>
        haversine(anchor.lt, anchor.lg, a.lt, a.lg) -
        haversine(anchor.lt, anchor.lg, b.lt, b.lg)
      )
      .slice(0, n - toAssign.length)
    toAssign = [...toAssign, ...extras]
  }

  return { assignments: toAssign.map(r => ({ id: r.id, da: day })), skippedNoCoords }
}

// Returns { assignments: [{ id, da }], skippedNoCoords: number }
export function autoFillWeek(dbRecords, n, areaFilter = 'all') {
  const allAssignments = []
  const excludeIds = new Set()
  let totalSkipped = 0

  for (let i = 0; i < DAYS.length; i++) {
    const { assignments, skippedNoCoords } = autoAssignDay(dbRecords, DAYS[i], n, areaFilter, excludeIds)
    assignments.forEach(a => { allAssignments.push(a); excludeIds.add(a.id) })
    totalSkipped = Math.max(totalSkipped, skippedNoCoords)
  }

  return { assignments: allAssignments, skippedNoCoords: totalSkipped }
}
