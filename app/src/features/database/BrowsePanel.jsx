import { useState, useMemo, useRef } from 'react'
import { useDatabase, useDatabaseDispatch, useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import { calcScore, calcPriority, PRIORITY_COLOR, PRIORITY_EMOJI, PRIORITIES } from '../../data/scoring.js'
import { parseWorkingHours } from '../../data/helpers.js'
import { buildClusters } from '../../data/clustering.js'
import { useVirtualizer } from '@tanstack/react-virtual'
import Button from '../../components/Button.jsx'

const badgeBase = { padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }
const badges = {
  unworked:   { ...badgeBase, background: 'var(--bg2)',        color: 'var(--text2)' },
  in_canvass: { ...badgeBase, background: 'var(--purple-bg)',  color: 'var(--purple-text)' },
  canvassed:  { ...badgeBase, background: 'var(--yellow-bg)',  color: 'var(--yellow-text)' },
  converted:  { ...badgeBase, background: 'var(--green-bg)',   color: 'var(--green-text)' },
  lead:       { ...badgeBase, background: 'var(--blue-bg)',    color: 'var(--blue-text)' },
}
const badgeLabel = { unworked: 'Unworked', in_canvass: 'In canvass', canvassed: 'Canvassed', converted: 'Converted', lead: 'Lead' }

function statusBadge(st) {
  const s = badges[st]; if (!s) return null
  return <span style={s}>{badgeLabel[st]}</span>
}

const ROW_HEIGHT = 52 // estimated px per row

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
  const [filterGroup,  setFilterGroup]  = useState('all')
  const [selected,     setSelected]     = useState(new Set())
  const [assignDay,    setAssignDay]     = useState('')
  const [groupInput,   setGroupInput]   = useState('')
  const [bulkStatus,   setBulkStatus]   = useState('')

  const areas  = useMemo(() => [...new Set(db.dbRecords.map(r => r.ar).filter(Boolean))].sort(), [db.dbRecords])
  const areaRecords = useMemo(() => filterArea === 'all' ? db.dbRecords : db.dbRecords.filter(r => r.ar === filterArea), [db.dbRecords, filterArea])
  const zips   = useMemo(() => [...new Set(areaRecords.map(r => r.zi).filter(Boolean))].sort(), [areaRecords])
  const zones  = useMemo(() => db.dbClusters.filter(c => areaRecords.some(r => r.zo === c.id)), [db.dbClusters, areaRecords])
  const groups = useMemo(() => [...new Set(db.dbRecords.map(r => r.grp).filter(Boolean))].sort(), [db.dbRecords])
  const recordById = useMemo(() => new Map(db.dbRecords.map(r => [r.id, r])), [db.dbRecords])

  const filtered = useMemo(() => {
    const q = filterSearch.toLowerCase()
    return db.dbRecords.filter(r =>
      (filterPri   === 'all' || r.pr === filterPri) &&
      (filterSt    === 'all' || r.st === filterSt) &&
      (filterArea  === 'all' || r.ar === filterArea) &&
      (filterZip   === 'all' || r.zi === filterZip) &&
      (filterZone  === 'all' || r.zo === filterZone) &&
      (filterGroup === 'all' || (r.grp || '') === filterGroup) &&
      (!q || (r.n || '').toLowerCase().includes(q) || (r.a || '').toLowerCase().includes(q))
    ).sort((a, b) => b.sc - a.sc)
  }, [db.dbRecords, filterPri, filterSt, filterArea, filterZip, filterZone, filterGroup, filterSearch])

  // Virtualizer
  const scrollRef = useRef(null)
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

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
      const r = recordById.get(id); if (!r) return
      if (existingNames.has((r.n || '').toLowerCase())) return
      const now = new Date().toISOString()
      const contactNote = r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : ''
      stops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: '', website: r.web, menu: r.mn, email: r.em,
        ...parseWorkingHours(r.hr),
        status: 'Not visited yet',
        date: new Date().toLocaleDateString(),
        added: now, fromDb: r.id,
        score: r.sc, priority: r.pr,
        history: [], notesLog: contactNote ? [{ text: 'Contact: ' + contactNote, ts: now, system: true }] : [],
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

  function setGroup() {
    const name = groupInput.trim(); if (!name) { flash('Enter a group name first.', 'err'); return }
    const ids = [...selected]; if (!ids.length) { flash('Select records first.', 'err'); return }
    dbDispatch({ type: 'SET_GROUP', ids, group: name })
    clearSel()
    setGroupInput('')
    flash(`${ids.length} records assigned to group "${name}".`, 'ok')
  }

  function clearGroup() {
    const ids = [...selected]; if (!ids.length) { flash('Select records first.', 'err'); return }
    dbDispatch({ type: 'SET_GROUP', ids, group: '' })
    clearSel()
    flash(`Group cleared from ${ids.length} records.`, 'ok')
  }

  function applyBulkStatus() {
    if (!bulkStatus) { flash('Pick a status first.', 'err'); return }
    const ids = [...selected]; if (!ids.length) { flash('Select records first.', 'err'); return }
    dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids, fields: { st: bulkStatus } })
    setBulkStatus('')
    clearSel()
    flash(`${ids.length} records set to ${badgeLabel[bulkStatus]}.`, 'ok')
  }

  function reassignAreas() {
    const byArea = {}
    let skipped = 0
    db.dbRecords.forEach(r => {
      let city = r.ci || ''
      let st = ''
      if (!city) {
        const addrMatch = (r.a || '').match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d/)
        if (addrMatch) { city = addrMatch[1].trim(); st = addrMatch[2] }
      }
      if (!city) { skipped++; return }
      if (!st) {
        const stMatch = (r.a || '').match(/,\s*([A-Z]{2})\s+\d/)
        if (stMatch) st = stMatch[1]
      }
      const area = st ? `${city}, ${st}` : city
      if (r.ar === area) return // already correct
      if (!byArea[area]) byArea[area] = []
      byArea[area].push(r.id)
    })
    // Apply new areas
    if (Object.keys(byArea).length) {
      Object.entries(byArea).forEach(([area, ids]) => {
        dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids, fields: { ar: area } })
      })
    }
    // Rebuild clusters from updated records
    const updatedRecords = db.dbRecords.map(r => {
      const areaForR = Object.entries(byArea).find(([, ids]) => ids.includes(r.id))
      return areaForR ? { ...r, ar: areaForR[0] } : r
    })
    const newClusters = buildClusters(updatedRecords)
    dbDispatch({ type: 'SET_CLUSTERS', dbClusters: newClusters })
    // Write zone IDs back onto records from cluster membership
    const idToZone = {}
    newClusters.forEach(c => { c.mb.forEach(id => { idToZone[id] = c.id }) })
    const zoneUpdates = Object.entries(
      Object.entries(idToZone).reduce((acc, [id, zo]) => { (acc[zo] || (acc[zo] = [])).push(id); return acc }, {})
    )
    zoneUpdates.forEach(([zo, ids]) => {
      dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids, fields: { zo } })
    })
    const reassigned = Object.values(byArea).flat().length
    const areaCount = Object.keys(byArea).length
    flash(`${reassigned ? `Reassigned ${reassigned} records across ${areaCount} area${areaCount !== 1 ? 's' : ''}, r` : 'R'}ebuilt ${newClusters.length} zones${skipped ? ` (${skipped} skipped)` : ''}.`, 'ok')
  }

  if (!db.dbRecords.length) {
    return <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text2)', fontSize: '13px' }}>No records yet — import an Outscraper XLSX to get started.</div>
  }

  return (
    <div>
      <div className="filter-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
        <select value={filterPri}    onChange={e => setFilterPri(e.target.value)}    style={{ minWidth: '100px' }}>
          <option value="all">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_EMOJI[p]} {p}</option>)}
        </select>
        <select value={filterSt}     onChange={e => setFilterSt(e.target.value)}     style={{ minWidth: '120px' }}>
          <option value="all">All statuses</option>
          <option value="unworked">Unworked</option>
          <option value="in_canvass">In canvass</option>
          <option value="canvassed">Canvassed</option>
          <option value="converted">Converted</option>
          <option value="lead">Lead</option>
        </select>
        <select value={filterArea}   onChange={e => { setFilterArea(e.target.value); setFilterZip('all'); setFilterZone('all') }}   style={{ minWidth: '140px' }}>
          <option value="all">All areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterZip}    onChange={e => setFilterZip(e.target.value)}    style={{ minWidth: '90px' }}>
          <option value="all">All ZIPs</option>
          {zips.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filterZone}   onChange={e => setFilterZone(e.target.value)}   style={{ minWidth: '130px' }}>
          <option value="all">All zones</option>
          {zones.map(c => <option key={c.id} value={c.id}>{c.nm} ({c.cnt})</option>)}
        </select>
        {groups.length > 0 && (
          <select value={filterGroup}  onChange={e => setFilterGroup(e.target.value)}  style={{ minWidth: '100px' }}>
            <option value="all">All groups</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <input type="text" value={filterSearch} placeholder="Search name…"
          style={{ flex: 2, minWidth: '140px' }} onChange={e => setFilterSearch(e.target.value)} />
        <Button size="sm" onClick={reassignAreas} style={{ fontSize: '11px', opacity: 0.7 }}>Reassign areas</Button>
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

      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '8px 10px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text2)', marginRight: '4px' }}>Bulk edit:</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} style={{ height: '28px', fontSize: '12px' }}>
            <option value="">Status…</option>
            <option value="unworked">Unworked</option>
            <option value="in_canvass">In canvass</option>
            <option value="canvassed">Canvassed</option>
            <option value="converted">Converted</option>
            <option value="lead">Lead</option>
          </select>
          <Button size="sm" onClick={applyBulkStatus}>Set</Button>
        </div>
      )}

      {msg && <div style={{ fontSize: '12px', marginBottom: '8px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>{msg.text}</div>}

      <div ref={scrollRef} style={{ maxHeight: 'min(460px, 60vh)', overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(vRow => {
            const r = filtered[vRow.index]
            return (
              <div key={r.id}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }}
                ref={virtualizer.measureElement}
                data-index={vRow.index}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: '0.5px solid var(--border)', fontSize: '13px', background: selected.has(r.id) ? 'var(--bg2)' : 'transparent', cursor: 'pointer' }}
                  onClick={() => toggle(r.id)}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                    style={{ width: '15px', height: '15px', flexShrink: 0, accentColor: 'var(--accent)' }}
                    onClick={e => e.stopPropagation()} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.n}
                      {r.grp && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--blue-text)', background: 'var(--blue-bg)', padding: '1px 5px', borderRadius: '8px' }}>{r.grp}</span>}
                      {r.df > 0 && <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--purple-text)', background: 'var(--purple-bg)', padding: '1px 5px', borderRadius: '8px' }}>{r.df} dropped</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.a}</div>
                    {r.nt && <div style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'pre-line', marginTop: '2px' }}>{r.nt}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 500, color: PRIORITY_COLOR[r.pr] }}>{PRIORITY_EMOJI[r.pr]} {r.pr} {r.sc}</span>
                      {r.rt > 0 && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>★{r.rt}</span>}
                      {statusBadge(r.st)}
                    </div>
                    {r.ph && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.ph}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
