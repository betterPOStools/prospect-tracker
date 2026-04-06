import { useState, useMemo, useRef, useCallback } from 'react'
import { useDatabase, useDatabaseDispatch, useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import { calcScore, calcPriority, PRIORITY_COLOR, PRIORITY_EMOJI, PRIORITIES } from '../../data/scoring.js'
import { parseWorkingHours, navUrl } from '../../data/helpers.js'
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

// ── Detail field definitions ──────────────────────────────────────────────
const FIELD_GROUPS = [
  { label: 'Contact', fields: [
    { key: 'ph',  label: 'Phone' },
    { key: 'pt',  label: 'Phone Type' },
    { key: 'pc',  label: 'Carrier' },
    { key: 'em',  label: 'Email' },
    { key: 'es',  label: 'Email Status' },
    { key: 'cn',  label: 'Contact Name' },
    { key: 'ct',  label: 'Contact Title' },
    { key: 'web', label: 'Website', link: true },
    { key: 'mn',  label: 'Menu', link: true },
    { key: 'fb',  label: 'Facebook', link: true },
    { key: 'ig',  label: 'Instagram', link: true },
  ]},
  { label: 'Business', fields: [
    { key: 'ty',  label: 'Type' },
    { key: 'rt',  label: 'Rating' },
    { key: 'rv',  label: 'Reviews' },
    { key: 'ch',  label: 'Is Chain', bool: true },
    { key: 'emp', label: 'Employees' },
    { key: 'rev', label: 'Revenue' },
    { key: 'nai', label: 'NAICS Code' },
    { key: 'nad', label: 'NAICS Desc' },
    { key: 'hr',  label: 'Hours' },
  ]},
  { label: 'Location', fields: [
    { key: 'a',   label: 'Address' },
    { key: 'ci',  label: 'City' },
    { key: 'zi',  label: 'ZIP' },
    { key: 'lt',  label: 'Latitude', readonly: true },
    { key: 'lg',  label: 'Longitude', readonly: true },
    { key: 'pi',  label: 'Place ID', readonly: true },
  ]},
  { label: 'Organization', fields: [
    { key: 'ar',  label: 'Area' },
    { key: 'da',  label: 'Day' },
    { key: 'grp', label: 'Group' },
    { key: 'st',  label: 'Status', select: ['unworked', 'in_canvass', 'canvassed', 'converted', 'lead'] },
    { key: 'co',  label: 'Cooldown Until', type: 'date' },
  ]},
  { label: 'Notes', fields: [
    { key: 'nt',  label: 'Notes', textarea: true },
  ]},
]

const dStyle = { fontSize: '12px', padding: '12px', background: 'var(--bg2)', borderBottom: '0.5px solid var(--border)' }
const fieldRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', gap: '8px' }
const fieldLabel = { color: 'var(--text3)', fontSize: '11px', flexShrink: 0, width: '90px' }
const fieldValue = { color: 'var(--text)', fontSize: '12px', textAlign: 'right', flex: 1, minWidth: 0, wordBreak: 'break-word' }
const fieldEmpty = { ...fieldValue, color: 'var(--text3)', fontStyle: 'italic' }
const groupTitle = { fontSize: '11px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '10px', marginBottom: '4px' }
const inputStyle = { width: '100%', height: '28px', fontSize: '12px', padding: '0 8px', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }

function RecordDetail({ r, dbDispatch, flash }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  function startEdit() {
    setForm({ ...r })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setForm({})
  }

  function saveEdit() {
    const sc = calcScore(form)
    const pr = calcPriority(sc)
    dbDispatch({ type: 'UPDATE_RECORD', record: { ...form, sc, pr } })
    setEditing(false)
    setForm({})
    flash('Record updated.', 'ok')
  }

  function upd(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function renderField(f) {
    if (editing && !f.readonly) {
      if (f.textarea) {
        return (
          <div key={f.key} style={{ padding: '3px 0' }}>
            <div style={{ ...fieldLabel, width: 'auto', marginBottom: '4px' }}>{f.label}</div>
            <textarea value={form[f.key] || ''} onChange={e => upd(f.key, e.target.value)}
              style={{ ...inputStyle, height: '60px', padding: '6px 8px', resize: 'vertical' }} />
          </div>
        )
      }
      if (f.select) {
        return (
          <div key={f.key} style={fieldRow}>
            <span style={fieldLabel}>{f.label}</span>
            <select value={form[f.key] || ''} onChange={e => upd(f.key, e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}>
              {f.select.map(o => <option key={o} value={o}>{badgeLabel[o] || o}</option>)}
            </select>
          </div>
        )
      }
      if (f.bool) {
        return (
          <div key={f.key} style={fieldRow}>
            <span style={fieldLabel}>{f.label}</span>
            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="checkbox" checked={!!form[f.key]} onChange={e => upd(f.key, e.target.checked)}
                style={{ accentColor: 'var(--accent)' }} />
              {form[f.key] ? 'Yes' : 'No'}
            </label>
          </div>
        )
      }
      return (
        <div key={f.key} style={fieldRow}>
          <span style={fieldLabel}>{f.label}</span>
          <input type={f.type || 'text'} value={form[f.key] ?? ''} onChange={e => upd(f.key, e.target.value)}
            style={{ ...inputStyle, textAlign: 'right', flex: 1 }} />
        </div>
      )
    }

    // View mode
    const val = r[f.key]
    const hasVal = val != null && val !== '' && val !== false
    if (f.textarea) {
      return (
        <div key={f.key} style={{ padding: '3px 0' }}>
          <div style={{ ...fieldLabel, width: 'auto', marginBottom: '2px' }}>{f.label}</div>
          <div style={hasVal ? { ...fieldValue, textAlign: 'left', whiteSpace: 'pre-wrap' } : { ...fieldEmpty, textAlign: 'left' }}>
            {hasVal ? val : '—'}
          </div>
        </div>
      )
    }
    if (f.bool) {
      return (
        <div key={f.key} style={fieldRow}>
          <span style={fieldLabel}>{f.label}</span>
          <span style={fieldValue}>{val ? 'Yes' : 'No'}</span>
        </div>
      )
    }
    return (
      <div key={f.key} style={fieldRow}>
        <span style={fieldLabel}>{f.label}</span>
        {hasVal ? (
          f.link ? (
            <a href={String(val).startsWith('http') ? val : 'https://' + val} target="_blank" rel="noopener noreferrer"
              style={{ ...fieldValue, color: 'var(--accent)', textDecoration: 'none' }}
              onClick={e => e.stopPropagation()}>
              {String(val).replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
            </a>
          ) : (
            <span style={fieldValue}>{String(val)}</span>
          )
        ) : (
          <span style={fieldEmpty}>—</span>
        )}
      </div>
    )
  }

  return (
    <div style={dStyle} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: PRIORITY_COLOR[r.pr] }}>{PRIORITY_EMOJI[r.pr]} {r.pr}</span>
          <span style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>Score {r.sc}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {editing ? (<>
            <Button size="sm" variant="primary" onClick={saveEdit}>Save</Button>
            <Button size="sm" onClick={cancelEdit}>Cancel</Button>
          </>) : (
            <Button size="sm" onClick={startEdit}>Edit</Button>
          )}
        </div>
      </div>

      {FIELD_GROUPS.map(group => (
        <div key={group.label}>
          <div style={groupTitle}>{group.label}</div>
          {group.fields.map(renderField)}
        </div>
      ))}
    </div>
  )
}

export default function BrowsePanel() {
  const db           = useDatabase()
  const dbDispatch   = useDatabaseDispatch()
  const canvass      = useCanvass()
  const cDispatch    = useCanvassDispatch()
  const { msg, flash } = useFlashMessage()

  const [filterPri,    setFilterPri]    = useState('all')
  const [filterSt,     setFilterSt]     = useState('all')
  const [filterArea,   setFilterArea]   = useState('all')
  const [filterZip,    setFilterZip]    = useState('all')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterGroup,  setFilterGroup]  = useState('all')
  const [hideHold,     setHideHold]     = useState(true)
  const [selected,     setSelected]     = useState(new Set())
  const [expandedId,   setExpandedId]   = useState(null)
  const [assignDay,    setAssignDay]     = useState('')
  const [groupInput,   setGroupInput]   = useState('')
  const [bulkStatus,   setBulkStatus]   = useState('')

  const areas  = useMemo(() => [...new Set(db.dbRecords.map(r => r.ar).filter(Boolean))].sort(), [db.dbRecords])
  const areaRecords = useMemo(() => filterArea === 'all' ? db.dbRecords : db.dbRecords.filter(r => r.ar === filterArea), [db.dbRecords, filterArea])
  const zips   = useMemo(() => [...new Set(areaRecords.map(r => r.zi).filter(Boolean))].sort(), [areaRecords])
  const groups = useMemo(() => [...new Set(db.dbRecords.map(r => r.grp).filter(Boolean))].sort(), [db.dbRecords])
  const recordById = useMemo(() => new Map(db.dbRecords.map(r => [r.id, r])), [db.dbRecords])

  const filtered = useMemo(() => {
    const q = filterSearch.toLowerCase()
    const todayISO = new Date().toISOString().slice(0, 10)
    return db.dbRecords.filter(r =>
      (filterPri   === 'all' || r.pr === filterPri) &&
      (filterSt    === 'all' || r.st === filterSt) &&
      (filterArea  === 'all' || r.ar === filterArea) &&
      (filterZip   === 'all' || r.zi === filterZip) &&
      (filterGroup === 'all' || (r.grp || '') === filterGroup) &&
      (!hideHold || !r.co || r.co <= todayISO) &&
      (!q || (r.n || '').toLowerCase().includes(q) || (r.a || '').toLowerCase().includes(q))
    ).sort((a, b) => b.sc - a.sc)
  }, [db.dbRecords, filterPri, filterSt, filterArea, filterZip, filterGroup, filterSearch, hideHold])

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

    const todayISO = new Date().toISOString().slice(0, 10)
    ids.forEach(id => {
      const r = recordById.get(id); if (!r) return
      if (r.co && r.co > todayISO) return // skip cooldown
      if (existingNames.has((r.n || '').toLowerCase())) return
      const now = new Date().toISOString()
      const contactNote = r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : ''
      stops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: '', website: r.web, menu: r.mn, email: r.em,
        ...parseWorkingHours(r.hr),
        lat: r.lt, lng: r.lg,
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

    // Auto-load to canvass
    const existingNames = new Set(canvass.map(c => c.name.toLowerCase()))
    const stops = []
    const dbUpdates = []
    const todayISO = new Date().toISOString().slice(0, 10)
    ids.forEach(id => {
      const r = recordById.get(id); if (!r) return
      if (r.st !== 'unworked') return
      if (r.co && r.co > todayISO) return
      if (existingNames.has((r.n || '').toLowerCase())) return
      const now = new Date().toISOString()
      const contactNote = r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : ''
      stops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: '', website: r.web, menu: r.mn, email: r.em,
        ...parseWorkingHours(r.hr),
        lat: r.lt, lng: r.lg,
        status: 'Not visited yet',
        date: new Date().toLocaleDateString(),
        added: now, fromDb: r.id, score: r.sc, priority: r.pr,
        history: [], notesLog: contactNote ? [{ text: 'Contact: ' + contactNote, ts: now, system: true }] : [],
      })
      dbUpdates.push(id)
    })
    if (stops.length) {
      cDispatch({ type: 'ADD_MANY', stops })
      dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })
    }

    clearSel()
    flash(`${ids.length} records assigned to ${assignDay}${stops.length ? `, ${stops.length} loaded to canvass` : ''}.`, 'ok')
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
    const reassigned = Object.values(byArea).flat().length
    const areaCount = Object.keys(byArea).length
    flash(`${reassigned ? `Reassigned ${reassigned} records across ${areaCount} area${areaCount !== 1 ? 's' : ''}` : 'No changes needed'}${skipped ? ` (${skipped} skipped)` : ''}.`, 'ok')
  }

  if (!db.dbRecords.length) {
    return <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text2)', fontSize: '13px' }}>No records yet — import Outscraper data to get started.</div>
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
        <select value={filterArea}   onChange={e => { setFilterArea(e.target.value); setFilterZip('all') }}   style={{ minWidth: '140px' }}>
          <option value="all">All areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterZip}    onChange={e => setFilterZip(e.target.value)}    style={{ minWidth: '90px' }}>
          <option value="all">All ZIPs</option>
          {zips.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {groups.length > 0 && (
          <select value={filterGroup}  onChange={e => setFilterGroup(e.target.value)}  style={{ minWidth: '100px' }}>
            <option value="all">All groups</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <input type="text" value={filterSearch} placeholder="Search name…"
          style={{ flex: 2, minWidth: '140px' }} onChange={e => setFilterSearch(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={hideHold} onChange={e => setHideHold(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          Hide on hold
        </label>
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
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: expandedId === r.id ? 'none' : '0.5px solid var(--border)', fontSize: '13px', background: selected.has(r.id) ? 'var(--bg2)' : 'transparent', cursor: 'pointer' }}
                  onClick={() => setExpandedId(prev => prev === r.id ? null : r.id)}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                    style={{ width: '15px', height: '15px', flexShrink: 0, accentColor: 'var(--accent)' }}
                    onClick={e => e.stopPropagation()} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.n}
                      {r.grp && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--blue-text)', background: 'var(--blue-bg)', padding: '1px 5px', borderRadius: '8px' }}>{r.grp}</span>}
                      {r.df > 0 && <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--purple-text)', background: 'var(--purple-bg)', padding: '1px 5px', borderRadius: '8px' }}>{r.df} dropped</span>}
                      {r.co && r.co > new Date().toISOString().slice(0, 10) && <span style={{ marginLeft: '4px', fontSize: '10px', color: 'var(--orange-text)', background: 'var(--yellow-bg)', padding: '1px 5px', borderRadius: '8px' }}>hold til {r.co}</span>}
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
                {expandedId === r.id && <RecordDetail r={r} dbDispatch={dbDispatch} flash={flash} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
