import React, { useState, useMemo, Suspense } from 'react'
import { useRecords } from '../../store/RecordsContext'
import SubTabs from '../../components/SubTabs'
import BrowsePanel from './BrowsePanel'
import PlannerPanel from './PlannerPanel'

// ── Lazy-load MapPanel to avoid loading Leaflet until needed ──────────────────
const MapPanel = React.lazy(() => import('./MapPanel'))

// ── Sub-tab types ─────────────────────────────────────────────────────────────

type SubTab = 'browse' | 'planner' | 'map'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'planner', label: 'Planner' },
  { id: 'map', label: 'Map' },
]

// ── Stats row ─────────────────────────────────────────────────────────────────

function StatsRow() {
  const records = useRecords()

  const stats = useMemo(() => {
    const total = records.length
    const fire = records.filter((r) => r.priority === 'Fire').length
    const hot = records.filter((r) => r.priority === 'Hot').length
    const warm = records.filter((r) => r.priority === 'Warm').length
    const cold = records.filter((r) => r.priority === 'Cold').length
    const dead = records.filter((r) => r.priority === 'Dead').length
    const unworked = records.filter((r) => r.status === 'unworked').length
    const worked = records.filter((r) => r.status !== 'unworked').length
    return { total, fire, hot, warm, cold, dead, unworked, worked }
  }, [records])

  return (
    <div
      className="flex items-center gap-3 overflow-x-auto border-b border-gray-100 bg-white px-4 py-2 text-xs shrink-0"
      aria-label="Database statistics"
    >
      <StatItem label="Total" value={stats.total} color="text-gray-700" />
      <span className="text-gray-200">|</span>
      <StatItem label="Fire" value={stats.fire} color="text-red-500" emoji="🔥" />
      <StatItem label="Hot" value={stats.hot} color="text-orange-500" emoji="🥵" />
      <StatItem label="Warm" value={stats.warm} color="text-yellow-500" emoji="☀️" />
      <StatItem label="Cold" value={stats.cold} color="text-blue-500" emoji="🥶" />
      <StatItem label="Dead" value={stats.dead} color="text-gray-400" emoji="☠️" />
      <span className="text-gray-200">|</span>
      <StatItem label="Unworked" value={stats.unworked} color="text-gray-600" />
      <StatItem label="Worked" value={stats.worked} color="text-green-600" />
    </div>
  )
}

interface StatItemProps {
  label: string
  value: number
  color: string
  emoji?: string
}

function StatItem({ label, value, color, emoji }: StatItemProps) {
  return (
    <span className={`whitespace-nowrap ${color}`}>
      {emoji && <span className="mr-0.5">{emoji}</span>}
      <span className="font-semibold">{value}</span>{' '}
      <span className="opacity-70">{label}</span>
    </span>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function DatabaseTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('browse')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <StatsRow />

      <SubTabs
        tabs={SUB_TABS}
        active={activeSubTab}
        onChange={setActiveSubTab}
      />

      {activeSubTab === 'browse' && <BrowsePanel />}
      {activeSubTab === 'planner' && <PlannerPanel />}
      {activeSubTab === 'map' && (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              Loading map…
            </div>
          }
        >
          <MapPanel />
        </Suspense>
      )}
    </div>
  )
}
