import { useState, useMemo } from 'react'
import type { ProspectRecord } from '../../types'
import { DAYS } from '../../types'
import { useRecords, useRecordsDispatch } from '../../store/RecordsContext'
import { useStopsDispatch } from '../../store/StopsContext'
import { useDayPlanner } from '../../hooks/useDayPlanner'
import { db } from '../../lib/supabase'
import { isNative } from '../../lib/platform'
import Button from '../../components/Button'
import { fillFromAnchor, type Anchor } from '../../data/dayPlanner'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTodayName(): string {
  const dayIndex = new Date().getDay() // 0=Sun, 1=Mon, …, 5=Fri, 6=Sat
  if (dayIndex === 0 || dayIndex === 6) return '' // weekend — no match
  return DAYS[dayIndex - 1]
}

function shortDay(day: string): string {
  return day.slice(0, 3)
}

// ── Day rows ─────────────────────────────────────────────────────────────────

interface DayRowProps {
  day: string
  records: ProspectRecord[]
  onCanvass: () => void
  onClear: () => void
  loading: boolean
}

function DayRow({ day, records, onCanvass, onClear, loading }: DayRowProps) {
  const total = records.length
  const unworked = records.filter((r) => r.status === 'unworked').length
  const today = getTodayName()

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-200 hover:border-[#2a3550] ${
        day === today ? 'border-blue-500/40 bg-[#1a2744]' : 'border-[#1e2535] bg-[#161b27]'
      }`}
    >
      <div className="w-12 shrink-0">
        <span
          className={`text-sm font-semibold ${
            day === today ? 'text-blue-400' : 'text-slate-300'
          }`}
        >
          {shortDay(day)}
        </span>
      </div>
      <div className="flex-1">
        <span className="text-sm text-slate-300">
          <span className="font-medium">{total}</span> stop{total !== 1 ? 's' : ''}
        </span>
        {total > 0 && (
          <span className="ml-2 text-xs text-slate-500">
            ({unworked} unworked)
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onCanvass}
            disabled={loading}
            aria-label={`Send ${day} to canvass`}
          >
            Canvass
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={loading}
            aria-label={`Clear ${day}`}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Anchor picker ─────────────────────────────────────────────────────────────

interface AnchorPickerProps {
  anchor: Anchor | null
  onSelect: (anchor: Anchor) => void
  records: ProspectRecord[]
}

function AnchorPicker({ anchor, onSelect, records }: AnchorPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const matches = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return records
      .filter((r) => r.lat && r.lng && r.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, records])

  function handleSelect(record: ProspectRecord) {
    onSelect({ lat: record.lat!, lng: record.lng!, name: record.name })
    setQuery('')
    setOpen(false)
  }

  function handleNearMe() {
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSelect({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: 'Current Location',
        })
        setGeoLoading(false)
      },
      (err) => {
        setGeoError(err.message)
        setGeoLoading(false)
      },
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-slate-400">Anchor location</label>
      <div className="relative">
        <input
          type="search"
          placeholder="Search for a record to anchor near…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          aria-label="Search anchor"
          aria-autocomplete="list"
          aria-expanded={open && matches.length > 0}
        />
        {open && matches.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 w-full rounded-lg border border-[#1e2535] bg-[#161b27] shadow-lg overflow-auto max-h-48"
          >
            {matches.map((r) => (
              <li key={r.id}>
                <button
                  role="option"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[#1a2744]"
                  onMouseDown={() => handleSelect(r)}
                >
                  <span className="font-medium text-slate-200">{r.name}</span>
                  {r.address && (
                    <span className="ml-2 text-xs text-slate-500">{r.address}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isNative && (
        <Button
          size="sm"
          variant="secondary"
          onClick={handleNearMe}
          disabled={geoLoading}
        >
          {geoLoading ? 'Locating…' : 'Near Me'}
        </Button>
      )}

      {geoError && (
        <p className="text-xs text-red-600">{geoError}</p>
      )}

      {anchor && (
        <div className="flex items-center gap-2 rounded-lg bg-green-900/30 px-3 py-2 text-sm text-green-400">
          <span className="shrink-0 text-green-400">&#x2713;</span>
          <span className="font-medium">{anchor.name ?? `${anchor.lat.toFixed(4)}, ${anchor.lng.toFixed(4)}`}</span>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PlannerPanel() {
  const records = useRecords()
  const recordsDispatch = useRecordsDispatch()
  const stopsDispatch = useStopsDispatch()
  const { fillDay, clearDay, clearWeek } = useDayPlanner()

  const today = getTodayName()
  const [selectedDay, setSelectedDay] = useState<string>(today || DAYS[0])
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [stopCount, setStopCount] = useState(10)
  const [areaFilter, setAreaFilter] = useState('all')
  const [fillResult, setFillResult] = useState<{ day: string; added: number; skipped: number } | null>(null)
  const [weekFillResult, setWeekFillResult] = useState<{ total: number } | null>(null)
  const [dayLoading, setDayLoading] = useState<string | null>(null)
  const [weekLoading, setWeekLoading] = useState(false)

  const areas = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => { if (r.area) set.add(r.area) })
    return Array.from(set).sort()
  }, [records])

  const areaOptions = useMemo(
    () => [
      { value: 'all', label: 'All Areas' },
      ...areas.map((a) => ({ value: a, label: a })),
    ],
    [areas],
  )

  const recordsByDay = useMemo(() => {
    const map: Record<string, ProspectRecord[]> = {}
    DAYS.forEach((d) => { map[d] = [] })
    records.forEach((r) => {
      if (r.day && map[r.day]) map[r.day].push(r)
    })
    return map
  }, [records])

  const unassignedCount = useMemo(
    () => records.filter((r) => !r.day && r.status === 'unworked').length,
    [records],
  )

  function handleFillDay() {
    if (!anchor) return
    const result = fillDay(anchor, selectedDay, stopCount, areaFilter)
    setFillResult({
      day: selectedDay,
      added: result.assignments.length,
      skipped: result.skippedNoCoords,
    })
    setWeekFillResult(null)
  }

  async function handleFillWeek() {
    if (!anchor) return
    setWeekLoading(true)
    setFillResult(null)
    setWeekFillResult(null)

    let totalAssigned = 0
    const allAssignments: Array<{ id: string; day: string }> = []

    // Build a working copy of records so each day excludes records assigned to previous days
    const assignedIds = new Set<string>()

    for (const day of DAYS) {
      // Use fillFromAnchor with a filtered record set that excludes already-assigned records
      const available = records.filter((r) => !assignedIds.has(r.id))
      const result = fillFromAnchor(anchor, available, day, stopCount, areaFilter)
      for (const a of result.assignments) {
        assignedIds.add(a.id)
        allAssignments.push(a)
      }
      totalAssigned += result.assignments.length
    }

    if (allAssignments.length > 0) {
      // Persist to Supabase
      const now = new Date().toISOString()
      for (const a of allAssignments) {
        await db
          .from('records')
          .update({ day: a.day, updated_at: now })
          .eq('id', a.id)
      }
      // Dispatch to context
      recordsDispatch({ type: 'WEEK_ASSIGN', assignments: allAssignments })
    }

    setWeekFillResult({ total: totalAssigned })
    setWeekLoading(false)
  }

  async function handleCanvassDay(day: string) {
    setDayLoading(day)
    const dayRecords = recordsByDay[day]
    const now = new Date().toISOString()

    for (const record of dayRecords) {
      const stop = {
        id: crypto.randomUUID(),
        name: record.name,
        phone: record.phone,
        address: record.address,
        status: 'queued' as const,
        area: record.area,
        day: record.day,
        record_id: record.id,
        created_at: now,
        updated_at: now,
      }
      await db.from('canvass_stops').insert(stop)
      stopsDispatch({ type: 'ADD', stop })

      await db
        .from('records')
        .update({ status: 'in_canvass', updated_at: now })
        .eq('id', record.id)
      recordsDispatch({ type: 'UPDATE_STATUS', id: record.id, status: 'in_canvass' })
    }

    setDayLoading(null)
  }

  async function handleClearDay(day: string) {
    setDayLoading(day)
    await db
      .from('records')
      .update({ day: null, updated_at: new Date().toISOString() })
      .eq('day', day)
    clearDay(day)
    setDayLoading(null)
  }

  async function handleClearWeek() {
    const assignedCount = records.filter((r) => r.day).length
    if (assignedCount === 0) return
    if (!window.confirm(`Clear all day assignments for ${assignedCount} records?`)) return

    setWeekLoading(true)
    await db
      .from('records')
      .update({ day: null, updated_at: new Date().toISOString() })
      .not('day', 'is', null)
    clearWeek()
    setFillResult(null)
    setWeekFillResult(null)
    setWeekLoading(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4 space-y-5">
      {/* Unassigned count */}
      <div className="rounded-lg bg-amber-900/30 border border-amber-500/30 px-3 py-2 text-sm text-amber-400">
        <span className="font-semibold">{unassignedCount}</span> unassigned unworked records
      </div>

      {/* Day selector */}
      <div>
        <p className="text-xs font-medium text-slate-400 mb-2">Select day</p>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.97] ${
                selectedDay === d
                  ? 'bg-blue-600 text-white'
                  : d === today
                  ? 'border border-blue-500/40 text-blue-400 hover:bg-[#1a2744]'
                  : 'border border-[#1e2535] text-slate-400 hover:bg-[#1a2744]'
              }`}
              aria-pressed={selectedDay === d}
              aria-label={d === today ? `${d} (today)` : d}
            >
              {shortDay(d)}
              {d === today && <span className="ml-1 text-[10px] opacity-70">today</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Anchor picker */}
      <AnchorPicker anchor={anchor} onSelect={setAnchor} records={records} />

      {/* Options row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Stops (1-20)</label>
          <input
            type="number"
            min={1}
            max={20}
            value={stopCount}
            onChange={(e) => setStopCount(Math.max(1, Math.min(20, Number(e.target.value))))}
            className="w-20 rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Stop count"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
          <label className="text-xs font-medium text-slate-400">Area filter</label>
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Area filter"
          >
            {areaOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <Button
          variant="primary"
          onClick={handleFillDay}
          disabled={!anchor}
          aria-label={`Fill ${selectedDay}`}
        >
          Fill {shortDay(selectedDay)}
        </Button>
        <Button
          variant="secondary"
          onClick={handleFillWeek}
          disabled={!anchor || weekLoading}
          aria-label="Auto-fill week"
        >
          {weekLoading ? 'Filling…' : 'Auto-fill Week'}
        </Button>
      </div>

      {/* Fill result */}
      {fillResult && (
        <div className="rounded-lg bg-green-900/30 border border-green-500/30 px-3 py-2 text-sm text-green-400">
          Added <strong>{fillResult.added}</strong> stop{fillResult.added !== 1 ? 's' : ''} to{' '}
          <strong>{fillResult.day}</strong>
          {fillResult.skipped > 0 && (
            <span className="text-green-500">
              {' '}({fillResult.skipped} skipped — no coords)
            </span>
          )}
        </div>
      )}
      {weekFillResult && (
        <div className="rounded-lg bg-green-900/30 border border-green-500/30 px-3 py-2 text-sm text-green-400">
          Filled Mon-Fri: <strong>{weekFillResult.total}</strong> records assigned
        </div>
      )}

      {/* Day rows */}
      <div className="space-y-2">
        {DAYS.map((d) => (
          <DayRow
            key={d}
            day={d}
            records={recordsByDay[d]}
            onCanvass={() => handleCanvassDay(d)}
            onClear={() => handleClearDay(d)}
            loading={dayLoading === d}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end pt-1">
        <Button variant="danger" size="sm" onClick={handleClearWeek} disabled={weekLoading}>
          {weekLoading ? 'Clearing…' : 'Clear Week'}
        </Button>
      </div>
    </div>
  )
}
