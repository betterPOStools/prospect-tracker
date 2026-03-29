interface SubTabsProps<T extends string> {
  tabs: { id: T; label: string; badge?: number }[]
  active: T
  onChange: (id: T) => void
}

export default function SubTabs<T extends string>({ tabs, active, onChange }: SubTabsProps<T>) {
  return (
    <div className="flex border-b border-gray-200 bg-white px-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
            active === tab.id
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className="min-w-[18px] rounded-full bg-blue-100 px-1 py-0.5 text-center text-[10px] font-semibold text-blue-700">
              {tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
