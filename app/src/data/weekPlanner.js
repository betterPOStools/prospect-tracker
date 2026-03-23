import { haversine } from './clustering.js'

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// Returns array of { id, da } assignments for the given day
export function autoAssignDay(dbRecords, day, n, areaFilter = 'all') {
  const pool = dbRecords.filter(r =>
    r.st === 'unworked' && !r.da &&
    r.lt && r.lg &&
    (areaFilter === 'all' || r.ar === areaFilter)
  )
  if (!pool.length) return []

  const ZONE_RADIUS = 0.75

  const PRI_WEIGHT = { Fire: 40, Hot: 30, Warm: 10, Cold: 2, Dead: 0 }
  const anchorScores = pool.map(r => {
    const baseScore = (PRI_WEIGHT[r.pr] ?? 2) + r.sc * 0.3
    const hotNeighbors = pool.filter(nb =>
      nb.id !== r.id && (nb.pr === 'Fire' || nb.pr === 'Hot') &&
      haversine(r.lt, r.lg, nb.lt, nb.lg) <= ZONE_RADIUS
    ).length
    return { r, anchorVal: baseScore + hotNeighbors * 8 }
  }).sort((a, b) => b.anchorVal - a.anchorVal)

  const anchor = anchorScores[0].r

  const inZone = pool
    .filter(r => haversine(anchor.lt, anchor.lg, r.lt, r.lg) <= ZONE_RADIUS)
    .sort((a, b) => {
      const distA = haversine(anchor.lt, anchor.lg, a.lt, a.lg)
      const distB = haversine(anchor.lt, anchor.lg, b.lt, b.lg)
      return (b.sc * 0.6 - distB * 20) - (a.sc * 0.6 - distA * 20)
    })

  let toAssign = inZone.slice(0, n)

  if (toAssign.length < n) {
    const inWider = pool
      .filter(r => !inZone.find(x => x.id === r.id) && haversine(anchor.lt, anchor.lg, r.lt, r.lg) <= 1.5)
      .sort((a, b) => b.sc - a.sc)
    toAssign = [...toAssign, ...inWider.slice(0, n - toAssign.length)]
  }

  if (toAssign.length < n) {
    const used = new Set(toAssign.map(r => r.id))
    const extras = pool.filter(r => !used.has(r.id)).sort((a, b) => b.sc - a.sc).slice(0, n - toAssign.length)
    toAssign = [...toAssign, ...extras]
  }

  return toAssign.map(r => ({ id: r.id, da: day }))
}

// Returns array of { id, da } assignments for whole week
export function autoFillWeek(dbRecords, dbClusters, n) {
  const recordById = new Map(dbRecords.map(r => [r.id, r]))
  // Score clusters by unworked hot value
  const clusterValue = dbClusters.map(c => ({
    ...c,
    value: (c.mb || []).reduce((s, id) => {
      const r = recordById.get(id)
      if (!r || r.st !== 'unworked') return s
      return s + (r.pr === 'Fire' ? 4 : r.pr === 'Hot' ? 3 : r.pr === 'Warm' ? 1 : 0)
    }, 0)
  })).filter(c => c.value > 0).sort((a, b) => b.value - a.value)

  const assigned = []
  const usedZips = new Set()
  for (const c of clusterValue) {
    if (assigned.length >= 5) break
    if (assigned.length < 3 && usedZips.has(c.zi) && clusterValue.filter(x => !usedZips.has(x.zi)).length > 0) continue
    assigned.push(c)
    usedZips.add(c.zi)
  }
  if (assigned.length < 5) {
    for (const c of clusterValue) {
      if (assigned.length >= 5) break
      if (!assigned.find(x => x.id === c.id)) assigned.push(c)
    }
  }

  const result = []
  assigned.forEach((c, i) => {
    const day = DAYS[i]
    const members = c.mb
      .map(id => recordById.get(id))
      .filter(r => r && r.st === 'unworked')
      .sort((a, b) => {
        const distA = haversine(c.lt, c.lg, a.lt, a.lg)
        const distB = haversine(c.lt, c.lg, b.lt, b.lg)
        return (b.sc * 0.6 - distB * 20) - (a.sc * 0.6 - distA * 20)
      })
      .slice(0, n)
    members.forEach(r => result.push({ id: r.id, da: day }))
  })

  return result
}
