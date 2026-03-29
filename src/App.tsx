import { useState, lazy, Suspense } from 'react'
import { DataProvider } from './store/DataProvider'
import TabBar from './components/TabBar'
import StatusBar from './components/StatusBar'
import type { TabId } from './types'

const LeadsTab    = lazy(() => import('./features/leads/LeadsTab'))
const CanvassTab  = lazy(() => import('./features/canvass/CanvassTab'))
const RouteTab    = lazy(() => import('./features/route/RouteTab'))
const DatabaseTab = lazy(() => import('./features/database/DatabaseTab'))
const UtilitiesTab = lazy(() => import('./features/utilities/UtilitiesTab'))

const BUILD = 'v0.1.0'

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('leads')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Value Systems
            </p>
            <h1 className="text-sm font-bold text-gray-900">Restaurant Prospect Tracker</h1>
          </div>
          <span className="text-[10px] text-gray-400">{BUILD}</span>
        </div>
      </header>

      {/* Offline / sync status */}
      <StatusBar />

      {/* Tab content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-gray-400">Loading…</div>}>
          {activeTab === 'leads'     && <LeadsTab />}
          {activeTab === 'canvass'   && <CanvassTab />}
          {activeTab === 'route'     && <RouteTab />}
          {activeTab === 'database'  && <DatabaseTab />}
          {activeTab === 'utilities' && <UtilitiesTab />}
        </Suspense>
      </main>

      {/* Bottom tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

export default function App() {
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  )
}
