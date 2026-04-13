// Demo Builder API client + shared status cache.
//
// The status cache is a module-level Map so it persists across re-renders and
// is readable by any component (DemoDatabasesPanel, CanvassCard) without
// threading props. DemoDatabasesPanel owns the polling loop; CanvassCard
// subscribes via useDemoStatus() and re-renders only when the cache updates.

import { useState, useEffect } from 'react'

const DEMO_BUILDER_URL = import.meta.env.VITE_DEMO_BUILDER_URL || 'http://localhost:3002'

// { pt_record_id → { pt_record_id, status, session_id, error, created_at } }
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
export async function fetchBatchStatus(ptRecordIds) {
  if (!ptRecordIds.length) return []
  const res = await fetch(
    `${DEMO_BUILDER_URL}/api/batch/status?pt_record_ids=${ptRecordIds.join(',')}`,
  )
  if (!res.ok) throw new Error(`batch/status HTTP ${res.status}`)
  const { results } = await res.json()
  results.forEach(r => demoStatusCache.set(r.pt_record_id, r))
  notifyListeners()
  return results
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
    body: JSON.stringify({ pt_record_id: ptRecordId }),
  })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
}

/**
 * Hook: returns the cached status entry for a single pt_record_id and
 * re-renders whenever the cache is updated by DemoDatabasesPanel's poll loop.
 */
export function useDemoStatus(ptRecordId) {
  const [entry, setEntry] = useState(() => demoStatusCache.get(ptRecordId) ?? null)
  useEffect(() => {
    if (!ptRecordId) return
    // Subscribe to cache updates; initial value already set by useState initializer.
    // ptRecordId is stable for a card's lifetime so we don't need to re-sync on change.
    return subscribeDemoStatus(() => setEntry(demoStatusCache.get(ptRecordId) ?? null))
  }, [ptRecordId])
  return entry
}
