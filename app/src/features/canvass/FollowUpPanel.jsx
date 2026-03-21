import { useState } from 'react'
import { useCanvass } from '../../data/store.jsx'
import { FOLLOWUP_STATUSES } from './constants.js'
import EmptyState from '../../components/EmptyState.jsx'
import CanvassCard from './CanvassCard.jsx'

export default function FollowUpPanel({ onConvert, onBuildRun }) {
  const canvassStops = useCanvass()
  const [search, setSearch] = useState('')

  const todayStr = new Date().toLocaleDateString()
  const q = search.toLowerCase()

  const list = canvassStops
    .filter(c =>
      c.date !== todayStr &&
      FOLLOWUP_STATUSES.includes(c.status) &&
      (!q || c.name.toLowerCase().includes(q))
    )
    .sort((a, b) => new Date(a.added) - new Date(b.added))

  function ageLabel(stop) {
    const daysAgo = Math.floor((new Date() - new Date(stop.added)) / (1000 * 60 * 60 * 24))
    if (daysAgo === 0) return 'Today'
    if (daysAgo === 1) return 'Yesterday'
    return daysAgo + ' days ago'
  }

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' }}>
        Stops from previous visits that need a return trip — Come back later and Decision maker unavailable.
      </p>
      <div style={{ marginBottom: '10px' }}>
        <input type="text" value={search} placeholder="Search follow-up stops…"
          style={{ width: '100%' }} onChange={e => setSearch(e.target.value)} />
      </div>
      {list.length === 0
        ? <EmptyState>No follow-up stops yet. Stops marked "Come back later" or "Decision maker unavailable" from previous days appear here automatically.</EmptyState>
        : list.map(c => (
            <CanvassCard key={c.id} stop={c} ageLabel={ageLabel(c)} showBuildRun onConvert={onConvert} onBuildRun={onBuildRun} />
          ))
      }
    </div>
  )
}
