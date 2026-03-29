import EmptyState from '../../components/EmptyState'
import { useStops } from '../../store/StopsContext'

export default function CanvassTab() {
  const stops = useStops()
  const queued = stops.filter((s) => s.status === 'queued' || s.status === 'not_visited')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* TODO: Phase 3 — CanvassStats, SubTabs, QueuePanel, FollowUpPanel, CompletedPanel */}
      {!stops.length ? (
        <EmptyState
          title="Queue is empty"
          description="Add stops from the Database tab or use the Planner."
        />
      ) : (
        <div className="p-4 text-sm text-gray-500">
          {queued.length} stop{queued.length !== 1 ? 's' : ''} in queue · {stops.length} total
        </div>
      )}
    </div>
  )
}
