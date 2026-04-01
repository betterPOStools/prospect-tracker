import { useState, useCallback, useMemo } from 'react'
import { DEFAULT_BLOCKLIST } from '../../data/blocklist'
import Button from '../../components/Button'
import Input from '../../components/Input'

const STORAGE_KEY = 'vs_blocklist'

function loadBlocklist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : DEFAULT_BLOCKLIST
  } catch {
    return DEFAULT_BLOCKLIST
  }
}

function saveBlocklist(terms: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(terms))
}

export default function BlocklistPanel() {
  const [terms, setTerms] = useState<string[]>(() => loadBlocklist())
  const [newTerm, setNewTerm] = useState('')

  const sorted = useMemo(() => [...terms].sort((a, b) => a.localeCompare(b)), [terms])

  const persist = useCallback((next: string[]) => {
    setTerms(next)
    saveBlocklist(next)
  }, [])

  const handleAdd = useCallback(() => {
    const trimmed = newTerm.trim().toLowerCase()
    if (!trimmed || terms.includes(trimmed)) return
    persist([...terms, trimmed])
    setNewTerm('')
  }, [newTerm, terms, persist])

  const handleRemove = useCallback(
    (term: string) => {
      persist(terms.filter((t) => t !== term))
    },
    [terms, persist],
  )

  const handleReset = useCallback(() => {
    persist([...DEFAULT_BLOCKLIST])
  }, [persist])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleAdd()
    },
    [handleAdd],
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-300">Blocklist</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {terms.length} terms — case-insensitive partial match. Records whose names contain
          any of these terms are skipped during import.
        </p>
      </div>

      {/* Add term */}
      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Add a term…"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={!newTerm.trim()}>
          Add
        </Button>
        <Button size="sm" variant="secondary" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </div>

      {/* Scrollable term list */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-wrap gap-2">
          {sorted.map((term) => (
            <span
              key={term}
              className="flex items-center gap-1 rounded-full bg-[#1e2535] px-3 py-1 text-xs text-slate-300"
            >
              {term}
              <button
                className="ml-0.5 rounded-full text-slate-500 hover:text-red-500 focus:outline-none"
                onClick={() => handleRemove(term)}
                aria-label={`Remove ${term}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
