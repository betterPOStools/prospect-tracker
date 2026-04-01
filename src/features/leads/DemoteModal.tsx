import { useState } from 'react'
import type { Lead, CanvassStop, StopStatus } from '../../types'
import { useLeadsDispatch } from '../../store/LeadsContext'
import { useStopsDispatch } from '../../store/StopsContext'
import { useRecordsDispatch } from '../../store/RecordsContext'
import { db } from '../../lib/supabase'
import Modal from '../../components/Modal'
import Button from '../../components/Button'
import Select from '../../components/Select'

// ── Canvass statuses available for demotion ─────────────────────────────────

const CANVASS_STATUS_OPTIONS: { value: StopStatus; label: string }[] = [
  { value: 'come_back_later', label: 'Come back later' },
  { value: 'dm_unavailable', label: 'DM unavailable' },
  { value: 'not_visited', label: 'Not visited' },
]

// ── Props ───────────────────────────────────────────────────────────────────

interface DemoteModalProps {
  open: boolean
  onClose: () => void
  lead: Lead
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DemoteModal({ open, onClose, lead }: DemoteModalProps) {
  const leadsDispatch = useLeadsDispatch()
  const stopsDispatch = useStopsDispatch()
  const recordsDispatch = useRecordsDispatch()

  const [status, setStatus] = useState<StopStatus>('come_back_later')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    setError('')

    const now = new Date().toISOString()

    // Combine lead notes with reason text
    const parts: string[] = []
    if (lead.notes) parts.push(lead.notes)
    if (reason.trim()) parts.push(reason.trim())
    parts.push('Previously a lead')

    const stop: CanvassStop = {
      id: crypto.randomUUID(),
      name: lead.name,
      phone: lead.phone,
      address: lead.address,
      status,
      record_id: lead.record_id,
      created_at: now,
      updated_at: now,
    }

    try {
      // Insert new canvass stop
      const { error: insertErr } = await db.from('canvass_stops').insert({
        id: stop.id,
        name: stop.name,
        phone: stop.phone,
        address: stop.address,
        status: stop.status,
        record_id: stop.record_id,
        created_at: stop.created_at,
        updated_at: stop.updated_at,
      })
      if (insertErr) throw insertErr

      stopsDispatch({ type: 'ADD', stop })

      // Log a system activity on the new stop with combined notes
      const noteText = parts.join(' — ')
      const act = {
        id: crypto.randomUUID(),
        stop_id: stop.id,
        type: 'note' as const,
        text: noteText,
        system: true,
        created_at: now,
      }
      await db.from('activities').insert(act)
      stopsDispatch({ type: 'APPEND_ACTIVITY', stop_id: stop.id, activity: act })

      // Update parent record status if linked
      if (lead.record_id) {
        await db
          .from('records')
          .update({ status: 'in_canvass', updated_at: now })
          .eq('id', lead.record_id)
        recordsDispatch({ type: 'UPDATE_STATUS', id: lead.record_id, status: 'in_canvass' })
      }

      // Delete the lead
      const { error: deleteErr } = await db.from('leads').delete().eq('id', lead.id)
      if (deleteErr) throw deleteErr

      leadsDispatch({ type: 'DELETE', id: lead.id })

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Move Back to Canvass" size="sm">
      <p className="mb-4 text-sm text-slate-400">
        This lead will be moved back to your canvass list as an active stop. All data is preserved.
      </p>

      <Select
        label="Canvass Status"
        options={CANVASS_STATUS_OPTIONS}
        value={status}
        onChange={(e) => setStatus(e.target.value as StopStatus)}
      />

      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor="demote-reason" className="text-xs font-medium text-slate-400">
          Reason / Notes (optional)
        </label>
        <textarea
          id="demote-reason"
          className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 placeholder-slate-500 transition-colors duration-150 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          rows={3}
          placeholder="Why is this lead being moved back?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="ghost"
          className="flex-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 active:bg-amber-500/30"
          onClick={handleConfirm}
          disabled={busy}
        >
          {busy ? 'Moving...' : 'Move to Canvass'}
        </Button>
      </div>
    </Modal>
  )
}
