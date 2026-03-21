import { useState } from 'react'
import { useCanvass } from '../../data/store.jsx'
import { CANVASS_ACTIVE } from './constants.js'
import EmptyState from '../../components/EmptyState.jsx'
import CanvassCard from './CanvassCard.jsx'

export default function AllActivePanel({ onConvert, onBuildRun }) {
  const canvassStops = useCanvass()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const q = search.toLowerCase()

  const list = canvassStops
    .filter(c =>
      CANVASS_ACTIVE.includes(c.status) &&
      (statusFilter === 'all' || c.status === statusFilter) &&
      (!q || c.name.toLowerCase().includes(q))
    )
    .sort((a, b) => new Date(b.added) - new Date(a.added))

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ minWidth: '160px' }}>
          <option value="all">All active statuses</option>
          {CANVASS_ACTIVE.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="text" value={search} placeholder="Search…"
          style={{ flex: 1, minWidth: '120px' }} onChange={e => setSearch(e.target.value)} />
      </div>
      {list.length === 0
        ? <EmptyState>No active canvass stops.</EmptyState>
        : list.map(c => (
            <CanvassCard key={c.id} stop={c} onConvert={onConvert} onBuildRun={onBuildRun} />
          ))
      }
    </div>
  )
}
