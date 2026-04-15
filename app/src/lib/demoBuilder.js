// Demo Builder API client + shared status cache.
//
// The status cache is a module-level Map so it persists across re-renders and
// is readable by any component (DemoDatabasesPanel, CanvassCard) without
// threading props. DemoDatabasesPanel owns the polling loop; CanvassCard
// subscribes via useDemoStatus() and re-renders only when the cache updates.

import { useState, useEffect } from 'react'

const DEMO_BUILDER_URL = import.meta.env.VITE_DEMO_BUILDER_URL || 'http://localhost:3002'

// Phase A2 (VSI migration, 2026-04-15) stripped the `db_` prefix from
// demo_builder.batch_queue.pt_record_id. PT still stores ids with the prefix,
// so we normalize at the boundary.
function stripDbPrefix(id) {
  return typeof id === 'string' && id.startsWith('db_') ? id.slice(3) : id
}

// { pt_record_id (stripped) → { pt_record_id, status, session_id, error, created_at } }
export const demoStatusCache = new Map()

const _listeners = new Set()

/** Subscribe to cache updates. Returns an unsubscribe function. */
export function subscribeDemoStatus(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

function notifyListeners() {
  _listeners.forEach(fn => fn())
}

/** Fetch status for a list of pt_record_ids and update the cache. */
// Vercel edge caps URL length; 50 Google place_ids (~1.5 KB) stays well under.
const BATCH_STATUS_CHUNK = 50

export async function fetchBatchStatus(ptRecordIds) {
  if (!ptRecordIds.length) return []
  const stripped = ptRecordIds.map(stripDbPrefix)
  const all = []
  for (let i = 0; i < stripped.length; i += BATCH_STATUS_CHUNK) {
    const chunk = stripped.slice(i, i + BATCH_STATUS_CHUNK)
    const res = await fetch(
      `${DEMO_BUILDER_URL}/api/batch/status?pt_record_ids=${chunk.join(',')}`,
    )
    if (!res.ok) throw new Error(`batch/status HTTP ${res.status}`)
    const { results } = await res.json()
    results.forEach(r => { demoStatusCache.set(r.pt_record_id, r); all.push(r) })
  }
  notifyListeners()
  return all
}

/** Queue one or more prospects for batch generation. */
export async function queueBatch(prospects, skipIfExists = true) {
  const res = await fetch(`${DEMO_BUILDER_URL}/api/batch/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospects, skip_if_exists: skipIfExists }),
  })
  if (!res.ok) throw new Error(`batch/queue HTTP ${res.status}`)
  return res.json()
}

/** Trigger tablet deployment for a pre-generated demo. */
export async function loadDemo(ptRecordId) {
  const res = await fetch(`${DEMO_BUILDER_URL}/api/batch/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pt_record_id: stripDbPrefix(ptRecordId) }),
  })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
}

/**
 * Global poll: keeps demoStatusCache warm for all records that could have a demo,
 * so CanvassCard and any other consumer sees fresh statuses without depending on
 * the Demo Databases panel being open. Mount once at the app shell level.
 */
export function useGlobalDemoStatusPoll(dbRecords, intervalMs = 60_000) {
  useEffect(() => {
    const ids = dbRecords.filter(r => r.mn || r.web).map(r => r.id)
    if (!ids.length) return
    let cancelled = false
    const run = async () => {
      try { await fetchBatchStatus(ids) } catch { /* silent */ }
    }
    run()
    const timer = setInterval(() => { if (!cancelled) run() }, intervalMs)
    return () => { cancelled = true; clearInterval(timer) }
  }, [dbRecords, intervalMs])
}

/**
 * Hook: returns the cached status entry for a single pt_record_id and
 * re-renders whenever the cache is updated by DemoDatabasesPanel's poll loop.
 */
export function useDemoStatus(ptRecordId) {
  const key = stripDbPrefix(ptRecordId)
  const [entry, setEntry] = useState(() => demoStatusCache.get(key) ?? null)
  useEffect(() => {
    if (!key) return
    // Subscribe to cache updates; initial value already set by useState initializer.
    // key is stable for a card's lifetime so we don't need to re-sync on change.
    return subscribeDemoStatus(() => setEntry(demoStatusCache.get(key) ?? null))
  }, [key])
  return entry
}
