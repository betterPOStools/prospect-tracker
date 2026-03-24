import { useState } from 'react'
import { useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import { CANVASS_ACTIVE, FOLLOWUP_STATUSES } from './constants.js'
import StatBar from '../../components/StatBar.jsx'
import Button  from '../../components/Button.jsx'
import TodayPanel    from './TodayPanel.jsx'
import FollowUpPanel from './FollowUpPanel.jsx'
import AllActivePanel from './AllActivePanel.jsx'
import AddStopPanel  from './AddStopPanel.jsx'
import ArchivedPanel from './ArchivedPanel.jsx'
import ConvertModal   from './ConvertModal.jsx'
import BuildRunModal  from './BuildRunModal.jsx'
import styles from './CanvassTab.module.css'

const SUBTABS = [
  { id: 'today',    label: 'Today' },
  { id: 'followup', label: 'Follow Up' },
  { id: 'active',   label: 'All Active' },
  { id: 'add',      label: '+ Add Stop' },
  { id: 'archived', label: 'Archived' },
]

export default function CanvassTab() {
  const canvassStops = useCanvass()
  const canvassDispatch = useCanvassDispatch()
  const [activeTab, setActiveTab]   = useState('today')
  const [converting,   setConverting]   = useState(null)
  const [buildRunStop, setBuildRunStop] = useState(null) // null = closed, false = open (no trigger), stop = open (with trigger)
  const { msg, flash } = useFlashMessage()

  const todayStr   = new Date().toLocaleDateString()
  const todayCnt   = canvassStops.filter(c => c.date === todayStr && CANVASS_ACTIVE.includes(c.status)).length
  const followupCnt = canvassStops.filter(c => c.date !== todayStr && FOLLOWUP_STATUSES.includes(c.status)).length
  const activeCnt  = canvassStops.filter(c => CANVASS_ACTIVE.includes(c.status)).length
  const convertedCnt = canvassStops.filter(c => c.status === 'Converted').length

  const stats = [
    { n: todayCnt,     label: 'Today' },
    { n: followupCnt,  label: 'Follow Up' },
    { n: activeCnt,    label: 'All Active' },
    { n: convertedCnt, label: 'Converted' },
  ]

  function getBadge(id) {
    if (id === 'today')    return todayCnt    || null
    if (id === 'followup') return followupCnt || null
    if (id === 'active')   return activeCnt   || null
    return null
  }

  function handleConverted(name) {
    setConverting(null)
    if (name) flash(`${name} converted to lead.`, 'ok')
  }

  function handleRemoveAll() {
    if (!canvassStops.length) { flash('No stops to remove.', 'err'); return }
    if (!confirm(`Remove all ${canvassStops.length} canvass stops? This cannot be undone.`)) return
    canvassDispatch({ type: '_REPLACE_ALL', items: [] })
    flash(`${canvassStops.length} stops removed.`, 'ok')
  }

  function handleBuildRun(stop) { setBuildRunStop(stop || false) }

  function handleRunBuilt(count) {
    setBuildRunStop(null)
    if (count) {
      flash(`${count} stop${count !== 1 ? 's' : ''} added to today's run.`, 'ok')
      setActiveTab('today')
    }
  }

  return (
    <div>
      <StatBar stats={stats} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
        <Button size="sm" variant="danger" onClick={handleRemoveAll}>Remove All Stops</Button>
      </div>

      <div className={styles.subtabs}>
        {SUBTABS.map(t => {
          const badge = getBadge(t.id)
          return (
            <button
              key={t.id}
              className={[styles.subtab, activeTab === t.id && styles.active].filter(Boolean).join(' ')}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {badge && <span className={styles.badge}>({badge})</span>}
            </button>
          )
        })}
      </div>

      {activeTab === 'today'    && <TodayPanel    onConvert={setConverting} onBuildRun={handleBuildRun} msg={msg} flash={flash} />}
      {activeTab === 'followup' && <FollowUpPanel onConvert={setConverting} onBuildRun={handleBuildRun} />}
      {activeTab === 'active'   && <AllActivePanel onConvert={setConverting} onBuildRun={handleBuildRun} />}
      {activeTab === 'add'      && <AddStopPanel  onAdded={() => setActiveTab('today')} />}
      {activeTab === 'archived' && <ArchivedPanel  onConvert={setConverting} onBuildRun={handleBuildRun} />}

      {converting && <ConvertModal stop={converting} onClose={handleConverted} />}
      {buildRunStop !== null && <BuildRunModal triggerStop={buildRunStop || null} onClose={handleRunBuilt} />}
    </div>
  )
}
