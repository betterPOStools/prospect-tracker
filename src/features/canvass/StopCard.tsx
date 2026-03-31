import { useState } from 'react'
import type { CanvassStop, StopStatus, Activity, Lead, RecordStatus } from '../../types'
import { useStopsDispatch } from '../../store/StopsContext'
import { useLeadsDispatch } from '../../store/LeadsContext'
import { useRecords } from '../../store/RecordsContext'
import { useRecordsDispatch } from '../../store/RecordsContext'
import { supabase, db } from '../../lib/supabase'
import { isNative } from '../../lib/platform'
import { addToBlocklist } from '../../data/blocklist'
import { Badge } from '../../components/Badge'
import Button from '../../components/Button'
import HoursChip from '../../components/HoursChip'
import Modal from '../../components/Modal'

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function isOverdue(dateStr?: string): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

function openMaps(address: string) {
  const encoded = encodeURIComponent(address)
  const url = `https://maps.google.com/?q=${encoded}`
  if (isNative) {
    window.open(url, '_system')
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<StopStatus, string> = {
  queued: 'Not visited',
  not_visited: 'Not visited',
  come_back_later: 'Come back later',
  dm_unavailable: 'DM unavailable',
  canvassed: 'Canvassed',
  converted: 'Converted',
  dropped: 'Dropped',
}

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

const STATUS_BADGE_VARIANT: Record<StopStatus, BadgeVariant> = {
  queued: 'default',
  not_visited: 'default',
  come_back_later: 'warning',
  dm_unavailable: 'warning',
  canvassed: 'success',
  converted: 'info',
  dropped: 'danger',
}

// ── Activity log ──────────────────────────────────────────────────────────────

function ActivityLog({ activities }: { activities: Activity[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!activities.length) return null

  const shown = expanded ? activities : activities.slice(-3)

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <div className="flex flex-col gap-1">
        {!expanded && activities.length > 3 && (
          <button
            className="text-left text-xs text-blue-600 hover:underline"
            onClick={() => setExpanded(true)}
          >
            Show {activities.length - 3} more
          </button>
        )}
        {shown.map((act) => (
          <div key={act.id} className="flex items-start gap-2 text-xs text-gray-500">
            <span className="shrink-0 text-[10px] text-gray-400">{relativeTime(act.created_at)}</span>
            <span className={act.system ? 'italic' : ''}>
              {act.text ?? act.type}
            </span>
          </div>
        ))}
        {expanded && activities.length > 3 && (
          <button
            className="text-left text-xs text-blue-600 hover:underline"
            onClick={() => setExpanded(false)}
          >
            Show less
          </button>
        )}
      </div>
    </div>
  )
}

// ── Removal reasons ─────────────────────────────────────────────────────────

interface RemovalReason {
  label: string
  /** Status to set on the parent record, or null for no change */
  recordStatus: RecordStatus | null
  /** Whether to add the stop name to the blocklist */
  blocklist: boolean
}

const REMOVAL_REASONS: RemovalReason[] = [
  { label: 'Permanently closed', recordStatus: 'canvassed', blocklist: true },
  { label: 'Incorrect address', recordStatus: 'canvassed', blocklist: false },
  { label: 'Duplicate', recordStatus: 'canvassed', blocklist: false },
  { label: 'Wrong business type', recordStatus: 'canvassed', blocklist: true },
  { label: 'Already a customer', recordStatus: 'converted', blocklist: false },
  { label: 'Not interested', recordStatus: 'canvassed', blocklist: false },
  { label: 'Just remove', recordStatus: null, blocklist: false },
]

// ── Props ────────────────────────────────────────────────────────────────────

interface StopCardProps {
  stop: CanvassStop
  readOnly?: boolean
  showOverdue?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StopCard({ stop, readOnly = false, showOverdue = false }: StopCardProps) {
  const dispatch = useStopsDispatch()
  const leadsDispatch = useLeadsDispatch()
  const records = useRecords()
  const recordsDispatch = useRecordsDispatch()

  const [noteText, setNoteText] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [converting, setConverting] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [error, setError] = useState('')

  const parentRecord = stop.record_id ? records.find((r) => r.id === stop.record_id) : undefined

  const activities = stop.activities ?? []
  const overdue = showOverdue && isOverdue(stop.follow_up_date)

  async function updateStatus(status: StopStatus) {
    const now = new Date().toISOString()
    setError('')

    // Optimistic update
    dispatch({ type: 'UPDATE_STATUS', id: stop.id, status })

    const { error: err } = await db
      .from('canvass_stops')
      .update({ status, updated_at: now })
      .eq('id', stop.id)

    if (err) {
      setError(err.message)
      // Roll back
      dispatch({ type: 'UPDATE_STATUS', id: stop.id, status: stop.status })
    }

    // Log system activity
    const act: Activity = {
      id: crypto.randomUUID(),
      stop_id: stop.id,
      type: 'status_change',
      text: `Status changed to ${STATUS_LABELS[status]}`,
      system: true,
      created_at: now,
    }
    await db.from('activities').insert(act)
    dispatch({ type: 'APPEND_ACTIVITY', stop_id: stop.id, activity: act })
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    const text = noteText.trim()
    if (!text) return

    setSubmittingNote(true)
    setError('')

    const act: Activity = {
      id: crypto.randomUUID(),
      stop_id: stop.id,
      type: 'note',
      text,
      system: false,
      created_at: new Date().toISOString(),
    }

    const { error: err } = await db.from('activities').insert(act)
    if (err) {
      setError(err.message)
    } else {
      dispatch({ type: 'APPEND_ACTIVITY', stop_id: stop.id, activity: act })
      setNoteText('')
    }
    setSubmittingNote(false)
  }

  async function handleConvertToLead() {
    if (converting) return
    setConverting(true)
    setError('')

    const now = new Date().toISOString()
    const lead: Lead = {
      id: crypto.randomUUID(),
      name: stop.name,
      status: 'Open',
      phone: stop.phone,
      email: parentRecord?.email,
      address: stop.address,
      contact_name: parentRecord?.contact_name,
      contact_title: parentRecord?.contact_title,
      website: parentRecord?.website,
      menu_link: parentRecord?.menu_link,
      record_id: stop.record_id,
      created_at: now,
      updated_at: now,
    }

    const { error: leadErr } = await db.from('leads').insert(lead)
    if (leadErr) {
      setError(leadErr.message)
      setConverting(false)
      return
    }

    leadsDispatch({ type: 'ADD', lead })

    // Update stop to converted
    const { error: stopErr } = await db
      .from('canvass_stops')
      .update({ status: 'converted', updated_at: now })
      .eq('id', stop.id)

    if (stopErr) {
      setError(stopErr.message)
      setConverting(false)
      return
    }

    dispatch({ type: 'UPDATE_STATUS', id: stop.id, status: 'converted' })

    // Update parent record status if record_id exists
    if (stop.record_id) {
      await db
        .from('records')
        .update({ status: 'converted', updated_at: now })
        .eq('id', stop.record_id)
    }

    // Log system activity
    const act: Activity = {
      id: crypto.randomUUID(),
      stop_id: stop.id,
      type: 'status_change',
      text: 'Converted to lead',
      system: true,
      created_at: now,
    }
    await db.from('activities').insert(act)
    dispatch({ type: 'APPEND_ACTIVITY', stop_id: stop.id, activity: act })

    setConverting(false)
  }

  async function handleDrop() {
    if (!confirm(`Drop "${stop.name}" from the queue?`)) return
    setDropping(true)
    setError('')

    const now = new Date().toISOString()
    const { error: err } = await db
      .from('canvass_stops')
      .update({ status: 'dropped', updated_at: now })
      .eq('id', stop.id)

    if (err) {
      setError(err.message)
      setDropping(false)
      return
    }

    dispatch({ type: 'UPDATE_STATUS', id: stop.id, status: 'dropped' })

    // Increment dropped_count on parent record
    if (stop.record_id) {
      await supabase.rpc('increment_dropped_count', { record_id: stop.record_id })
    }

    setDropping(false)
  }

  async function handleRemoveWithReason(reason: RemovalReason) {
    setShowRemoveModal(false)
    setRemoving(true)
    setError('')

    const now = new Date().toISOString()

    // 1. Delete the canvass stop
    const { error: err } = await db
      .from('canvass_stops')
      .delete()
      .eq('id', stop.id)

    if (err) {
      setError(err.message)
      setRemoving(false)
      return
    }

    dispatch({ type: 'DELETE', id: stop.id })

    // 2. Update parent record status if applicable
    if (stop.record_id && reason.recordStatus) {
      const { error: recErr } = await db
        .from('records')
        .update({ status: reason.recordStatus, updated_at: now })
        .eq('id', stop.record_id)

      if (!recErr) {
        recordsDispatch({ type: 'UPDATE_STATUS', id: stop.record_id, status: reason.recordStatus })
      }
    }

    // 3. Add to blocklist if needed
    if (reason.blocklist) {
      addToBlocklist(stop.name)
    }

    // 4. Log system activity
    const act: Activity = {
      id: crypto.randomUUID(),
      stop_id: stop.id,
      type: 'status_change',
      text: `Removed: ${reason.label}`,
      system: true,
      created_at: now,
    }
    await db.from('activities').insert(act)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-gray-900">{stop.name}</span>
            {stop.group && (
              <Badge variant="default">{stop.group}</Badge>
            )}
          </div>
          {stop.address && (
            <p className="mt-0.5 text-xs text-gray-500 truncate">{stop.address}</p>
          )}
          {stop.phone && (
            <a
              href={`tel:${stop.phone}`}
              className="mt-0.5 block text-xs text-blue-600 hover:underline"
            >
              {stop.phone}
            </a>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <Badge variant={STATUS_BADGE_VARIANT[stop.status]}>
            {STATUS_LABELS[stop.status]}
          </Badge>
          <HoursChip workingHours={parentRecord?.working_hours} />
          {overdue && <Badge variant="danger">Overdue</Badge>}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
        {stop.last_contact && (
          <span>Last contact: {relativeTime(stop.last_contact)}</span>
        )}
        {stop.follow_up_date && (
          <span className={isOverdue(stop.follow_up_date) ? 'text-red-500 font-medium' : ''}>
            Follow up: {stop.follow_up_date}
          </span>
        )}
      </div>

      {/* Activity log */}
      <ActivityLog activities={activities} />

      {/* Error */}
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
      )}

      {/* Note input (not in readOnly mode) */}
      {!readOnly && (
        <form onSubmit={handleAddNote} className="mt-2 flex gap-1.5">
          <input
            type="text"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Add a note…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={!noteText.trim() || submittingNote}
            className="shrink-0"
          >
            {submittingNote ? '…' : 'Add'}
          </Button>
        </form>
      )}

      {/* Action buttons */}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-1">
          {/* Navigate */}
          {stop.address && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openMaps(stop.address!)}
              title="Open in Maps"
            >
              Navigate
            </Button>
          )}

          {/* Status dropdown */}
          <select
            value={stop.status}
            onChange={(e) => updateStatus(e.target.value as StopStatus)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="queued">Not Visited</option>
            <option value="come_back_later">Come Back Later</option>
            <option value="dm_unavailable">DM Unavailable</option>
            <option value="canvassed">Canvassed</option>
            <option value="converted">Converted</option>
          </select>

          {/* Convert to Lead (only if not already converted) */}
          {stop.status !== 'converted' && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleConvertToLead}
              disabled={converting}
            >
              {converting ? 'Converting…' : 'Convert to Lead'}
            </Button>
          )}

          {/* Drop rank */}
          <Button
            size="sm"
            variant="danger"
            onClick={handleDrop}
            disabled={dropping}
          >
            {dropping ? 'Updating…' : '↓ Rank'}
          </Button>

          {/* Remove */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowRemoveModal(true)}
            disabled={removing}
          >
            {removing ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      )}

      {/* Removal reason modal */}
      <Modal open={showRemoveModal} onClose={() => setShowRemoveModal(false)} title="Remove Stop" size="sm">
        <p className="mb-3 text-sm text-gray-600">
          Why are you removing <span className="font-medium text-gray-900">{stop.name}</span>?
        </p>
        <div className="flex flex-col gap-2">
          {REMOVAL_REASONS.map((reason) => (
            <button
              key={reason.label}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100"
              onClick={() => handleRemoveWithReason(reason)}
            >
              <span>{reason.label}</span>
              {reason.blocklist && (
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                  + blocklist
                </span>
              )}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
