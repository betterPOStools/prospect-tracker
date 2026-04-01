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
      {count}
    </span>
  )
}

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="flex shrink-0 overflow-x-auto border-b border-[#1e2535] bg-[#161b27]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-1 shrink-0 items-center justify-center whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-all duration-150 ${
            activeTab === tab.id
              ? 'border-b-2 border-blue-500 text-white'
              : 'border-b-2 border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#1e2535]/50'
          }`}
        >
          {tab.label}
          <TabBadge id={tab.id} />
        </button>
      ))}
    </nav>
  )
}
