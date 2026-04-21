import { supabase } from './supabase.js'

// Tier sort priority: best fit first. Off-tiers sort last.
export const TIER_ORDER = {
  small_indie: 1,
  mid_market:  2,
  kiosk_tier:  3,
  chain_nogo:  4,
  not_a_fit:   5,
}

export const TIER_LABEL = {
  small_indie: 'Small indie',
  mid_market:  'Mid market',
  kiosk_tier:  'Kiosk tier',
  chain_nogo:  'Chain (no-go)',
  not_a_fit:   'Not a fit',
}

export const TIER_STYLE = {
  small_indie: { background: 'var(--green-bg)',  color: 'var(--green-text)' },
  mid_market:  { background: 'var(--blue-bg)',   color: 'var(--blue-text)' },
  kiosk_tier:  { background: 'var(--yellow-bg)', color: 'var(--yellow-text)' },
  chain_nogo:  { background: 'var(--bg3)',       color: 'var(--text3)' },
  not_a_fit:   { background: 'var(--bg3)',       color: 'var(--text3)' },
}

export const VOLUME_ORDER = { high: 3, medium: 2, low: 1, unknown: 0 }

const SELECT_COLS =
  'place_id, name, city, state, category, tier, score, detected_pos, ' +
  'detected_pos_evidence, estimated_swipe_volume, swipe_volume_evidence, ' +
  'reasoning, rubric_version, ranked_at'

export async function fetchRankings() {
  if (!supabase) return []
  const { data, error } = await supabase
    .schema('demo_builder')
    .from('prospect_rankings')
    .select(SELECT_COLS)
    .limit(5000)
  if (error) throw error
  return data || []
}

// PT record.id is `db_${place_id}`; join on that.
export function ptIdForPlaceId(pid) { return `db_${pid}` }

export function compareSalesQueue(a, b) {
  const ta = TIER_ORDER[a.tier] ?? 99
  const tb = TIER_ORDER[b.tier] ?? 99
  if (ta !== tb) return ta - tb
  const va = VOLUME_ORDER[a.estimated_swipe_volume] ?? 0
  const vb = VOLUME_ORDER[b.estimated_swipe_volume] ?? 0
  if (va !== vb) return vb - va
  return (b.score ?? 0) - (a.score ?? 0)
}
