import { useState } from 'react'
import { useProspectsDispatch, useCanvassDispatch } from '../../data/store.jsx'
import { uid } from '../../data/helpers.js'
import Modal from '../../components/Modal.jsx'
import Button from '../../components/Button.jsx'
import PosSelect from '../../components/PosSelect.jsx'

export default function ConvertModal({ stop, onClose }) {
  const prospectsDispatch = useProspectsDispatch()
  const canvassDispatch   = useCanvassDispatch()
  const [email,   setEmail]   = useState('')
  const [owner,   setOwner]   = useState('')
  const [current, setCurrent] = useState('')
  const c = stop

  function confirm() {
    const lead = {
      id:          c.fromDb ? 'lead_' + c.fromDb : uid(),
      name:        c.name,
      addr:        c.addr    || '',
      phone:       c.phone   || '',
      email,
      current,
      owner,
      website:     c.website || '',
      menu:        c.menu    || '',
      notes:       c.notes   || '',
      status:      'Open',
      added:       new Date().toLocaleDateString(),
      fromCanvass: c.id,
      fromDb:      c.fromDb  || null,
    }
    prospectsDispatch({ type: 'ADD', prospect: lead })
    canvassDispatch({
      type: 'UPDATE',
      stop: { ...c, status: 'Converted', convertedDate: new Date().toLocaleDateString() },
    })
    onClose(c.name)
  }

  return (
    <Modal title="Convert to Lead" onClose={() => onClose(null)}>
      <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' }}>
        Fill in any additional details — everything from the canvass stop is pre-loaded.
      </p>
      <div className="row">
        <input type="text" value={email} placeholder="Email (if found)"    onChange={e => setEmail(e.target.value)} />
        <input type="text" value={owner} placeholder="Main contact name"   onChange={e => setOwner(e.target.value)} />
      </div>
      <div style={{ marginBottom: '9px' }}>
        <PosSelect value={current} onChange={setCurrent} />
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <Button variant="success" onClick={confirm}>Convert to Lead</Button>
        <Button onClick={() => onClose(null)}>Cancel</Button>
      </div>
    </Modal>
  )
}
