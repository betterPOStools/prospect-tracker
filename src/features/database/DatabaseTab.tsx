import { useRecords } from '../../store/RecordsContext'

export default function DatabaseTab() {
  const records = useRecords()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* TODO: Phase 3 — DatabaseStats, SubTabs (Browse/Planner/Map) */}
      <div className="p-4 text-sm text-gray-500">
        {records.length} record{records.length !== 1 ? 's' : ''} in database
      </div>
    </div>
  )
}
