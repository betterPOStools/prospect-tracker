import { useMemo, useState } from 'react'
import { useDatabase, useDatabaseDispatch, useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import Button from '../../components/Button.jsx'
import Modal from '../../components/Modal.jsx'
import { buildCandidatePayload, callRankService, hashPayload, loadCache, saveCacheEntry } from '../../data/aiRanking.js'
import { appendBrief, loadBriefHistory, exportBriefHistoryJson, clearBriefHistory, saveLastResult, loadLastResult, clearLastResult } from '../../data/briefHistory.js'
import { parseWorkingHours } from '../../data/helpers.js'
import { PRIORITY_COLOR, PRIORITY_EMOJI } from '../../data/scoring.js'

const ENDPOINT = import.meta.env.VITE_AI_RANK_URL || ''

export default function AiPriorityPanel() {
  const db = useDatabase()
  const dbDispatch = useDatabaseDispatch()
  const canvass = useCanvass()
  const cDispatch = useCanvassDispatch()

  const persisted = loadLastResult()
  const [mode, setMode] = useState(persisted?.mode || 'rank')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(persisted?.response || null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [showContext, setShowContext] = useState(false)
  const [userContext, setUserContext] = useState('')
  const [useLocation, setUseLocation] = useState(false)
  const [capturedLocation, setCapturedLocation] = useState(null)
  const [radiusMiles, setRadiusMiles] = useState(5)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [toast, setToast] = useState('')

  const effectiveLocation = useLocation ? capturedLocation : null
  const effectiveRadius = useLocation ? radiusMiles : 0

  const candidates = useMemo(
    () => buildCandidatePayload(db.dbRecords, canvass, db.dbBlocklist, {
      currentLocation: effectiveLocation,
      radiusMiles: effectiveRadius,
    }),
    [db.dbRecords, canvass, db.dbBlocklist, effectiveLocation, effectiveRadius],
  )

  async function captureLocation() {
    try {
      const loc = await getLocation()
      setCapturedLocation(loc)
      setUseLocation(true)
      flash(`Location captured (${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}).`)
    } catch (err) {
      setError('Location unavailable: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  async function handleRun() {
    setError(null)
    if (!ENDPOINT) { setError('VITE_AI_RANK_URL is not set. Configure the proxy URL in .env.'); return }
    if (candidates.length === 0) { setError('No eligible candidates to rank.'); return }

    setBusy(true)
    try {
      const currentLocation = effectiveLocation
      const key = hashPayload(mode, candidates, userContext, currentLocation)
      const cached = loadCache()[key]
      if (cached) { setResult(cached.response); saveLastResult(mode, cached.response); setSelectedIds(new Set()); return }
      const response = await callRankService({ mode, candidates, endpointUrl: ENDPOINT, userContext, currentLocation })
      saveCacheEntry(key, response)
      appendBrief({ mode, candidates, response, userContext, currentLocation })
      setResult(response)
      saveLastResult(mode, response)
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

  // BUSINESS RULE: AI *bias*, not routing override. Tags selected records with
  // grp='ai-seed' so they surface visibly; geo auto-plan is not modified.
  function seedSelected() {
    if (selectedIds.size === 0) return
    dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: Array.from(selectedIds), fields: { grp: 'ai-seed' } })
    flash(`Tagged ${selectedIds.size} as AI-seed.`)
  }

  // BUSINESS RULE: Parks stops in Canvass queue — does NOT auto-route today.
  // See memory: project_ai_queue_routing_decision.md. User works out of queue.
  function addToQueue() {
    if (selectedIds.size === 0) return
    const existingKeys = new Set(canvass.map(c => (c.fromDb || c.name?.toLowerCase() || '')))
    const shortlist = result?.shortlist || result?.highlights || []
    const reasonById = new Map(shortlist.map(e => [e.id, e.reason]))
    const now = new Date().toISOString()
    const newStops = []
    const dbUpdates = []
    for (const id of selectedIds) {
      const r = db.dbRecords.find(x => x.id === id); if (!r) continue
      if (existingKeys.has(r.id) || existingKeys.has((r.n || '').toLowerCase())) continue
      const reason = reasonById.get(id) || ''
      newStops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: '', website: r.web, menu: r.mn, email: r.em,
        ...parseWorkingHours(r.hr),
        lat: r.lt, lng: r.lg,
        status: 'Not visited yet',
        date: new Date().toLocaleDateString(),
        added: now, fromDb: r.id, score: r.sc, priority: r.pr,
        history: [],
        notesLog: reason ? [{ text: 'AI: ' + reason, ts: now, system: true }] : [],
      })
      dbUpdates.push(r.id)
    }
    if (newStops.length) {
      cDispatch({ type: 'ADD_MANY', stops: newStops })
      dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })
    }
    const skipped = selectedIds.size - newStops.length
    if (newStops.length === 0) {
      flash(`Nothing added — all ${skipped} selected are already in the Canvass queue.`)
    } else if (skipped > 0) {
      flash(`Added ${newStops.length} to Canvass queue (${skipped} already present).`)
    } else {
      flash(`Added ${newStops.length} to Canvass queue.`)
    }
    setSelectedIds(new Set())
  }

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const shortlist = result?.shortlist || result?.highlights || []
  const brief = result?.brief || ''
  const recordsById = useMemo(() => new Map(db.dbRecords.map(r => [r.id, r])), [db.dbRecords])

  return (
    <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '13px', color: 'var(--text)' }}>AI Prioritization</strong>
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{candidates.length} candidates</span>
        <button type="button" onClick={() => setShowContext(v => !v)}
          style={{ fontSize: '11px', color: 'var(--accent, #0a84ff)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {showContext ? '− Context' : '+ Context'}
        </button>
        <button type="button" onClick={() => setHistoryOpen(true)}
          style={{ fontSize: '11px', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          History ({loadBriefHistory().length})
        </button>
        {result && (
          <button type="button" onClick={() => { setResult(null); setSelectedIds(new Set()); clearLastResult() }}
            style={{ fontSize: '11px', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '4px' }}>
          <ModeToggle mode={mode} setMode={setMode} />
          <Button size="sm" variant="primary" onClick={handleRun} disabled={busy || candidates.length === 0}>
            {busy ? (mode === 'brief' ? 'Thinking…' : 'Ranking…') : (mode === 'brief' ? 'Brief me' : 'Prioritize')}
          </Button>
        </span>
      </div>

      {showContext && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <textarea
            value={userContext}
            onChange={e => setUserContext(e.target.value)}
            placeholder="Optional: e.g. 'I have 2 hours near downtown, focus on follow-ups.'"
            rows={2}
            maxLength={1000}
            style={{ width: '100%', fontSize: '12px', padding: '6px 8px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', resize: 'vertical' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text2)' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <input type="checkbox" checked={useLocation} onChange={e => {
                if (e.target.checked && !capturedLocation) { captureLocation() } else { setUseLocation(e.target.checked) }
              }} />
              Use my current location
            </label>
            {useLocation && (
              <>
                <label>within
                  <select value={radiusMiles} onChange={e => setRadiusMiles(Number(e.target.value))}
                    style={{ margin: '0 4px', fontSize: '11px', padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                    <option value={2}>2 mi</option>
                    <option value={5}>5 mi</option>
                    <option value={10}>10 mi</option>
                    <option value={25}>25 mi</option>
                  </select>
                </label>
                <button type="button" onClick={captureLocation}
                  style={{ fontSize: '11px', color: 'var(--accent, #0a84ff)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {capturedLocation ? 'Refresh GPS' : 'Get GPS'}
                </button>
                {capturedLocation && <span style={{ color: 'var(--text3)' }}>
                  @ {capturedLocation.lat.toFixed(3)}, {capturedLocation.lng.toFixed(3)}
                </span>}
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--green-text, #0a84ff)' }}>{toast}</div>}
      {error && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red-text)' }}>{error}</div>}

      {result?.mode === 'brief' && brief && (
        <pre style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '10px 0' }}>{brief}</pre>
      )}

      {shortlist.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
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
          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <Button size="sm" variant="primary" onClick={addToQueue} disabled={selectedIds.size === 0}>
              Add {selectedIds.size || ''} to Canvass queue
            </Button>
            <Button size="sm" variant="secondary" onClick={seedSelected} disabled={selectedIds.size === 0}>
              Mark as AI-seed
            </Button>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
              Queue = parked for canvassing. AI-seed = bias tag only.
            </span>
          </div>
        </div>
      )}

      {historyOpen && <HistoryModal
        onClose={() => setHistoryOpen(false)}
        onLoad={entry => {
          setMode(entry.mode)
          setResult(entry.response)
          saveLastResult(entry.mode, entry.response)
          setSelectedIds(new Set())
          setHistoryOpen(false)
        }}
      />}
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
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      <span style={{ fontSize: '10px', color: 'var(--text3)', marginRight: '2px' }}>Mode:</span>
      {btn('rank', 'Shortlist')}
      {btn('brief', 'Briefing')}
    </span>
  )
}

function HistoryModal({ onClose, onLoad }) {
  const entries = loadBriefHistory().slice().reverse()
  return (
    <Modal title={`AI History (${entries.length})`} onClose={onClose}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <Button size="sm" variant="secondary" onClick={exportBriefHistoryJson} disabled={entries.length === 0}>Export JSON</Button>
        <Button size="sm" variant="secondary" onClick={() => {
          if (confirm('Clear all AI history? This cannot be undone.')) { clearBriefHistory(); onClose() }
        }} disabled={entries.length === 0}>Clear</Button>
      </div>
      {entries.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text3)' }}>No AI runs yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '60vh', overflow: 'auto' }}>
        {entries.map(e => (
          <div key={e.id} style={{ border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', flex: 1 }}>
                {new Date(e.ts).toLocaleString()} · {e.mode} · {e.candidateCount} candidates · {e.usage?.outputTokens ?? '?'} out tokens
              </div>
              <button type="button" onClick={() => onLoad(e)}
                style={{ fontSize: '11px', color: 'var(--accent, #0a84ff)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Load
              </button>
            </div>
            {e.userContext && <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>ctx: {e.userContext}</div>}
            {e.response?.brief && <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '4px 0 0 0', color: 'var(--text)' }}>{e.response.brief}</pre>}
            {(e.response?.shortlist || e.response?.highlights || []).length > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
                {(e.response.shortlist || e.response.highlights).length} results
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation unavailable')); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  })
}
