import type { ProspectRecord, Priority } from '../types'

export function calcScore(r: Partial<ProspectRecord>): number {
  let s = 70

  // Rating bonuses (highest tier only)
  if ((r.rating ?? 0) >= 4.5)      s += 15
  else if ((r.rating ?? 0) >= 4.0) s += 5

  // Review bonuses (highest tier only)
  if ((r.reviews ?? 0) >= 200)      s += 15
  else if ((r.reviews ?? 0) >= 100) s += 10

  // Social presence bonus
  if (r.facebook || r.instagram) s += 5

  // Email bonus
  if (r.email) s += 5

  // Enrichment bonuses
  if (r.menu_link)     s += 3
  if (r.contact_name)  s += 5
  if (r.working_hours) s += 3
  if ((r.employees ?? '') > '') s += 2

  // Penalties
  if (r.is_chain)                        s -= 30
  if ((r.rating ?? 0) < 3.0)            s -= 20
  else if ((r.rating ?? 0) < 4.0)       s -= 10
  if ((r.reviews ?? 0) < 10)            s -= 20
  else if ((r.reviews ?? 0) < 30)       s -= 10
  if (!r.email)   s -= 10
  if (!r.website) s -= 5
  if (!r.phone)   s -= 10

  return Math.max(s, 0)
}

export function calcPriority(score: number): Priority {
  if (score >= 95) return 'Fire'
  if (score >= 75) return 'Hot'
  if (score >= 55) return 'Warm'
  if (score >= 35) return 'Cold'
  return 'Dead'
}
