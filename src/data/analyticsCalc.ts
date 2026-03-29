// Pure computation functions for the Analytics dashboard — no React deps.
// Field names use the new normalized schema (full names, not abbreviations).

import type { ProspectRecord, Lead, CanvassStop, Priority } from '../types'
import type { DaySummary } from './canvassLog'

// ── Pipeline overview ────────────────────────────────────────────────────────

export interface PipelineStats {
  total: number
  byPriority: Record<Priority, number>
  byStatus: Record<string, number>
  conversionRate: number | null
}

export function calcPipeline(records: ProspectRecord[]): PipelineStats {
  const byPriority: Record<Priority, number> = { Fire: 0, Hot: 0, Warm: 0, Cold: 0, Dead: 0 }
  const byStatus: Record<string, number> = {
    unworked: 0, in_canvass: 0, canvassed: 0, converted: 0,
  }

  for (const r of records) {
    if (r.priority in byPriority) byPriority[r.priority]++
    const st = r.status ?? 'unworked'
    if (st in byStatus) byStatus[st]++
  }

  const worked = byStatus.in_canvass + byStatus.canvassed + byStatus.converted
  const conversionRate = worked > 0 ? byStatus.converted / worked : null

  return { total: records.length, byPriority, byStatus, conversionRate }
}

// ── Canvass performance ───────────────────────────────────────────────────────

export interface CanvassPerf {
  today: {
    total: number
    notVisited: number
    comeBackLater: number
    dmUnavailable: number
    canvassed: number
    converted: number
    dropped: number
  }
  dailyLog: DaySummary[]
  avgStopsPerDay: number
  avgConversionRate: number | null
  totalDaysLogged: number
}

export function calcCanvassPerf(stops: CanvassStop[], dailyLog: DaySummary[]): CanvassPerf {
  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

  const todayStops = stops.filter((s) => s.updated_at?.slice(0, 10) === todayStr)
  const today = {
    total:         todayStops.length,
    notVisited:    todayStops.filter((s) => s.status === 'not_visited').length,
    comeBackLater: todayStops.filter((s) => s.status === 'come_back_later').length,
    dmUnavailable: todayStops.filter((s) => s.status === 'dm_unavailable').length,
    canvassed:     todayStops.filter((s) => s.status === 'canvassed').length,
    converted:     todayStops.filter((s) => s.status === 'converted').length,
    dropped:       todayStops.filter((s) => s.status === 'dropped').length,
  }

  const days = dailyLog.length
  const totalStops = dailyLog.reduce((s, d) => s + (d.total ?? 0), 0)
  const totalConverted = dailyLog.reduce((s, d) => s + (d.converted ?? 0), 0)
  const avgStopsPerDay = days > 0 ? totalStops / days : 0
  const avgConversionRate = totalStops > 0 ? totalConverted / totalStops : null

  return {
    today,
    dailyLog: dailyLog.slice(-14),
    avgStopsPerDay,
    avgConversionRate,
    totalDaysLogged: days,
  }
}

// ── Territory coverage ────────────────────────────────────────────────────────

export interface AreaStats {
  area: string
  total: number
  unworked: number
  in_canvass: number
  canvassed: number
  converted: number
  worked: number
  avgScore: number
  coveragePct: number
  convRate: number | null
}

export interface TerritoryStats {
  byArea: AreaStats[]
  overallCoverage: number
}

export function calcTerritory(records: ProspectRecord[]): TerritoryStats {
  const areaMap: Record<string, AreaStats & { totalScore: number }> = {}

  for (const r of records) {
    const area = r.area ?? 'Unknown'
    if (!areaMap[area]) {
      areaMap[area] = { area, total: 0, unworked: 0, in_canvass: 0, canvassed: 0, converted: 0, worked: 0, avgScore: 0, coveragePct: 0, convRate: null, totalScore: 0 }
    }
    areaMap[area].total++
    areaMap[area].totalScore += r.score ?? 0
    const st = r.status ?? 'unworked'
    if (st in areaMap[area]) (areaMap[area] as Record<string, number>)[st]++
  }

  const byArea = Object.values(areaMap).map((a) => {
    const worked = a.total - a.unworked
    return {
      ...a,
      worked,
      avgScore: a.total > 0 ? Math.round(a.totalScore / a.total) : 0,
      coveragePct: a.total > 0 ? Math.round((worked / a.total) * 100) : 0,
      convRate: worked > 0 ? a.converted / worked : null,
    }
  }).sort((a, b) => b.total - a.total)

  const totalRecords = records.length
  const totalWorked = byArea.reduce((s, a) => s + a.worked, 0)
  const overallCoverage = totalRecords > 0 ? Math.round((totalWorked / totalRecords) * 100) : 0

  return { byArea, overallCoverage }
}

// ── Data quality ──────────────────────────────────────────────────────────────

export interface DataQualityStats {
  total: number
  withEmail: number; pctEmail: number
  withPhone: number; pctPhone: number
  withContact: number; pctContact: number
  withWebsite: number; pctWebsite: number
  withCoords: number; pctCoords: number
  avgScore: number
  scoreBuckets: number[] // 10 buckets: 0-9, 10-19, ..., 90-100
}

export function calcDataQuality(records: ProspectRecord[]): DataQualityStats | null {
  const total = records.length
  if (total === 0) return null

  let withEmail = 0, withPhone = 0, withContact = 0, withWebsite = 0, withCoords = 0
  let totalScore = 0
  const scoreBuckets = new Array(10).fill(0)

  for (const r of records) {
    if (r.email)        withEmail++
    if (r.phone)        withPhone++
    if (r.contact_name) withContact++
    if (r.website)      withWebsite++
    if (r.lat && r.lng) withCoords++
    totalScore += r.score ?? 0
    const bucket = Math.min(Math.floor((r.score ?? 0) / 10), 9)
    scoreBuckets[bucket]++
  }

  const pct = (n: number) => Math.round((n / total) * 100)

  return {
    total,
    withEmail,   pctEmail:   pct(withEmail),
    withPhone,   pctPhone:   pct(withPhone),
    withContact, pctContact: pct(withContact),
    withWebsite, pctWebsite: pct(withWebsite),
    withCoords,  pctCoords:  pct(withCoords),
    avgScore: Math.round(totalScore / total),
    scoreBuckets,
  }
}

// ── Lead pipeline ─────────────────────────────────────────────────────────────

export interface LeadPipelineStats {
  total: number
  byStatus: Record<string, number>
  winRate: number | null
}

export function calcLeadPipeline(leads: Lead[]): LeadPipelineStats {
  const byStatus: Record<string, number> = { Open: 0, Won: 0, Lost: 0 }
  for (const l of leads) {
    if (l.status in byStatus) byStatus[l.status]++
  }
  const decided = byStatus.Won + byStatus.Lost
  const winRate = decided > 0 ? byStatus.Won / decided : null
  return { total: leads.length, byStatus, winRate }
}
