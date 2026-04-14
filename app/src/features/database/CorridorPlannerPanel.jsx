import { useMemo, useState } from 'react'
import { useDatabase, useDatabaseDispatch, useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import Button from '../../components/Button.jsx'
import { selectCorridorStops } from '../../data/corridorPlanner.js'
import { parseWorkingHours } from '../../data/helpers.js'
import { PRIORITY_COLOR } from '../../data/scoring.js'

// Storage keys shared with RouteTab so plan → optimize works end-to-end.
const RXL_START_KEY        = 'vs_rxl_start_choice'
const RXL_END_KEY          = 'vs_rxl_end_choice'
const RXL_HOME_ADDR_KEY    = 'vs_rxl_home_addr'
const RXL_HOME_COORDS_KEY  = 'vs_rxl_home_coords'
const RXL_WORK_ADDR_KEY    = 'vs_rxl_work_addr'
const RXL_WORK_COORDS_KEY  = 'vs_rxl_work_coords'
const RXL_CUSTOM_START_KEY = 'vs_rxl_custom_start'
const RXL_CUSTOM_END_KEY   = 'vs_rxl_custom_end'

async function geocodeAddr(addr) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'ValueSystems-ProspectTracker/1.0' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

function getGPS() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  })
}

// BUSINESS RULE: same resolution semantics as RouteTab.resolveEndpoint — the
// corridor planner and the router must agree on what "home"/"work"/"custom"
// means, otherwise the plan won't match the optimized route.
async function resolveEndpoint(choice, isEnd) {
  if (choice === 'none') return null
  if (choice === 'gps') {
    const g = await getGPS(); return g ? { lat: g.lat, lng: g.lng } : null
  }
  if (choice === 'home' || choice === 'work') {
    const addr = localStorage.getItem(choice === 'home' ? RXL_HOME_ADDR_KEY : RXL_WORK_ADDR_KEY)
    if (!addr) throw new Error(`No ${choice} address saved — set it in Route tab → RouteXL setup.`)
    const cachedRaw = localStorage.getItem(choice === 'home' ? RXL_HOME_COORDS_KEY : RXL_WORK_COORDS_KEY)
    if (cachedRaw) { try { const p = JSON.parse(cachedRaw); if (p?.lat && p?.lng) return { lat: p.lat, lng: p.lng } } catch { /* fall through */ } }
    const g = await geocodeAddr(addr); if (!g) throw new Error(`Could not geocode ${choice} address.`)
    try { localStorage.setItem(choice === 'home' ? RXL_HOME_COORDS_KEY : RXL_WORK_COORDS_KEY, JSON.stringify(g)) } catch { /* ignore */ }
    return g
  }
  if (choice === 'custom') {
    const raw = (localStorage.getItem(isEnd ? RXL_CUSTOM_END_KEY : RXL_CUSTOM_START_KEY) || '').trim()
    if (!raw) throw new Error(`Enter a custom ${isEnd ? 'end' : 'start'} address in the field below.`)
    const g = await geocodeAddr(raw); if (!g) throw new Error(`Could not geocode custom ${isEnd ? 'end' : 'start'} address.`)
    return g
  }
  return null
}

const ELIGIBLE = new Set(['unworked', 'in_canvass', 'canvassed', ''])

export default function CorridorPlannerPanel() {
  const db = useDatabase()
  const dbDispatch = useDatabaseDispatch()
  const canvass = useCanvass()
  const cDispatch = useCanvassDispatch()

  const [startChoice, setStartChoice] = useState(() => localStorage.getItem(RXL_START_KEY) || 'gps')
  const [endChoice,   setEndChoice]   = useState(() => localStorage.getItem(RXL_END_KEY)   || 'home')
  const [customStart, setCustomStart] = useState(() => localStorage.getItem(RXL_CUSTOM_START_KEY) || '')
  const [customEnd,   setCustomEnd]   = useState(() => localStorage.getItem(RXL_CUSTOM_END_KEY)   || '')
  const [mode, setMode] = useState('count')            // 'count' | 'budget'
  const [count, setCount] = useState(10)
  const [minutes, setMinutes] = useState(120)
  const [widthMiles, setWidthMiles] = useState(2)
  const [preview, setPreview] = useState(null)         // { stops, estMinutes, rejected, a, b } | null
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const homeAddr = localStorage.getItem(RXL_HOME_ADDR_KEY) || ''
  const workAddr = localStorage.getItem(RXL_WORK_ADDR_KEY) || ''
  const hasHome = Boolean(homeAddr), hasWork = Boolean(workAddr)

  // Active-queue exclusion matches AI panel: avoid recommending stops already parked.
  const activeQueueIds = useMemo(() => new Set((canvass || []).map(s => s.fromDb).filter(Boolean)), [canvass])

  const pool = useMemo(() => (db.dbRecords || []).filter(r => (
    r && r.id && !r.ch &&
    ELIGIBLE.has(r.st || '') &&
    !activeQueueIds.has(r.id)
  )), [db.dbRecords, activeQueueIds])

  function persist(key, value) { try { localStorage.setItem(key, value) } catch { /* ignore */ } }

  async function handlePreview() {
    setError(null); setToast(''); setPreview(null)
    setBusy(true)
    try {
      if (endChoice === 'none') throw new Error('Pick an End — a corridor needs two endpoints.')
      const a = await resolveEndpoint(startChoice, false)
      const b = await resolveEndpoint(endChoice,   true)
      if (!a || !b) throw new Error('Could not resolve start or end coordinates.')
      const result = selectCorridorStops(pool, a, b, {
        widthMiles: Number(widthMiles),
        mode,
        count: Number(count),
        minutes: Number(minutes),
      })
      setPreview({ ...result, a, b })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  function handleAdd() {
    if (!preview || preview.stops.length === 0) return
    const existingKeys = new Set(canvass.map(c => (c.fromDb || c.name?.toLowerCase() || '')))
    const now = new Date().toISOString()
    const newStops = []
    const dbUpdates = []
    for (const r of preview.stops) {
      if (existingKeys.has(r.id) || existingKeys.has((r.n || '').toLowerCase())) continue
      newStops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: '', website: r.web, menu: r.mn, email: r.em,
        ...parseWorkingHours(r.hr),
        lat: r.lt, lng: r.lg,
        status: 'Not visited yet',
        date: new Date().toLocaleDateString(),
        added: now, fromDb: r.id, score: r.sc, priority: r.pr,
        history: [],
        notesLog: [{ text: `Corridor plan: ${mode === 'count' ? `top ${count}` : `${minutes}-min budget`}, ${widthMiles}-mi width`, ts: now, system: true }],
      })
      dbUpdates.push(r.id)
    }
    if (newStops.length) {
      cDispatch({ type: 'ADD_MANY', stops: newStops })
      dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })
    }
    const skipped = preview.stops.length - newStops.length
    flash(newStops.length === 0
      ? `Nothing added — all ${skipped} already in the Canvass queue.`
      : skipped > 0
        ? `Added ${newStops.length} to Canvass queue (${skipped} already present).`
        : `Added ${newStops.length} to Canvass queue. Open Route tab to optimize.`,
    )
    setPreview(null)
  }

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  return (
    <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <strong style={{ fontSize: '13px', color: 'var(--text)' }}>Corridor Planner</strong>
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Pick stops along a start→end corridor and park them in Canvass queue.</span>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          Start:
          <select value={startChoice} onChange={e => { setStartChoice(e.target.value); persist(RXL_START_KEY, e.target.value) }} style={sel}>
            <option value="gps">Current GPS</option>
            <option value="home" disabled={!hasHome}>Home{!hasHome ? ' (set in Route tab)' : ''}</option>
            <option value="work" disabled={!hasWork}>Work{!hasWork ? ' (set in Route tab)' : ''}</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        {startChoice === 'custom' && (
          <input type="text" value={customStart} placeholder="Start address"
            onChange={e => { setCustomStart(e.target.value); persist(RXL_CUSTOM_START_KEY, e.target.value) }}
            style={txt} />
        )}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          End:
          <select value={endChoice} onChange={e => { setEndChoice(e.target.value); persist(RXL_END_KEY, e.target.value) }} style={sel}>
            <option value="gps">Current GPS</option>
            <option value="home" disabled={!hasHome}>Home{!hasHome ? ' (set in Route tab)' : ''}</option>
            <option value="work" disabled={!hasWork}>Work{!hasWork ? ' (set in Route tab)' : ''}</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        {endChoice === 'custom' && (
          <input type="text" value={customEnd} placeholder="End address"
            onChange={e => { setCustomEnd(e.target.value); persist(RXL_CUSTOM_END_KEY, e.target.value) }}
            style={txt} />
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' }}>
        <span style={{ display: 'inline-flex', gap: '4px' }}>
          <button type="button" onClick={() => setMode('count')} style={pill(mode === 'count')}>By stops</button>
          <button type="button" onClick={() => setMode('budget')} style={pill(mode === 'budget')}>By time</button>
        </span>
        {mode === 'count' ? (
          <label>Stops: <input type="number" min={1} max={50} value={count} onChange={e => setCount(e.target.value)} style={{ ...num, width: '56px' }} /></label>
        ) : (
          <label>Minutes: <input type="number" min={30} max={600} step={15} value={minutes} onChange={e => setMinutes(e.target.value)} style={{ ...num, width: '72px' }} /></label>
        )}
        <label>Width:
          <select value={widthMiles} onChange={e => setWidthMiles(Number(e.target.value))} style={sel}>
            <option value={0.5}>0.5 mi</option>
            <option value={1}>1 mi</option>
            <option value={2}>2 mi</option>
            <option value={5}>5 mi</option>
            <option value={10}>10 mi</option>
          </select>
        </label>
        <Button size="sm" variant="primary" onClick={handlePreview} disabled={busy || pool.length === 0}>
          {busy ? 'Previewing…' : 'Preview'}
        </Button>
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{pool.length} eligible records</span>
      </div>

      {toast && <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--green-text, #0a84ff)' }}>{toast}</div>}
      {error && <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--red-text)' }}>{error}</div>}

      {preview && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' }}>
            {preview.stops.length} stops · ~{preview.estMinutes} min round trip · {preview.rejected} records outside corridor
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '260px', overflow: 'auto', marginBottom: '8px' }}>
            {preview.stops.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', gap: '8px', fontSize: '12px', padding: '4px 8px', borderRadius: 'var(--radius-md)' }}>
                <span style={{ color: 'var(--text3)', width: '20px', textAlign: 'right' }}>{i + 1}.</span>
                <span style={{ flex: 1, color: 'var(--text)' }}>{r.n}</span>
                <span style={{ color: PRIORITY_COLOR[r.pr] || 'var(--text3)', fontSize: '11px' }}>{r.pr} {r.sc}</span>
              </div>
            ))}
          </div>
          <Button size="sm" variant="primary" onClick={handleAdd} disabled={preview.stops.length === 0}>
            Add {preview.stops.length} to Canvass queue
          </Button>
        </div>
      )}
    </div>
  )
}

const sel = { fontSize: '12px', padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }
const txt = { width: '200px', fontSize: '12px', padding: '2px 6px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }
const num = { fontSize: '12px', padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }
const pill = active => ({
  padding: '3px 10px', fontSize: '11px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)',
  background: active ? 'var(--accent, #0a84ff)' : 'var(--bg)',
  color: active ? 'white' : 'var(--text2)', cursor: 'pointer',
})
