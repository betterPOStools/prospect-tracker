import { useState } from 'react'
import { useProspectsDispatch, useCanvassDispatch, useDatabaseDispatch } from '../../data/store.jsx'
import { uid } from '../../data/helpers.js'
import Modal from '../../components/Modal.jsx'
import Button from '../../components/Button.jsx'

const STATUSES = [
  'Come back later',
  'Decision maker unavailable',
  'Not visited yet',
  'No answer / closed',
  'Not interested',
]

export default function DemoteModal({ prospect, onClose }) {
  const prospectsDispatch = useProspectsDispatch()
  const canvassDispatch   = useCanvassDispatch()
  const dbDispatch        = useDatabaseDispatch()
  const [status, setStatus] = useState('Come back later')
  const [notes,  setNotes]  = useState('')

  function confirm() {
    const p = prospect
    const reason = notes.trim()
    const now = new Date().toISOString()
    const noteEntries = []
    if (p.owner) noteEntries.push({ text: 'Contact: ' + p.owner, ts: now, system: true })
    const demoteText = (reason ? reason + ' — ' : '') + 'Previously a lead' + (p.notes ? ' — ' + p.notes : '')
    noteEntries.push({ text: demoteText, ts: now, system: true })
    const stop = {
      id:       p.fromDb ? 'canvass_' + p.fromDb : uid(),
      name:     p.name,
      addr:     p.addr    || '',
      phone:    p.phone   || '',
      email:    p.email   || '',
      website:  p.website || '',
      menu:     p.menu    || '',
      notes:    '',
      status,
      date:     new Date().toLocaleDateString(),
      added:    now,
      fromLead: p.id,
      fromDb:   p.fromDb || null,
      history:  [],
      notesLog: noteEntries,
    }
    canvassDispatch({ type: 'ADD', stop })
    prospectsDispatch({ type: 'DELETE', id: p.id })
    if (p.fromDb) dbDispatch({ type: 'UPDATE_RECORD_STATUS', id: p.fromDb, status: 'in_canvass' })
    onClose()
  }

  return (
    <Modal title="Move Back to Canvass" onClose={onClose}>
      <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' }}>
        This lead will be moved back to your canvass list as an active stop. All data is preserved.
      </p>
      <div style={{ marginBottom: '9px' }}>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <input
        type="text" value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Reason / notes (optional)" style={{ marginBottom: '16px' }}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="warning" onClick={confirm}>Move to Canvass</Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  )
}
