import { describe, it, expect } from 'vitest'
import { calcScore, calcPriority } from './scoring'
import type { ProspectRecord } from '../types'

const base: Partial<ProspectRecord> = {
  phone: '555-0100',
  email: 'owner@example.com',
  website: 'https://example.com',
  rating: 4.2,
  reviews: 120,
  is_chain: false,
}

describe('calcScore', () => {
  it('returns 70 base and applies bonuses', () => {
    // base 70 + review100 +10 + email +5 + website (no penalty) - email penalty removed + phone no penalty
    // Let's compute: 70 + rating4.0 +5 + reviews100 +10 + email +5 = 90, then -10 (rating<4.0? no, 4.2>=4.0 so +5 not -10) + 0
    const score = calcScore(base)
    expect(score).toBeGreaterThan(70)
  })

  it('penalises chains heavily', () => {
    const chainScore = calcScore({ ...base, is_chain: true })
    const indieScore = calcScore(base)
    expect(chainScore).toBeLessThan(indieScore - 25)
  })

  it('adds bonus for high rating (>=4.5)', () => {
    const low  = calcScore({ ...base, rating: 4.2 })
    const high = calcScore({ ...base, rating: 4.6 })
    expect(high).toBeGreaterThan(low)
  })

  it('adds bonus for contact_name', () => {
    const without = calcScore(base)
    const with_cn = calcScore({ ...base, contact_name: 'Jane Doe' })
    expect(with_cn).toBeGreaterThan(without)
  })

  it('never returns negative', () => {
    const score = calcScore({ is_chain: true, rating: 1.0, reviews: 0 })
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('penalises missing phone, email, website', () => {
    const missing = calcScore({ rating: 4.0, reviews: 50, is_chain: false })
    const full    = calcScore({ ...base })
    expect(full).toBeGreaterThan(missing)
  })
})

describe('calcPriority', () => {
  it('Fire at 95+', () => expect(calcPriority(95)).toBe('Fire'))
  it('Hot at 75-94', () => expect(calcPriority(80)).toBe('Hot'))
  it('Warm at 55-74', () => expect(calcPriority(60)).toBe('Warm'))
  it('Cold at 35-54', () => expect(calcPriority(40)).toBe('Cold'))
  it('Dead below 35', () => expect(calcPriority(20)).toBe('Dead'))
  it('boundary: 74 is Warm not Hot', () => expect(calcPriority(74)).toBe('Warm'))
  it('boundary: 75 is Hot', () => expect(calcPriority(75)).toBe('Hot'))
})
