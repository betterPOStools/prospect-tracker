import { useState } from 'react'
import type { Lead } from '../../types'
import { useLeadsDispatch } from '../../store/LeadsContext'
import { db } from '../../lib/supabase'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import Input from '../../components/Input'
import AddressAutocomplete from '../../components/AddressAutocomplete'
import PosSelect from '../../components/PosSelect'

interface AddLeadModalProps {
  open: boolean
  onClose: () => void
}

interface FormState {
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

const INITIAL: FormState = {
  name: '',
  phone: '',
  email: '',
  address: '',
  contact_name: '',
  contact_title: '',
  pos_type: '',
  website: '',
  menu_link: '',
  notes: '',
  follow_up: '',
}

export default function AddLeadModal({ open, onClose }: AddLeadModalProps) {
  const dispatch = useLeadsDispatch()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [nameError, setNameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === 'name' && value.trim()) setNameError('')
  }

  function handleClose() {
    setForm(INITIAL)
    setNameError('')
    setSaveError('')
    setSaving(false)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setNameError('Name is required')
      return
    }

    setSaving(true)
    setSaveError('')

    const now = new Date().toISOString()
    const lead: Lead = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      status: 'Open',
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
      created_at: now,
      updated_at: now,
    }

    const { error } = await db.from('leads').insert(lead)
    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    dispatch({ type: 'ADD', lead })
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Lead" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Name *"
          placeholder="Business name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={nameError}
          autoFocus
        />
        <Input
          label="Phone"
          type="tel"
          placeholder="(555) 555-5555"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          placeholder="contact@restaurant.com"
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
          placeholder="Decision maker / owner"
          value={form.contact_name}
          onChange={(e) => set('contact_name', e.target.value)}
        />
        <Input
          label="Contact Title"
          placeholder="e.g. Owner, GM, Manager"
          value={form.contact_title}
          onChange={(e) => set('contact_title', e.target.value)}
        />
        <PosSelect
          label="POS Type"
          value={form.pos_type}
          onChange={(value) => set('pos_type', value)}
        />
        <Input
          label="Website"
          type="url"
          placeholder="https://restaurant.com"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
        />
        <Input
          label="Menu Link"
          type="url"
          placeholder="https://restaurant.com/menu"
          value={form.menu_link}
          onChange={(e) => set('menu_link', e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400" htmlFor="add-lead-notes">
            Notes
          </label>
          <textarea
            id="add-lead-notes"
            className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Any notes about this prospect..."
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

        {saveError && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{saveError}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
            {saving ? 'Saving…' : 'Add Lead'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
