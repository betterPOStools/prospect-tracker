import { useState, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ProspectRecord, Priority, RecordStatus } from '../../types'
import { PRIORITIES, DAYS, PRIORITY_COLOR } from '../../types'
import { useRecords, useRecordsDispatch } from '../../store/RecordsContext'
import { useStopsDispatch } from '../../store/StopsContext'
import { supabase } from '../../lib/supabase'
import Button from '../../components/Button'
import { PriorityBadge, Badge } from '../../components/Badge'
import EmptyState from '../../components/EmptyState'
import Select from '../../components/Select'
import RecordDetailModal from './RecordDetailModal'

// ── Types ────────────────────────────────────────────────────────────────────

type FilterPriority = 'All' | Priority
type FilterStatus = 'All' | RecordStatus

// ── Constants ────────────────────────────────────────────────────────────────

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

function statusLabel(status: RecordStatus): string {
  switch (status) {
    case 'unworked': return 'Unworked'
    case 'in_canvass': return 'In Canvass'
    case 'canvassed': return 'Canvassed'
    case 'converted': return 'Converted'
  }
}

function statusVariant(status: RecordStatus): 'default' | 'info' | 'warning' | 'success' {
  switch (status) {
    case 'unworked': return 'default'
    case 'in_canvass': return 'info'
    case 'canvassed': return 'warning'
    case 'converted': return 'success'
  }
}

// ── Record row ───────────────────────────────────────────────────────────────

interface RecordRowProps {
  record: ProspectRecord
  selected: boolean
  onToggle: () => void
  onClick: () => void
}

function RecordRow({ record, selected, onToggle, onClick }: RecordRowProps) {
  const color = PRIORITY_COLOR[record.priority]
  return (
    <div
      className={`flex items-center gap-3 border-b border-gray-100 px-4 py-2 transition-colors ${
        selected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
      style={{ height: 72, boxSizing: 'border-box' }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded border-gray-300"
        aria-label={`Select ${record.name}`}
      />

      {/* Priority dot */}
      <span
        className="shrink-0 h-3 w-3 rounded-full"
        style={{ background: color }}
        aria-hidden
      />

      {/* Name + details */}
      <button
        className="flex flex-1 flex-col items-start gap-0.5 text-left overflow-hidden"
        onClick={onClick}
        aria-label={`Open ${record.name}`}
      >
        <span className="text-sm font-medium text-gray-900 truncate w-full">{record.name}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PriorityBadge priority={record.priority} score={record.score} />
          <Badge variant={statusVariant(record.status)}>{statusLabel(record.status)}</Badge>
          {record.area && (
            <span className="text-xs text-gray-400">{record.area}</span>
          )}
        </div>
        {record.address && (
          <span className="text-xs text-gray-500 truncate w-full">{record.address}</span>
        )}
      </button>
    </div>
  )
}

// ── Virtualized list ─────────────────────────────────────────────────────────

interface VirtualRecordListProps {
  records: ProspectRecord[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onOpen: (record: ProspectRecord) => void
}

function VirtualRecordList({ records, selectedIds, onToggle, onOpen }: VirtualRecordListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8,
  })

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const record = records[virtualRow.index]
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <RecordRow
                record={record}
                selected={selectedIds.has(record.id)}
                onToggle={() => onToggle(record.id)}
                onClick={() => onOpen(record)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function BrowsePanel() {
  const records = useRecords()
  const recordsDispatch = useRecordsDispatch()
  const stopsDispatch = useStopsDispatch()

  // Filters
  const [filterPriority, setFilterPriority] = useState<FilterPriority>('All')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('All')
  const [filterArea, setFilterArea] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [hideOnHold, setHideOnHold] = useState(false)

  // Selection + bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDay, setBulkDay] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)

  // Detail modal
  const [detailRecord, setDetailRecord] = useState<ProspectRecord | null>(null)

  // Unique areas
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

  // Filtered records
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter((r) => {
      if (hideOnHold && (r.is_chain || r.status === 'canvassed')) return false
      if (filterPriority !== 'All' && r.priority !== filterPriority) return false
      if (filterStatus !== 'All' && r.status !== filterStatus) return false
      if (filterArea !== 'All' && r.area !== filterArea) return false
      if (q && !r.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [records, filterPriority, filterStatus, filterArea, search, hideOnHold])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleAddToCanvass() {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    const now = new Date().toISOString()
    const selected = records.filter((r) => selectedIds.has(r.id))

    for (const record of selected) {
      const stop = {
        id: crypto.randomUUID(),
        name: record.name,
        phone: record.phone,
        address: record.address,
        status: 'queued' as const,
        area: record.area,
        record_id: record.id,
        created_at: now,
        updated_at: now,
      }
      await supabase.from('prospect.canvass_stops').insert(stop)
      stopsDispatch({ type: 'ADD', stop })

      await supabase
        .from('prospect.records')
        .update({ status: 'in_canvass', updated_at: now })
        .eq('id', record.id)
      recordsDispatch({ type: 'UPDATE_STATUS', id: record.id, status: 'in_canvass' })
    }

    setBulkLoading(false)
    clearSelection()
  }

  async function handleBulkAssignDay() {
    if (selectedIds.size === 0 || !bulkDay) return
    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    const now = new Date().toISOString()

    await supabase
      .from('prospect.records')
      .update({ day: bulkDay, updated_at: now })
      .in('id', ids)
    recordsDispatch({ type: 'ASSIGN_DAY', ids, day: bulkDay })

    setBulkLoading(false)
    clearSelection()
    setBulkDay('')
  }

  const hasSelection = selectedIds.size > 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2 border-b border-gray-100 bg-white px-4 py-2">
        <div className="flex-1 min-w-[160px]">
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Search records"
          />
        </div>
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
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={hideOnHold}
            onChange={(e) => setHideOnHold(e.target.checked)}
            className="rounded border-gray-300"
          />
          Hide on hold
        </label>
      </div>

      {/* Count + bulk actions */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-1.5">
        <span className="text-xs text-gray-500">
          Showing <span className="font-semibold text-gray-700">{filteredRecords.length}</span>{' '}
          of <span className="font-semibold text-gray-700">{records.length}</span>
        </span>

        {hasSelection && (
          <>
            <span className="text-xs text-blue-700 font-medium">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={handleAddToCanvass}
              disabled={bulkLoading}
            >
              Add to Today's Canvass
            </Button>
            <div className="flex items-center gap-1.5">
              <select
                value={bulkDay}
                onChange={(e) => setBulkDay(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                aria-label="Assign day"
              >
                <option value="">Assign to day…</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleBulkAssignDay}
                disabled={bulkLoading || !bulkDay}
              >
                Assign
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
          </>
        )}
      </div>

      {/* List */}
      {filteredRecords.length === 0 ? (
        <EmptyState
          title="No records match"
          description="Try adjusting your filters or search."
        />
      ) : (
        <VirtualRecordList
          records={filteredRecords}
          selectedIds={selectedIds}
          onToggle={toggleSelect}
          onOpen={(r) => setDetailRecord(r)}
        />
      )}

      <RecordDetailModal
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
      />
    </div>
  )
}
