import { useState } from 'react'
import { useProspectsDispatch, useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { uid, navUrl } from '../../data/helpers.js'
import { CANVASS_ACTIVE } from '../canvass/constants.js'
import Button from '../../components/Button.jsx'
import PosSelect from '../../components/PosSelect.jsx'
import styles from './LeadCard.module.css'
import btnStyles from '../../components/Button.module.css'

const STATUSES = ['Open', 'Won', 'Lost', 'Abandoned']

export default function LeadCard({ prospect, onDemote }) {
  const dispatch = useProspectsDispatch()
  const canvass = useCanvass()
  const canvassDispatch = useCanvassDispatch()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const p = prospect

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

  const todayISO = new Date().toISOString().slice(0, 10)
  const followUpOverdue = p.followUp && p.followUp < todayISO
  const followUpDays = p.followUp ? Math.floor((new Date(p.followUp) - new Date(todayISO)) / 86400000) : null
  const lastContactDays = p.lastContact ? Math.floor((Date.now() - new Date(p.lastContact)) / 86400000) : null
  const lastContactLabel = lastContactDays === 0 ? 'today' : lastContactDays === 1 ? 'yesterday' : lastContactDays != null ? lastContactDays + 'd ago' : null

  const inQueue = canvass.some(c => c.fromLead === p.id && CANVASS_ACTIVE.includes(c.status))

  function addToQueue() {
    if (inQueue) return
    const now = new Date().toISOString()
    canvassDispatch({ type: 'ADD', stop: {
      id: uid(),
      name: p.name,
      addr: p.addr || '',
      phone: p.phone || '',
      email: p.email || '',
      website: p.website || '',
      menu: p.menu || '',
      notes: '',
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

      <div className={styles.actions}>
        {p.phone && <a href={`tel:${p.phone}`} className={`${btnStyles.btn} ${btnStyles.sm}`}>Call</a>}
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
