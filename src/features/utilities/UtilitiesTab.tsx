import { useState } from 'react'
import SubTabs from '../../components/SubTabs'
import AnalyticsPanel from './AnalyticsPanel'
import ImportPanel from './ImportPanel'
import ExportPanel from './ExportPanel'
import BackupsPanel from './BackupsPanel'
import BlocklistPanel from './BlocklistPanel'
import SettingsPanel from './SettingsPanel'

type UtilTab = 'analytics' | 'import' | 'export' | 'backups' | 'blocklist' | 'settings'

const TABS: { id: UtilTab; label: string }[] = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'import', label: 'Import' },
  { id: 'export', label: 'Export' },
  { id: 'backups', label: 'Backups' },
  { id: 'blocklist', label: 'Blocklist' },
  { id: 'settings', label: 'Settings' },
]

export default function UtilitiesTab() {
  const [active, setActive] = useState<UtilTab>('analytics')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div data-testid="utilities-sub-tabs">
        <SubTabs tabs={TABS} active={active} onChange={setActive} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        {active === 'analytics' && <AnalyticsPanel />}
        {active === 'import' && <ImportPanel />}
        {active === 'export' && <ExportPanel />}
        {active === 'backups' && <BackupsPanel />}
        {active === 'blocklist' && <BlocklistPanel />}
        {active === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
