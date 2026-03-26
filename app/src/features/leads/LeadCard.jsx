import { useState } from 'react'
import { useProspectsDispatch, useCanvass, useCanvassDispatch, useDatabase } from '../../data/store.jsx'
import { uid, navUrl } from '../../data/helpers.js'
import { CANVASS_ACTIVE } from '../canvass/constants.js'
import Button from '../../components/Button.jsx'
import PosSelect from '../../components/PosSelect.jsx'
import styles from './LeadCard.module.css'
import btnStyles from '../../components/Button.module.css'

const STATUSES = ['Open', 'Won', 'Lost', 'Abandoned']

function fmtTs(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function LeadCard({ prospect, onDemote }) {
  const dispatch = useProspectsDispatch()
  const canvass = useCanvass()
  const db = useDatabase()
  const canvassDispatch = useCanvassDispatch()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [showAllActivity, setShowAllActivity] = useState(false)
  const p = prospect
  const activityLog = p.activityLog || []

  function startEdit() {
    setForm({ ...p })
    setEditing(true)
  }

  function cancelEdit() { setEditing(false) }

  function saveEdit() {
    const updated = { ...p, ...form, name: form.name?.trim() || p.name }
    dispatch({ type: 'UPDATE', prospect: updated })
    setEditing(false)
  }

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  function handleStatusChange(e) {
    dispatch({ type: 'UPDATE', prospect: { ...p, status: e.target.value, lastContact: new Date().toISOString() } })
  }

  function handleDelete() {
    if (confirm(`Remove ${p.name}?`)) dispatch({ type: 'DELETE', id: p.id })
  }

  function logActivity(type, text) {
    const now = new Date().toISOString()
    dispatch({ type: 'UPDATE', prospect: { ...p, activityLog: [...activityLog, { text, ts: now, type }], lastContact: now } })
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const followUpOverdue = p.followUp && p.followUp < todayISO
  const followUpDays = p.followUp ? Math.floor((new Date(p.followUp) - new Date(todayISO)) / 86400000) : null
  const lastContactDays = p.lastContact ? Math.floor((Date.now() - new Date(p.lastContact)) / 86400000) : null
  const lastContactLabel = lastContactDays === 0 ? 'today' : lastContactDays === 1 ? 'yesterday' : lastContactDays != null ? lastContactDays + 'd ago' : null

  const inQueue = canvass.some(c => c.fromLead === p.id && CANVASS_ACTIVE.includes(c.status))

  function addToQueue() {
    if (inQueue) return
    const now = new Date().toISOString()
    const dbRec = p.fromDb ? db.dbRecords.find(r => r.id === p.fromDb) : null
    canvassDispatch({ type: 'ADD', stop: {
      id: uid(),
      name: p.name,
      addr: p.addr || '',
      phone: p.phone || '',
      email: p.email || '',
      website: p.website || '',
      menu: p.menu || '',
      notes: '',
      lat: dbRec?.lt, lng: dbRec?.lg,
      status: 'Not visited yet',
      date: new Date().toLocaleDateString(),
      added: now,
      fromLead: p.id,
      history: [],
      notesLog: p.owner ? [{ text: 'Contact: ' + p.owner, ts: now, system: true }] : [],
    }})
  }

  if (editing) {
    return (
      <div className={styles.card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="row">
            <input
              type="text" value={form.name || ''} placeholder="Restaurant name *"
              onChange={e => set('name', e.target.value)} style={{ flex: 2 }}
            />
            <select
              value={form.status || 'Open'} onChange={e => set('status', e.target.value)}
              style={{ minWidth: '118px' }}
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <input type="text" value={form.addr || ''} placeholder="Full address" onChange={e => set('addr', e.target.value)} />
          <div className="row">
            <input type="tel"  value={form.phone || ''} placeholder="Phone"  onChange={e => set('phone', e.target.value)} />
            <input type="text" value={form.email || ''} placeholder="Email"  onChange={e => set('email', e.target.value)} />
          </div>
          <PosSelect value={form.current || ''} onChange={v => set('current', v)} />
          <input type="text" value={form.owner   || ''} placeholder="Main contact name"    onChange={e => set('owner',   e.target.value)} />
          <input type="url"  value={form.website || ''} placeholder="Website (https://…)"  onChange={e => set('website', e.target.value)} />
          <input type="url"  value={form.menu    || ''} placeholder="Menu link (https://…)" onChange={e => set('menu',    e.target.value)} />
          <input type="text" value={form.notes   || ''} placeholder="Notes"                onChange={e => set('notes',   e.target.value)} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <div style={{ flex: 1 }}>
              <div className="field-label">Follow up</div>
              <input type="date" value={form.followUp || ''} onChange={e => set('followUp', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <Button variant="primary" size="sm" onClick={saveEdit}>Save</Button>
            <Button size="sm" onClick={cancelEdit}>Cancel</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <div className={styles.name}>{p.name}</div>
          {p.owner && <div className={styles.detail}>👤 {p.owner} (main contact)</div>}
        </div>
        <select className={styles.statusSelect} value={p.status} onChange={handleStatusChange}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {p.addr    && <div className={styles.detail} style={{ marginTop: '6px' }}>📍 {p.addr}</div>}
      {p.phone   && <div className={styles.detail}>📞 {p.phone}</div>}
      {p.email   && <div className={styles.detail}>✉ {p.email}</div>}
      {p.current && <div className={styles.detail}>POS: {p.current}</div>}
      {p.website && <div className={styles.detail}>🌐 <a href={p.website} target="_blank" rel="noreferrer">{p.website}</a></div>}
      {p.menu    && <div className={styles.detail}>🍽 <a href={p.menu} target="_blank" rel="noreferrer">View menu</a></div>}
      {p.notes   && <div className={`${styles.detail} ${styles.italics}`}>{p.notes}</div>}
      {(p.followUp || lastContactLabel) && (
        <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', gap: '8px', marginTop: '4px' }}>
          {p.followUp && (
            <span style={{ color: followUpOverdue ? 'var(--red-text)' : 'var(--text3)' }}>
              Follow up: {p.followUp}{followUpOverdue && ` (${Math.abs(followUpDays)}d overdue)`}{followUpDays === 0 && ' (today)'}{followUpDays > 0 && ` (in ${followUpDays}d)`}
            </span>
          )}
          {lastContactLabel && <span>Last contact: {lastContactLabel}</span>}
        </div>
      )}

      {activityLog.length > 0 && (
        <div style={{ marginTop: '8px', borderTop: '0.5px solid var(--border)', paddingTop: '6px' }}>
          {activityLog.length > 3 && !showAllActivity && (
            <button onClick={() => setShowAllActivity(true)}
              style={{ background: 'none', border: 'none', color: 'var(--blue-text)', fontSize: '11px', cursor: 'pointer', padding: 0, marginBottom: '4px' }}>
              View all ({activityLog.length}) activities
            </button>
          )}
          {showAllActivity && activityLog.length > 3 && (
            <button onClick={() => setShowAllActivity(false)}
              style={{ background: 'none', border: 'none', color: 'var(--blue-text)', fontSize: '11px', cursor: 'pointer', padding: 0, marginBottom: '4px' }}>
              Show recent
            </button>
          )}
          {(showAllActivity ? activityLog : activityLog.slice(-3)).map((a, i) => {
            const icon = a.type === 'call' ? '📞 ' : a.type === 'sms' ? '💬 ' : ''
            const color = a.type === 'call' ? 'var(--blue-text)' : a.type === 'sms' ? 'var(--purple-text)' : 'var(--text2)'
            return (
              <div key={i} style={{ fontSize: '12px', color, marginBottom: '3px' }}>
                <span style={{ color: 'var(--text3)', fontSize: '10px' }}>{fmtTs(a.ts)}</span>
                {' '}{icon}{a.text}
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.actions}>
        {p.phone && <Button size="sm" onClick={() => { logActivity('call', 'Called ' + p.phone); window.location.href = 'tel:' + p.phone }}>Call</Button>}
        {p.phone && <Button size="sm" onClick={() => { logActivity('sms', 'Texted ' + p.phone); window.location.href = 'sms:' + p.phone }}>Text</Button>}
        {p.addr  && (
          <a href={navUrl(p.addr)} target="_blank" rel="noreferrer" className={`${btnStyles.btn} ${btnStyles.sm}`}>
            Navigate ↗
          </a>
        )}
        {inQueue
          ? <span style={{ fontSize: '11px', color: 'var(--purple-text)', background: 'var(--purple-bg)', padding: '3px 8px', borderRadius: '12px', fontWeight: 500 }}>In queue</span>
          : <Button size="sm" variant="primary" onClick={addToQueue}>→ Queue</Button>
        }
        <Button size="sm" onClick={startEdit}>Edit</Button>
        <Button size="sm" variant="warning" onClick={() => onDemote(p)}>↩ Canvass</Button>
        <Button size="sm" variant="danger" onClick={handleDelete}>Remove</Button>
      </div>
    </div>
  )
}
