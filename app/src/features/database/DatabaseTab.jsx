import { useState, useMemo, lazy, Suspense } from 'react'
import { useDatabase } from '../../data/store.jsx'
import { PRIORITIES, PRIORITY_EMOJI } from '../../data/scoring.js'
import StatBar    from '../../components/StatBar.jsx'
import BrowsePanel         from './BrowsePanel.jsx'
import WeekPlannerPanel    from './WeekPlannerPanel.jsx'
import DemoDatabasesPanel  from './DemoDatabasesPanel.jsx'

const MapPanel = lazy(() => import('./MapPanel.jsx'))

const SUB_TABS = ['Browse', 'Planner', 'Map']

export default function DatabaseTab() {
  const { dbRecords } = useDatabase()
  const [subTab,      setSubTab]      = useState('Browse')

  const stats = useMemo(() => {
    const total    = dbRecords.length
    const unworked = dbRecords.filter(r => r.st === 'unworked').length
    const worked   = dbRecords.filter(r => r.st !== 'unworked' && r.st !== 'in_canvass').length
    const byCounts = PRIORITIES.map(p => ({ n: dbRecords.filter(r => r.pr === p).length, label: `${PRIORITY_EMOJI[p]} ${p}` }))
    return [
      { n: total,    label: 'Total' },
      ...byCounts,
      { n: unworked, label: 'Unworked' },
      { n: worked,   label: 'Worked' },
    ]
  }, [dbRecords])

  return (
    <div>
      {dbRecords.length > 0 && <StatBar stats={stats} />}

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: '4px', margin: '14px 0 12px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {SUB_TABS.map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            style={{
              background: 'none', border: 'none', borderBottom: subTab === t ? '2px solid var(--accent)' : '2px solid transparent',
              padding: '6px 12px', fontSize: '13px', fontWeight: subTab === t ? 600 : 400,
              color: subTab === t ? 'var(--text)' : 'var(--text2)', cursor: 'pointer',
              marginBottom: '-1px', transition: 'color .15s',
            }}>
            {t}
          </button>
        ))}
      </div>

      {subTab === 'Browse'  && <BrowsePanel />}
      {subTab === 'Planner' && <WeekPlannerPanel />}
      <Suspense fallback={<div style={{ padding: '24px', color: 'var(--text2)', fontSize: '13px' }}>Loading map…</div>}>
        {subTab === 'Map' && <MapPanel />}
      </Suspense>

      <DemoDatabasesPanel />
    </div>
  )
}
