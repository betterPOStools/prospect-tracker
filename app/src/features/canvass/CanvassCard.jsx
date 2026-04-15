import { useState, useRef, useCallback } from 'react'
import { useCanvassDispatch, useDatabaseDispatch, useDatabase } from '../../data/store.jsx'
import { hoursChip, navUrl } from '../../data/helpers.js'
import { CANVASS_ACTIVE, CANVASS_TO_DB_STATUS, REMOVAL_STATUSES, BLOCKLIST_ON_REMOVAL } from './constants.js'
import { HoursChip } from '../../components/Badge.jsx'
import Button from '../../components/Button.jsx'
import styles from './CanvassCard.module.css'
import btnStyles from '../../components/Button.module.css'
import { useDemoStatus, loadDemo, fetchSession } from '../../lib/demoBuilder.js'

// Module-level geocode cache — survives re-renders, cleared on page reload
const _geocodeCache = new Map()

function fmtTs(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function CanvassCard({ stop, overdue, ageLabel, showBuildRun, onConvert, onBuildRun }) {
  const canvassDispatch = useCanvassDispatch()
  const dbDispatch      = useDatabaseDispatch()
  const db              = useDatabase()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [newNote, setNewNote] = useState('')
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [editingNoteIdx, setEditingNoteIdx] = useState(-1)
  const [editNoteText, setEditNoteText] = useState('')
  const [loadDemoMsg, setLoadDemoMsg] = useState('')
  const [loadDemoLoading, setLoadDemoLoading] = useState(false)
  const c = stop
  const isConverted = c.status === 'Converted'
  const isRemoved = REMOVAL_STATUSES.includes(c.status)
  const isArchived = isConverted || isRemoved
  const dbRecord = c.fromDb ? db.dbRecords.find(r => r.id === c.fromDb) : null
  const droppedCount = dbRecord?.df || 0
  const demoEntry = useDemoStatus(c.fromDb)
  const demoReady = demoEntry?.status === 'done'
  const notesLog = c.notesLog || []
  const history = c.history || []

  function handleStatusChange(e) {
    const val = e.target.value
    if (REMOVAL_STATUSES.includes(val)) {
      if (!confirm(`Mark "${c.name}" as ${val}? This will remove it from the database.`)) return
      canvassDispatch({ type: 'UPDATE_STATUS', id: c.id, status: val })
      if (c.fromDb) dbDispatch({ type: 'DELETE_RECORD', id: c.fromDb })
      if (BLOCKLIST_ON_REMOVAL.includes(val)) dbDispatch({ type: 'ADD_TO_BLOCKLIST', name: c.name })
      return
    }
    canvassDispatch({ type: 'UPDATE_STATUS', id: c.id, status: val })
    // Sync back to DB record
    if (c.fromDb) {
      const dbSt = CANVASS_TO_DB_STATUS[val]
      dbDispatch({
        type: 'UPDATE_RECORD_STATUS',
        id: c.fromDb,
        status: dbSt || (CANVASS_ACTIVE.includes(val) ? 'in_canvass' : undefined),
      })
      if (val === 'Dropped folder') dbDispatch({ type: 'INCREMENT_DROPPED', id: c.fromDb })
    }
  }

  function handleDropFolder() {
    canvassDispatch({ type: 'UPDATE_STATUS', id: c.id, status: 'Dropped folder' })
    if (c.fromDb) {
      dbDispatch({ type: 'UPDATE_RECORD_STATUS', id: c.fromDb, status: 'canvassed' })
      dbDispatch({ type: 'INCREMENT_DROPPED', id: c.fromDb })
    }
  }

  function handleDelete() {
    if (confirm(`Remove ${c.name}?`)) canvassDispatch({ type: 'DELETE', id: c.id })
  }

  function startEdit() { setForm({ ...c }); setEditing(true) }
  function cancelEdit() { setEditing(false) }
  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  const [geocoding, setGeocoding] = useState(false)
  const geocodeTimer = useRef(null)
  const geocodeAddr = useCallback(() => {
    const addr = form.addr?.trim(); if (!addr) return
    clearTimeout(geocodeTimer.current)
    geocodeTimer.current = setTimeout(async () => {
      if (_geocodeCache.has(addr)) {
        const { lat, lng } = _geocodeCache.get(addr)
        set('_lat', lat); set('_lng', lng)
        return
      }
      setGeocoding(true)
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`, { headers: { 'Accept-Language': 'en' } })
        const data = await res.json()
        if (data[0]) {
          const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon)
          _geocodeCache.set(addr, { lat, lng })
          set('_lat', lat); set('_lng', lng)
        }
      } catch { /* silently ignore */ }
      setGeocoding(false)
    }, 300)
  }, [form.addr])

  function saveEdit() {
    const noteText = form.notes?.trim() || ''
    const updated = {
      ...c,
      name:      form.name?.trim()    || c.name,
      status:    form.status,
      addr:      form.addr?.trim()    || '',
      phone:     form.phone?.trim()   || '',
      notes:     '',
      openTime:  form.openTime        || '',
      closeTime: form.closeTime       || '',
      website:   form.website?.trim() || '',
      menu:      form.menu?.trim()    || '',
      followUp:  form.followUp        || '',
    }
    if (form._lat) { updated.lat = form._lat; updated.lng = form._lng; delete updated._lat; delete updated._lng }
    // Append notes field text as a new log entry inline
    if (noteText) updated.notesLog = [...(updated.notesLog || []), { text: noteText, ts: new Date().toISOString(), system: false }]
    canvassDispatch({ type: 'UPDATE', stop: updated })
    setEditing(false)
  }

  function addNote() {
    const text = newNote.trim()
    if (!text) return
    canvassDispatch({ type: 'APPEND_NOTE', id: c.id, text })
    setNewNote('')
  }

  function startEditNote(idx) {
    setEditingNoteIdx(idx)
    setEditNoteText(notesLog[idx].text)
  }

  function saveEditNote() {
    if (editingNoteIdx < 0) return
    canvassDispatch({ type: 'UPDATE_NOTE', id: c.id, noteIdx: editingNoteIdx, text: editNoteText })
    setEditingNoteIdx(-1)
  }

  async function handleLoadDemo() {
    setLoadDemoLoading(true)
    setLoadDemoMsg('Queuing demo…')
    try {
      const { ok, status, data } = await loadDemo(c.fromDb)
      if (!ok) {
        setLoadDemoMsg(status === 404 ? 'No demo built yet for this prospect' : (data.error || 'Load failed'))
        setLoadDemoLoading(false)
        setTimeout(() => setLoadDemoMsg(''), 5000)
        return
      }
      // Poll the session's deploy_status until done/failed or 60s elapses.
      setLoadDemoMsg('Deploying to tablet…')
      const sessionId = data.session_id
      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000))
        try {
          const session = await fetchSession(sessionId)
          if (session?.deploy_status === 'done') {
            setLoadDemoMsg('Demo deployed to tablet ✓')
            break
          }
          if (session?.deploy_status === 'failed') {
            setLoadDemoMsg('Deploy failed — check Demo Builder')
            break
          }
        } catch { /* keep polling on transient network errors */ }
      }
      if (Date.now() >= deadline) {
        setLoadDemoMsg('Deploy taking longer than usual — check Demo Builder')
      }
    } catch {
      setLoadDemoMsg('Could not reach Demo Builder — check your connection')
    }
    setLoadDemoLoading(false)
    setTimeout(() => setLoadDemoMsg(''), 10_000)
  }

  const hours = hoursChip(c.openTime, c.closeTime)

  if (editing) {
    return (
      <div className={styles.card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="row">
            <input type="text" value={form.name || ''} placeholder="Business name *"
              style={{ flex: 2 }} onChange={e => set('name', e.target.value)} />
            <select value={form.status || 'Not visited yet'}
              onChange={e => set('status', e.target.value)}
              style={{ minWidth: '170px' }}>
              {CANVASS_ACTIVE.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="text" value={form.addr || ''} placeholder="Full address"
              style={{ flex: 1 }} onChange={e => set('addr', e.target.value)} />
            <Button size="sm" onClick={geocodeAddr} disabled={geocoding || !form.addr?.trim()}
              title="Geocode address for proximity-based routing">
              {geocoding ? '…' : form._lat ? '✓ Geocoded' : 'Geocode'}
            </Button>
          </div>
          <div className="row">
            <input type="tel"  value={form.phone || ''} placeholder="Phone"  onChange={e => set('phone',  e.target.value)} />
            <input type="text" value={form.notes || ''} placeholder="Notes"  onChange={e => set('notes',  e.target.value)} />
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <div className="field-label">Opens</div>
              <input type="time" value={form.openTime  || ''} onChange={e => set('openTime',  e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="field-label">Closes</div>
              <input type="time" value={form.closeTime || ''} onChange={e => set('closeTime', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="field-label">Follow up</div>
              <input type="date" value={form.followUp || ''} onChange={e => set('followUp', e.target.value)} />
            </div>
          </div>
          <input type="url" value={form.website || ''} placeholder="Website (https://…)"   onChange={e => set('website', e.target.value)} />
          <input type="url" value={form.menu    || ''} placeholder="Menu link (https://…)" onChange={e => set('menu',    e.target.value)} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Button variant="primary" size="sm" onClick={saveEdit}>Save</Button>
            <Button size="sm" onClick={cancelEdit}>Cancel</Button>
          </div>
        </div>
      </div>
    )
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const followUpOverdue = c.followUp && c.followUp < todayISO
  const followUpDays = c.followUp ? Math.floor((new Date(c.followUp) - new Date(todayISO)) / 86400000) : null
  const lastContactDays = c.lastContact ? Math.floor((Date.now() - new Date(c.lastContact)) / 86400000) : null
  const lastContactLabel = lastContactDays === 0 ? 'today' : lastContactDays === 1 ? 'yesterday' : lastContactDays != null ? lastContactDays + 'd ago' : null

  // Show last 3 notes inline, rest behind "View all"
  const visibleNotes = showAllNotes ? notesLog : notesLog.slice(-3)
  const hasMoreNotes = notesLog.length > 3

  return (
    <div className={`${styles.card} ${isArchived ? styles.archived : ''}`}>
      <div className={styles.top}>
        <div>
          <div className={styles.name}>
            {c.name}
            {droppedCount > 0 && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, color: 'var(--purple-text)', background: 'var(--purple-bg)', padding: '1px 6px', borderRadius: '10px' }}>{droppedCount} dropped</span>}
          </div>
          {c.date && (
            <div className={styles.dateLine}>
              {c.date}{ageLabel && <> · <span className={styles.age}>{ageLabel}</span></>}
              {overdue && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 600, color: 'var(--red-text)', background: 'var(--red-bg)', padding: '1px 6px', borderRadius: '10px' }}>Overdue</span>}
            </div>
          )}
          {(c.followUp || lastContactLabel) && (
            <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', gap: '8px' }}>
              {c.followUp && (
                <span style={{ color: followUpOverdue ? 'var(--red-text)' : 'var(--text3)' }}>
                  Follow up: {c.followUp}{followUpOverdue && ` (${Math.abs(followUpDays)}d overdue)`}{followUpDays === 0 && ' (today)'}{followUpDays > 0 && ` (in ${followUpDays}d)`}
                </span>
              )}
              {lastContactLabel && <span>Last contact: {lastContactLabel}</span>}
            </div>
          )}
        </div>
        <div className={styles.topRight}>
          {hours && <HoursChip label={hours.label} isOpen={hours.isOpen} />}
          {isArchived
            ? <span style={{ background: isConverted ? 'var(--green-bg)' : 'var(--red-bg)', color: isConverted ? 'var(--green-text)' : 'var(--red-text)', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>{c.status}</span>
            : (
              <select className={styles.statusSelect} value={c.status} onChange={handleStatusChange}>
                {CANVASS_ACTIVE.map(s => <option key={s} value={s}>{s}</option>)}
                <option disabled>──────────</option>
                {REMOVAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )
          }
        </div>
      </div>

      {c.addr    && <div className={styles.detail} style={{ marginTop: '6px' }}>📍 {c.addr}</div>}
      {c.phone   && <div className={styles.detail}>📞 {c.phone}</div>}
      {c.website && <div className={styles.detail}>🌐 <a href={c.website} target="_blank" rel="noreferrer">{c.website}</a></div>}
      {c.menu    && <div className={styles.detail}>🍽 <a href={c.menu} target="_blank" rel="noreferrer">View menu</a></div>}

      {/* Notes Log */}
      {(notesLog.length > 0 || !isArchived) && (
        <div style={{ marginTop: '8px', borderTop: '0.5px solid var(--border)', paddingTop: '6px' }}>
          {hasMoreNotes && !showAllNotes && (
            <button onClick={() => setShowAllNotes(true)}
              style={{ background: 'none', border: 'none', color: 'var(--blue-text)', fontSize: '11px', cursor: 'pointer', padding: 0, marginBottom: '4px' }}>
              View all ({notesLog.length}) notes
            </button>
          )}
          {showAllNotes && hasMoreNotes && (
            <button onClick={() => setShowAllNotes(false)}
              style={{ background: 'none', border: 'none', color: 'var(--blue-text)', fontSize: '11px', cursor: 'pointer', padding: 0, marginBottom: '4px' }}>
              Show recent
            </button>
          )}
          {visibleNotes.map((note, i) => {
            const realIdx = showAllNotes ? i : notesLog.length - 3 + i
            const isEditing = editingNoteIdx === realIdx
            const nType = note.type || 'note'
            const isActivity = nType === 'call' || nType === 'sms'
            const actColor = nType === 'call' ? 'var(--blue-text)' : nType === 'sms' ? 'var(--purple-text)' : note.system ? 'var(--text3)' : 'var(--text2)'
            const actIcon = nType === 'call' ? '📞 ' : nType === 'sms' ? '💬 ' : ''
            return (
              <div key={realIdx} style={{ fontSize: '12px', color: actColor, marginBottom: '3px', fontStyle: note.system ? 'italic' : 'normal' }}>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input type="text" value={editNoteText} onChange={e => setEditNoteText(e.target.value)}
                      style={{ flex: 1, fontSize: '12px', padding: '2px 6px' }}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditNote(); if (e.key === 'Escape') setEditingNoteIdx(-1) }} />
                    <Button size="sm" onClick={saveEditNote} style={{ fontSize: '10px', padding: '2px 6px' }}>OK</Button>
                  </div>
                ) : (
                  <span onClick={() => !isArchived && !isActivity && startEditNote(realIdx)} style={{ cursor: isArchived || isActivity ? 'default' : 'pointer' }}>
                    <span style={{ color: 'var(--text3)', fontSize: '10px' }}>{fmtTs(note.ts)}</span>
                    {' '}{actIcon}{note.text}
                  </span>
                )}
              </div>
            )
          })}
          {!isArchived && (
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
              <input type="text" value={newNote} placeholder="Add note…"
                style={{ flex: 1, fontSize: '12px', padding: '3px 8px' }}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addNote() }} />
              <Button size="sm" onClick={addNote} disabled={!newNote.trim()} style={{ fontSize: '11px' }}>+</Button>
            </div>
          )}
        </div>
      )}

      {/* History toggle */}
      {history.length > 0 && (
        <div style={{ marginTop: '6px' }}>
          <button onClick={() => setShowHistory(!showHistory)}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>
            {showHistory ? 'Hide' : 'Show'} history ({history.length})
          </button>
          {showHistory && (
            <div style={{ marginTop: '4px', paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>
                  <span>{fmtTs(h.ts)}</span> — {h.status}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isArchived && (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Group:</span>
          <input type="text" value={c.grp || ''} placeholder="none"
            style={{ fontSize: '11px', padding: '2px 6px', width: '100px', height: '24px' }}
            onChange={e => canvassDispatch({ type: 'UPDATE', stop: { ...c, grp: e.target.value } })} />
          {c.grp && <button onClick={() => canvassDispatch({ type: 'UPDATE', stop: { ...c, grp: '' } })}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>✕</button>}
        </div>
      )}

      <div className={styles.actions}>
        {c.phone && !isArchived && <Button size="sm" onClick={() => { canvassDispatch({ type: 'APPEND_NOTE', id: c.id, text: 'Called ' + c.phone, actType: 'call' }); window.location.href = 'tel:' + c.phone }}>Call</Button>}
        {c.phone && !isArchived && <Button size="sm" onClick={() => { canvassDispatch({ type: 'APPEND_NOTE', id: c.id, text: 'Texted ' + c.phone, actType: 'sms' }); window.location.href = 'sms:' + c.phone }}>Text</Button>}
        {c.addr  && <a href={navUrl(c.addr)} target="_blank" rel="noreferrer" className={`${btnStyles.btn} ${btnStyles.sm}`}>Navigate ↗</a>}
        {!isArchived && <Button size="sm" onClick={startEdit}>Edit</Button>}
        {!isArchived && c.status !== 'Dropped folder' && (
          <Button size="sm" onClick={handleDropFolder}>
            Drop Folder{droppedCount > 0 ? ' (' + droppedCount + ')' : ''}
          </Button>
        )}
        {!isArchived && <Button size="sm" variant="success" onClick={() => onConvert(c)}>Convert to Lead</Button>}
        <Button size="sm" variant="danger" onClick={handleDelete}>Remove</Button>
        {showBuildRun && (
          <Button size="sm" className={styles.buildRunBtn} onClick={() => onBuildRun(c)}>Build Run</Button>
        )}
        {demoReady && (
          <Button size="sm" onClick={handleLoadDemo} disabled={loadDemoLoading}
            style={{ background: 'var(--green-bg)', color: 'var(--green-text)', borderColor: 'var(--green-text)' }}>
            {loadDemoLoading ? 'Loading…' : 'Load Demo'}
          </Button>
        )}
      </div>
      {loadDemoMsg && (
        <div style={{
          marginTop: '6px', padding: '6px 8px', fontSize: '12px', fontWeight: 500,
          borderRadius: '4px',
          background: loadDemoMsg.includes('✓') ? 'var(--green-bg)'
                    : loadDemoMsg.includes('fail') || loadDemoMsg.includes('No demo') || loadDemoMsg.includes('Could not') ? 'var(--red-bg)'
                    : 'var(--yellow-bg)',
          color: loadDemoMsg.includes('✓') ? 'var(--green-text)'
                : loadDemoMsg.includes('fail') || loadDemoMsg.includes('No demo') || loadDemoMsg.includes('Could not') ? 'var(--red-text)'
                : 'var(--yellow-text)',
        }}>
          {loadDemoLoading && <span style={{ marginRight: '6px' }}>⏳</span>}
          {loadDemoMsg}
        </div>
      )}
    </div>
  )
}
