import { useState, useCallback, useEffect, useRef } from 'react'
import { useRecords, useRecordsDispatch } from '../../store/RecordsContext'
import { db } from '../../lib/supabase'
import { settings } from '../../lib/storage'
import { processOutscraperRows, withDefaults, lookupZips, buildQueries } from '../../data/outscraper'
import type { OsConfig } from '../../data/outscraper'
import { DEFAULT_BLOCKLIST } from '../../data/blocklist'
import { useOutscraper } from '../../hooks/useOutscraper'
import Button from '../../components/Button'
import { Badge } from '../../components/Badge'
import SubTabs from '../../components/SubTabs'
import Input from '../../components/Input'
import type { OutscraperTask } from '../../types'

type ImportSubTab = 'search' | 'queue' | 'settings'

const IMPORT_TABS: { id: ImportSubTab; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'queue', label: 'Queue' },
  { id: 'settings', label: 'Settings' },
]

// ── State abbreviation map ────────────────────────────────────────────────────

const STATE_ABBR: Record<string, string> = {
  Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',
  Colorado:'CO',Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',
  Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',
  Kentucky:'KY',Louisiana:'LA',Maine:'ME',Maryland:'MD',Massachusetts:'MA',
  Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',
  Nebraska:'NE',Nevada:'NV','New Hampshire':'NH','New Jersey':'NJ',
  'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',
  Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI',
  'South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',
  Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','West Virginia':'WV',
  Wisconsin:'WI',Wyoming:'WY','District of Columbia':'DC',
}

interface CitySuggestion { city: string; state: string; display: string }

function CityAutocomplete({
  city, onCityChange, onStateChange,
}: {
  city: string
  onCityChange: (v: string) => void
  onStateChange: (v: string) => void
}) {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (city.length < 3) { setSuggestions([]); setOpen(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&addressdetails=1&countrycodes=us&limit=8`
        const res = await fetch(url, { headers: { 'User-Agent': 'ProspectTracker/1.0' } })
        const data = await res.json() as Array<{ address: Record<string, string>; type: string }>
        const seen = new Set<string>()
        const results: CitySuggestion[] = []
        for (const item of data) {
          const a = item.address
          const cityName = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet
          const stateName = a.state
          if (!cityName || !stateName) continue
          const abbr = STATE_ABBR[stateName]
          if (!abbr) continue
          const key = `${cityName}|${abbr}`
          if (seen.has(key)) continue
          seen.add(key)
          results.push({ city: cityName, state: abbr, display: `${cityName}, ${abbr}` })
        }
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch { /* ignore network errors */ }
    }, 500)
  }, [city])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(s: CitySuggestion) {
    onCityChange(s.city)
    onStateChange(s.state)
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <Input
        label="City"
        placeholder="Wilmington"
        value={city}
        onChange={(e) => { onCityChange(e.target.value); setOpen(true) }}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-[#1e2535] bg-[#161b27] shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.display}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-[#1a2744] active:bg-[#1e2535]"
                onMouseDown={(e) => { e.preventDefault(); select(s) }}
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

// ── Search Sub-Tab ─────────────────────────────────────────────────────────────

function SearchSubTab({ onSwitchToQueue }: { onSwitchToQueue: () => void }) {
  const records = useRecords()
  const recordsDispatch = useRecordsDispatch()
  const { submit, loading, error, config } = useOutscraper()

  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [categories, setCategories] = useState(config.categories)
  const [zips, setZips] = useState<string[]>([])
  const [zipLoading, setZipLoading] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)

  // File import
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importArea, setImportArea] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    added: number; updated: number; dupes: number
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleLookupZips = useCallback(async () => {
    if (!city.trim() || !state.trim()) return
    setZipLoading(true)
    setZipError(null)
    setZips([])
    try {
      const found = await lookupZips(city.trim(), state.trim())
      setZips(found)
    } catch (e) {
      setZipError(e instanceof Error ? e.message : 'ZIP lookup failed')
    } finally {
      setZipLoading(false)
    }
  }, [city, state])

  const handleSubmitScrape = useCallback(async () => {
    if (!city.trim() || !state.trim() || zips.length === 0) return
    const title = `${city}, ${state} — ${new Date().toISOString().slice(0, 10)}`
    const queries = buildQueries(zips, city.trim(), state.trim(), categories)
    const taskId = await submit(title, queries)
    if (taskId) {
      onSwitchToQueue()
    }
  }, [city, state, zips, categories, submit])

  const handleImportFile = useCallback(async () => {
    if (!importFile || !importArea.trim()) return
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const text = await importFile.text()
      const rows = JSON.parse(text) as unknown[]
      const storedBlocklist = (() => {
        try {
          const raw = localStorage.getItem('vs_blocklist')
          return raw ? (JSON.parse(raw) as string[]) : DEFAULT_BLOCKLIST
        } catch {
          return DEFAULT_BLOCKLIST
        }
      })()
      const existingAreas = [...new Set(records.map((r) => r.area).filter(Boolean))] as string[]
      const { allRecords, added, updated, dupes } = processOutscraperRows(
        rows,
        importArea.trim(),
        records,
        storedBlocklist,
        existingAreas,
      )
      recordsDispatch({ type: 'UPSERT_MANY', records: allRecords })

      // Upsert to Supabase in batches of 500
      const batch = allRecords.slice(0, 500)
      if (batch.length > 0) {
        await db.from('records').upsert(batch)
      }
      if (allRecords.length > 500) {
        for (let i = 500; i < allRecords.length; i += 500) {
          await db.from('records').upsert(allRecords.slice(i, i + 500))
        }
      }

      setImportResult({ added, updated, dupes })
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed — check JSON format')
    } finally {
      setImporting(false)
    }
  }, [importFile, importArea, records, recordsDispatch])

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Scrape submission */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Submit Outscraper Search</h3>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <CityAutocomplete
              city={city}
              onCityChange={setCity}
              onStateChange={setState}
            />
            <div className="w-20">
              <Input
                label="State"
                placeholder="NC"
                value={state}
                maxLength={2}
                onChange={(e) => setState(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400">Categories</label>
            <textarea
              className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              rows={3}
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="restaurant, bar, brewery"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLookupZips}
              disabled={zipLoading || !city.trim() || !state.trim()}
            >
              {zipLoading ? 'Looking up…' : 'Look Up ZIPs'}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitScrape}
              disabled={loading || zips.length === 0}
            >
              {loading ? 'Submitting…' : 'Submit Scrape'}
            </Button>
          </div>

          {zipError && <p className="text-xs text-red-600">{zipError}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {zips.length > 0 && (
            <div className="rounded-lg bg-[#0f1117] border border-[#1e2535] p-3">
              <p className="mb-1 text-xs font-medium text-slate-400">
                {zips.length} ZIP{zips.length !== 1 ? 's' : ''} found
              </p>
              <p className="text-xs text-slate-500 break-words">{zips.join(', ')}</p>
            </div>
          )}
        </div>
      </section>

      <div className="border-t border-[#1e2535]" />

      {/* File Import */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Import from JSON File</h3>
        <div className="flex flex-col gap-3">
          <Input
            label="Area Label"
            placeholder="Wilmington NC"
            value={importArea}
            onChange={(e) => setImportArea(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400">JSON File</label>
            <input
              type="file"
              accept=".json"
              className="text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-500"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button
            size="sm"
            onClick={handleImportFile}
            disabled={importing || !importFile || !importArea.trim()}
          >
            {importing ? 'Importing…' : 'Import File'}
          </Button>

          {importError && <p className="text-xs text-red-600">{importError}</p>}
          {importResult && (
            <div className="rounded-lg bg-green-900/20 border border-green-800/30 p-3 text-xs text-green-400">
              Added {importResult.added}, Updated {importResult.updated}, Skipped{' '}
              {importResult.dupes} (dupes)
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

// ── Queue Sub-Tab ──────────────────────────────────────────────────────────────

function statusVariant(status: OutscraperTask['status']): 'warning' | 'success' | 'danger' | 'default' {
  if (status === 'pending') return 'warning'
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  return 'default'
}

function QueueSubTab() {
  const { fetchTasks, poll, loading, error } = useOutscraper()
  const [tasks, setTasks] = useState<OutscraperTask[]>([])
  const [fetched, setFetched] = useState(false)
  const [pollingId, setPollingId] = useState<string | null>(null)
  const [pollResults, setPollResults] = useState<Record<string, string>>({})
  const [manualTaskId, setManualTaskId] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  const handleRefresh = useCallback(async () => {
    const result = await fetchTasks()
    setTasks(result)
    setFetched(true)
  }, [fetchTasks])

  useEffect(() => { handleRefresh() }, [handleRefresh])

  const handlePoll = useCallback(
    async (taskId: string) => {
      setPollingId(taskId)
      const area = 'Import'
      const result = await poll(taskId, area)
      if (result) {
        setPollResults((prev) => ({
          ...prev,
          [taskId]: `${result.status} — Added: ${result.added}, Updated: ${result.updated}`,
        }))
        // Refresh task list
        const updated = await fetchTasks()
        setTasks(updated)
      }
      setPollingId(null)
    },
    [poll, fetchTasks],
  )

  const handleAddManualTask = useCallback(async () => {
    const id = manualTaskId.trim()
    if (!id) return
    setAddingTask(true)
    await db.from('outscraper_tasks').insert({
      task_id: id,
      title: `Manual — ${id}`,
      status: 'pending',
    })
    setManualTaskId('')
    const updated = await fetchTasks()
    setTasks(updated)
    setAddingTask(false)
  }, [manualTaskId, fetchTasks])

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={handleRefresh} disabled={loading}>
          {loading && !pollingId ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {fetched && tasks.length === 0 && (
        <p className="text-sm text-slate-500">No tasks found.</p>
      )}

      {tasks.map((task) => (
        <div key={task.id} className="rounded-xl border border-[#1e2535] bg-[#161b27] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-100">
                {task.title ?? task.task_id}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {task.task_id}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {task.record_count != null && (
                  <span>{task.record_count} records</span>
                )}
                <span>{new Date(task.created_at).toLocaleDateString()}</span>
                {task.completed_at && (
                  <span>Done {new Date(task.completed_at).toLocaleDateString()}</span>
                )}
              </div>
              {pollResults[task.task_id] && (
                <p className="mt-1 text-xs text-green-400">{pollResults[task.task_id]}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
              {task.status === 'pending' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handlePoll(task.task_id)}
                  disabled={pollingId === task.task_id}
                >
                  {pollingId === task.task_id ? 'Polling…' : 'Poll'}
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Manual task add */}
      <div className="border-t border-[#1e2535] pt-4">
        <p className="mb-2 text-xs font-medium text-slate-400">Add Task by ID</p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="Outscraper task ID"
            value={manualTaskId}
            onChange={(e) => setManualTaskId(e.target.value)}
          />
          <Button
            size="sm"
            onClick={handleAddManualTask}
            disabled={addingTask || !manualTaskId.trim()}
          >
            {addingTask ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Settings Sub-Tab ───────────────────────────────────────────────────────────

function OsSettingsSubTab() {
  const [apiKey, setApiKeyState] = useState(() => settings.getOsKey())
  const [cfg, setCfg] = useState<OsConfig>(() => withDefaults(settings.getOsCfg() as Partial<OsConfig>))
  const [saved, setSaved] = useState(false)

  const handleSave = useCallback(() => {
    settings.setOsKey(apiKey)
    settings.setOsCfg(cfg as unknown as Record<string, unknown>)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [apiKey, cfg])

  const update = <K extends keyof OsConfig>(key: K, value: OsConfig[K]) => {
    setCfg((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-400">API Key</label>
        <input
          type="password"
          className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          placeholder="os_••••••••"
          value={apiKey}
          onChange={(e) => setApiKeyState(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-400">Categories</label>
        <textarea
          className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          rows={3}
          value={cfg.categories}
          onChange={(e) => update('categories', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">ZIPs per Task</label>
          <input
            type="number"
            min={1}
            max={50}
            className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            value={cfg.zipBatchSize}
            onChange={(e) => update('zipBatchSize', Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Min Rating</label>
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            value={cfg.minRating}
            onChange={(e) => update('minRating', Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Min Reviews</label>
          <input
            type="number"
            min={0}
            max={1000}
            className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            value={cfg.minReviews}
            onChange={(e) => update('minReviews', Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Webhook URL</label>
          <input
            type="text"
            className="rounded-lg border border-[#1e2535] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            placeholder="https://…"
            value={cfg.webhookUrl}
            onChange={(e) => update('webhookUrl', e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {(
          [
            { key: 'useEnrichments', label: 'Enrich Results (contacts, emails)' },
            { key: 'exactMatch', label: 'Exact Category Match' },
            { key: 'usePhoneEnricher', label: 'Phone Enricher' },
            { key: 'useCompanyData', label: 'US Company Data' },
            { key: 'autoImport', label: 'Auto Import on Poll' },
          ] as { key: keyof OsConfig; label: string }[]
        ).map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#1e2535] bg-[#0f1117] text-blue-600"
              checked={cfg[key] as boolean}
              onChange={(e) => update(key, e.target.checked as OsConfig[typeof key])}
            />
            {label}
          </label>
        ))}
      </div>

      <Button onClick={handleSave}>
        {saved ? 'Saved!' : 'Save Settings'}
      </Button>
    </div>
  )
}

// ── ImportPanel ────────────────────────────────────────────────────────────────

export default function ImportPanel() {
  const [activeTab, setActiveTab] = useState<ImportSubTab>('search')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div data-testid="import-sub-tabs">
        <SubTabs tabs={IMPORT_TABS} active={activeTab} onChange={setActiveTab} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'search' && <SearchSubTab onSwitchToQueue={() => setActiveTab('queue')} />}
        {activeTab === 'queue' && <QueueSubTab />}
        {activeTab === 'settings' && <OsSettingsSubTab />}
      </div>
    </div>
  )
}
