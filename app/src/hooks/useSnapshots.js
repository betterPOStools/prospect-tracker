import { useProspects, useCanvass, useDatabase, useProspectsDispatch, useCanvassDispatch, useDatabaseDispatch } from '../data/store.jsx'
import { loadSnapshots, saveSnapshots } from '../data/storage.js'

const MAX_SNAPSHOTS = 5

function getAge(date) {
  const mins = Math.floor((new Date() - date) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return hrs + 'h ago'
  return Math.floor(hrs / 24) + 'd ago'
}

export function useSnapshots() {
  const prospects   = useProspects()
  const canvass     = useCanvass()
  const db          = useDatabase()
  const pDispatch   = useProspectsDispatch()
  const cDispatch   = useCanvassDispatch()
  const dbDispatch  = useDatabaseDispatch()

  function takeSnapshot(reason) {
    const hasData = db.dbRecords.length > 0 || prospects.length > 0 || canvass.length > 0
    if (!hasData) return false

    const now   = new Date()
    const label = reason === 'manual'     ? 'Manual save'       :
                  reason === 'pre-import' ? 'Before import'     :
                  reason === 'pre-clear'  ? 'Before clear'      : reason

    const snap = {
      ts:       now.toISOString(),
      label,
      records:  db.dbRecords.length,
      clusters: db.dbClusters.length,
      leads:    prospects.length,
      canvass:  canvass.length,
      areas:    [...new Set(db.dbRecords.map(r => r.ar).filter(Boolean))].join(', '),
      data: {
        dbRecords:    JSON.parse(JSON.stringify(db.dbRecords)),
        dbClusters:   JSON.parse(JSON.stringify(db.dbClusters)),
        dbAreas:      [...db.dbAreas],
        dbBlocklist:  [...db.dbBlocklist],
        prospects:    JSON.parse(JSON.stringify(prospects)),
        canvassStops: JSON.parse(JSON.stringify(canvass)),
      }
    }

    const snaps = loadSnapshots()
    snaps.unshift(snap)
    while (snaps.length > MAX_SNAPSHOTS) snaps.pop()
    saveSnapshots(snaps)
    return true
  }

  function restoreSnapshot(idx) {
    const snaps = loadSnapshots()
    const snap  = snaps[idx]
    if (!snap) return false

    const ts = new Date(snap.ts).toLocaleString()
    if (!confirm(
      `Restore snapshot from ${ts}?\n\n` +
      `${snap.records} DB records, ${snap.clusters} zones, ${snap.leads || 0} leads, ${snap.canvass || 0} canvass stops` +
      `${snap.areas ? '\nAreas: ' + snap.areas : ''}` +
      '\n\nAll current data will be replaced. Your current state is auto-saved first.'
    )) return false

    // Save current state before replacing
    takeSnapshot(`pre-restore (${ts})`)

    dbDispatch({ type: 'RESTORE_SNAPSHOT', ...snap.data })
    if (Array.isArray(snap.data.prospects))    pDispatch({ type: 'IMPORT_MERGE', incoming: snap.data.prospects })
    if (Array.isArray(snap.data.canvassStops)) cDispatch({ type: 'IMPORT_MERGE', incoming: snap.data.canvassStops })

    // Full replace for prospects/canvass (not just merge — snapshot is authoritative)
    // Re-dispatch with DELETE_ALL then re-add
    // Simpler: use a direct replacement action
    pDispatch({ type: '_REPLACE_ALL', items: snap.data.prospects || [] })
    cDispatch({ type: '_REPLACE_ALL', items: snap.data.canvassStops || [] })

    return true
  }

  function deleteSnapshot(idx) {
    const snaps = loadSnapshots()
    snaps.splice(idx, 1)
    saveSnapshots(snaps)
  }

  function getSnapshots() {
    return loadSnapshots().map((s, i) => ({
      ...s,
      idx: i,
      age: getAge(new Date(s.ts)),
      size: Math.round(JSON.stringify(s.data).length / 1024),
    }))
  }

  return { takeSnapshot, restoreSnapshot, deleteSnapshot, getSnapshots }
}
