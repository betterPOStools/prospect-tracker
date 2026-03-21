import { useState } from 'react'
import { useProspectsDispatch } from '../../data/store.jsx'
import Button from '../../components/Button.jsx'
import PosSelect from '../../components/PosSelect.jsx'
import styles from './LeadCard.module.css'
import btnStyles from '../../components/Button.module.css'

const STATUSES = ['Open', 'Won', 'Lost', 'Abandoned']

export default function LeadCard({ prospect, onDemote }) {
  const dispatch = useProspectsDispatch()
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
    dispatch({ type: 'UPDATE', prospect: { ...p, status: e.target.value } })
  }

  function handleDelete() {
    if (confirm(`Remove ${p.name}?`)) dispatch({ type: 'DELETE', id: p.id })
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

      <div className={styles.actions}>
        {p.phone && <a href={`tel:${p.phone}`} className={`${btnStyles.btn} ${btnStyles.sm}`}>Call</a>}
        {p.addr  && (
          <a href={`https://maps.google.com?q=${encodeURIComponent(p.addr)}`} target="_blank" rel="noreferrer" className={`${btnStyles.btn} ${btnStyles.sm}`}>
            Map ↗
          </a>
        )}
        <Button size="sm" onClick={startEdit}>Edit</Button>
        <Button size="sm" variant="warning" onClick={() => onDemote(p)}>↩ Canvass</Button>
        <Button size="sm" variant="danger" onClick={handleDelete}>Remove</Button>
      </div>
    </div>
  )
}
