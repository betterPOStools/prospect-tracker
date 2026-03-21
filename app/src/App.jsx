import { useState } from 'react'
import { DataProvider, useProspects, useCanvass, useDatabase, useFileSync } from './data/store.jsx'
import { useTheme } from './hooks/useTheme.js'
import DatabaseTab from './features/database/DatabaseTab.jsx'
import CanvassTab  from './features/canvass/CanvassTab.jsx'
import LeadsTab    from './features/leads/LeadsTab.jsx'
import RouteTab    from './features/route/RouteTab.jsx'
import ExportTab   from './features/export/ExportTab.jsx'
import SourcesTab  from './features/sources/SourcesTab.jsx'
import styles from './App.module.css'

const BUILD = '2026-03-21'

const TABS = [
  { id: 'db',      label: 'Database',       badge: 'db' },
  { id: 'canvass', label: 'Canvass',         badge: null },
  { id: 'leads',   label: 'My Leads',        badge: 'leads' },
  { id: 'route',   label: 'Route',           badge: null },
  { id: 'export',  label: 'Export / Import', badge: null },
  { id: 'sources', label: 'Free Sources',    badge: null },
]

function TabBadge({ id }) {
  const prospects   = useProspects()
  const canvass     = useCanvass()
  const { dbRecords } = useDatabase()

  if (id === 'leads') {
    const count = prospects.filter(p => p.status === 'Open').length
    return count > 0 ? <span className={styles.badge}>{count}</span> : null
  }
  if (id === 'db') {
    const count = dbRecords.length
    return count > 0 ? <span className={styles.badge}>{count}</span> : null
  }
  return null
}

function relativeTime(d) {
  if (!d) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 5)  return 'just now'
  if (s < 60) return s + 's ago'
  const m = Math.floor(s / 60)
  return m < 60 ? m + 'm ago' : Math.floor(m / 60) + 'h ago'
}

function AppShell() {
  const { toggleTheme } = useTheme()
  const fileSync = useFileSync()
  const [activeTab, setActiveTab] = useState('canvass')

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
        {fileSync?.linked && (
          <div className={styles.syncStatus}>
            <span className={
              fileSync.status === 'error'  ? styles.dotErr :
              fileSync.status === 'saving' ? styles.dotSaving : styles.dotOk
            } />
            {fileSync.fileName}
            {fileSync.lastSavedAt && <> · {relativeTime(fileSync.lastSavedAt)}</>}
          </div>
        )}
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
          {activeTab === 'db'      && <DatabaseTab />}
          {activeTab === 'canvass' && <CanvassTab />}
          {activeTab === 'leads'   && <LeadsTab />}
          {activeTab === 'route'   && <RouteTab />}
          {activeTab === 'export'  && <ExportTab />}
          {activeTab === 'sources' && <SourcesTab />}
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
