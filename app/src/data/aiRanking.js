// Client glue for the AI prioritization layer. Builds a compact candidate
// payload from records + canvass stops, POSTs to the Vercel proxy, and caches
// the response keyed by payload hash.
//
// See docs/adr/ADR-001-ai-prioritization-layer.md for architecture.

import { deriveSignals } from './signalDerivation.js'

const MAX_CANDIDATES = 200
const CACHE_KEY = 'vs_ai_rank_cache'
const CACHE_VERSION = 1

/**
 * Build the compact per-record payload sent to the proxy.
 * Filters out chains, blocklisted names, and already-worked records.
 */
export function buildCandidatePayload(records, stops, blocklist = []) {
  const blocked = new Set((blocklist || []).map(s => String(s).toLowerCase()))
  const eligible = (records || []).filter(r => (
    r && r.id && !r.ch && r.st === 'unworked' && !blocked.has((r.n || '').toLowerCase())
  ))
  const ranked = eligible.slice().sort((a, b) => (b.sc || 0) - (a.sc || 0)).slice(0, MAX_CANDIDATES)
  return ranked.map(r => {
    const sig = deriveSignals(r, stops)
    return {
      id: r.id,
      n: r.n,
      ar: r.ar || undefined,
      sc: r.sc || 0,
      pr: r.pr || 'Cold',
      rt: r.rt || undefined,
      rv: r.rv || undefined,
      ch: r.ch ? 1 : 0,
      es: r.es || undefined,
      lastContact: sig.lastContact,
      touchCount: sig.touchCount,
      daysSinceContact: sig.daysSinceContact,
      isOverdue: sig.isOverdue,
      recentNotes: sig.recentNotes,
    }
  })
}

// AI: POST to prospect-tracker-api /api/rank. The proxy holds the Anthropic
// key and enforces rate limits + origin allowlist. Prompt template lives at
// prospect-tracker-api/lib/prompts.ts.
export async function callRankService({ mode, candidates, endpointUrl, signal }) {
  if (!endpointUrl) throw new Error('VITE_AI_RANK_URL is not configured')
  if (mode !== 'rank' && mode !== 'brief') throw new Error(`invalid mode: ${mode}`)
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, candidates, todayIso: new Date().toISOString() }),
    signal,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`rank service ${res.status}: ${detail || res.statusText}`)
  }
  return res.json()
}

/** Stable fingerprint of a payload + mode. Used as the cache key. */
export function hashPayload(mode, candidates) {
  const ids = candidates.map(c => `${c.id}:${c.touchCount}:${c.lastContact || ''}:${c.isOverdue ? 1 : 0}`).join('|')
  return `${mode}:${candidates.length}:${hashString(ids)}`
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
