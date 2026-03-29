import { useState } from 'react'
import type { Lead, LeadStatus } from '../../types'
import { useLeadsDispatch } from '../../store/LeadsContext'
import { supabase } from '../../lib/supabase'
import Button from '../../components/Button'
import { Badge } from '../../components/Badge'
import Input from '../../components/Input'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return '1 month ago'
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? 's' : ''} ago`
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date(new Date().toDateString())
}

function formatFollowUp(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date(new Date().toDateString())
  const diffMs = d.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`
  if (diffDays < 7) return `In ${diffDays} days`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function statusBadgeVariant(status: LeadStatus): 'info' | 'success' | 'danger' {
  if (status === 'Open') return 'info'
  if (status === 'Won') return 'success'
  return 'danger'
}

// ── Inline edit form ─────────────────────────────────────────────────────────

interface EditFormState {
  name: string
  phone: string
  address: string
  pos_type: string
  notes: string
  follow_up: string
}

interface InlineEditProps {
  lead: Lead
  onSave: (updated: Partial<Lead>) => void
  onCancel: () => void
}

function InlineEditForm({ lead, onSave, onCancel }: InlineEditProps) {
  const [form, setForm] = useState<EditFormState>({
    name: lead.name,
    phone: lead.phone ?? '',
    address: lead.address ?? '',
    pos_type: lead.pos_type ?? '',
    notes: lead.notes ?? '',
    follow_up: lead.follow_up ?? '',
  })

  function set(field: keyof EditFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave({
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      pos_type: form.pos_type.trim() || undefined,
      notes: form.notes.trim() || undefined,
      follow_up: form.follow_up || undefined,
    })
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3 pt-2">
      <Input
        label="Name *"
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        autoFocus
      />
      <Input
        label="Phone"
        type="tel"
        value={form.phone}
        onChange={(e) => set('phone', e.target.value)}
      />
      <Input
        label="Address"
        value={form.address}
        onChange={(e) => set('address', e.target.value)}
      />
      <Input
        label="POS Type"
        value={form.pos_type}
        onChange={(e) => set('pos_type', e.target.value)}
      />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600" htmlFor={`notes-${lead.id}`}>
          Notes
        </label>
        <textarea
          id={`notes-${lead.id}`}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          rows={3}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>
      <Input
        label="Follow Up Date"
        type="date"
        value={form.follow_up}
        onChange={(e) => set('follow_up', e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" className="flex-1">
          Save
        </Button>
      </div>
    </form>
  )
}

// ── LeadCard ─────────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead: Lead
}

export default function LeadCard({ lead }: LeadCardProps) {
  const dispatch = useLeadsDispatch()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  async function updateStatus(status: LeadStatus) {
    const label = status === 'Won' ? 'Won' : status === 'Lost' ? 'Lost' : 'Open'
    if (!window.confirm(`Mark this lead as ${label}?`)) return
    setBusy(true)
    const now = new Date().toISOString()
    await supabase
      .from('prospect.leads')
      .update({ status, updated_at: now })
      .eq('id', lead.id)
    dispatch({ type: 'UPDATE_STATUS', id: lead.id, status })
    setBusy(false)
  }

  async function handleDelete() {
    if (!window.confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return
    setBusy(true)
    await supabase.schema('prospect').from('leads').delete().eq('id', lead.id)
    dispatch({ type: 'DELETE', id: lead.id })
  }

  async function handleSaveEdit(updates: Partial<Lead>) {
    setBusy(true)
    const now = new Date().toISOString()
    const updated: Lead = { ...lead, ...updates, updated_at: now }
    await supabase
      .from('prospect.leads')
      .update({ ...updates, updated_at: now })
      .eq('id', lead.id)
    dispatch({ type: 'UPDATE', lead: updated })
    setEditing(false)
    setBusy(false)
  }

  const phone = lead.phone ? formatPhone(lead.phone) : null
  const followUpOverdue = lead.follow_up ? isOverdue(lead.follow_up) : false

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-semibold text-gray-900">{lead.name}</span>
          {lead.last_contact && (
            <span className="text-xs text-gray-400">
              Last contact: {relativeTime(lead.last_contact)}
            </span>
          )}
        </div>
        <Badge variant={statusBadgeVariant(lead.status)}>{lead.status}</Badge>
      </div>

      {/* Won handoff note */}
      {lead.status === 'Won' && (
        <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          Ready for Menu Import — handoff URL wiring coming soon.
        </div>
      )}

      {/* Details */}
      <div className="mt-2 flex flex-col gap-1">
        {phone && (
          <a
            href={`tel:${lead.phone}`}
            className="text-sm text-blue-600 active:opacity-70"
          >
            {phone}
          </a>
        )}
        {lead.address && (
          <span className="text-sm text-gray-600">{lead.address}</span>
        )}
        {lead.pos_type && (
          <span className="text-xs text-gray-500">POS: {lead.pos_type}</span>
        )}
        {lead.follow_up && (
          <span
            className={`text-xs font-medium ${
              followUpOverdue ? 'text-red-600' : 'text-amber-600'
            }`}
          >
            Follow up: {formatFollowUp(lead.follow_up)}
            {followUpOverdue && ' (overdue)'}
          </span>
        )}
        {lead.notes && (
          <div>
            <p
              className={`text-sm text-gray-600 ${expanded ? '' : 'line-clamp-2'}`}
            >
              {lead.notes}
            </p>
            {lead.notes.length > 100 && (
              <button
                className="mt-0.5 text-xs text-blue-500 active:opacity-70"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline edit form */}
      {editing && (
        <InlineEditForm
          lead={lead}
          onSave={handleSaveEdit}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Action buttons */}
      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {phone && (
            <a
              href={`tel:${lead.phone}`}
              className="inline-flex min-h-[36px] items-center rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-200 active:bg-gray-300"
            >
              Call
            </a>
          )}
          {lead.address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-200 active:bg-gray-300"
            >
              Navigate
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="min-h-[36px]"
          >
            Edit
          </Button>
          {lead.status !== 'Won' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateStatus('Won')}
              disabled={busy}
              className="min-h-[36px] text-green-700 hover:bg-green-50"
            >
              Mark Won
            </Button>
          )}
          {lead.status !== 'Lost' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateStatus('Lost')}
              disabled={busy}
              className="min-h-[36px] text-red-600 hover:bg-red-50"
            >
              Mark Lost
            </Button>
          )}
          {lead.status !== 'Open' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateStatus('Open')}
              disabled={busy}
              className="min-h-[36px] text-blue-600 hover:bg-blue-50"
            >
              Reopen
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={busy}
            className="min-h-[36px] text-red-600 hover:bg-red-50"
          >
            Delete
          </Button>
        </div>
      )}
    </div>
  )
}
