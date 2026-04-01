import { useState } from 'react'
import type { ProspectRecord, Priority, RecordStatus } from '../../types'
import { PRIORITIES, DAYS } from '../../types'
import { useRecordsDispatch } from '../../store/RecordsContext'
import { db } from '../../lib/supabase'
import Modal from '../../components/Modal'
import Button from '../../components/Button'
import { PriorityBadge, Badge } from '../../components/Badge'
import Input from '../../components/Input'
import AddressAutocomplete from '../../components/AddressAutocomplete'
import Select from '../../components/Select'

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: RecordStatus): 'default' | 'info' | 'warning' | 'success' | 'danger' {
  switch (status) {
    case 'unworked': return 'default'
    case 'in_canvass': return 'info'
    case 'canvassed': return 'warning'
    case 'converted': return 'success'
    case 'on_hold': return 'danger'
  }
}

function statusLabel(status: RecordStatus): string {
  switch (status) {
    case 'unworked': return 'Unworked'
    case 'in_canvass': return 'In Canvass'
    case 'canvassed': return 'Canvassed'
    case 'converted': return 'Converted'
    case 'on_hold': return 'On Hold'
  }
}

// ── View mode ────────────────────────────────────────────────────────────────

function RecordView({
  record,
  onEdit,
}: {
  record: ProspectRecord
  onEdit: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{record.name}</h3>
          {record.type && <p className="text-xs text-gray-500">{record.type}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PriorityBadge priority={record.priority} score={record.score} />
          <Badge variant={statusVariant(record.status)}>{statusLabel(record.status)}</Badge>
        </div>
      </div>

      {/* Contact info */}
      <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 text-sm">
        {record.address && <p className="text-gray-700">{record.address}</p>}
        {(record.city || record.zip) && (
          <p className="text-gray-500 text-xs">
            {[record.city, record.zip].filter(Boolean).join(', ')}
          </p>
        )}
        {record.phone && (
          <a href={`tel:${record.phone}`} className="block text-blue-600 hover:underline">
            {record.phone}
          </a>
        )}
        {record.email && (
          <a href={`mailto:${record.email}`} className="block text-blue-600 hover:underline truncate">
            {record.email}
          </a>
        )}
        {record.website && (
          <a
            href={record.website}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:underline truncate"
          >
            {record.website}
          </a>
        )}
        {record.menu_link && (
          <a
            href={record.menu_link}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:underline truncate text-xs"
          >
            Menu link
          </a>
        )}
      </div>

      {/* Ratings */}
      {(record.rating !== undefined || record.reviews !== undefined) && (
        <div className="flex gap-4 text-sm">
          {record.rating !== undefined && (
            <span className="text-gray-600">
              <span className="font-medium">{record.rating}</span> stars
            </span>
          )}
          {record.reviews !== undefined && (
            <span className="text-gray-600">
              <span className="font-medium">{record.reviews}</span> reviews
            </span>
          )}
        </div>
      )}

      {/* Contact person */}
      {(record.contact_name || record.contact_title) && (
        <div className="text-sm">
          {record.contact_name && (
            <p className="font-medium text-gray-800">{record.contact_name}</p>
          )}
          {record.contact_title && (
            <p className="text-gray-500 text-xs">{record.contact_title}</p>
          )}
        </div>
      )}

      {/* Assignment row */}
      <div className="flex flex-wrap gap-2 text-xs">
        {record.area && (
          <Badge variant="default">Area: {record.area}</Badge>
        )}
        {record.day && (
          <Badge variant="info">Day: {record.day}</Badge>
        )}
        {record.group && (
          <Badge variant="default">Group: {record.group}</Badge>
        )}
        {record.is_chain && (
          <Badge variant="warning">Chain</Badge>
        )}
      </div>

      {/* Social */}
      {(record.facebook || record.instagram) && (
        <div className="flex gap-3 text-sm">
          {record.facebook && (
            <a
              href={record.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Facebook
            </a>
          )}
          {record.instagram && (
            <a
              href={record.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Instagram
            </a>
          )}
        </div>
      )}

      {/* Business details */}
      {(record.employees || record.revenue || record.naics_description) && (
        <div className="rounded-lg bg-gray-50 p-3 space-y-1 text-xs text-gray-600">
          {record.employees && <p>Employees: {record.employees}</p>}
          {record.revenue && <p>Revenue: {record.revenue}</p>}
          {record.naics_description && (
            <p>Industry: {record.naics_description}</p>
          )}
        </div>
      )}

      {/* Notes */}
      {record.notes && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.notes}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-gray-400 space-y-0.5">
        {record.dropped_count > 0 && (
          <p>Dropped {record.dropped_count} time{record.dropped_count !== 1 ? 's' : ''}</p>
        )}
        <p>Created: {new Date(record.created_at).toLocaleDateString()}</p>
        <p>Updated: {new Date(record.updated_at).toLocaleDateString()}</p>
      </div>

      <Button variant="secondary" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  )
}

// ── Edit form ────────────────────────────────────────────────────────────────

interface EditForm {
  name: string
  type: string
  address: string
  city: string
  zip: string
  phone: string
  email: string
  website: string
  menu_link: string
  priority: Priority
  status: RecordStatus
  area: string
  day: string
  group: string
  contact_name: string
  contact_title: string
  facebook: string
  instagram: string
  employees: string
  revenue: string
  naics_code: string
  naics_description: string
  notes: string
  is_chain: boolean
}

function toEditForm(r: ProspectRecord): EditForm {
  return {
    name: r.name,
    type: r.type ?? '',
    address: r.address ?? '',
    city: r.city ?? '',
    zip: r.zip ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    website: r.website ?? '',
    menu_link: r.menu_link ?? '',
    priority: r.priority,
    status: r.status,
    area: r.area ?? '',
    day: r.day ?? '',
    group: r.group ?? '',
    contact_name: r.contact_name ?? '',
    contact_title: r.contact_title ?? '',
    facebook: r.facebook ?? '',
    instagram: r.instagram ?? '',
    employees: r.employees ?? '',
    revenue: r.revenue ?? '',
    naics_code: r.naics_code ?? '',
    naics_description: r.naics_description ?? '',
    notes: r.notes ?? '',
    is_chain: r.is_chain,
  }
}

const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ value: p, label: p }))

const STATUS_OPTIONS: { value: RecordStatus; label: string }[] = [
  { value: 'unworked', label: 'Unworked' },
  { value: 'in_canvass', label: 'In Canvass' },
  { value: 'canvassed', label: 'Canvassed' },
  { value: 'converted', label: 'Converted' },
  { value: 'on_hold', label: 'On Hold' },
]

const DAY_OPTIONS = [
  { value: '', label: 'No day' },
  ...DAYS.map((d) => ({ value: d, label: d })),
]

function RecordEditForm({
  record,
  onCancel,
  onSaved,
  onDeleted,
}: {
  record: ProspectRecord
  onCancel: () => void
  onSaved: (updated: ProspectRecord) => void
  onDeleted: () => void
}) {
  const [form, setForm] = useState<EditForm>(toEditForm(record))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    const now = new Date().toISOString()
    const patch: Partial<ProspectRecord> = {
      name: form.name.trim(),
      type: form.type || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      zip: form.zip || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      website: form.website || undefined,
      menu_link: form.menu_link || undefined,
      priority: form.priority,
      status: form.status,
      area: form.area || undefined,
      day: form.day || undefined,
      group: form.group || undefined,
      contact_name: form.contact_name || undefined,
      contact_title: form.contact_title || undefined,
      facebook: form.facebook || undefined,
      instagram: form.instagram || undefined,
      employees: form.employees || undefined,
      revenue: form.revenue || undefined,
      naics_code: form.naics_code || undefined,
      naics_description: form.naics_description || undefined,
      notes: form.notes || undefined,
      is_chain: form.is_chain,
      updated_at: now,
    }
    const { error: supaErr } = await db
      .from('records')
      .update(patch)
      .eq('id', record.id)
    if (supaErr) {
      setError(supaErr.message)
      setSaving(false)
      return
    }
    onSaved({ ...record, ...patch })
    setSaving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const { error: supaErr } = await db
      .from('records')
      .delete()
      .eq('id', record.id)
    if (supaErr) {
      setError(supaErr.message)
      setDeleting(false)
      setConfirmDelete(false)
      return
    }
    onDeleted()
  }

  return (
    <div className="space-y-4">
      <Input
        label="Name"
        value={form.name}
        onChange={(e) => setField('name', e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Type"
          value={form.type}
          onChange={(e) => setField('type', e.target.value)}
          placeholder="Restaurant, Bar…"
        />
        <Input
          label="Area"
          value={form.area}
          onChange={(e) => setField('area', e.target.value)}
        />
      </div>
      <AddressAutocomplete
        label="Address"
        value={form.address}
        onChange={(v) => setField('address', v)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="City"
          value={form.city}
          onChange={(e) => setField('city', e.target.value)}
        />
        <Input
          label="Zip"
          value={form.zip}
          onChange={(e) => setField('zip', e.target.value)}
        />
      </div>
      <Input
        label="Phone"
        type="tel"
        value={form.phone}
        onChange={(e) => setField('phone', e.target.value)}
      />
      <Input
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => setField('email', e.target.value)}
      />
      <Input
        label="Website"
        type="url"
        value={form.website}
        onChange={(e) => setField('website', e.target.value)}
      />
      <Input
        label="Menu link"
        type="url"
        value={form.menu_link}
        onChange={(e) => setField('menu_link', e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Priority"
          value={form.priority}
          options={PRIORITY_OPTIONS}
          onChange={(e) => setField('priority', e.target.value as Priority)}
        />
        <Select
          label="Status"
          value={form.status}
          options={STATUS_OPTIONS}
          onChange={(e) => setField('status', e.target.value as RecordStatus)}
        />
      </div>
      <Select
        label="Day"
        value={form.day}
        options={DAY_OPTIONS}
        onChange={(e) => setField('day', e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Contact name"
          value={form.contact_name}
          onChange={(e) => setField('contact_name', e.target.value)}
        />
        <Input
          label="Contact title"
          value={form.contact_title}
          onChange={(e) => setField('contact_title', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Facebook"
          type="url"
          value={form.facebook}
          onChange={(e) => setField('facebook', e.target.value)}
        />
        <Input
          label="Instagram"
          type="url"
          value={form.instagram}
          onChange={(e) => setField('instagram', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Employees"
          value={form.employees}
          onChange={(e) => setField('employees', e.target.value)}
        />
        <Input
          label="Revenue"
          value={form.revenue}
          onChange={(e) => setField('revenue', e.target.value)}
        />
      </div>
      <Input
        label="NAICS description"
        value={form.naics_description}
        onChange={(e) => setField('naics_description', e.target.value)}
      />
      <Input
        label="Group"
        value={form.group}
        onChange={(e) => setField('group', e.target.value)}
      />
      <div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_chain}
            onChange={(e) => setField('is_chain', e.target.checked)}
            className="rounded border-gray-300"
          />
          Is chain / on hold
        </label>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          placeholder="Notes…"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {!confirmDelete ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={saving || deleting}
          >
            Delete
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600">Delete this record?</span>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Confirm'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

interface RecordDetailModalProps {
  record: ProspectRecord | null
  onClose: () => void
}

export default function RecordDetailModal({ record, onClose }: RecordDetailModalProps) {
  const dispatch = useRecordsDispatch()
  const [editing, setEditing] = useState(false)

  function handleClose() {
    setEditing(false)
    onClose()
  }

  function handleSaved(updated: ProspectRecord) {
    dispatch({ type: 'UPSERT', record: updated })
    setEditing(false)
  }

  function handleDeleted() {
    if (!record) return
    dispatch({ type: 'DELETE', id: record.id })
    handleClose()
  }

  return (
    <Modal
      open={record !== null}
      onClose={handleClose}
      title={editing ? 'Edit Record' : 'Record Detail'}
      size="lg"
    >
      {record && !editing && (
        <RecordView record={record} onEdit={() => setEditing(true)} />
      )}
      {record && editing && (
        <RecordEditForm
          record={record}
          onCancel={() => setEditing(false)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </Modal>
  )
}
