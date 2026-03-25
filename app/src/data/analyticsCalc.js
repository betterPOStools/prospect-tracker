// Pure computation functions for the Analytics dashboard — no React deps

export function calcPipeline(dbRecords) {
  const byPriority = { Fire: 0, Hot: 0, Warm: 0, Cold: 0, Dead: 0 }
  const byStatus   = { unworked: 0, in_canvass: 0, canvassed: 0, converted: 0, lead: 0 }

  for (const r of dbRecords) {
    if (byPriority[r.pr] !== undefined) byPriority[r.pr]++
    const st = r.st || 'unworked'
    if (byStatus[st] !== undefined) byStatus[st]++
  }

  const worked = byStatus.in_canvass + byStatus.canvassed + byStatus.converted + byStatus.lead
  const conversionRate = worked > 0 ? (byStatus.converted + byStatus.lead) / worked : null

  return { total: dbRecords.length, byPriority, byStatus, conversionRate }
}

export function calcCanvassPerf(canvassStops, dailyLog) {
  const todayStr = new Date().toLocaleDateString()

  // Today's snapshot from live canvass data
  const todayStops = canvassStops.filter(c => c.date === todayStr)
  const today = {
    total:       todayStops.length,
    notVisited:  todayStops.filter(c => c.status === 'Not visited yet').length,
    noAnswer:    todayStops.filter(c => c.status === 'No answer / closed').length,
    comeBack:    todayStops.filter(c => c.status === 'Come back later').length,
    dmu:         todayStops.filter(c => c.status === 'Decision maker unavailable').length,
    notInterested: todayStops.filter(c => c.status === 'Not interested').length,
    dropped:     todayStops.filter(c => c.status === 'Dropped folder').length,
    converted:   todayStops.filter(c => c.status === 'Converted').length,
  }

  // Historical from daily log
  const days = dailyLog.length
  const totalStops = dailyLog.reduce((s, d) => s + (d.total || 0), 0)
  const totalConverted = dailyLog.reduce((s, d) => s + (d.converted || 0), 0)
  const avgStopsPerDay = days > 0 ? totalStops / days : 0
  const avgConversionRate = totalStops > 0 ? totalConverted / totalStops : null

  // Last 14 days for sparkline
  const recent = dailyLog.slice(-14)

  return { today, dailyLog: recent, avgStopsPerDay, avgConversionRate, totalDaysLogged: days }
}

export function calcTerritory(dbRecords, dbClusters) {
  // By area
  const areaMap = {}
  for (const r of dbRecords) {
    const area = r.ar || 'Unknown'
    if (!areaMap[area]) areaMap[area] = { area, total: 0, unworked: 0, converted: 0, totalScore: 0 }
    areaMap[area].total++
    areaMap[area].totalScore += (r.sc || 0)
    if (!r.st || r.st === 'unworked') areaMap[area].unworked++
    if (r.st === 'converted' || r.st === 'lead') areaMap[area].converted++
  }
  const byArea = Object.values(areaMap).map(a => ({
    ...a,
    avgScore: a.total > 0 ? Math.round(a.totalScore / a.total) : 0,
    convRate: (a.total - a.unworked) > 0 ? a.converted / (a.total - a.unworked) : null,
  })).sort((a, b) => b.total - a.total)

  // By zone
  const recordMap = {}
  for (const r of dbRecords) recordMap[r.id] = r

  const byZone = (dbClusters || []).map(c => {
    const members = (c.mb || []).map(id => recordMap[id]).filter(Boolean)
    const total = members.length
    const worked = members.filter(r => r.st && r.st !== 'unworked').length
    const priorityDist = { Fire: 0, Hot: 0, Warm: 0, Cold: 0, Dead: 0 }
    for (const r of members) {
      if (priorityDist[r.pr] !== undefined) priorityDist[r.pr]++
    }
    return {
      zone: c.zone || c.id,
      total,
      worked,
      unworked: total - worked,
      pctWorked: total > 0 ? Math.round((worked / total) * 100) : 0,
      priorityDist,
    }
  }).sort((a, b) => b.total - a.total)

  return { byArea, byZone }
}

export function calcDataQuality(dbRecords) {
  const total = dbRecords.length
  if (total === 0) return null

  let withEmail = 0, withPhone = 0, withContact = 0, withHours = 0, withEmployees = 0, withWebsite = 0
  let totalScore = 0
  const scoreBuckets = new Array(10).fill(0) // 0-9, 10-19, ..., 90-100

  for (const r of dbRecords) {
    if (r.em)  withEmail++
    if (r.ph)  withPhone++
    if (r.cn)  withContact++
    if (r.hr)  withHours++
    if (r.emp > 0) withEmployees++
    if (r.web) withWebsite++
    totalScore += (r.sc || 0)
    const bucket = Math.min(Math.floor((r.sc || 0) / 10), 9)
    scoreBuckets[bucket]++
  }

  const pct = n => Math.round((n / total) * 100)

  return {
    total,
    withEmail, pctEmail: pct(withEmail),
    withPhone, pctPhone: pct(withPhone),
    withContact, pctContact: pct(withContact),
    withHours, pctHours: pct(withHours),
    withEmployees, pctEmployees: pct(withEmployees),
    withWebsite, pctWebsite: pct(withWebsite),
    avgScore: Math.round(totalScore / total),
    scoreBuckets,
  }
}

export function calcLeadPipeline(prospects) {
  const byStatus = { Open: 0, Won: 0, Lost: 0, Abandoned: 0 }
  for (const p of prospects) {
    if (byStatus[p.status] !== undefined) byStatus[p.status]++
  }
  const decided = byStatus.Won + byStatus.Lost
  const winRate = decided > 0 ? byStatus.Won / decided : null

  return { total: prospects.length, byStatus, winRate }
}
