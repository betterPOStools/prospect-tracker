import { useState, useMemo } from 'react'
import { useCanvass, useCanvassDispatch, useDatabase, useDatabaseDispatch } from '../../data/store.jsx'
import { CANVASS_ACTIVE } from './constants.js'
import { DAYS } from '../../data/weekPlanner.js'
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
  const [fillArea, setFillArea] = useState('all')
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

  // Build a map from record id → day assignment
  const recordDayMap = useMemo(() => {
    const m = {}
    db.dbRecords.forEach(r => { if (r.da) m[r.id] = r.da })
    return m
  }, [db.dbRecords])

  // Group stops by day (via their linked DB record's `da` field)
  const dayGroups = useMemo(() => {
    const groups = []
    for (const day of DAYS) {
      const dayStops = list.filter(c => c.fromDb && recordDayMap[c.fromDb] === day)
      if (dayStops.length) groups.push({ day, stops: dayStops })
    }
    const unassigned = list.filter(c => !c.fromDb || !recordDayMap[c.fromDb])
    if (unassigned.length) groups.push({ day: '_unassigned', label: 'Unassigned', stops: unassigned })
    return groups
  }, [list, recordDayMap])

  const hasDayGroups = dayGroups.length > 0 && !(dayGroups.length === 1 && dayGroups[0].day === '_unassigned')

  const todayDayName = DAYS[new Date().getDay() - 1] || null
  const [collapsedDays, setCollapsedDays] = useState(() => {
    const c = new Set(DAYS.filter(d => d !== todayDayName))
    c.add('_unassigned')
    return c
  })
  const toggleDay = day => setCollapsedDays(prev => {
    const next = new Set(prev)
    if (next.has(day)) next.delete(day); else next.add(day)
    return next
  })

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
    if (!db.dbRecords.length) { flash('No records — import data first.', 'err'); return }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const userLat = pos.coords.latitude
        const userLng = pos.coords.longitude
        const todayISO = new Date().toISOString().slice(0, 10)
        const existingNames = new Set(canvassStops.map(c => c.name.toLowerCase()))

        // Pure geo — filter all records, sort by distance from GPS
        let noCoords = 0
        const available = db.dbRecords.filter(r => {
          if (r.st !== 'unworked') return false
          if (r.da) return false                                    // don't grab day-assigned records
          if (r.co && r.co > todayISO) return false                 // cooldown
          if (existingNames.has((r.n || '').toLowerCase())) return false
          if (fillArea !== 'all' && r.ar !== fillArea) return false  // area filter
          if (!r.lt || !r.lg) { noCoords++; return false }
          return true
        })

        const sorted = available
          .map(r => ({ r, dist: haversine(userLat, userLng, r.lt, r.lg) }))
          .sort((a, b) => a.dist - b.dist)

        const take = sorted.slice(0, fillCount)
        const newStops = []
        const dbUpdates = []

        take.forEach(({ r, dist }) => {
          const now = new Date().toISOString()
          const contactNote = r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : ''
          newStops.push({
            id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
            notes: '', website: r.web, menu: r.mn, email: r.em,
            ...parseWorkingHours(r.hr),
            lat: r.lt, lng: r.lg,
            status: 'Not visited yet',
            date: new Date().toLocaleDateString(),
            added: now, fromDb: r.id, score: r.sc, priority: r.pr,
            history: [], notesLog: contactNote ? [{ text: 'Contact: ' + contactNote, ts: now, system: true }] : [],
          })
          dbUpdates.push(r.id)
        })

        setLocating(false)
        if (!newStops.length) {
          const reasons = []
          if (noCoords > 0) reasons.push(`${noCoords} missing coordinates`)
          if (!available.length && !noCoords) reasons.push('no unworked records' + (fillArea !== 'all' ? ` in ${fillArea}` : ''))
          flash('No stops found' + (reasons.length ? ' — ' + reasons.join(', ') : '') + '.', 'err')
          return
        }

        cDispatch({ type: 'ADD_MANY', stops: newStops })
        dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })

        const farthest = sorted[Math.min(fillCount - 1, sorted.length - 1)]
        const distLabel = farthest ? ` (${farthest.dist.toFixed(1)} mi radius)` : ''
        const shortMsg = newStops.length < fillCount && noCoords > 0 ? ` · ${noCoords} skipped (no coords)` : ''
        flash(`Loaded ${newStops.length} stops${distLabel}${shortMsg}.`, 'ok')
      },
      err => {
        setLocating(false)
        const reason = err.code === 1 ? 'permission denied' : err.code === 3 ? 'timed out' : 'unavailable'
        flash(`Location ${reason} — enable GPS and try again.`, 'err')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
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
        {db.dbAreas.length > 1 && (
          <select value={fillArea} onChange={e => setFillArea(e.target.value)}
            style={{ height: '28px', fontSize: '12px', minWidth: '100px' }}>
            <option value="all">All areas</option>
            {db.dbAreas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <Button size="sm" onClick={handleFillNearMe} disabled={locating}>
          {locating ? 'Locating…' : 'Fill Near Me'}
        </Button>
      </div>

      {overdueStops.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--red-text)', fontWeight: 500, marginBottom: '8px', padding: '6px 10px', borderRadius: 'var(--radius)', background: 'var(--red-bg)' }}>
          {overdueStops.length} overdue stop{overdueStops.length !== 1 ? 's' : ''} from previous days
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState>No stops in queue — go to the <strong>Database</strong> tab to load your canvass list, or use <strong>+ Add Stop</strong> to add manually.</EmptyState>
      ) : !hasDayGroups ? (
        list.map(c => (
          <CanvassCard
            key={c.id}
            stop={c}
            overdue={c.date !== todayStr}
            ageLabel={c.date !== todayStr ? ageLabel(c) : null}
            onConvert={onConvert}
            onBuildRun={onBuildRun}
          />
        ))
      ) : (
        dayGroups.map(({ day, label, stops: dayStops }) => {
          const isToday = day === todayDayName
          const isCollapsed = collapsedDays.has(day)
          const displayLabel = label || day
          return (
            <div key={day} style={{ marginBottom: '2px' }}>
              <button
                onClick={() => toggleDay(day)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                  padding: '10px 12px', border: 'none', borderBottom: '0.5px solid var(--border)',
                  background: isToday ? 'var(--blue-bg, rgba(59,130,246,0.08))' : 'var(--bg2)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '11px', transition: 'transform 0.15s', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', color: 'var(--text3)' }}>▶</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: isToday ? 'var(--blue-text, #60a5fa)' : 'var(--text)' }}>
                  {displayLabel}
                </span>
                {isToday && (
                  <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--blue-text, #60a5fa)', background: 'var(--blue-bg, rgba(59,130,246,0.12))', padding: '2px 6px', borderRadius: '4px' }}>
                    Today
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text3)' }}>
                  {dayStops.length} stop{dayStops.length !== 1 ? 's' : ''}
                </span>
              </button>
              {!isCollapsed && dayStops.map(c => (
                <CanvassCard
                  key={c.id}
                  stop={c}
                  overdue={c.date !== todayStr}
                  ageLabel={c.date !== todayStr ? ageLabel(c) : null}
                  onConvert={onConvert}
                  onBuildRun={onBuildRun}
                />
              ))}
            </div>
          )
        })
      )}

      {msg && (
        <div style={{ fontSize: '12px', marginTop: '6px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>
          {msg.text}
        </div>
      )}

      {showEndDay && <EndDayModal onClose={() => { setShowEndDay(false); flash('Day ended — Follow-up stops will appear tomorrow.', 'ok') }} />}
    </div>
  )
}
