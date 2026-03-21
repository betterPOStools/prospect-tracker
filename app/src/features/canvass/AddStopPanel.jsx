import { useState } from 'react'
import { useCanvassDispatch } from '../../data/store.jsx'
import { uid } from '../../data/helpers.js'
import { CANVASS_ACTIVE } from './constants.js'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import Button from '../../components/Button.jsx'

const EMPTY = {
  name: '', status: 'Not visited yet', addr: '', phone: '', notes: '',
  openTime: '', closeTime: '', website: '', menu: '',
}

export default function AddStopPanel({ onAdded }) {
  const dispatch = useCanvassDispatch()
  const [form, setForm] = useState(EMPTY)
  const { msg, flash } = useFlashMessage()

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  function addStop() {
    if (!form.name.trim()) { flash('Business name is required.', 'err'); return }
    const stop = {
      id:        uid(),
      name:      form.name.trim(),
      status:    form.status,
      addr:      form.addr.trim(),
      phone:     form.phone.trim(),
      notes:     form.notes.trim(),
      openTime:  form.openTime,
      closeTime: form.closeTime,
      website:   form.website.trim(),
      menu:      form.menu.trim(),
      date:      new Date().toLocaleDateString(),
      added:     new Date().toISOString(),
    }
    dispatch({ type: 'ADD', stop })
    setForm(EMPTY)
    flash(`Stop added.`, 'ok')
    onAdded?.()
  }

  return (
    <div>
      <div className="row">
        <input type="text" value={form.name} placeholder="Business name *"
          style={{ flex: 2, minWidth: '180px' }} onChange={e => set('name', e.target.value)} />
        <select value={form.status} onChange={e => set('status', e.target.value)} style={{ maxWidth: '190px' }}>
          {CANVASS_ACTIVE.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="row">
        <input type="text" value={form.addr} placeholder="Full address (paste from Google Maps)"
          onChange={e => set('addr', e.target.value)} />
      </div>
      <div className="row">
        <input type="tel"  value={form.phone} placeholder="Phone number" onChange={e => set('phone', e.target.value)} />
        <input type="text" value={form.notes} placeholder="Notes / first impression" onChange={e => set('notes', e.target.value)} />
      </div>
      <div className="row">
        <div style={{ flex: 1, minWidth: '140px' }}>
          <div className="field-label">Opens</div>
          <input type="time" value={form.openTime}  onChange={e => set('openTime',  e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: '140px' }}>
          <div className="field-label">Closes</div>
          <input type="time" value={form.closeTime} onChange={e => set('closeTime', e.target.value)} />
        </div>
        <div style={{ flex: 2, minWidth: '180px' }}>
          <div className="field-label">Website</div>
          <input type="url" value={form.website} placeholder="https://…" onChange={e => set('website', e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div style={{ flex: 1, minWidth: '180px' }}>
          <div className="field-label">Menu link</div>
          <input type="url" value={form.menu} placeholder="https://…" onChange={e => set('menu', e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: '4px' }}>
        <Button variant="primary" onClick={addStop}>+ Add Stop</Button>
        <Button onClick={() => setForm(EMPTY)}>Clear</Button>
      </div>
      {msg && (
        <div style={{ fontSize: '12px', marginTop: '7px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
