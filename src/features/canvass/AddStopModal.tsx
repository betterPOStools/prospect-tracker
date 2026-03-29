import { useState } from 'react'
import type { CanvassStop } from '../../types'
import { useStopsDispatch } from '../../store/StopsContext'
import { supabase } from '../../lib/supabase'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import Input from '../../components/Input'

interface AddStopModalProps {
  open: boolean
  onClose: () => void
}

interface FormState {
  name: string
  address: string
  phone: string
  area: string
  group: string
}

const INITIAL: FormState = {
  name: '',
  address: '',
  phone: '',
  area: '',
  group: '',
}

export default function AddStopModal({ open, onClose }: AddStopModalProps) {
  const dispatch = useStopsDispatch()
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
    const stop: CanvassStop = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      area: form.area.trim() || undefined,
      group: form.group.trim() || undefined,
      status: 'queued',
      created_at: now,
      updated_at: now,
    }

    const { error } = await supabase.from('prospect.canvass_stops').insert(stop)
    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    dispatch({ type: 'ADD', stop })
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Stop" size="md">
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
          label="Address"
          placeholder="123 Main St, City, ST"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
        />
        <Input
          label="Phone"
          type="tel"
          placeholder="(555) 555-5555"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
        <Input
          label="Area"
          placeholder="e.g. Downtown, Northside"
          value={form.area}
          onChange={(e) => set('area', e.target.value)}
        />
        <Input
          label="Group"
          placeholder="e.g. Monday Route"
          value={form.group}
          onChange={(e) => set('group', e.target.value)}
        />

        {saveError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={saving}>
            {saving ? 'Saving…' : 'Add Stop'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
