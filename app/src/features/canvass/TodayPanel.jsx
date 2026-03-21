import { useState } from 'react'
import { useCanvass } from '../../data/store.jsx'
import { CANVASS_ACTIVE } from './constants.js'
import EmptyState from '../../components/EmptyState.jsx'
import Button from '../../components/Button.jsx'
import CanvassCard from './CanvassCard.jsx'
import EndDayModal from './EndDayModal.jsx'

export default function TodayPanel({ onConvert, onBuildRun, msg, flash }) {
  const canvassStops = useCanvass()
  const [search,      setSearch]      = useState('')
  const [showEndDay,  setShowEndDay]  = useState(false)

  const todayStr = new Date().toLocaleDateString()
  const q = search.toLowerCase()

  const list = canvassStops
    .filter(c =>
      c.date === todayStr &&
      CANVASS_ACTIVE.includes(c.status) &&
      (!q || c.name.toLowerCase().includes(q))
    )
    .sort((a, b) => new Date(a.added) - new Date(b.added))

  function handleEndDay() {
    const todayStops = canvassStops.filter(c => c.date === todayStr && CANVASS_ACTIVE.includes(c.status))
    if (!todayStops.length) { flash("No active stops in today's queue.", 'err'); return }
    setShowEndDay(true)
  }

  function handleClearQueue() {
    // Implemented in CanvassTab level — bubble up via prop or handle here
    flash('Use the End Day button to process today\'s stops.', 'err')
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" value={search} placeholder="Search today's stops…"
          style={{ flex: 1, minWidth: '140px' }}
          onChange={e => setSearch(e.target.value)}
        />
        <Button size="sm" variant="primary" onClick={handleEndDay}>End Day ✓</Button>
      </div>

      {list.length === 0
        ? <EmptyState>No stops loaded for today yet — go to the <strong>Database</strong> tab to load your canvass list, or use <strong>+ Add Stop</strong> to add manually.</EmptyState>
        : list.map(c => (
            <CanvassCard key={c.id} stop={c} onConvert={onConvert} onBuildRun={onBuildRun} />
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
