import { describe, it, expect } from 'vitest'
import { fillFromAnchor } from './dayPlanner'
import type { ProspectRecord } from '../types'

const now = new Date().toISOString()

function makeRecord(id: string, lat: number, lng: number, overrides: Partial<ProspectRecord> = {}): ProspectRecord {
  return {
    id,
    name: `Stop ${id}`,
    status: 'unworked',
    is_chain: false,
    dropped_count: 0,
    score: 50,
    priority: 'Warm',
    created_at: now,
    updated_at: now,
    lat,
    lng,
    ...overrides,
  }
}

const anchor = { lat: 35.0, lng: -80.0 }

const records: ProspectRecord[] = [
  makeRecord('r1', 35.01, -80.01),   // ~0.9 mi
  makeRecord('r2', 35.05, -80.05),   // ~4.7 mi
  makeRecord('r3', 35.10, -80.10),   // ~9.4 mi
  makeRecord('r4', 35.20, -80.20),   // ~18.8 mi
  makeRecord('r5', 35.50, -80.50),   // ~47 mi
]

describe('fillFromAnchor', () => {
  it('returns N closest records', () => {
    const result = fillFromAnchor(anchor, records, 'Monday', 3)
    expect(result.assignments).toHaveLength(3)
    expect(result.assignments[0].id).toBe('r1')
    expect(result.assignments[1].id).toBe('r2')
    expect(result.assignments[2].id).toBe('r3')
  })

  it('assigns the correct day', () => {
    const result = fillFromAnchor(anchor, records, 'Wednesday', 2)
    result.assignments.forEach((a) => expect(a.day).toBe('Wednesday'))
  })

  it('skips records already assigned to a day', () => {
    const withDay = records.map((r) =>
      r.id === 'r1' ? { ...r, day: 'Tuesday' } : r,
    )
    const result = fillFromAnchor(anchor, withDay, 'Monday', 1)
    expect(result.assignments[0].id).toBe('r2')
  })

  it('skips non-unworked records', () => {
    const worked = records.map((r) =>
      r.id === 'r1' ? { ...r, status: 'canvassed' as const } : r,
    )
    const result = fillFromAnchor(anchor, worked, 'Monday', 1)
    expect(result.assignments[0].id).toBe('r2')
  })

  it('skips records without coords and increments skippedNoCoords', () => {
    const noCoords: ProspectRecord[] = [
      makeRecord('nc1', 0, 0, { lat: undefined, lng: undefined }),
      ...records,
    ]
    const result = fillFromAnchor(anchor, noCoords, 'Monday', 2)
    expect(result.skippedNoCoords).toBe(1)
    expect(result.assignments).toHaveLength(2)
  })

  it('filters by area when specified', () => {
    const withAreas = records.map((r, i) => ({ ...r, area: i % 2 === 0 ? 'Zone A' : 'Zone B' }))
    const result = fillFromAnchor(anchor, withAreas, 'Monday', 10, 'Zone A')
    const returnedIds = result.assignments.map((a) => a.id)
    // Only Zone A records (r1, r3, r5) should be returned
    returnedIds.forEach((id) => {
      const r = withAreas.find((x) => x.id === id)!
      expect(r.area).toBe('Zone A')
    })
  })

  it('caps at available records when N > pool size', () => {
    const result = fillFromAnchor(anchor, records, 'Monday', 100)
    expect(result.assignments.length).toBeLessThanOrEqual(records.length)
  })

  it('respects cooloff notes', () => {
    const future = new Date(Date.now() + 86400 * 3 * 1000).toISOString().slice(0, 10)
    const withCooloff = records.map((r) =>
      r.id === 'r1' ? { ...r, notes: `cooloff:${future}` } : r,
    )
    const result = fillFromAnchor(anchor, withCooloff, 'Monday', 1)
    expect(result.assignments[0].id).toBe('r2')
  })
})
