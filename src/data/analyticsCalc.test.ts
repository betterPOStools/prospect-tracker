import { describe, it, expect } from 'vitest'
import { calcPipeline, calcTerritory, calcDataQuality, calcLeadPipeline } from './analyticsCalc'
import type { ProspectRecord, Lead } from '../types'

const now = new Date().toISOString()

function makeRecord(id: string, overrides: Partial<ProspectRecord> = {}): ProspectRecord {
  return {
    id,
    name: `Record ${id}`,
    status: 'unworked',
    priority: 'Warm',
    is_chain: false,
    dropped_count: 0,
    score: 50,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

function makeLead(id: string, status: Lead['status']): Lead {
  return {
    id,
    name: `Lead ${id}`,
    status,
    created_at: now,
    updated_at: now,
  }
}

// ── calcPipeline ──────────────────────────────────────────────────────────────

describe('calcPipeline', () => {
  it('returns zero stats for empty array', () => {
    const stats = calcPipeline([])
    expect(stats.total).toBe(0)
    expect(stats.conversionRate).toBeNull()
  })

  it('counts by priority and status', () => {
    const records = [
      makeRecord('1', { priority: 'Fire', status: 'converted' }),
      makeRecord('2', { priority: 'Hot',  status: 'canvassed' }),
      makeRecord('3', { priority: 'Warm', status: 'unworked'  }),
    ]
    const stats = calcPipeline(records)
    expect(stats.total).toBe(3)
    expect(stats.byPriority.Fire).toBe(1)
    expect(stats.byPriority.Hot).toBe(1)
    expect(stats.byStatus.converted).toBe(1)
    expect(stats.byStatus.canvassed).toBe(1)
    expect(stats.byStatus.unworked).toBe(1)
  })

  it('calculates conversion rate correctly', () => {
    const records = [
      makeRecord('1', { status: 'converted' }),
      makeRecord('2', { status: 'canvassed' }),
      makeRecord('3', { status: 'canvassed' }),
      makeRecord('4', { status: 'unworked'  }),
    ]
    const stats = calcPipeline(records)
    // worked = 1 converted + 2 canvassed = 3
    expect(stats.conversionRate).toBeCloseTo(1 / 3)
  })

  it('returns null conversionRate when nothing worked', () => {
    const records = [makeRecord('1'), makeRecord('2')]
    expect(calcPipeline(records).conversionRate).toBeNull()
  })
})

// ── calcTerritory ─────────────────────────────────────────────────────────────

describe('calcTerritory', () => {
  it('groups by area', () => {
    const records = [
      makeRecord('1', { area: 'North', status: 'unworked',  score: 60 }),
      makeRecord('2', { area: 'North', status: 'canvassed', score: 80 }),
      makeRecord('3', { area: 'South', status: 'converted', score: 90 }),
    ]
    const { byArea, overallCoverage } = calcTerritory(records)
    const north = byArea.find((a) => a.area === 'North')!
    const south = byArea.find((a) => a.area === 'South')!
    expect(north.total).toBe(2)
    expect(south.total).toBe(1)
    expect(north.coveragePct).toBe(50)
    expect(south.coveragePct).toBe(100)
    expect(overallCoverage).toBe(67) // 2 worked / 3 total
  })

  it('uses Unknown for records without area', () => {
    const records = [makeRecord('1', { area: undefined })]
    const { byArea } = calcTerritory(records)
    expect(byArea[0].area).toBe('Unknown')
  })
})

// ── calcDataQuality ───────────────────────────────────────────────────────────

describe('calcDataQuality', () => {
  it('returns null for empty array', () => {
    expect(calcDataQuality([])).toBeNull()
  })

  it('counts fields correctly', () => {
    const records = [
      makeRecord('1', { email: 'a@b.com', phone: '555', website: 'http://x.com', contact_name: 'Jane', lat: 35, lng: -80, score: 60 }),
      makeRecord('2', { score: 20 }),
    ]
    const stats = calcDataQuality(records)!
    expect(stats.total).toBe(2)
    expect(stats.withEmail).toBe(1)
    expect(stats.pctEmail).toBe(50)
    expect(stats.withCoords).toBe(1)
    expect(stats.avgScore).toBe(40)
  })
})

// ── calcLeadPipeline ──────────────────────────────────────────────────────────

describe('calcLeadPipeline', () => {
  it('returns null winRate for empty', () => {
    expect(calcLeadPipeline([]).winRate).toBeNull()
  })

  it('calculates win rate', () => {
    const leads = [makeLead('1', 'Won'), makeLead('2', 'Won'), makeLead('3', 'Lost'), makeLead('4', 'Open')]
    const stats = calcLeadPipeline(leads)
    expect(stats.total).toBe(4)
    expect(stats.byStatus.Won).toBe(2)
    expect(stats.byStatus.Lost).toBe(1)
    expect(stats.byStatus.Open).toBe(1)
    expect(stats.winRate).toBeCloseTo(2 / 3)
  })
})
