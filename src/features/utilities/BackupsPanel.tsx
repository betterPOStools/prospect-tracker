import { useState, useCallback, useEffect } from 'react'
import { useRecords, useRecordsDispatch } from '../../store/RecordsContext'
import { useLeads, useLeadsDispatch } from '../../store/LeadsContext'
import { useStops, useStopsDispatch } from '../../store/StopsContext'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import type { ProspectRecord, Lead, CanvassStop } from '../../types'

interface Snapshot {
  key: string
  savedAt: string
  recordCount: number
  leadCount: number
  stopCount: number
}

interface SnapshotData {
  records?: ProspectRecord[]
  leads?: Lead[]
  stops?: CanvassStop[]
  savedAt?: string
}

function loadSnapshots(): Snapshot[] {
  const snapshots: Snapshot[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('pt_snapshot_')) continue
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const data = JSON.parse(raw) as SnapshotData
      snapshots.push({
        key,
        savedAt: data.savedAt ?? new Date(parseInt(key.replace('pt_snapshot_', ''))).toISOString(),
        recordCount: data.records?.length ?? 0,
        leadCount: data.leads?.length ?? 0,
        stopCount: data.stops?.length ?? 0,
      })
    } catch {
      // corrupt entry — skip
    }
  }
  return snapshots.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export default function BackupsPanel() {
  const records = useRecords()
  const leads = useLeads()
  const stops = useStops()
  const recordsDispatch = useRecordsDispatch()
  const leadsDispatch = useLeadsDispatch()
  const stopsDispatch = useStopsDispatch()

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [clearModal, setClearModal] = useState(false)

  const refresh = useCallback(() => {
    setSnapshots(loadSnapshots())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleSaveSnapshot = useCallback(() => {
    const key = `pt_snapshot_${Date.now()}`
    const data: SnapshotData = {
      records,
      leads,
      stops,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(key, JSON.stringify(data))
    refresh()
  }, [records, leads, stops, refresh])

  const handleRestore = useCallback(
    (key: string) => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return
        const data = JSON.parse(raw) as SnapshotData
        if (data.records) recordsDispatch({ type: 'SET_ALL', records: data.records })
        if (data.leads) leadsDispatch({ type: 'SET_ALL', leads: data.leads })
        if (data.stops) stopsDispatch({ type: 'SET_ALL', stops: data.stops })
      } catch {
        // parse error — silently fail
      }
      setConfirmKey(null)
    },
    [recordsDispatch, leadsDispatch, stopsDispatch],
  )

  const handleDelete = useCallback(
    (key: string) => {
      localStorage.removeItem(key)
      refresh()
    },
    [refresh],
  )

  const handleClearAll = useCallback(() => {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('pt_snapshot_')) keys.push(key)
    }
    keys.forEach((k) => localStorage.removeItem(k))
    refresh()
    setClearModal(false)
  }, [refresh])

  const confirmSnapshot = snapshots.find((s) => s.key === confirmKey)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Snapshot History</h3>
          <p className="text-xs text-slate-500">Saved locally — not synced to Supabase</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSaveSnapshot}>
            Save Snapshot
          </Button>
          {snapshots.length > 0 && (
            <Button size="sm" variant="danger" onClick={() => setClearModal(true)}>
              Clear All
            </Button>
          )}
        </div>
      </div>

      {snapshots.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No snapshots saved yet. Click "Save Snapshot" to create one.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {snapshots.map((snap) => (
            <div
              key={snap.key}
              className="flex items-center justify-between rounded-xl border border-[#1e2535] bg-[#161b27] p-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-100">
                  {new Date(snap.savedAt).toLocaleString()}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {snap.recordCount} records · {snap.leadCount} leads · {snap.stopCount} stops
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmKey(snap.key)}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleDelete(snap.key)}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Restore confirm modal */}
      <Modal
        open={!!confirmKey}
        onClose={() => setConfirmKey(null)}
        title="Restore Snapshot"
        size="sm"
      >
        {confirmSnapshot && (
          <>
            <p className="mb-4 text-sm text-slate-300">
              Restore snapshot from{' '}
              <strong>{new Date(confirmSnapshot.savedAt).toLocaleString()}</strong>?
              <br />
              This will overwrite current in-memory data ({records.length} records,{' '}
              {leads.length} leads, {stops.length} stops). Supabase is not affected.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => handleRestore(confirmSnapshot.key)}>Yes, Restore</Button>
              <Button variant="secondary" onClick={() => setConfirmKey(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Clear all modal */}
      <Modal
        open={clearModal}
        onClose={() => setClearModal(false)}
        title="Clear All Snapshots"
        size="sm"
      >
        <p className="mb-4 text-sm text-slate-300">
          Delete all {snapshots.length} snapshots from localStorage? This cannot be undone.
        </p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={handleClearAll}>
            Yes, Delete All
          </Button>
          <Button variant="secondary" onClick={() => setClearModal(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}
