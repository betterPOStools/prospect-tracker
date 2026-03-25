import { useState } from 'react'
import { useCanvass } from '../../data/store.jsx'
import { CANVASS_ACTIVE } from './constants.js'
import EmptyState from '../../components/EmptyState.jsx'
import Button from '../../components/Button.jsx'
import CanvassCard from './CanvassCard.jsx'
import EndDayModal from './EndDayModal.jsx'

export default function QueuePanel({ onConvert, onBuildRun, msg, flash }) {
  const canvassStops = useCanvass()
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('all')
  const [showEndDay, setShowEndDay] = useState(false)

  const todayStr = new Date().toLocaleDateString()
  const q = search.toLowerCase()
  const groups = [...new Set(canvassStops.map(c => c.grp).filter(Boolean))].sort()

  const matchesFilter = c =>
    CANVASS_ACTIVE.includes(c.status) &&
    (!q || c.name.toLowerCase().includes(q)) &&
    (filterGroup === 'all' || (c.grp || '') === filterGroup)

  const todayStops = canvassStops
    .filter(c => c.date === todayStr && matchesFilter(c))
    .sort((a, b) => new Date(a.added) - new Date(b.added))

  const overdueStops = canvassStops
    .filter(c => c.date !== todayStr && matchesFilter(c))
    .sort((a, b) => new Date(a.added) - new Date(b.added))

  const list = [...overdueStops, ...todayStops]

  function handleEndDay() {
    const active = canvassStops.filter(c => c.date === todayStr && CANVASS_ACTIVE.includes(c.status))
    if (!active.length) { flash("No active stops in today's queue.", 'err'); return }
    setShowEndDay(true)
  }

  function ageLabel(stop) {
    const daysAgo = Math.floor((new Date() - new Date(stop.added)) / (1000 * 60 * 60 * 24))
    if (daysAgo === 0) return null
    if (daysAgo === 1) return 'Yesterday'
    return daysAgo + ' days ago'
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" value={search} placeholder="Search queue…"
          style={{ flex: 1, minWidth: '140px' }}
          onChange={e => setSearch(e.target.value)}
        />
        {groups.length > 0 && (
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={{ minWidth: '100px' }}>
            <option value="all">All groups</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <Button size="sm" variant="primary" onClick={handleEndDay}>End Day ✓</Button>
      </div>

      {overdueStops.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--red-text)', fontWeight: 500, marginBottom: '8px', padding: '6px 10px', borderRadius: 'var(--radius)', background: 'var(--red-bg)' }}>
          {overdueStops.length} overdue stop{overdueStops.length !== 1 ? 's' : ''} from previous days
        </div>
      )}

      {list.length === 0
        ? <EmptyState>No stops in queue — go to the <strong>Database</strong> tab to load your canvass list, or use <strong>+ Add Stop</strong> to add manually.</EmptyState>
        : list.map(c => (
            <CanvassCard
              key={c.id}
              stop={c}
              overdue={c.date !== todayStr}
              ageLabel={c.date !== todayStr ? ageLabel(c) : null}
              onConvert={onConvert}
              onBuildRun={onBuildRun}
            />
          ))
      }

      {msg && (
        <div style={{ fontSize: '12px', marginTop: '6px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>
          {msg.text}
        </div>
      )}

      {showEndDay && <EndDayModal onClose={() => { setShowEndDay(false); flash('Day ended — Follow-up stops will appear tomorrow.', 'ok') }} />}
    </div>
  )
}
