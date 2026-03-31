import { useState } from 'react'
import { useStops, useStopsDispatch } from '../../store/StopsContext'
import { useRecords, useRecordsDispatch } from '../../store/RecordsContext'
import { db } from '../../lib/supabase'
import { haversine } from '../../data/clustering'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import Modal from '../../components/Modal'
import SubTabs from '../../components/SubTabs'
import StopCard from './StopCard'
import AddStopModal from './AddStopModal'
import EndDayModal from './EndDayModal'

// ── Sub-tab types ─────────────────────────────────────────────────────────────

type CanvassSubTab = 'queue' | 'followup' | 'completed'

// ── CanvassTab ────────────────────────────────────────────────────────────────

export default function CanvassTab() {
  const stops = useStops()
  const dispatch = useStopsDispatch()

  const [subTab, setSubTab] = useState<CanvassSubTab>('queue')
  const [addOpen, setAddOpen] = useState(false)
  const [endDayOpen, setEndDayOpen] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  // Queue panel state
  const [queueSearch, setQueueSearch] = useState('')
  const [queueArea, setQueueArea] = useState('')

  // Follow up panel state
  const [followUpFilter, setFollowUpFilter] = useState<'all' | 'come_back_later' | 'dm_unavailable'>('all')

  // Completed panel state
  const [completedSearch, setCompletedSearch] = useState('')

  // (End Day modal state is managed inside EndDayModal)

  // ── Derived lists ───────────────────────────────────────────────────────────

  const queueStops = stops.filter(
    (s) => s.status === 'queued' || s.status === 'not_visited'
  )
  const followUpStops = stops.filter(
    (s) => s.status === 'come_back_later' || s.status === 'dm_unavailable'
  )
  const completedStops = stops.filter(
    (s) => s.status === 'canvassed' || s.status === 'converted'
  )

  // Counts for stats row
  const queueCount = queueStops.length
  const followUpCount = followUpStops.length
  const completedCount = completedStops.length

  // Unique areas from all active stops (queue + followup)
  const areas = Array.from(
    new Set([...queueStops, ...followUpStops].map((s) => s.area).filter(Boolean))
  ) as string[]

  // Filtered queue
  const filteredQueue = queueStops.filter((s) => {
    const matchesSearch =
      !queueSearch || s.name.toLowerCase().includes(queueSearch.toLowerCase())
    const matchesArea = !queueArea || s.area === queueArea
    return matchesSearch && matchesArea
  })

  // Filtered follow up
  const filteredFollowUp =
    followUpFilter === 'all'
      ? followUpStops
      : followUpStops.filter((s) => s.status === followUpFilter)

  // Filtered completed
  const filteredCompleted = completedStops.filter(
    (s) =>
      !completedSearch ||
      s.name.toLowerCase().includes(completedSearch.toLowerCase())
  )

  // (End Day logic is now inside EndDayModal)

  // ── Clear All handler ────────────────────────────────────────────────────────

  async function handleClearAll() {
    const ids = queueStops.map((s) => s.id)
    if (!ids.length) {
      setClearConfirmOpen(false)
      return
    }

    await db.from('canvass_stops').delete().in('id', ids)
    dispatch({ type: 'DELETE_MANY', ids })
    setClearConfirmOpen(false)
  }

  // ── Sub-tab definitions ──────────────────────────────────────────────────────

  const tabs = [
    { id: 'queue' as CanvassSubTab, label: 'Queue', badge: queueCount },
    { id: 'followup' as CanvassSubTab, label: 'Follow Up', badge: followUpCount },
    { id: 'completed' as CanvassSubTab, label: 'Completed', badge: completedCount },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Stats row */}
      <div
        className="flex shrink-0 divide-x divide-gray-200 border-b border-gray-200 bg-white"
        data-testid="canvass-stats"
      >
        <div className="flex flex-1 flex-col items-center py-2">
          <span className="text-lg font-bold text-gray-900">{queueCount}</span>
          <span className="text-[10px] text-gray-500">Queue</span>
        </div>
        <div className="flex flex-1 flex-col items-center py-2">
          <span className="text-lg font-bold text-yellow-600">{followUpCount}</span>
          <span className="text-[10px] text-gray-500">Follow Up</span>
        </div>
        <div className="flex flex-1 flex-col items-center py-2">
          <span className="text-lg font-bold text-green-600">{completedCount}</span>
          <span className="text-[10px] text-gray-500">Completed</span>
        </div>
      </div>

      {/* Sub-tabs + Add Stop button */}
      <div className="flex shrink-0 items-center border-b border-gray-200 bg-white">
        <div className="flex-1 overflow-x-auto">
          <SubTabs tabs={tabs} active={subTab} onChange={setSubTab} />
        </div>
        <button
          className="mr-2 shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          onClick={() => setAddOpen(true)}
        >
          + Add Stop
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {subTab === 'queue' && (
          <QueuePanel
            stops={filteredQueue}
            search={queueSearch}
            onSearchChange={setQueueSearch}
            area={queueArea}
            onAreaChange={setQueueArea}
            areas={areas}
            onEndDay={() => setEndDayOpen(true)}
            onClearAll={() => setClearConfirmOpen(true)}
          />
        )}
        {subTab === 'followup' && (
          <FollowUpPanel
            stops={filteredFollowUp}
            filter={followUpFilter}
            onFilterChange={setFollowUpFilter}
          />
        )}
        {subTab === 'completed' && (
          <CompletedPanel
            stops={filteredCompleted}
            search={completedSearch}
            onSearchChange={setCompletedSearch}
          />
        )}
      </div>

      {/* Add Stop Modal */}
      <AddStopModal open={addOpen} onClose={() => setAddOpen(false)} />

      {/* End Day Modal */}
      <EndDayModal
        open={endDayOpen}
        onClose={() => setEndDayOpen(false)}
        stops={stops}
      />

      {/* Clear All Confirm Modal */}
      <Modal
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        title="Clear Queue"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-700">
            Remove all {queueCount} stop{queueCount !== 1 ? 's' : ''} from the queue? This cannot be
            undone.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setClearConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleClearAll}>
              Clear All
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Queue Panel ───────────────────────────────────────────────────────────────

interface QueuePanelProps {
  stops: ReturnType<typeof useStops>
  search: string
  onSearchChange: (v: string) => void
  area: string
  onAreaChange: (v: string) => void
  areas: string[]
  onEndDay: () => void
  onClearAll: () => void
}

function QueuePanel({
  stops,
  search,
  onSearchChange,
  area,
  onAreaChange,
  areas,
  onEndDay,
  onClearAll,
}: QueuePanelProps) {
  const records = useRecords()
  const recordsDispatch = useRecordsDispatch()
  const stopsDispatch = useStopsDispatch()

  const [fillCount, setFillCount] = useState(15)
  const [fillArea, setFillArea] = useState('')
  const [filling, setFilling] = useState(false)
  const [fillResult, setFillResult] = useState<string | null>(null)

  const areaOptions = [
    { value: '', label: 'All Areas' },
    ...areas.map((a) => ({ value: a, label: a })),
  ]

  async function handleFillNearMe() {
    setFilling(true)
    setFillResult(null)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 })
      )
      const { latitude: myLat, longitude: myLng } = pos.coords

      const candidates = records.filter((r) =>
        r.lat != null && r.lng != null &&
        r.status === 'unworked' &&
        (!fillArea || r.area === fillArea)
      )

      const sorted = candidates
        .map((r) => ({ r, dist: haversine(myLat, myLng, r.lat!, r.lng!) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, fillCount)

      if (!sorted.length) {
        setFillResult('No unworked records with coordinates found nearby.')
        return
      }

      const now = new Date().toISOString()
      for (const { r } of sorted) {
        const stop = {
          id: crypto.randomUUID(),
          name: r.name,
          phone: r.phone,
          address: r.address,
          status: 'queued' as const,
          area: r.area,
          record_id: r.id,
          created_at: now,
          updated_at: now,
        }
        await db.from('canvass_stops').insert(stop)
        stopsDispatch({ type: 'ADD', stop })
        await db.from('records').update({ status: 'in_canvass', updated_at: now }).eq('id', r.id)
        recordsDispatch({ type: 'UPDATE_STATUS', id: r.id, status: 'in_canvass' })
      }

      const radius = sorted[sorted.length - 1].dist.toFixed(1)
      setFillResult(`Added ${sorted.length} stops (${radius} mi radius)`)
    } catch (e) {
      setFillResult(e instanceof Error ? e.message : 'Location unavailable')
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Filter bar */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <div className="flex gap-2">
          <input
            type="search"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Search stops…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {areas.length > 0 && (
            <select
              className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={area}
              onChange={(e) => onAreaChange(e.target.value)}
            >
              {areaOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Fill Near Me */}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={50}
            value={fillCount}
            onChange={(e) => setFillCount(Math.max(1, Math.min(50, Number(e.target.value))))}
            className="w-14 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Stop count"
          />
          {areas.length > 0 && (
            <select
              value={fillArea}
              onChange={(e) => setFillArea(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Any area</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleFillNearMe}
            disabled={filling}
            className="flex-1"
          >
            {filling ? 'Locating…' : '📍 Fill Near Me'}
          </Button>
        </div>

        {fillResult && (
          <p className="text-xs text-gray-600">{fillResult}</p>
        )}

        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={onEndDay} className="min-h-[44px] flex-1">
            End Day
          </Button>
          <Button size="sm" variant="ghost" onClick={onClearAll} className="min-h-[44px] flex-1 text-red-600 hover:bg-red-50">
            Clear All
          </Button>
        </div>
      </div>

      {/* Stop list */}
      {stops.length === 0 ? (
        <EmptyState
          title="Queue is empty"
          description="Fill Near Me to load nearby stops, or add from the Database tab."
        />
      ) : (
        <div className="flex flex-col gap-2 p-3">
          {stops.map((stop) => (
            <StopCard key={stop.id} stop={stop} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Follow Up Panel ───────────────────────────────────────────────────────────

interface FollowUpPanelProps {
  stops: ReturnType<typeof useStops>
  filter: 'all' | 'come_back_later' | 'dm_unavailable'
  onFilterChange: (v: 'all' | 'come_back_later' | 'dm_unavailable') => void
}

function FollowUpPanel({ stops, filter, onFilterChange }: FollowUpPanelProps) {
  const filterOptions: { value: 'all' | 'come_back_later' | 'dm_unavailable'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'come_back_later', label: 'Come Back Later' },
    { value: 'dm_unavailable', label: 'DM Unavailable' },
  ]

  return (
    <div className="flex flex-col gap-0">
      {/* Filter bar */}
      <div
        className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 px-3 py-2"
        data-testid="followup-filter-bar"
      >
        <div className="flex gap-1.5">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => onFilterChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stop list */}
      {stops.length === 0 ? (
        <EmptyState
          title="No follow-up stops"
          description="Stops marked 'Come Back Later' or 'DM Unavailable' will appear here."
        />
      ) : (
        <div className="flex flex-col gap-2 p-3">
          {stops.map((stop) => (
            <StopCard key={stop.id} stop={stop} showOverdue />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Completed Panel ───────────────────────────────────────────────────────────

interface CompletedPanelProps {
  stops: ReturnType<typeof useStops>
  search: string
  onSearchChange: (v: string) => void
}

function CompletedPanel({ stops, search, onSearchChange }: CompletedPanelProps) {
  return (
    <div className="flex flex-col gap-0">
      {/* Search bar */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <input
          type="search"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          placeholder="Search completed stops…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Stop list */}
      {stops.length === 0 ? (
        <EmptyState
          title="No completed stops"
          description="Stops marked 'Canvassed' or 'Converted' will appear here."
        />
      ) : (
        <div className="flex flex-col gap-2 p-3">
          {stops.map((stop) => (
            <StopCard key={stop.id} stop={stop} readOnly />
          ))}
        </div>
      )}
    </div>
  )
}
