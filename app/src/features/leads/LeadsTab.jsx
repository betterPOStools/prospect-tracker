import { useState } from 'react'
import { useProspects, useProspectsDispatch } from '../../data/store.jsx'
import { uid } from '../../data/helpers.js'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import StatBar from '../../components/StatBar.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import PosSelect from '../../components/PosSelect.jsx'
import Button from '../../components/Button.jsx'
import LeadCard from './LeadCard.jsx'
import DemoteModal from './DemoteModal.jsx'

const EMPTY_FORM = {
  name: '', status: 'Open', addr: '', phone: '', email: '',
  current: '', owner: '', website: '', menu: '', notes: '', followUp: '',
  activityLog: [],
}

export default function LeadsTab() {
  const prospects = useProspects()
  const dispatch  = useProspectsDispatch()
  const { msg, flash } = useFlashMessage()

  const [form,         setForm]         = useState(EMPTY_FORM)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSearch, setFilterSearch] = useState('')
  const [demoting,     setDemoting]     = useState(null) // prospect to demote

  function setF(field, val) { setForm(f => ({ ...f, [field]: val })) }

  function addLead() {
    if (!form.name.trim()) { flash('Name is required.', 'err'); return }
    const lead = {
      id:      uid(),
      name:    form.name.trim(),
      addr:    form.addr.trim(),
      phone:   form.phone.trim(),
      email:   form.email.trim(),
      current: form.current,
      owner:   form.owner.trim(),
      website: form.website.trim(),
      menu:    form.menu.trim(),
      notes:   form.notes.trim(),
      followUp: form.followUp || '',
      status:  form.status || 'Open',
      added:   new Date().toLocaleDateString(),
    }
    dispatch({ type: 'ADD', prospect: lead })
    setForm(EMPTY_FORM)
    flash(`Added — ${prospects.length + 1} leads total.`, 'ok')
  }

  const filtered = prospects.filter(p =>
    (filterStatus === 'all' || p.status === filterStatus) &&
    p.name.toLowerCase().includes(filterSearch.toLowerCase())
  )

  const stats = [
    { n: prospects.length,                                    label: 'Total' },
    { n: prospects.filter(p => p.status === 'Open').length,   label: 'Open' },
    { n: prospects.filter(p => p.status === 'Won').length,    label: 'Won' },
    { n: prospects.filter(p => p.status === 'Lost').length,   label: 'Lost' },
  ]

  return (
    <div>
      {/* Add form */}
      <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '0.5px solid var(--border)' }}>
        <div className="section-divider">Add a lead manually</div>
        <div className="row">
          <input type="text" value={form.name} placeholder="Restaurant name *"
            style={{ flex: 2, minWidth: '180px' }}
            onChange={e => setF('name', e.target.value)} />
          <select value={form.status} onChange={e => setF('status', e.target.value)} style={{ maxWidth: '160px' }}>
            <option value="Open">Open</option>
            <option value="Won">Won</option>
            <option value="Lost">Lost</option>
            <option value="Abandoned">Abandoned</option>
          </select>
        </div>
        <div className="row">
          <input type="text" value={form.addr} placeholder="Full address (paste from Google Maps)"
            onChange={e => setF('addr', e.target.value)} />
        </div>
        <div className="row">
          <input type="tel"  value={form.phone} placeholder="Phone number" onChange={e => setF('phone', e.target.value)} />
          <input type="text" value={form.email} placeholder="Email (if found)" onChange={e => setF('email', e.target.value)} />
        </div>
        <div className="row">
          <div style={{ flex: 1, minWidth: '160px' }}>
            <PosSelect value={form.current} onChange={v => setF('current', v)} />
          </div>
          <input type="text" value={form.owner} placeholder="Main contact name" onChange={e => setF('owner', e.target.value)} />
        </div>
        <div className="row">
          <input type="url"  value={form.website} placeholder="Website (https://…)" onChange={e => setF('website', e.target.value)} />
          <input type="url"  value={form.menu}    placeholder="Menu link (https://…)" onChange={e => setF('menu', e.target.value)} />
        </div>
        <div className="row">
          <input type="text" value={form.notes} placeholder="Notes" onChange={e => setF('notes', e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: '4px' }}>
          <Button variant="primary" onClick={addLead}>+ Add Lead</Button>
          <Button onClick={() => setForm(EMPTY_FORM)}>Clear</Button>
        </div>
        {msg && (
          <div style={{ fontSize: '12px', marginTop: '7px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>
            {msg.text}
          </div>
        )}
      </div>

      <StatBar stats={stats} />

      <div className="filter-row">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="Open">Open</option>
          <option value="Won">Won</option>
          <option value="Lost">Lost</option>
          <option value="Abandoned">Abandoned</option>
        </select>
        <input type="text" value={filterSearch} placeholder="Search name…"
          onChange={e => setFilterSearch(e.target.value)} />
      </div>

      {filtered.length === 0
        ? <EmptyState>No leads yet.</EmptyState>
        : filtered.map(p => (
            <LeadCard key={p.id} prospect={p} onDemote={setDemoting} />
          ))
      }

      {demoting && (
        <DemoteModal prospect={demoting} onClose={() => setDemoting(null)} />
      )}
    </div>
  )
}
