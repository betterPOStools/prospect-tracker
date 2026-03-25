import { useState } from 'react'
import { useCanvass } from '../../data/store.jsx'
import { FOLLOWUP_STATUSES } from './constants.js'
import EmptyState from '../../components/EmptyState.jsx'
import CanvassCard from './CanvassCard.jsx'

export default function FollowUpPanel({ onConvert, onBuildRun }) {
  const canvassStops = useCanvass()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const todayStr = new Date().toLocaleDateString()
  const todayISO = new Date().toISOString().slice(0, 10)
  const q = search.toLowerCase()

  const all = canvassStops.filter(c =>
    c.date !== todayStr &&
    FOLLOWUP_STATUSES.includes(c.status)
  )

  const list = all
    .filter(c =>
      (filterStatus === 'all' || c.status === filterStatus) &&
      (!q || c.name.toLowerCase().includes(q))
    )
    .sort((a, b) => {
      // Overdue first, then today, then upcoming, then no date
      const aFu = a.followUp || ''
      const bFu = b.followUp || ''
      const aOverdue = aFu && aFu < todayISO
      const bOverdue = bFu && bFu < todayISO
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      if (aFu && bFu) return aFu < bFu ? -1 : aFu > bFu ? 1 : 0
      if (aFu && !bFu) return -1
      if (!aFu && bFu) return 1
      return new Date(a.added) - new Date(b.added)
    })

  const overdueCnt  = all.filter(c => c.followUp && c.followUp < todayISO).length
  const todayCnt    = all.filter(c => c.followUp === todayISO).length
  const upcomingCnt = all.filter(c => c.followUp && c.followUp > todayISO).length
  const noDateCnt   = all.filter(c => !c.followUp).length

  function ageLabel(stop) {
    if (stop.followUp) {
      const days = Math.floor((new Date(stop.followUp) - new Date(todayISO)) / 86400000)
      if (days < 0) return `${Math.abs(days)}d overdue`
      if (days === 0) return 'Due today'
      return `Due in ${days}d`
    }
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

      {all.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', marginBottom: '10px', color: 'var(--text2)' }}>
          {overdueCnt > 0 && <span style={{ color: 'var(--red-text)', fontWeight: 500 }}>{overdueCnt} overdue</span>}
          {todayCnt > 0 && <span style={{ color: 'var(--orange-text)', fontWeight: 500 }}>{todayCnt} due today</span>}
          {upcomingCnt > 0 && <span>{upcomingCnt} upcoming</span>}
          {noDateCnt > 0 && <span>{noDateCnt} no date</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <input type="text" value={search} placeholder="Search follow-up stops…"
          style={{ flex: 1 }} onChange={e => setSearch(e.target.value)} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: '140px' }}>
          <option value="all">All statuses</option>
          {FOLLOWUP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {list.length === 0
        ? <EmptyState>No follow-up stops yet. Stops marked "Come back later" or "Decision maker unavailable" from previous days appear here automatically.</EmptyState>
        : list.map(c => (
            <CanvassCard
              key={c.id} stop={c}
              overdue={c.followUp ? c.followUp < todayISO : c.date !== todayStr}
              ageLabel={ageLabel(c)}
              showBuildRun onConvert={onConvert} onBuildRun={onBuildRun}
            />
          ))
      }
    </div>
  )
}
