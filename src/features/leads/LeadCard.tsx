import { useState } from 'react'
import type { Lead, LeadStatus, Activity } from '../../types'
import { useLeadsDispatch } from '../../store/LeadsContext'
import { useRecords } from '../../store/RecordsContext'
import { db } from '../../lib/supabase'
import { openUrl } from '../../lib/platform'
import { useCopper } from '../../hooks/useCopper'
import Button from '../../components/Button'
import { Badge } from '../../components/Badge'
import Input from '../../components/Input'
import AddressAutocomplete from '../../components/AddressAutocomplete'

const MENU_IMPORT_URL = 'https://menu-import-tool.vercel.app/'

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

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

// ── Activity log ─────────────────────────────────────────────────────────────

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
            <span className="shrink-0 text-[10px] text-gray-400">
              {formatTimestamp(act.created_at)}
            </span>
            <span
              className={
                act.system
                  ? 'italic'
                  : act.type === 'call'
                    ? 'text-blue-600'
                    : act.type === 'sms'
                      ? 'text-purple-600'
                      : ''
              }
            >
              {act.type === 'call' && '\u{1F4DE} '}
              {act.type === 'sms' && '\u{1F4AC} '}
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

// ── Inline edit form ─────────────────────────────────────────────────────────

interface EditFormState {
  name: string
  phone: string
  email: string
  address: string
  contact_name: string
  contact_title: string
  pos_type: string
  website: string
  menu_link: string
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
    email: lead.email ?? '',
    address: lead.address ?? '',
    contact_name: lead.contact_name ?? '',
    contact_title: lead.contact_title ?? '',
    pos_type: lead.pos_type ?? '',
    website: lead.website ?? '',
    menu_link: lead.menu_link ?? '',
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
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      contact_name: form.contact_name.trim() || undefined,
      contact_title: form.contact_title.trim() || undefined,
      pos_type: form.pos_type.trim() || undefined,
      website: form.website.trim() || undefined,
      menu_link: form.menu_link.trim() || undefined,
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
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => set('email', e.target.value)}
      />
      <AddressAutocomplete
        label="Address"
        value={form.address}
        onChange={(v) => set('address', v)}
      />
      <Input
        label="Contact Name"
        value={form.contact_name}
        onChange={(e) => set('contact_name', e.target.value)}
      />
      <Input
        label="Contact Title"
        value={form.contact_title}
        onChange={(e) => set('contact_title', e.target.value)}
      />
      <Input
        label="POS Type"
        value={form.pos_type}
        onChange={(e) => set('pos_type', e.target.value)}
      />
      <Input
        label="Website"
        type="url"
        value={form.website}
        onChange={(e) => set('website', e.target.value)}
      />
      <Input
        label="Menu Link"
        type="url"
        value={form.menu_link}
        onChange={(e) => set('menu_link', e.target.value)}
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
  const records = useRecords()
  const { configured: copperConfigured, pushing: copperPushing, error: copperError, pushLead: copperPush } = useCopper()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [error, setError] = useState('')

  const linkedRecord = lead.record_id ? records.find((r) => r.id === lead.record_id) : undefined
  const activities = lead.activities ?? []
  const phone = lead.phone ? formatPhone(lead.phone) : null
  const email = lead.email || linkedRecord?.email
  const contactName = lead.contact_name || linkedRecord?.contact_name
  const contactTitle = lead.contact_title || linkedRecord?.contact_title
  const website = lead.website || linkedRecord?.website
  const menuLink = lead.menu_link || linkedRecord?.menu_link
  const followUpOverdue = lead.follow_up ? isOverdue(lead.follow_up) : false

  function openInMenuImport() {
    const params = new URLSearchParams({ name: lead.name })
    const link = menuLink || website
    if (link) params.set('url', link)
    openUrl(MENU_IMPORT_URL + '?' + params.toString())
  }

  async function logActivity(type: 'call' | 'sms' | 'note', text: string) {
    const now = new Date().toISOString()
    const act: Activity = {
      id: crypto.randomUUID(),
      lead_id: lead.id,
      type,
      text,
      system: false,
      created_at: now,
    }

    // Optimistic local update
    dispatch({ type: 'APPEND_ACTIVITY', lead_id: lead.id, activity: act })

    // Persist activity
    await db.from('activities').insert(act)

    // Update last_contact
    await db
      .from('leads')
      .update({ last_contact: now, updated_at: now })
      .eq('id', lead.id)
    dispatch({ type: 'UPDATE', lead: { ...lead, last_contact: now, updated_at: now } })
  }

  function handleCall() {
    if (lead.phone) {
      logActivity('call', `Called ${formatPhone(lead.phone)}`)
    }
  }

  function handleText() {
    if (lead.phone) {
      logActivity('sms', `Texted ${formatPhone(lead.phone)}`)
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    const text = noteText.trim()
    if (!text) return

    setSubmittingNote(true)
    setError('')

    try {
      await logActivity('note', text)
      setNoteText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note')
    } finally {
      setSubmittingNote(false)
    }
  }

  async function updateStatus(status: LeadStatus) {
    const label = status === 'Won' ? 'Won' : status === 'Lost' ? 'Lost' : 'Open'
    if (!window.confirm(`Mark this lead as ${label}?`)) return
    setBusy(true)
    const now = new Date().toISOString()
    await db
      .from('leads')
      .update({ status, updated_at: now, last_contact: now })
      .eq('id', lead.id)
    dispatch({ type: 'UPDATE_STATUS', id: lead.id, status })

    // Log status change as system activity
    const act: Activity = {
      id: crypto.randomUUID(),
      lead_id: lead.id,
      type: 'status_change',
      text: `Status changed to ${label}`,
      system: true,
      created_at: now,
    }
    await db.from('activities').insert(act)
    dispatch({ type: 'APPEND_ACTIVITY', lead_id: lead.id, activity: act })

    setBusy(false)
  }

  async function handleDelete() {
    if (!window.confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return
    setBusy(true)
    await db.from('leads').delete().eq('id', lead.id)
    dispatch({ type: 'DELETE', id: lead.id })
  }

  async function handleSaveEdit(updates: Partial<Lead>) {
    setBusy(true)
    const now = new Date().toISOString()
    const updated: Lead = { ...lead, ...updates, updated_at: now }
    await db
      .from('leads')
      .update({ ...updates, updated_at: now })
      .eq('id', lead.id)
    dispatch({ type: 'UPDATE', lead: updated })
    setEditing(false)
    setBusy(false)
  }

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-semibold text-gray-900">{lead.name}</span>
          {contactName && (
            <span className="text-xs text-gray-500">
              {contactName}{contactTitle ? ` (${contactTitle})` : ''}
            </span>
          )}
        </div>
        <Badge variant={statusBadgeVariant(lead.status)}>{lead.status}</Badge>
      </div>

      {/* Won handoff */}
      {lead.status === 'Won' && (
        <button
          onClick={openInMenuImport}
          className="mt-2 w-full rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 active:bg-green-800"
        >
          Open in Menu Import →
        </button>
      )}

      {/* Details */}
      <div className="mt-2 flex flex-col gap-1">
        {lead.address && (
          <span className="text-sm text-gray-600">{lead.address}</span>
        )}
        {phone && (
          <a href={`tel:${lead.phone}`} className="text-sm text-blue-600 active:opacity-70">
            {phone}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="text-sm text-blue-600 active:opacity-70">
            {email}
          </a>
        )}
        {lead.pos_type && (
          <span className="text-xs text-gray-500">POS: {lead.pos_type}</span>
        )}
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline active:opacity-70"
          >
            {website}
          </a>
        )}
        {menuLink && menuLink !== website && (
          <a
            href={menuLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline active:opacity-70"
          >
            View menu
          </a>
        )}
        {lead.notes && (
          <div>
            <p className={`text-sm italic text-gray-600 ${expanded ? '' : 'line-clamp-2'}`}>
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

      {/* Timestamps */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
        {lead.follow_up && (
          <span className={followUpOverdue ? 'font-medium text-red-500' : 'text-amber-600'}>
            Follow up: {formatFollowUp(lead.follow_up)}
            {followUpOverdue && ' (overdue)'}
          </span>
        )}
        {lead.last_contact && (
          <span>Last contact: {relativeTime(lead.last_contact)}</span>
        )}
        <span>Added: {new Date(lead.created_at).toLocaleDateString()}</span>
      </div>

      {/* Activity log */}
      <ActivityLog activities={activities} />

      {/* Error */}
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
      )}

      {/* Note input */}
      {!editing && (
        <form onSubmit={handleAddNote} className="mt-2 flex gap-1.5">
          <input
            type="text"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Add a note..."
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
            {submittingNote ? '...' : 'Add'}
          </Button>
        </form>
      )}

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
        <div className="mt-2 flex flex-wrap gap-2">
          {phone && (
            <a
              href={`tel:${lead.phone}`}
              onClick={handleCall}
              className="inline-flex min-h-[36px] items-center rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 active:bg-blue-200"
            >
              Call
            </a>
          )}
          {phone && (
            <a
              href={`sms:${lead.phone}`}
              onClick={handleText}
              className="inline-flex min-h-[36px] items-center rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 active:bg-purple-200"
            >
              Text
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
          {copperConfigured && (
            lead.copper_opportunity_id ? (
              <span className="inline-flex min-h-[36px] items-center px-3 py-1.5 text-xs font-medium text-green-600">
                Synced to Copper
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copperPush(lead, linkedRecord ?? undefined)}
                disabled={busy || copperPushing}
                className="min-h-[36px] text-orange-600 hover:bg-orange-50"
              >
                {copperPushing ? 'Pushing...' : 'Push to Copper'}
              </Button>
            )
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
      {copperError && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {copperError}
        </p>
      )}
    </div>
  )
}
