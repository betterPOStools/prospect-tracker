import EmptyState from '../../components/EmptyState'
import { useStops } from '../../store/StopsContext'

export default function RouteTab() {
  const stops = useStops()
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const todayStops = stops.filter((s) => s.day === today)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* TODO: Phase 3 — RouteHeader, OptimizeButton, RouteStopList, LegSections */}
      {!todayStops.length ? (
        <EmptyState
          title="No stops for today"
          description="Assign stops in the Planner or add them from the Database."
        />
      ) : (
        <div className="p-4 text-sm text-gray-500">
          {todayStops.length} stop{todayStops.length !== 1 ? 's' : ''} for {today}
        </div>
      )}
    </div>
  )
}
