import { useState, useEffect, useRef } from 'react'

interface Suggestion {
  display: string
  full: string  // formatted address to fill the field
}

interface AddressAutocompleteProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export default function AddressAutocomplete({
  label,
  placeholder = '123 Main St, City, ST',
  value,
  onChange,
  className = '',
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value.length < 5) { setSuggestions([]); setOpen(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&addressdetails=1&countrycodes=us&limit=6`
        const res = await fetch(url, { headers: { 'User-Agent': 'ProspectTracker/1.0' } })
        const data = await res.json() as Array<{ display_name: string; address: Record<string, string> }>
        const seen = new Set<string>()
        const results: Suggestion[] = []
        for (const item of data) {
          const a = item.address
          const num    = a.house_number ?? ''
          const road   = a.road ?? ''
          const city   = a.city ?? a.town ?? a.village ?? ''
          const state  = a.state ?? ''
          const zip    = a.postcode ?? ''
          if (!road) continue
          const full = [num && road ? `${num} ${road}` : road, city, state, zip]
            .filter(Boolean).join(', ')
          if (seen.has(full)) continue
          seen.add(full)
          results.push({ display: full, full })
        }
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch { /* ignore */ }
    }, 500)
  }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      )}
      <input
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.full}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50 active:bg-blue-100"
                onMouseDown={(e) => { e.preventDefault(); onChange(s.full); setOpen(false) }}
              >
                {s.display}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
