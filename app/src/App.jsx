import { useState, useEffect, memo, useMemo } from 'react'
import { DataProvider, useProspects, useDatabase, useFileSync, useLastSave, useSupabaseSyncCtx } from './data/store.jsx'
import { useTheme } from './hooks/useTheme.js'
import DatabaseTab from './features/database/DatabaseTab.jsx'
import CanvassTab  from './features/canvass/CanvassTab.jsx'
import LeadsTab    from './features/leads/LeadsTab.jsx'
import RouteTab    from './features/route/RouteTab.jsx'
import ExportTab   from './features/export/ExportTab.jsx'
import styles from './App.module.css'

const BUILD = '2026-03-24 20:00'

const TABS = [
  { id: 'leads',   label: 'My Leads',   badge: 'leads' },
  { id: 'canvass', label: 'Canvass',    badge: null },
  { id: 'route',   label: 'Route',      badge: null },
  { id: 'db',      label: 'Database',   badge: 'db' },
  { id: 'export',  label: 'Utilities',  badge: null },
]

const TabBadge = memo(function TabBadge({ id }) {
  const prospects     = useProspects()
  const { dbRecords } = useDatabase()

  const count = useMemo(() => {
    if (id === 'leads')  return prospects.filter(p => p.status === 'Open').length
    if (id === 'db')     return dbRecords.length
    return 0
  }, [id, prospects, dbRecords])

  return count > 0 ? <span className={styles.badge}>{count}</span> : null
})

function relativeTime(d) {
  if (!d) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 5)  return 'just now'
  if (s < 60) return s + 's ago'
  const m = Math.floor(s / 60)
  return m < 60 ? m + 'm ago' : Math.floor(m / 60) + 'h ago'
}

function SaveIndicator() {
  const fileSync      = useFileSync()
  const supabaseSync  = useSupabaseSyncCtx()
  const lastSave      = useLastSave()
  const [, setTick]   = useState(0)

  // Re-render every 15s so relative timestamps stay fresh
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15000)
    return () => clearInterval(id)
  }, [])

  if (fileSync?.status === 'error') {
    return (
      <div className={styles.syncStatus}>
        <span className={styles.dotErr} />
        <span>Save error</span>
      </div>
    )
  }

  if (fileSync?.linked) {
    const isSaving = fileSync.status === 'saving'
    return (
      <div className={styles.syncStatus}>
        <span className={isSaving ? styles.dotSaving : styles.dotOk} />
        <span>{isSaving ? 'Saving…' : fileSync.fileName}</span>
        {!isSaving && fileSync.lastSavedAt && <span> · {relativeTime(fileSync.lastSavedAt)}</span>}
      </div>
    )
  }

  // No file linked — show Supabase sync status if enabled
  if (supabaseSync?.enabled) {
    const isSyncing = supabaseSync.status === 'syncing'
    const isError   = supabaseSync.status === 'error'
    return (
      <div className={styles.syncStatus}>
        <span className={isSyncing ? styles.dotSaving : isError ? styles.dotErr : styles.dotOk} />
        <span>
          {isSyncing ? 'Syncing…'
           : isError  ? 'Sync error'
           : supabaseSync.lastSyncAt ? `Cloud · ${relativeTime(supabaseSync.lastSyncAt)}`
           : 'Cloud sync ready'}
        </span>
      </div>
    )
  }

  // Fallback — localStorage only
  return (
    <div className={styles.syncStatus}>
      <span className={lastSave ? styles.dotOk : styles.dotDim} />
      <span>{lastSave ? `Saved · ${relativeTime(lastSave)}` : 'No changes yet'}</span>
    </div>
  )
}

function AppShell() {
  const { toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('leads')

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Restaurant Prospect Tracker</h1>
          <p>
            Value Systems &nbsp;·&nbsp;{' '}
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
              Build {BUILD}
            </span>
          </p>
        </div>
        <SaveIndicator />
        <button className={styles.themeBtn} onClick={toggleTheme} aria-label="Toggle light/dark theme">☀ / ☾</button>
      </div>

      <div className={styles.shell}>
        <div className={styles.tabs} role="tablist" aria-label="Main navigation">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={[styles.tab, activeTab === tab.id && styles.active].filter(Boolean).join(' ')}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.badge && <TabBadge id={tab.badge} />}
            </button>
          ))}
        </div>

        <div className={styles.panel} role="tabpanel">
          {activeTab === 'leads'   && <LeadsTab />}
          {activeTab === 'canvass' && <CanvassTab />}
          {activeTab === 'route'   && <RouteTab />}
          {activeTab === 'db'      && <DatabaseTab />}
          {activeTab === 'export'  && <ExportTab />}
        </div>
      </div>
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
