import type { TabId } from '../types'
import { useLeads } from '../store/LeadsContext'
import { useRecords } from '../store/RecordsContext'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'leads', label: 'My Leads' },
  { id: 'canvass', label: 'Canvass' },
  { id: 'route', label: 'Route' },
  { id: 'database', label: 'Database' },
  { id: 'utilities', label: 'Utilities' },
]

interface TabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

function TabBadge({ id }: { id: TabId }) {
  const leads = useLeads()
  const records = useRecords()

  let count = 0
  if (id === 'leads') count = leads.filter((l) => l.status === 'Open').length
  if (id === 'database') count = records.length

  if (!count) return null
  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
      {count > 999 ? '999+' : count}
    </span>
  )
}

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="flex shrink-0 border-t border-gray-200 bg-white">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-1 flex-col items-center justify-center py-2 text-xs font-medium transition-colors ${
            activeTab === tab.id
              ? 'border-t-2 border-blue-600 text-blue-600'
              : 'border-t-2 border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-0.5">
            {tab.label}
            <TabBadge id={tab.id} />
          </span>
        </button>
      ))}
    </nav>
  )
}
