import { useState, useCallback } from 'react'
import { useRecords, useRecordsDispatch } from '../../store/RecordsContext'
import { supabase } from '../../lib/supabase'
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

// ── Search Sub-Tab ─────────────────────────────────────────────────────────────

function SearchSubTab() {
  const records = useRecords()
  const recordsDispatch = useRecordsDispatch()
  const { submit, loading, error, config } = useOutscraper()

  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [categories, setCategories] = useState(config.categories)
  const [zips, setZips] = useState<string[]>([])
  const [zipLoading, setZipLoading] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<string | null>(null)

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
      setSubmitResult(`Task submitted: ${taskId}`)
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
        await supabase.from('prospect.records').upsert(batch)
      }
      if (allRecords.length > 500) {
        for (let i = 500; i < allRecords.length; i += 500) {
          await supabase.from('prospect.records').upsert(allRecords.slice(i, i + 500))
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
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Submit Outscraper Search</h3>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                label="City"
                placeholder="Wilmington"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
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
            <label className="text-xs font-medium text-gray-600">Categories</label>
            <textarea
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
          {submitResult && <p className="text-xs text-green-700">{submitResult}</p>}

          {zips.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-600">
                {zips.length} ZIP{zips.length !== 1 ? 's' : ''} found
              </p>
              <p className="text-xs text-gray-500 break-words">{zips.join(', ')}</p>
            </div>
          )}
        </div>
      </section>

      <div className="border-t border-gray-100" />

      {/* File Import */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Import from JSON File</h3>
        <div className="flex flex-col gap-3">
          <Input
            label="Area Label"
            placeholder="Wilmington NC"
            value={importArea}
            onChange={(e) => setImportArea(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">JSON File</label>
            <input
              type="file"
              accept=".json"
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-700"
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
            <div className="rounded-lg bg-green-50 p-3 text-xs text-green-800">
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
    await supabase.from('prospect.outscraper_tasks').insert({
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
        <p className="text-sm text-gray-400">No tasks found.</p>
      )}

      {tasks.map((task) => (
        <div key={task.id} className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">
                {task.title ?? task.task_id}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {task.task_id}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                {task.record_count != null && (
                  <span>{task.record_count} records</span>
                )}
                <span>{new Date(task.created_at).toLocaleDateString()}</span>
                {task.completed_at && (
                  <span>Done {new Date(task.completed_at).toLocaleDateString()}</span>
                )}
              </div>
              {pollResults[task.task_id] && (
                <p className="mt-1 text-xs text-green-700">{pollResults[task.task_id]}</p>
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
      <div className="border-t border-gray-100 pt-4">
        <p className="mb-2 text-xs font-medium text-gray-600">Add Task by ID</p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
        <label className="text-xs font-medium text-gray-600">API Key</label>
        <input
          type="password"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="os_••••••••"
          value={apiKey}
          onChange={(e) => setApiKeyState(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Categories</label>
        <textarea
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          rows={3}
          value={cfg.categories}
          onChange={(e) => update('categories', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">ZIPs per Task</label>
          <input
            type="number"
            min={1}
            max={50}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={cfg.zipBatchSize}
            onChange={(e) => update('zipBatchSize', Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Min Rating</label>
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={cfg.minRating}
            onChange={(e) => update('minRating', Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Min Reviews</label>
          <input
            type="number"
            min={0}
            max={1000}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            value={cfg.minReviews}
            onChange={(e) => update('minReviews', Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Webhook URL</label>
          <input
            type="text"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
          <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
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
      <SubTabs tabs={IMPORT_TABS} active={activeTab} onChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'search' && <SearchSubTab />}
        {activeTab === 'queue' && <QueueSubTab />}
        {activeTab === 'settings' && <OsSettingsSubTab />}
      </div>
    </div>
  )
}
