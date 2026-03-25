import { useState } from 'react'
import { useCanvass } from '../../data/store.jsx'
import { COMPLETED_STATUSES, REMOVAL_STATUSES } from './constants.js'
import EmptyState from '../../components/EmptyState.jsx'
import CanvassCard from './CanvassCard.jsx'

export default function CompletedPanel({ onConvert, onBuildRun }) {
  const canvassStops = useCanvass()
  const [search, setSearch] = useState('')

  const q = search.toLowerCase()

  const list = canvassStops
    .filter(c =>
      (COMPLETED_STATUSES.includes(c.status) || REMOVAL_STATUSES.includes(c.status)) &&
      (!q || c.name.toLowerCase().includes(q))
    )
    .sort((a, b) => new Date(b.added) - new Date(a.added))

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <input type="text" value={search} placeholder="Search completed stops…"
          style={{ width: '100%' }} onChange={e => setSearch(e.target.value)} />
      </div>
      {list.length === 0
        ? <EmptyState>No completed stops yet. Converted, not interested, and removed stops appear here.</EmptyState>
        : list.map(c => (
            <CanvassCard key={c.id} stop={c} onConvert={onConvert} onBuildRun={onBuildRun} />
          ))
      }
    </div>
  )
}
