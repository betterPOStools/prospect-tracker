import { useState, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Priority, RecordStatus } from '../../types'
import { PRIORITIES, PRIORITY_COLOR } from '../../types'
import { useRecords } from '../../store/RecordsContext'
import { PriorityBadge, Badge } from '../../components/Badge'
import Select from '../../components/Select'

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [35.2271, -80.8431] // Charlotte, NC
const DEFAULT_ZOOM = 10

function statusLabel(status: RecordStatus): string {
  switch (status) {
    case 'unworked': return 'Unworked'
    case 'in_canvass': return 'In Canvass'
    case 'canvassed': return 'Canvassed'
    case 'converted': return 'Converted'
    case 'on_hold': return 'On Hold'
  }
}

function statusVariant(status: RecordStatus): 'default' | 'info' | 'warning' | 'success' | 'danger' {
  switch (status) {
    case 'unworked': return 'default'
    case 'in_canvass': return 'info'
    case 'canvassed': return 'warning'
    case 'converted': return 'success'
    case 'on_hold': return 'danger'
  }
}

// ── Fit bounds controller ────────────────────────────────────────────────────

interface FitBoundsControllerProps {
  bounds: LatLngBoundsExpression | null
  trigger: number
}

function FitBoundsController({ bounds, trigger }: FitBoundsControllerProps) {
  const map = useMap()
  const lastTrigger = useRef(-1)

  if (bounds && trigger !== lastTrigger.current) {
    lastTrigger.current = trigger
    // Use setTimeout to defer until after render
    setTimeout(() => {
      try {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 })
      } catch {
        // ignore if map not ready
      }
    }, 0)
  }

  return null
}

// ── Filter types ─────────────────────────────────────────────────────────────

type FilterPriority = 'All' | Priority
type FilterStatus = 'All' | RecordStatus

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'All', label: 'All Priorities' },
  ...PRIORITIES.map((p) => ({ value: p, label: p })),
]

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'All', label: 'All Statuses' },
  { value: 'unworked', label: 'Unworked' },
  { value: 'in_canvass', label: 'In Canvass' },
  { value: 'canvassed', label: 'Canvassed' },
  { value: 'converted', label: 'Converted' },
]

// ── Main panel ────────────────────────────────────────────────────────────────

export default function MapPanel() {
  const records = useRecords()

  const [filterPriority, setFilterPriority] = useState<FilterPriority>('All')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('All')
  const [filterArea, setFilterArea] = useState('All')
  const [fitTrigger, setFitTrigger] = useState(0)

  const areas = useMemo(() => {
    const set = new Set<string>()
    records.forEach((r) => { if (r.area) set.add(r.area) })
    return Array.from(set).sort()
  }, [records])

  const areaOptions = useMemo(
    () => [
      { value: 'All', label: 'All Areas' },
      ...areas.map((a) => ({ value: a, label: a })),
    ],
    [areas],
  )

  const withCoords = useMemo(
    () => records.filter((r) => r.lat !== undefined && r.lng !== undefined),
    [records],
  )

  const filteredRecords = useMemo(() => {
    return withCoords.filter((r) => {
      if (filterPriority !== 'All' && r.priority !== filterPriority) return false
      if (filterStatus !== 'All' && r.status !== filterStatus) return false
      if (filterArea !== 'All' && r.area !== filterArea) return false
      return true
    })
  }, [withCoords, filterPriority, filterStatus, filterArea])

  const bounds: LatLngBoundsExpression | null = useMemo(() => {
    if (filteredRecords.length === 0) return null
    return filteredRecords.map((r) => [r.lat!, r.lng!] as [number, number])
  }, [filteredRecords])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2 border-b border-[#1e2535] bg-[#161b27] px-4 py-2">
        <Select
          value={filterPriority}
          options={PRIORITY_OPTIONS}
          onChange={(e) => setFilterPriority(e.target.value as FilterPriority)}
          className="min-w-[130px]"
          aria-label="Filter by priority"
        />
        <Select
          value={filterStatus}
          options={STATUS_OPTIONS}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="min-w-[130px]"
          aria-label="Filter by status"
        />
        <Select
          value={filterArea}
          options={areaOptions}
          onChange={(e) => setFilterArea(e.target.value)}
          className="min-w-[120px]"
          aria-label="Filter by area"
        />
        <button
          onClick={() => setFitTrigger((n) => n + 1)}
          className="rounded-lg border border-[#1e2535] bg-[#161b27] px-3 py-2 text-sm text-slate-300 hover:bg-[#1a2744] active:bg-[#1e2535] transition-colors"
          aria-label="Fit view to records"
        >
          Fit View
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {filteredRecords.length} / {withCoords.length} records
        </span>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          className="absolute inset-0 h-full w-full"
          style={{ zIndex: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {bounds && (
            <FitBoundsController bounds={bounds} trigger={filteredRecords.length + fitTrigger} />
          )}

          {filteredRecords.map((record) => (
            <CircleMarker
              key={record.id}
              center={[record.lat!, record.lng!]}
              radius={7}
              pathOptions={{
                color: PRIORITY_COLOR[record.priority],
                fillColor: PRIORITY_COLOR[record.priority],
                fillOpacity: 0.8,
                weight: 1.5,
              }}
            >
              <Popup>
                <div className="space-y-1 text-sm min-w-[160px]">
                  <p className="font-semibold text-slate-100">{record.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PriorityBadge priority={record.priority} score={record.score} />
                    <Badge variant={statusVariant(record.status)}>
                      {statusLabel(record.status)}
                    </Badge>
                  </div>
                  {record.phone && (
                    <a href={`tel:${record.phone}`} className="block text-blue-600 hover:underline">
                      {record.phone}
                    </a>
                  )}
                  {record.address && (
                    <p className="text-slate-400 text-xs">{record.address}</p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
