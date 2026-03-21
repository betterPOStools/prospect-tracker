export function calcScore(r) {
  let s = 70

  // Rating bonuses (highest tier only)
  if ((r.rt || 0) >= 4.5)     s += 15
  else if ((r.rt || 0) >= 4.0) s += 5

  // Review bonuses (highest tier only)
  if ((r.rv || 0) >= 200)     s += 15
  else if ((r.rv || 0) >= 100) s += 10

  // Social presence bonus
  if (r.fb || r.ig) s += 5

  // Email bonus
  if (r.em) s += 5

  // Penalties
  if (r.ch)                    s -= 30
  if ((r.rt || 0) < 3.0)      s -= 20
  else if ((r.rt || 0) < 4.0) s -= 10
  if ((r.rv || 0) < 10)       s -= 20
  else if ((r.rv || 0) < 30)  s -= 10
  if (!r.em)  s -= 10
  if (!r.web) s -= 5
  if (!r.ph)  s -= 10

  return Math.max(s, 0)
}

export function calcPriority(s) {
  if (s >= 100) return 'Fire'
  if (s >= 80)  return 'Hot'
  if (s >= 60)  return 'Warm'
  if (s >= 40)  return 'Cold'
  return 'Dead'
}

export const PRIORITY_COLOR = {
  Fire: 'var(--red-text)',
  Hot:  'var(--orange-text)',
  Warm: 'var(--yellow-text)',
  Cold: 'var(--blue-text)',
  Dead: 'var(--text3)',
}

export const PRIORITY_EMOJI = {
  Fire: '🔥',
  Hot:  '🥵',
  Warm: '☀️',
  Cold: '🥶',
  Dead: '☠️',
}

export const PRIORITIES = ['Fire', 'Hot', 'Warm', 'Cold', 'Dead']
