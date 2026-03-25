import { useState, useMemo } from 'react'
import { useDatabase, useDatabaseDispatch, useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import { DAYS, autoAssignDay, autoFillWeek } from '../../data/weekPlanner.js'
import { PRIORITY_COLOR, PRIORITY_EMOJI } from '../../data/scoring.js'
import { parseWorkingHours } from '../../data/helpers.js'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'

export default function WeekPlannerPanel() {
  const db         = useDatabase()
  const dbDispatch = useDatabaseDispatch()
  const canvass    = useCanvass()
  const cDispatch  = useCanvassDispatch()
  const { msg, flash } = useFlashMessage()

  const [stopsPerDay, setStopsPerDay]   = useState(15)
  const [stopsInput,  setStopsInput]    = useState('15')
  const [areaFilter,  setAreaFilter]    = useState('all')
  const [expandDay,   setExpandDay]     = useState(null)

  const areas = useMemo(() => [...new Set(db.dbRecords.map(r => r.ar).filter(Boolean))].sort(), [db.dbRecords])

  const byDay = useMemo(() => {
    const m = {}
    DAYS.forEach(d => { m[d] = [] })
    db.dbRecords.forEach(r => { if (r.da && m[r.da]) m[r.da].push(r) })
    return m
  }, [db.dbRecords])

  const unworkedCount = useMemo(() =>
    db.dbRecords.filter(r => r.st === 'unworked' && !r.da).length,
  [db.dbRecords])

  const todayDayName = DAYS[new Date().getDay() - 1] // getDay(): 0=Sun, 1=Mon...

  function handleAutoFillToday() {
    if (!todayDayName) { flash('Today is not a weekday.', 'err'); return }
    const { assignments, skippedNoCoords } = autoAssignDay(db.dbRecords, todayDayName, stopsPerDay, areaFilter)
    if (!assignments.length) { flash('No unworked records available for today.' + (skippedNoCoords ? ` (${skippedNoCoords} missing coordinates)` : ''), 'err'); return }
    // Assign the day
    dbDispatch({ type: 'WEEK_ASSIGN', assignments })
    // Load straight to canvass
    const existingNames = new Set(canvass.map(c => c.name.toLowerCase()))
    const newStops = []
    const dbUpdates = []
    assignments.forEach(({ id }) => {
      const r = db.dbRecords.find(x => x.id === id); if (!r) return
      if (existingNames.has((r.n || '').toLowerCase())) return
      const now = new Date().toISOString()
      const contactNote = r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : ''
      newStops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: '', website: r.web, menu: r.mn, email: r.em,
        ...parseWorkingHours(r.hr),
        status: 'Not visited yet',
        date: new Date().toLocaleDateString(),
        added: now, fromDb: r.id, score: r.sc, priority: r.pr,
        history: [], notesLog: contactNote ? [{ text: 'Contact: ' + contactNote, ts: now, system: true }] : [],
      })
      dbUpdates.push(id)
    })
    if (newStops.length) {
      cDispatch({ type: 'ADD_MANY', stops: newStops })
      dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })
    }
    const skipMsg = skippedNoCoords ? ` (${skippedNoCoords} skipped — no coordinates)` : ''
    flash(`${assignments.length} stops assigned to ${todayDayName} and loaded to canvass.${skipMsg}`, 'ok')
  }

  function handleAutoFillWeek() {
    if (!db.dbRecords.some(r => r.st === 'unworked' && !r.da)) {
      flash('No unworked records available to assign.', 'err'); return
    }
    const { assignments, skippedNoCoords } = autoFillWeek(db.dbRecords, stopsPerDay, areaFilter)
    if (!assignments.length) { flash('Not enough data to auto-fill week.' + (skippedNoCoords ? ` (${skippedNoCoords} missing coordinates)` : ''), 'err'); return }
    dbDispatch({ type: 'WEEK_ASSIGN', assignments })
    const skipMsg = skippedNoCoords ? ` (${skippedNoCoords} skipped — no coordinates)` : ''
    flash(`Week filled — ${assignments.length} stops assigned across ${DAYS.length} days.${skipMsg}`, 'ok')
  }

  function handleAutoFillDay(day) {
    const { assignments, skippedNoCoords } = autoAssignDay(db.dbRecords, day, stopsPerDay, areaFilter)
    if (!assignments.length) { flash(`No unworked records available for ${day}.` + (skippedNoCoords ? ` (${skippedNoCoords} missing coordinates)` : ''), 'err'); return }
    dbDispatch({ type: 'WEEK_ASSIGN', assignments })
    const skipMsg = skippedNoCoords ? ` (${skippedNoCoords} skipped — no coordinates)` : ''
    flash(`${assignments.length} stops assigned to ${day}.${skipMsg}`, 'ok')
  }

  function handleClearDay(day) {
    if (!confirm(`Clear all assignments for ${day}?`)) return
    dbDispatch({ type: 'CLEAR_DAY', day })
    flash(`${day} cleared.`, 'ok')
  }

  function handleClearWeek() {
    if (!confirm('Clear all week assignments?')) return
    dbDispatch({ type: 'CLEAR_WEEK' })
    flash('Week cleared.', 'ok')
  }

  function handleRemoveStop(id) {
    dbDispatch({ type: 'REMOVE_FROM_DAY', id })
  }

  function loadDayToCanvass(day) {
    const stops = byDay[day]
    if (!stops.length) { flash(`No stops assigned to ${day}.`, 'err'); return }
    const existingNames = new Set(canvass.map(c => c.name.toLowerCase()))
    const newStops = []
    const dbUpdates = []
    let skippedStatus = 0
    stops.forEach(r => {
      if (r.st !== 'unworked') { skippedStatus++; return }
      if (existingNames.has((r.n || '').toLowerCase())) return
      const now = new Date().toISOString()
      const contactNote = r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : ''
      newStops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: '', website: r.web, menu: r.mn, email: r.em,
        ...parseWorkingHours(r.hr),
        status: 'Not visited yet',
        date: new Date().toLocaleDateString(),
        added: now, fromDb: r.id, score: r.sc, priority: r.pr,
        history: [], notesLog: contactNote ? [{ text: 'Contact: ' + contactNote, ts: now, system: true }] : [],
      })
      dbUpdates.push(r.id)
    })
    if (!newStops.length) { flash(`All ${day} stops already in canvass.` + (skippedStatus ? ` (${skippedStatus} already canvassed)` : ''), 'err'); return }
    cDispatch({ type: 'ADD_MANY', stops: newStops })
    dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })
    const skipMsg = skippedStatus ? ` (${skippedStatus} skipped — already canvassed)` : ''
    flash(`${newStops.length} stops from ${day} loaded to canvass.${skipMsg}`, 'ok')
  }

  if (!db.dbRecords.length) {
    return <EmptyState>No records yet — import an Outscraper XLSX to get started.</EmptyState>
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Stops/day:</span>
          <input type="number" min={1} max={50} value={stopsInput}
            onChange={e => setStopsInput(e.target.value)}
            onBlur={() => { const n = parseInt(stopsInput) || 15; const c = Math.min(50, Math.max(1, n)); setStopsPerDay(c); setStopsInput(String(c)) }}
            style={{ width: '56px', height: '30px', fontSize: '12px', textAlign: 'center' }} />
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} style={{ height: '30px', fontSize: '12px', minWidth: '140px' }}>
            <option value="all">All areas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <Button size="sm" variant="primary" onClick={handleAutoFillToday} disabled={!todayDayName}>Today → Canvass</Button>
          <Button size="sm" variant="primary" onClick={handleAutoFillWeek}>Auto-fill Week</Button>
          <Button size="sm" variant="danger" onClick={handleClearWeek}>Clear Week</Button>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text2)' }}>{unworkedCount} unassigned</span>
        </div>
      </div>

      {msg && <div style={{ fontSize: '12px', marginBottom: '8px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>{msg.text}</div>}

      {/* Day columns */}
      {DAYS.map(day => {
        const stops = byDay[day]
        const isOpen = expandDay === day
        return (
          <div key={day} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: '8px', overflow: 'hidden' }}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', cursor: 'pointer', background: isOpen ? 'var(--bg2)' : 'transparent' }}
              onClick={() => setExpandDay(isOpen ? null : day)}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>{day}</span>
                <span style={{ fontSize: '12px', color: 'var(--text2)', marginLeft: '8px' }}>
                  {stops.length} stop{stops.length !== 1 ? 's' : ''}
                  {stops.filter(r => r.pr === 'Hot' || r.pr === 'Fire').length > 0 &&
                    <span style={{ color: 'var(--red-text)', marginLeft: '6px' }}>
                      {stops.filter(r => r.pr === 'Hot' || r.pr === 'Fire').length} hot
                    </span>
                  }
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                <Button size="sm" onClick={() => handleAutoFillDay(day)}>Auto-fill</Button>
                <Button size="sm" variant="primary" onClick={() => loadDayToCanvass(day)}>→ Canvass</Button>
                <Button size="sm" variant="danger" onClick={() => handleClearDay(day)}>Clear</Button>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{isOpen ? '▴' : '▾'}</span>
            </div>

            {/* Stop list */}
            {isOpen && (
              <div style={{ borderTop: '0.5px solid var(--border)' }}>
                {stops.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text2)' }}>
                    No stops assigned — click Auto-fill or assign stops from Browse.
                  </div>
                ) : stops.sort((a, b) => b.sc - a.sc).map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderBottom: '0.5px solid var(--border)', fontSize: '13px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.n}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.a}</div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: PRIORITY_COLOR[r.pr], flexShrink: 0 }}>{PRIORITY_EMOJI[r.pr]} {r.pr} {r.sc}</span>
                    <button onClick={() => handleRemoveStop(r.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '14px', padding: '0 4px', flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
