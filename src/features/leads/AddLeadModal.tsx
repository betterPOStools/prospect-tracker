import { useState } from 'react'
import type { Lead } from '../../types'
import { useLeadsDispatch } from '../../store/LeadsContext'
import { supabase } from '../../lib/supabase'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import Input from '../../components/Input'

interface AddLeadModalProps {
  open: boolean
  onClose: () => void
}

interface FormState {
  name: string
  phone: string
  address: string
  pos_type: string
  notes: string
  follow_up: string
}

const INITIAL: FormState = {
  name: '',
  phone: '',
  address: '',
  pos_type: '',
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
      address: form.address.trim() || undefined,
      pos_type: form.pos_type.trim() || undefined,
      notes: form.notes.trim() || undefined,
      follow_up: form.follow_up || undefined,
      created_at: now,
      updated_at: now,
    }

    const { error } = await supabase.schema('prospect').from('leads').insert(lead)
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
          label="Address"
          placeholder="123 Main St, City, ST"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
        />
        <Input
          label="POS Type"
          placeholder="e.g. Aloha, Micros, Custom"
          value={form.pos_type}
          onChange={(e) => set('pos_type', e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600" htmlFor="add-lead-notes">
            Notes
          </label>
          <textarea
            id="add-lead-notes"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</p>
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
