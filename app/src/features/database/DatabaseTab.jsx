import { useState, useMemo } from 'react'
import { useDatabase } from '../../data/store.jsx'
import { PRIORITIES, PRIORITY_EMOJI } from '../../data/scoring.js'
import StatBar    from '../../components/StatBar.jsx'
import ImportBar  from './ImportBar.jsx'
import BlocklistManager from './BlocklistManager.jsx'
import SnapshotManager  from './SnapshotManager.jsx'
import BrowsePanel      from './BrowsePanel.jsx'
import ZonesPanel       from './ZonesPanel.jsx'
import WeekPlannerPanel from './WeekPlannerPanel.jsx'
import OutscraperPanel  from './OutscraperPanel.jsx'

const SUB_TABS = ['Browse', 'Zones', 'Week Planner', 'Outscraper API']

export default function DatabaseTab() {
  const { dbRecords } = useDatabase()
  const [subTab,      setSubTab]      = useState('Browse')
  const [zoneFilter,  setZoneFilter]  = useState(null)

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

  function handleBrowseZone(zoneId) {
    setZoneFilter(zoneId)
    setSubTab('Browse')
  }

  return (
    <div>
      <ImportBar onImported={() => setSubTab('Browse')} />
      <SnapshotManager />
      <BlocklistManager />

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

      {subTab === 'Browse'        && <BrowsePanel zoneFilter={zoneFilter} onClearZoneFilter={() => setZoneFilter(null)} />}
      {subTab === 'Zones'         && <ZonesPanel onBrowseZone={handleBrowseZone} />}
      {subTab === 'Week Planner'  && <WeekPlannerPanel />}
      {subTab === 'Outscraper API' && <OutscraperPanel />}
    </div>
  )
}
