import EmptyState from '../../components/EmptyState'
import { useLeads } from '../../store/LeadsContext'

export default function LeadsTab() {
  const leads = useLeads()
  const open = leads.filter((l) => l.status === 'Open')

  if (!leads.length) {
    return (
      <EmptyState
        title="No leads yet"
        description="Convert a canvass stop to create your first lead."
      />
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* TODO: Phase 3 — LeadsFilterBar, LeadsList, AddLeadModal */}
      <div className="p-4 text-sm text-gray-500">
        {open.length} open lead{open.length !== 1 ? 's' : ''} · {leads.length} total
      </div>
    </div>
  )
}
