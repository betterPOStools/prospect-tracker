import { useState } from 'react'
import { useCanvass } from '../../data/store.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import CanvassCard from './CanvassCard.jsx'

export default function ArchivedPanel({ onConvert, onBuildRun }) {
  const canvassStops = useCanvass()
  const [search, setSearch] = useState('')

  const q = search.toLowerCase()

  const list = canvassStops
    .filter(c =>
      (c.status === 'Converted' || c.status === 'Not interested') &&
      (!q || c.name.toLowerCase().includes(q))
    )
    .sort((a, b) => new Date(b.added) - new Date(a.added))

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <input type="text" value={search} placeholder="Search archived stops…"
          style={{ width: '100%' }} onChange={e => setSearch(e.target.value)} />
      </div>
      {list.length === 0
        ? <EmptyState>No archived stops yet.</EmptyState>
        : list.map(c => (
            <CanvassCard key={c.id} stop={c} onConvert={onConvert} onBuildRun={onBuildRun} />
          ))
      }
    </div>
  )
}
