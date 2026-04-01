import { useState, lazy, Suspense } from 'react'
import { DataProvider } from './store/DataProvider'
import { FlashProvider } from './hooks/useFlash'
import TabBar from './components/TabBar'
import MigrationBanner from './components/MigrationBanner'
import OfflineBanner from './components/OfflineBanner'
import SyncStatus from './components/SyncStatus'
import type { TabId } from './types'

const LeadsTab    = lazy(() => import('./features/leads/LeadsTab'))
const CanvassTab  = lazy(() => import('./features/canvass/CanvassTab'))
const RouteTab    = lazy(() => import('./features/route/RouteTab'))
const DatabaseTab = lazy(() => import('./features/database/DatabaseTab'))
const UtilitiesTab = lazy(() => import('./features/utilities/UtilitiesTab'))

const BUILD = `v${__APP_VERSION__}`

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('leads')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-[#161b27] px-4 py-2 border-b border-[#1e2535] shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight text-slate-100">
              Restaurant Prospect Tracker
            </h1>
            <p className="text-[10px] text-slate-500">Value Systems · {BUILD}</p>
          </div>
          <SyncStatus />
        </div>
      </header>

      {/* One-time legacy data migration */}
      <MigrationBanner />

      {/* Offline / reconnection banner */}
      <OfflineBanner />

      {/* Tab bar — top, below header */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>}>
          {activeTab === 'leads'     && <LeadsTab />}
          {activeTab === 'canvass'   && <CanvassTab />}
          {activeTab === 'route'     && <RouteTab />}
          {activeTab === 'database'  && <DatabaseTab />}
          {activeTab === 'utilities' && <UtilitiesTab />}
        </Suspense>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <FlashProvider>
      <DataProvider>
        <AppShell />
      </DataProvider>
    </FlashProvider>
  )
}
