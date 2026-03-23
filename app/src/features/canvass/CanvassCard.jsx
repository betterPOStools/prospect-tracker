import { useState, useRef, useCallback } from 'react'
import { useCanvassDispatch, useDatabaseDispatch } from '../../data/store.jsx'
import { hoursChip } from '../../data/helpers.js'
import { CANVASS_ACTIVE, CANVASS_TO_DB_STATUS } from './constants.js'
import { HoursChip } from '../../components/Badge.jsx'
import Button from '../../components/Button.jsx'
import styles from './CanvassCard.module.css'
import btnStyles from '../../components/Button.module.css'

// Module-level geocode cache — survives re-renders, cleared on page reload
const _geocodeCache = new Map()

export default function CanvassCard({ stop, ageLabel, showBuildRun, onConvert, onBuildRun }) {
  const canvassDispatch = useCanvassDispatch()
  const dbDispatch      = useDatabaseDispatch()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const c = stop
  const isConverted = c.status === 'Converted'

  function handleStatusChange(e) {
    const val = e.target.value
    canvassDispatch({ type: 'UPDATE_STATUS', id: c.id, status: val })
    // Sync back to DB record
    if (c.fromDb) {
      const dbSt = CANVASS_TO_DB_STATUS[val]
      dbDispatch({
        type: 'UPDATE_RECORD_STATUS',
        id: c.fromDb,
        status: dbSt || (CANVASS_ACTIVE.includes(val) ? 'in_canvass' : undefined),
      })
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
    // Debounce rapid clicks (300ms)
    clearTimeout(geocodeTimer.current)
    geocodeTimer.current = setTimeout(async () => {
      // Check cache first
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
    const updated = {
      ...c,
      name:      form.name?.trim()    || c.name,
      status:    form.status,
      addr:      form.addr?.trim()    || '',
      phone:     form.phone?.trim()   || '',
      notes:     form.notes?.trim()   || '',
      openTime:  form.openTime        || '',
      closeTime: form.closeTime       || '',
      website:   form.website?.trim() || '',
      menu:      form.menu?.trim()    || '',
    }
    // Persist geocoded coords if set
    if (form._lat) { updated.lat = form._lat; updated.lng = form._lng; delete updated._lat; delete updated._lng }
    canvassDispatch({ type: 'UPDATE', stop: updated })
    setEditing(false)
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

  return (
    <div className={`${styles.card} ${isConverted ? styles.archived : ''}`}>
      <div className={styles.top}>
        <div>
          <div className={styles.name}>{c.name}</div>
          {c.date && (
            <div className={styles.dateLine}>
              {c.date}{ageLabel && <> · <span className={styles.age}>{ageLabel}</span></>}
            </div>
          )}
        </div>
        <div className={styles.topRight}>
          {hours && <HoursChip label={hours.label} isOpen={hours.isOpen} />}
          {isConverted
            ? <span style={{ background: 'var(--green-bg)', color: 'var(--green-text)', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>Converted</span>
            : (
              <select className={styles.statusSelect} value={c.status} onChange={handleStatusChange}>
                {CANVASS_ACTIVE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )
          }
        </div>
      </div>

      {c.addr    && <div className={styles.detail} style={{ marginTop: '6px' }}>📍 {c.addr}</div>}
      {c.phone   && <div className={styles.detail}>📞 {c.phone}</div>}
      {c.website && <div className={styles.detail}>🌐 <a href={c.website} target="_blank" rel="noreferrer">{c.website}</a></div>}
      {c.menu    && <div className={styles.detail}>🍽 <a href={c.menu} target="_blank" rel="noreferrer">View menu</a></div>}
      {c.notes   && <div className={`${styles.detail} ${styles.italics}`}>{c.notes}</div>}

      <div className={styles.actions}>
        {c.phone && !isConverted && <a href={`tel:${c.phone}`} className={`${btnStyles.btn} ${btnStyles.sm}`}>Call</a>}
        {c.addr  && <a href={`https://maps.google.com?q=${encodeURIComponent(c.addr)}`} target="_blank" rel="noreferrer" className={`${btnStyles.btn} ${btnStyles.sm}`}>Map ↗</a>}
        {!isConverted && <Button size="sm" onClick={startEdit}>Edit</Button>}
        {!isConverted && <Button size="sm" variant="success" onClick={() => onConvert(c)}>Convert to Lead</Button>}
        <Button size="sm" variant="danger" onClick={handleDelete}>Remove</Button>
        {showBuildRun && (
          <Button size="sm" className={styles.buildRunBtn} onClick={() => onBuildRun(c)}>Build Run</Button>
        )}
      </div>
    </div>
  )
}
