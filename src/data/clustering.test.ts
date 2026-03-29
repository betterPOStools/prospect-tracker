import { describe, it, expect } from 'vitest'
import { haversine } from './clustering'

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine(35.0, -80.0, 35.0, -80.0)).toBe(0)
  })

  it('calculates known distance between two cities', () => {
    // Charlotte, NC → Raleigh, NC ≈ 130 miles great-circle (driving ≈ 165 mi)
    const dist = haversine(35.2271, -80.8431, 35.7796, -78.6382)
    expect(dist).toBeGreaterThan(125)
    expect(dist).toBeLessThan(140)
  })

  it('is commutative (A→B === B→A)', () => {
    const ab = haversine(35.2, -80.8, 35.7, -78.6)
    const ba = haversine(35.7, -78.6, 35.2, -80.8)
    expect(Math.abs(ab - ba)).toBeLessThan(0.001)
  })

  it('returns miles (not km)', () => {
    // 1 degree of latitude ≈ 69 miles
    const dist = haversine(35.0, -80.0, 36.0, -80.0)
    expect(dist).toBeGreaterThan(65)
    expect(dist).toBeLessThan(75)
  })
})
