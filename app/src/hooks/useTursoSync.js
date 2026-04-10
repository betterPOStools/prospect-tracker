import { useState, useRef, useCallback, useEffect } from 'react'

const TURSO_URL    = (import.meta.env.VITE_TURSO_DATABASE_URL || '').replace('libsql://', 'https://')
const TURSO_TOKEN  = import.meta.env.VITE_TURSO_AUTH_TOKEN || ''
const DEBOUNCE_MS  = 1500
const POLL_MS      = 5000
const ECHO_WINDOW_MS = 2000
const ROW_ID       = 1

async function tursoQuery(sql, args = []) {
  const stmt = { sql, args: args.map(v => {
    if (v === null || v === undefined) return { type: 'null' }
    if (typeof v === 'number') return { type: 'integer', value: String(v) }
    return { type: 'text', value: String(v) }
  })}
  const r = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt }, { type: 'close' }] }),
  })
  if (!r.ok) throw new Error(`Turso HTTP ${r.status}`)
  const data = await r.json()
  const res = data.results[0]
  if (res.type === 'error') throw new Error(res.error?.message || 'Turso error')
  const result = res.response.result
  const cols = result.cols.map(c => c.name)
  return result.rows.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]?.type === 'null' ? null : row[i]?.value]))
  )
}

export function useTursoSync() {
  const [status,     setStatus]     = useState('idle')
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [error,      setError]      = useState(null)

  const writeTimerRef    = useRef(null)
  const lastWriteTimeRef = useRef(null)
  const pollTimerRef     = useRef(null)

  const enabled = !!(TURSO_URL && TURSO_TOKEN)

  async function loadFromSupabase() {
    if (!enabled) return null
    try {
      const rows = await tursoQuery(
        'SELECT payload, updated_at FROM prospect_state WHERE id = ?',
        [ROW_ID]
      )
      if (!rows.length) return null
      return { payload: JSON.parse(rows[0].payload), updated_at: rows[0].updated_at }
    } catch (e) {
      console.warn('[TursoSync] load failed:', e.message)
      return null
    }
  }

  const writeToSupabase = useCallback((payload) => {
    if (!enabled) return
    clearTimeout(writeTimerRef.current)
    writeTimerRef.current = setTimeout(async () => {
      setStatus('syncing')
      try {
        const now = new Date().toISOString()
        await tursoQuery(
          'INSERT INTO prospect_state (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at',
          [ROW_ID, JSON.stringify(payload), now]
        )
        lastWriteTimeRef.current = Date.now()
        const ts = new Date()
        setLastSyncAt(ts)
        localStorage.setItem('vs_supabase_synced_at', ts.toISOString())
        setStatus('synced')
        setTimeout(() => setStatus(s => s === 'synced' ? 'idle' : s), 3000)
      } catch (e) {
        setStatus('error')
        setError(e.message)
        console.warn('[TursoSync] write failed:', e.message)
      }
    }, DEBOUNCE_MS)
  }, [enabled])

  // Polling replaces Supabase realtime
  function subscribeRealtime({ onUpdate }) {
    if (!enabled) return () => {}

    let lastUpdatedAt = null

    async function poll() {
      try {
        const rows = await tursoQuery(
          'SELECT payload, updated_at FROM prospect_state WHERE id = ?',
          [ROW_ID]
        )
        if (!rows.length) return
        const row = rows[0]
        if (!lastUpdatedAt) { lastUpdatedAt = row.updated_at; return }
        if (row.updated_at === lastUpdatedAt) return
        lastUpdatedAt = row.updated_at
        // Ignore our own writes (echo window)
        if (lastWriteTimeRef.current && Date.now() - lastWriteTimeRef.current < ECHO_WINDOW_MS) return
        if (!row.payload) return
        onUpdate(JSON.parse(row.payload), row.updated_at)
      } catch (e) {
        console.warn('[TursoSync] poll failed:', e.message)
      }
    }

    pollTimerRef.current = setInterval(poll, POLL_MS)
    return () => {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearTimeout(writeTimerRef.current)
      clearInterval(pollTimerRef.current)
    }
  }, [])

  return { enabled, status, lastSyncAt, error, loadFromSupabase, writeToSupabase, subscribeRealtime }
}
