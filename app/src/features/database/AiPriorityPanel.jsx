import { useMemo, useState } from 'react'
import { useDatabase, useDatabaseDispatch, useCanvass } from '../../data/store.jsx'
import Button from '../../components/Button.jsx'
import { buildCandidatePayload, callRankService, hashPayload, loadCache, saveCacheEntry } from '../../data/aiRanking.js'
import { PRIORITY_COLOR, PRIORITY_EMOJI } from '../../data/scoring.js'

const ENDPOINT = import.meta.env.VITE_AI_RANK_URL || ''

export default function AiPriorityPanel() {
  const db = useDatabase()
  const dbDispatch = useDatabaseDispatch()
  const canvass = useCanvass()

  const [mode, setMode] = useState('rank')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const candidates = useMemo(
    () => buildCandidatePayload(db.dbRecords, canvass, db.dbBlocklist),
    [db.dbRecords, canvass, db.dbBlocklist],
  )

  const cacheKey = useMemo(() => hashPayload(mode, candidates), [mode, candidates])

  async function handleRun() {
    setError(null)
    if (!ENDPOINT) { setError('VITE_AI_RANK_URL is not set. Configure the proxy URL in .env.'); return }
    if (candidates.length === 0) { setError('No eligible candidates to rank.'); return }
    const cached = loadCache()[cacheKey]
    if (cached) { setResult(cached.response); setSelectedIds(new Set()); return }
    setBusy(true)
    try {
      const response = await callRankService({ mode, candidates, endpointUrl: ENDPOINT })
      saveCacheEntry(cacheKey, response)
      setResult(response)
      setSelectedIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // BUSINESS RULE: this is an AI *bias* on the Planner's input, not a routing
  // override. We bump the `sc` of selected records by +10 temporarily via
  // dispatcher so the next autoAssignDay picks them first from their geo
  // cluster. We do NOT touch scoring.js or weekPlanner.js.
  function seedSelected() {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids, fields: { grp: 'ai-seed' } })
  }

  const shortlist = result?.shortlist || result?.highlights || []
  const brief = result?.brief || ''
  const recordsById = useMemo(() => new Map(db.dbRecords.map(r => [r.id, r])), [db.dbRecords])

  return (
    <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: result ? '10px' : 0 }}>
        <strong style={{ fontSize: '13px', color: 'var(--text)' }}>AI Prioritization</strong>
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{candidates.length} candidates</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '4px' }}>
          <ModeToggle mode={mode} setMode={setMode} />
          <Button size="sm" variant="primary" onClick={handleRun} disabled={busy || candidates.length === 0}>
            {busy ? (mode === 'brief' ? 'Thinking…' : 'Ranking…') : (mode === 'brief' ? 'Brief me' : 'Prioritize')}
          </Button>
        </span>
      </div>

      {error && <div style={{ fontSize: '12px', color: 'var(--red-text)' }}>{error}</div>}

      {result?.mode === 'brief' && brief && (
        <pre style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0 0 10px 0' }}>{brief}</pre>
      )}

      {shortlist.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {shortlist.map(entry => {
            const r = recordsById.get(entry.id)
            if (!r) return null
            const selected = selectedIds.has(entry.id)
            return (
              <label key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 8px', background: selected ? 'var(--bg)' : 'transparent', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected} onChange={() => toggleSelect(entry.id)} style={{ marginTop: '3px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{r.n}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{entry.reason}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 500, color: PRIORITY_COLOR[r.pr], flexShrink: 0 }}>{PRIORITY_EMOJI[r.pr]} {r.pr} {r.sc}</span>
              </label>
            )
          })}
          <div style={{ marginTop: '6px' }}>
            <Button size="sm" variant="primary" onClick={seedSelected} disabled={selectedIds.size === 0}>
              Mark {selectedIds.size || ''} as AI-seed
            </Button>
            <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text3)' }}>
              Tags selected records with <code>grp=ai-seed</code>; Auto-fill is unchanged (geo-first).
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function ModeToggle({ mode, setMode }) {
  const btn = (value, label) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      style={{
        padding: '4px 10px', fontSize: '11px', borderRadius: 'var(--radius-md)',
        border: '0.5px solid var(--border)',
        background: mode === value ? 'var(--accent, #0a84ff)' : 'var(--bg)',
        color: mode === value ? 'white' : 'var(--text2)', cursor: 'pointer',
      }}>
      {label}
    </button>
  )
  return (
    <span style={{ display: 'inline-flex', gap: '4px' }}>
      {btn('rank', 'Shortlist')}
      {btn('brief', 'Briefing')}
    </span>
  )
}
