import { useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LeadStatus } from '../../types'
import { useLeads } from '../../store/LeadsContext'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import LeadCard from './LeadCard'
import AddLeadModal from './AddLeadModal'

// ── Filter types ─────────────────────────────────────────────────────────────

type FilterStatus = 'All' | LeadStatus

const FILTER_OPTIONS: FilterStatus[] = ['All', 'Open', 'Won', 'Lost', 'Abandoned']

// ── Virtualized list ─────────────────────────────────────────────────────────

const VIRTUALIZE_THRESHOLD = 20
// Estimated row height — cards vary but this keeps scrolling smooth
const ESTIMATED_ROW_HEIGHT = 160

interface VirtualLeadListProps {
  leadIds: string[]
  leads: import('../../types').Lead[]
}

function VirtualLeadList({ leadIds, leads }: VirtualLeadListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: leadIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
  })

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualItem) => {
          const lead = leads.find((l) => l.id === leadIds[virtualItem.index])
          if (!lead) return null
          return (
            <div
              key={lead.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <LeadCard lead={lead} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export default function LeadsTab() {
  const leads = useLeads()
  const [filter, setFilter] = useState<FilterStatus>('All')
  const [showAddModal, setShowAddModal] = useState(false)

  const counts = {
    All: leads.length,
    Open: leads.filter((l) => l.status === 'Open').length,
    Won: leads.filter((l) => l.status === 'Won').length,
    Lost: leads.filter((l) => l.status === 'Lost').length,
    Abandoned: leads.filter((l) => l.status === 'Abandoned').length,
  }

  const filtered = filter === 'All' ? leads : leads.filter((l) => l.status === filter)
  const filteredIds = filtered.map((l) => l.id)
  const useVirtual = filtered.length > VIRTUALIZE_THRESHOLD

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Stats row */}
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-4 py-2">
        <span className="text-xs text-gray-500">
          <span className="font-semibold text-gray-800">{counts.All}</span> total
        </span>
        <span className="text-xs text-blue-700">
          <span className="font-semibold">{counts.Open}</span> open
        </span>
        <span className="text-xs text-green-700">
          <span className="font-semibold">{counts.Won}</span> won
        </span>
        <span className="text-xs text-red-600">
          <span className="font-semibold">{counts.Lost}</span> lost
        </span>
        <span className="text-xs text-yellow-700">
          <span className="font-semibold">{counts.Abandoned}</span> abandoned
        </span>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowAddModal(true)}
          >
            + Add Lead
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex border-b border-gray-200 bg-white px-1" data-testid="leads-filter-bar">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            className={`flex min-h-[44px] items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              filter === f
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f}
            {counts[f] > 0 && (
              <span
                className={`min-w-[18px] rounded-full px-1 py-0.5 text-center text-[10px] font-semibold ${
                  filter === f
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {counts[f] > 99 ? '99+' : counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List or empty state */}
      {filtered.length === 0 ? (
        <EmptyState
          title={filter === 'All' ? 'No leads yet' : `No ${filter.toLowerCase()} leads`}
          description={
            filter === 'All'
              ? 'Add your first lead manually or convert a canvass stop.'
              : `You have no ${filter.toLowerCase()} leads right now.`
          }
          action={
            filter === 'All' ? (
              <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
                Add Lead
              </Button>
            ) : undefined
          }
        />
      ) : useVirtual ? (
        <VirtualLeadList leadIds={filteredIds} leads={filtered} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}

      <AddLeadModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  )
}
