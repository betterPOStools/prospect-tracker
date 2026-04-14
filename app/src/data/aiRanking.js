// Client glue for the AI prioritization layer. Builds a compact candidate
// payload from records + canvass stops, POSTs to the Vercel proxy, and caches
// the response keyed by payload hash.
//
// See docs/adr/ADR-001-ai-prioritization-layer.md for architecture.

import { deriveSignals } from './signalDerivation.js'
import { haversine } from './clustering.js'

const MAX_CANDIDATES = 200
const CACHE_KEY = 'vs_ai_rank_cache'
const CACHE_VERSION = 1

// BUSINESS RULE: active-pipeline statuses. A record is in the AI candidate
// pool if it's either fresh ('unworked') or has been touched but isn't done
// ('in_canvass', 'canvassed'). Converted/lead records belong to the leads
// pipeline and are out of scope here.
const ELIGIBLE_STATUSES = new Set(['unworked', 'in_canvass', 'canvassed', ''])

/**
 * Build the compact per-record payload sent to the proxy.
 *
 * Includes both fresh prospects and already-canvassed records — the AI uses
 * notes and follow-up signals to decide which touched records deserve a
 * re-visit. Overdue follow-ups and previously-touched records sort above
 * cold top-scored prospects so they don't get pushed out by the 200 cap.
 */
export function buildCandidatePayload(records, stops, blocklist = [], opts = {}) {
  const { currentLocation, radiusMiles } = opts
  const blocked = new Set((blocklist || []).map(s => String(s).toLowerCase()))
  // BUSINESS RULE: records already parked in the active canvass queue are out
  // of the AI pool. If they're in queue the rep will see them there; letting
  // the AI re-surface them just means "Add to Queue" silently no-ops because
  // the stop-dedup blocks every selection. Visited records (canvassed, stop
  // removed) stay eligible so follow-ups can be re-surfaced.
  const activeQueueIds = new Set((stops || []).map(s => s.fromDb).filter(Boolean))
  let eligible = (records || []).filter(r => (
    r && r.id && !r.ch &&
    ELIGIBLE_STATUSES.has(r.st || '') &&
    !blocked.has((r.n || '').toLowerCase()) &&
    !activeQueueIds.has(r.id)
  ))

  // BUSINESS RULE: when the rep shares GPS + a radius, drop records outside
  // the radius BEFORE we take the top 200. Otherwise a citywide shotgun pool
  // pushes nearby candidates out, and the model can't prioritize what's close
  // because it never sees them. Records without coords are dropped too —
  // can't reason about proximity without them.
  if (currentLocation && typeof radiusMiles === 'number' && radiusMiles > 0) {
    eligible = eligible.filter(r => {
      if (typeof r.lt !== 'number' || typeof r.lg !== 'number') return false
      return haversine(currentLocation.lat, currentLocation.lng, r.lt, r.lg) <= radiusMiles
    })
  }

  const enriched = eligible.map(r => ({ record: r, sig: deriveSignals(r, stops) }))

  // Sort keys: overdue first (missed follow-ups are the most expensive miss),
  // then any record with human-logged notes, then by static score.
  enriched.sort((a, b) => {
    const aOv = a.sig.isOverdue ? 1 : 0, bOv = b.sig.isOverdue ? 1 : 0
    if (aOv !== bOv) return bOv - aOv
    const aTouched = a.sig.touchCount > 0 ? 1 : 0
    const bTouched = b.sig.touchCount > 0 ? 1 : 0
    if (aTouched !== bTouched) return bTouched - aTouched
    return (b.record.sc || 0) - (a.record.sc || 0)
  })

  return enriched.slice(0, MAX_CANDIDATES).map(({ record: r, sig }) => ({
    id: r.id,
    n: r.n,
    ar: r.ar || undefined,
    sc: r.sc || 0,
    pr: r.pr || 'Cold',
    st: r.st || 'unworked',
    rt: r.rt || undefined,
    rv: r.rv || undefined,
    ch: r.ch ? 1 : 0,
    es: r.es || undefined,
    lt: typeof r.lt === 'number' ? r.lt : undefined,
    lg: typeof r.lg === 'number' ? r.lg : undefined,
    lastContact: sig.lastContact,
    touchCount: sig.touchCount,
    daysSinceContact: sig.daysSinceContact,
    isOverdue: sig.isOverdue,
    recentNotes: sig.recentNotes,
  }))
}

// AI: POST to prospect-tracker-api /api/rank. The proxy holds the Anthropic
// key and enforces rate limits + origin allowlist. Prompt template lives at
// prospect-tracker-api/lib/prompts.ts.
export async function callRankService({ mode, candidates, endpointUrl, signal, userContext, currentLocation }) {
  if (!endpointUrl) throw new Error('VITE_AI_RANK_URL is not configured')
  if (mode !== 'rank' && mode !== 'brief') throw new Error(`invalid mode: ${mode}`)
  const body = { mode, candidates, todayIso: new Date().toISOString() }
  if (userContext && userContext.trim()) body.userContext = userContext.trim().slice(0, 1000)
  if (currentLocation && typeof currentLocation.lat === 'number' && typeof currentLocation.lng === 'number') {
    body.currentLocation = { lat: currentLocation.lat, lng: currentLocation.lng }
  }
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`rank service ${res.status}: ${detail || res.statusText}`)
  }
  return res.json()
}

/** Stable fingerprint of a payload + mode. Used as the cache key. */
export function hashPayload(mode, candidates, userContext, currentLocation) {
  const ids = candidates.map(c => `${c.id}:${c.touchCount}:${c.lastContact || ''}:${c.isOverdue ? 1 : 0}`).join('|')
  const ctx = (userContext || '').trim()
  const loc = currentLocation ? `${currentLocation.lat.toFixed(3)},${currentLocation.lng.toFixed(3)}` : ''
  return `${mode}:${candidates.length}:${hashString(ids)}:${hashString(ctx)}:${loc}`
}

export function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed?.v !== CACHE_VERSION) return {}
    return parsed.entries || {}
  } catch { return {} }
}

export function saveCacheEntry(key, response) {
  const entries = loadCache()
  entries[key] = { ts: Date.now(), response }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, entries }))
  } catch { /* quota — ignore */ }
}

export function clearCache() {
  try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

// djb2. Not a security hash — just a short stable fingerprint.
function hashString(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
