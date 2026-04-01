import { useState } from 'react'

interface PosSelectProps {
  value?: string
  onChange: (value: string) => void
  label?: string
}

const POS_OPTIONS = [
  { value: '', label: 'Select POS system...' },
  { value: 'Toast', label: 'Toast' },
  { value: 'Square for Restaurants', label: 'Square for Restaurants' },
  { value: 'Clover', label: 'Clover' },
  { value: 'Lightspeed', label: 'Lightspeed' },
  { value: 'TouchBistro', label: 'TouchBistro' },
  { value: 'Revel Systems', label: 'Revel Systems' },
  { value: 'Aloha (NCR)', label: 'Aloha (NCR)' },
  { value: 'Micros (Oracle)', label: 'Micros (Oracle)' },
  { value: 'Heartland', label: 'Heartland' },
  { value: 'SpotOn', label: 'SpotOn' },
  { value: 'Shift4 (Harbortouch)', label: 'Shift4 (Harbortouch)' },
  { value: 'PAX', label: 'PAX' },
  { value: 'None/Unknown', label: 'None/Unknown' },
  { value: 'Other', label: 'Other' },
]

const KNOWN_VALUES = new Set(POS_OPTIONS.map((o) => o.value))

export default function PosSelect({ value = '', onChange, label }: PosSelectProps) {
  const isOther = value !== '' && !KNOWN_VALUES.has(value)
  const [showOther, setShowOther] = useState(isOther)
  const [customValue, setCustomValue] = useState(isOther ? value : '')

  const selectId = label?.toLowerCase().replace(/\s+/g, '-')

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value
    if (selected === 'Other') {
      setShowOther(true)
      onChange(customValue || '')
    } else {
      setShowOther(false)
      setCustomValue('')
      onChange(selected)
    }
  }

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setCustomValue(text)
    onChange(text)
  }

  const selectValue = showOther ? 'Other' : value

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-slate-400">
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={selectValue}
        onChange={handleSelectChange}
        className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        {POS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {showOther && (
        <input
          type="text"
          value={customValue}
          onChange={handleCustomChange}
          placeholder="Enter POS system name..."
          className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      )}
    </div>
  )
}
