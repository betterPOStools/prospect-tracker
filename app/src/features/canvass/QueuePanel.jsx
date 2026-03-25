import { useState } from 'react'
import { useCanvass, useCanvassDispatch, useDatabase, useDatabaseDispatch } from '../../data/store.jsx'
import { CANVASS_ACTIVE } from './constants.js'
import { haversine } from '../../data/clustering.js'
import { parseWorkingHours } from '../../data/helpers.js'
import EmptyState from '../../components/EmptyState.jsx'
import Button from '../../components/Button.jsx'
import CanvassCard from './CanvassCard.jsx'
import EndDayModal from './EndDayModal.jsx'

const FILL_KEY = 'vs_fill_count'

export default function QueuePanel({ onConvert, onBuildRun, msg, flash }) {
  const canvassStops = useCanvass()
  const cDispatch    = useCanvassDispatch()
  const db           = useDatabase()
  const dbDispatch   = useDatabaseDispatch()

  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('all')
  const [showEndDay, setShowEndDay] = useState(false)
  const [locating, setLocating] = useState(false)

  const savedCount = localStorage.getItem(FILL_KEY) || '15'
  const [fillInput, setFillInput] = useState(savedCount)
  const [fillCount, setFillCount] = useState(parseInt(savedCount) || 15)

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

  function handleFillBlur() {
    const n = parseInt(fillInput) || 15
    const clamped = Math.min(50, Math.max(1, n))
    setFillCount(clamped)
    setFillInput(String(clamped))
    localStorage.setItem(FILL_KEY, String(clamped))
  }

  function handleFillNearMe() {
    if (!navigator.geolocation) { flash('Geolocation not supported by this browser.', 'err'); return }
    if (!db.dbClusters.length) { flash('No zones available — import data first.', 'err'); return }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const userLat = pos.coords.latitude
        const userLng = pos.coords.longitude
        const todayISO = new Date().toISOString().slice(0, 10)
        const existingNames = new Set(canvassStops.map(c => c.name.toLowerCase()))
        const recordById = new Map(db.dbRecords.map(r => [r.id, r]))

        // Sort zones by distance from user
        const sorted = db.dbClusters
          .map(c => ({ ...c, dist: haversine(userLat, userLng, c.lt, c.lg) }))
          .sort((a, b) => a.dist - b.dist)

        const newStops = []
        const dbUpdates = []
        let usedZoneName = ''
        let usedDist = 0

        for (const zone of sorted) {
          if (newStops.length >= fillCount) break

          const available = (zone.mb || [])
            .map(id => recordById.get(id))
            .filter(r => r && r.st === 'unworked' && (!r.co || r.co <= todayISO) && !existingNames.has((r.n || '').toLowerCase()))
            .sort((a, b) => b.sc - a.sc)

          if (!available.length) continue
          if (!usedZoneName) { usedZoneName = zone.nm; usedDist = zone.dist }

          const take = available.slice(0, fillCount - newStops.length)
          take.forEach(r => {
            const now = new Date().toISOString()
            const contactNote = r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : ''
            newStops.push({
              id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
              notes: '', website: r.web, menu: r.mn, email: r.em,
              ...parseWorkingHours(r.hr),
              status: 'Not visited yet',
              date: new Date().toLocaleDateString(),
              added: now, fromDb: r.id, score: r.sc, priority: r.pr,
              history: [], notesLog: contactNote ? [{ text: 'Contact: ' + contactNote, ts: now, system: true }] : [],
            })
            dbUpdates.push(r.id)
            existingNames.add((r.n || '').toLowerCase())
          })
        }

        setLocating(false)
        if (!newStops.length) { flash('No unworked stops nearby.', 'err'); return }

        cDispatch({ type: 'ADD_MANY', stops: newStops })
        dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })
        flash(`Loaded ${newStops.length} stops from ${usedZoneName} (${usedDist.toFixed(1)} mi away).`, 'ok')
      },
      () => {
        setLocating(false)
        flash('Location unavailable — enable GPS and try again.', 'err')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
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

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Stops:</span>
        <input type="number" min={1} max={50} value={fillInput}
          onChange={e => setFillInput(e.target.value)}
          onBlur={handleFillBlur}
          style={{ width: '50px', height: '28px', fontSize: '12px', textAlign: 'center' }} />
        <Button size="sm" onClick={handleFillNearMe} disabled={locating}>
          {locating ? 'Locating…' : 'Fill Near Me'}
        </Button>
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
