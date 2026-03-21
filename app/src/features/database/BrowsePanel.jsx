import { useState, useMemo } from 'react'
import { useDatabase, useDatabaseDispatch, useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { uid } from '../../data/helpers.js'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import Button from '../../components/Button.jsx'

const PRIORITY_COLOR = { Hot: 'var(--red-text)', Warm: 'var(--yellow-text)', Cold: 'var(--text3)' }

function statusBadge(st) {
  if (st === 'unworked')   return <span style={{ background: 'var(--bg2)', color: 'var(--text2)', padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>Unworked</span>
  if (st === 'in_canvass') return <span style={{ background: 'var(--purple-bg)', color: 'var(--purple-text)', padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>In canvass</span>
  if (st === 'canvassed')  return <span style={{ background: 'var(--yellow-bg)', color: 'var(--yellow-text)', padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>Canvassed</span>
  if (st === 'converted')  return <span style={{ background: 'var(--green-bg)',  color: 'var(--green-text)',  padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>Converted</span>
  if (st === 'lead')       return <span style={{ background: 'var(--blue-bg)',   color: 'var(--blue-text)',   padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>Lead</span>
  return null
}

export default function BrowsePanel({ zoneFilter, onClearZoneFilter }) {
  const db           = useDatabase()
  const dbDispatch   = useDatabaseDispatch()
  const canvass      = useCanvass()
  const cDispatch    = useCanvassDispatch()
  const { msg, flash } = useFlashMessage()

  const [filterPri,    setFilterPri]    = useState('all')
  const [filterSt,     setFilterSt]     = useState('all')
  const [filterArea,   setFilterArea]   = useState('all')
  const [filterZip,    setFilterZip]    = useState('all')
  const [filterZone,   setFilterZone]   = useState(zoneFilter || 'all')
  const [filterSearch, setFilterSearch] = useState('')
  const [selected,     setSelected]     = useState(new Set())
  const [assignDay,    setAssignDay]     = useState('')

  const areas = useMemo(() => [...new Set(db.dbRecords.map(r => r.ar).filter(Boolean))].sort(), [db.dbRecords])
  const zips  = useMemo(() => [...new Set(db.dbRecords.map(r => r.zi).filter(Boolean))].sort(), [db.dbRecords])

  const filtered = useMemo(() => {
    const q = filterSearch.toLowerCase()
    return db.dbRecords.filter(r =>
      (filterPri  === 'all' || r.pr === filterPri) &&
      (filterSt   === 'all' || r.st === filterSt) &&
      (filterArea === 'all' || r.ar === filterArea) &&
      (filterZip  === 'all' || r.zi === filterZip) &&
      (filterZone === 'all' || r.zo === filterZone) &&
      (!q || (r.n || '').toLowerCase().includes(q) || (r.a || '').toLowerCase().includes(q))
    ).sort((a, b) => b.sc - a.sc)
  }, [db.dbRecords, filterPri, filterSt, filterArea, filterZip, filterZone, filterSearch])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll()  { setSelected(new Set(filtered.map(r => r.id))) }
  function clearSel()   { setSelected(new Set()) }

  function loadToCanvass() {
    const ids = selected.size ? [...selected] : filtered.map(r => r.id)
    if (!ids.length) { flash('Select records first.', 'err'); return }

    const existingNames = new Set(canvass.map(c => c.name.toLowerCase()))
    const stops = []
    const dbUpdates = []

    ids.forEach(id => {
      const r = db.dbRecords.find(x => x.id === id); if (!r) return
      if (existingNames.has((r.n || '').toLowerCase())) return
      stops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : '',
        website: r.web, menu: r.mn, email: r.em,
        openTime: '', closeTime: '',
        status: 'Not visited yet',
        date: new Date().toLocaleDateString(),
        added: new Date().toISOString(),
        fromDb: r.id,
        score: r.sc, priority: r.pr,
      })
      dbUpdates.push(id)
    })

    if (!stops.length) { flash('All selected stops are already in canvass.', 'err'); return }
    cDispatch({ type: 'ADD_MANY', stops })
    dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })
    clearSel()
    flash(`${stops.length} stops loaded to canvass.`, 'ok')
  }

  function assignToDay() {
    if (!assignDay) { flash('Pick a day first.', 'err'); return }
    const ids = [...selected]; if (!ids.length) { flash('Select records first.', 'err'); return }
    dbDispatch({ type: 'ASSIGN_DAY', ids, day: assignDay })
    clearSel()
    flash(`${ids.length} stops assigned to ${assignDay}.`, 'ok')
  }

  if (!db.dbRecords.length) {
    return <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text2)', fontSize: '13px' }}>No records yet — import an Outscraper XLSX to get started.</div>
  }

  return (
    <div>
      <div className="filter-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
        <select value={filterPri}    onChange={e => setFilterPri(e.target.value)}    style={{ minWidth: '100px' }}>
          <option value="all">All priorities</option>
          <option value="Hot">Hot</option>
          <option value="Warm">Warm</option>
          <option value="Cold">Cold</option>
        </select>
        <select value={filterSt}     onChange={e => setFilterSt(e.target.value)}     style={{ minWidth: '120px' }}>
          <option value="all">All statuses</option>
          <option value="unworked">Unworked</option>
          <option value="in_canvass">In canvass</option>
          <option value="canvassed">Canvassed</option>
          <option value="converted">Converted</option>
          <option value="lead">Lead</option>
        </select>
        <select value={filterArea}   onChange={e => setFilterArea(e.target.value)}   style={{ minWidth: '140px' }}>
          <option value="all">All areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterZip}    onChange={e => setFilterZip(e.target.value)}    style={{ minWidth: '90px' }}>
          <option value="all">All ZIPs</option>
          {zips.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filterZone}   onChange={e => setFilterZone(e.target.value)}   style={{ minWidth: '130px' }}>
          <option value="all">All zones</option>
          {db.dbClusters.map(c => <option key={c.id} value={c.id}>{c.nm} ({c.cnt})</option>)}
        </select>
        <input type="text" value={filterSearch} placeholder="Search name…"
          style={{ flex: 2, minWidth: '140px' }} onChange={e => setFilterSearch(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="sm" onClick={selectAll}>Select all filtered</Button>
        <Button size="sm" onClick={clearSel}>Clear selection</Button>
        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
          {selected.size ? selected.size + ' selected' : filtered.length + ' records'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <Button size="sm" variant="primary" onClick={loadToCanvass}>→ Today's Canvass</Button>
          <select value={assignDay} onChange={e => setAssignDay(e.target.value)} style={{ height: '30px', fontSize: '12px', width: 'auto' }}>
            <option value="">Assign to day…</option>
            {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <Button size="sm" onClick={assignToDay}>Assign</Button>
        </div>
      </div>

      {msg && <div style={{ fontSize: '12px', marginBottom: '8px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>{msg.text}</div>}

      <div style={{ maxHeight: 'min(460px, 60vh)', overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        {filtered.map(r => (
          <div key={r.id}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: '0.5px solid var(--border)', fontSize: '13px', background: selected.has(r.id) ? 'var(--bg2)' : 'transparent', cursor: 'pointer' }}
            onClick={() => toggle(r.id)}>
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
              style={{ width: '15px', height: '15px', flexShrink: 0, accentColor: 'var(--accent)' }}
              onClick={e => e.stopPropagation()} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.n}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.a}</div>
              {r.nt && <div style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'pre-line', marginTop: '2px' }}>{r.nt}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: PRIORITY_COLOR[r.pr] }}>{r.pr} {r.sc}</span>
                {r.rt > 0 && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>★{r.rt}</span>}
                {statusBadge(r.st)}
              </div>
              {r.ph && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.ph}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
