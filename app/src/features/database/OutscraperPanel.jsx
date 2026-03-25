import { useState, useEffect, useCallback, memo } from 'react'
import { useDatabase, useDatabaseDispatch } from '../../data/store.jsx'
import { useSnapshots } from '../../hooks/useSnapshots.js'
import { useOutscraper } from '../../hooks/useOutscraper.js'
import { lookupZips, loadOsTasks, getTaskConfig, pollTask, processOutscraperRows, saveOsApiKey, saveOsConfig, extractTaskId } from '../../data/outscraper.js'
import { supabase } from '../../lib/supabase.js'
import Button from '../../components/Button.jsx'

const VIEWS = ['Search', 'Queue', 'Settings']

function fmtEta(secs) {
  if (!secs || secs < 60) return `${secs || 0}s`
  const m = Math.round(secs / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

const dot = (color, pulse = false) => ({
  display: 'inline-block',
  width: 8, height: 8,
  borderRadius: '50%',
  background: color,
  marginRight: 6,
  flexShrink: 0,
  ...(pulse ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
})

const card = {
  background: 'var(--bg2)',
  border: '0.5px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '14px 16px',
  marginBottom: 10,
}

const subTabBtn = (active) => ({
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  color: active ? 'var(--text)' : 'var(--text2)',
  cursor: 'pointer',
  marginBottom: -1,
})

// ── Search View ────────────────────────────────────────────────────────────────
function SearchView({ os }) {
  const [city,   setCity]   = useState('')
  const [state,  setState]  = useState('SC')
  const [phase,  setPhase]  = useState('idle') // 'idle' | 'looking' | 'confirm' | 'submitting'
  const [found,  setFound]  = useState(null)   // { zips, queryCount, costEst }
  const [err,    setErr]    = useState(null)

  if (!os.apiKey) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 10 }}>
          API key not set. Go to{' '}
          <button
            onClick={() => os._setView('Settings')}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, padding: 0, fontWeight: 500 }}>
            Settings
          </button>
          {' '}to add your Outscraper API key.
        </div>
      </div>
    )
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!city.trim()) { setErr('Enter a city name.'); return }
    setPhase('looking'); setErr(null); setFound(null)
    try {
      const zips      = await lookupZips(city.trim(), state)
      const cats      = os.config.categories.split(',').map(c => c.trim()).filter(Boolean)
      const batchSize = os.config.zipBatchSize || zips.length
      const batches   = Math.ceil(zips.length / batchSize)
      const queryCount = zips.length * cats.length
      const costEst   = (queryCount * 0.002).toFixed(3)
      setFound({ zips, queryCount, costEst, batches, batchSize })
      setPhase('confirm')
    } catch (e) {
      setErr(e.message)
      setPhase('idle')
    }
  }

  async function handleSubmit() {
    setPhase('submitting')
    try {
      await os.submit({ city: city.trim(), state, zips: found.zips })
      os._setView('Queue')
    } catch (e) {
      setErr(e.message)
      setPhase('confirm')
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Search by City</div>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          value={city}
          onChange={e => { setCity(e.target.value); setPhase('idle'); setFound(null); setErr(null) }}
          placeholder="e.g. Wilmington, Conway, Georgetown"
          style={{ flex: '1 1 200px', minWidth: 160 }}
          disabled={phase === 'looking' || phase === 'submitting'}
        />
        <select
          value={state}
          onChange={e => { setState(e.target.value); setPhase('idle'); setFound(null) }}
          style={{ flex: '0 0 80px' }}
          disabled={phase === 'looking' || phase === 'submitting'}
        >
          <option value="SC">SC</option>
          <option value="NC">NC</option>
          <option value="GA">GA</option>
          <option value="VA">VA</option>
          <option value="TN">TN</option>
        </select>
        <Button type="submit" variant="primary" disabled={phase === 'looking' || phase === 'submitting'}>
          {phase === 'looking' ? 'Looking up ZIPs…' : 'Search & Scrape'}
        </Button>
      </form>

      {phase === 'confirm' && found && (
        <div style={{ background: 'var(--bg3, var(--bg2))', border: '0.5px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
            Found <strong>{found.zips.length}</strong> ZIP codes for {city.trim()}, {state}:
            <span style={{ color: 'var(--text2)', marginLeft: 6, fontSize: 12, fontFamily: 'var(--mono)' }}>
              {found.zips.slice(0, 8).join(', ')}{found.zips.length > 8 ? ` +${found.zips.length - 8} more` : ''}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
            <strong>{found.queryCount}</strong> queries × $0.002 ≈ <strong>${found.costEst}</strong> estimated cost
          </div>
          {found.batches > 1 && (
            <div style={{ fontSize: 12, color: 'var(--blue-text, var(--accent))', marginBottom: 10 }}>
              Will submit as <strong>{found.batches} separate tasks</strong> of ~{found.batchSize} ZIPs each
              {os.config.useEnrichments === false ? ' · enrichments off (faster)' : ''}
            </div>
          )}
          {found.batches === 1 && os.config.useEnrichments === false && (
            <div style={{ fontSize: 12, color: 'var(--blue-text, var(--accent))', marginBottom: 10 }}>
              Enrichments off (faster, no contact data)
            </div>
          )}
          {found.batches === 1 && os.config.useEnrichments !== false && (
            <div style={{ marginBottom: 10 }} />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={handleSubmit} disabled={phase === 'submitting'}>
              {phase === 'submitting' ? 'Submitting…' : found.batches > 1 ? `Submit ${found.batches} tasks` : 'Submit scrape'}
            </Button>
            <Button onClick={() => setPhase('idle')}>Cancel</Button>
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: 12, color: 'var(--red-text)', marginTop: 6 }}>{err}</div>}
    </div>
  )
}

// ── Add by ID ──────────────────────────────────────────────────────────────────
function AddByIdRow({ os }) {
  const [idVal, setIdVal] = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    const ids = idVal.split(',').map(s => s.trim()).filter(Boolean)
    if (!ids.length) return
    const dupes = ids.filter(id => os.tasks.some(t => t.taskId === id))
    if (dupes.length) { setErr('Already in queue: ' + dupes.join(', ')); return }
    setBusy(true); setErr(null)
    const errors = []
    try {
      for (const taskId of ids) {
        try {
          // Step 1: fetch task config/metadata (city, state, tags, queue_task_id)
          const config      = await getTaskConfig(os.apiKey, taskId)
          const meta        = config.metadata || {}
          const queueTaskId = config.queue_task_id || null
          const rawTitle    = meta.title || config.title || ''
          const titleMatch  = rawTitle.match(/^([^,]+),\s*([A-Z]{2})\s*[—-]/)

          // Step 2: if we have a request ID, fetch actual status + results
          let status = 'pending', resultData = [], recordCount = 0, etaSecs = null, error = null
          if (queueTaskId) {
            const poll    = await pollTask(os.apiKey, queueTaskId)
            const pollSt  = (poll.status || '').toLowerCase()
            const isFin   = ['success', 'finished', 'done', 'completed'].includes(pollSt)

            if (isFin) {
              let data = poll.data || []
              if (data.length > 0 && Array.isArray(data[0]) && !data[0]?.name) data = data.flat()
              status = 'completed'; resultData = data; recordCount = data.length
            } else if (['failed', 'error'].includes(pollSt)) {
              status = 'failed'; error = poll.error || 'Unknown error'
            } else if (pollSt === 'pending' && !poll.data && Object.keys(poll).length <= 3) {
              // Results expired from /requests/ endpoint (2-hour window)
              status = 'expired'
            } else {
              status = pollSt || 'pending'
              etaSecs = poll.estimated_time_seconds ?? poll.time_left ?? null
            }
          }

          const task = {
            taskId,
            queueTaskId,
            tags:        config.tags || meta.tags || '',
            city:        titleMatch ? titleMatch[1].trim() : rawTitle || taskId,
            state:       titleMatch ? titleMatch[2] : '',
            zips:        '',
            queryCount:  meta.queries_amount || config.queries_count || 0,
            submittedAt: config.created || config.created_at || new Date().toISOString(),
            status, resultData, recordCount,
            imported: false, importCounts: null,
            error, etaSecs,
          }
          os.setTasks(prev => [...prev, task])
        } catch (err) {
          errors.push(taskId + ': ' + err.message)
        }
      }
      setIdVal('')
      if (errors.length) setErr(errors.join('; '))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      <input
        value={idVal}
        onChange={e => { setIdVal(e.target.value); setErr(null) }}
        placeholder="Paste task ID(s), comma-separated…"
        style={{ flex: 1 }}
        disabled={busy}
      />
      <Button type="submit" disabled={busy || !idVal.trim()}>{busy ? 'Loading…' : 'Add task'}</Button>
      {err && <span style={{ fontSize: 12, color: 'var(--red-text)', alignSelf: 'center' }}>{err}</span>}
    </form>
  )
}

function buildDownloadUrl(task) {
  const id = extractTaskId(task.taskId)
  if (!id || !task.tags) return null
  const year = id.slice(0, 4), month = id.slice(4, 6), day = id.slice(6, 8)
  const tagPart = task.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).join('_')
  return `https://s3.us-east-005.backblazeb2.com/shared-data-files/results/${year}/${month}/${day}/Outscraper-${id}_${tagPart}.json`
}

function buildProxiedUrls(task) {
  const id = extractTaskId(task.taskId)
  if (!id || !task.tags) return null
  const tagPart = task.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).join('_')
  const base = new Date(`${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`)
  const urls = []
  for (let offset = 0; offset <= 3; offset++) {
    const d = new Date(base); d.setDate(d.getDate() + offset)
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
    urls.push(`/s3-proxy/shared-data-files/results/${y}/${m}/${dd}/Outscraper-${id}_${tagPart}.json`)
  }
  return urls
}

const TaskCard = memo(function TaskCard({ task, doImport, doFetchAndImport, fetching, os }) {
  const isRunning   = task.status !== 'completed' && task.status !== 'failed' && task.status !== 'expired'
  const isCompleted = task.status === 'completed'
  const isFailed    = task.status === 'failed'
  const isExpired   = task.status === 'expired'

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{task.city}, {task.state}</span>
          <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 8 }}>
            {task.zips} · {task.queryCount} queries
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))' }}>
          {new Date(task.submittedAt).toLocaleString()}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 10 }}>
        {isRunning   && <><span style={dot('#f59e0b', true)} />{task.status || 'Pending'}{task.progress ? ` (${task.progress} so far)` : ''}{task.etaSecs ? ` — ~${fmtEta(task.etaSecs)}` : ''}</>}
        {isCompleted && <><span style={dot('#22c55e')} />Completed — {task.recordCount} records</>}
        {isFailed    && <><span style={dot('#ef4444')} />Failed: {task.error || 'Unknown error'}</>}
        {isExpired   && <><span style={dot('#94a3b8')} />Expired — results no longer available from API</>}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {isCompleted && task.recordCount > 0 && (
          task.imported
            ? <span style={{ fontSize: 12, color: 'var(--text2)' }}>✓ Imported{task.importCounts ? ` (${task.importCounts.added} added)` : ''}</span>
            : <Button variant="primary" size="sm" onClick={() => doImport(task)}>Import to database</Button>
        )}
        {(isExpired || (isCompleted && !task.recordCount && !task.imported)) && buildProxiedUrls(task) && (
          <Button variant="primary" size="sm" disabled={fetching === task.taskId} onClick={() => doFetchAndImport(task)}>
            {fetching === task.taskId ? 'Fetching…' : 'Fetch & Import'}
          </Button>
        )}
        {isCompleted && task.resultData?.length > 0 && (
          <Button size="sm" onClick={() => {
            const preview = task.resultData.slice(0, 10).map(r => `${r.name || '?'} — ${r.city || ''} ${r.postal_code || ''}`).join('\n')
            alert(`First 10 results:\n\n${preview}`)
          }}>Preview</Button>
        )}
        {(isCompleted || isExpired) && buildDownloadUrl(task) && (
          <a href={buildDownloadUrl(task)} download
            style={{ fontSize: 13, padding: '4px 10px', borderRadius: 'var(--radius)', background: 'var(--bg3, var(--bg2))', border: '0.5px solid var(--border)', color: 'var(--text)', textDecoration: 'none', cursor: 'pointer' }}>
            Download JSON
          </a>
        )}
        {isFailed && <Button size="sm" onClick={() => os.retryTask(task.taskId)}>Retry</Button>}
        <Button size="sm" variant="danger" onClick={() => os.removeTask(task.taskId)}>Remove</Button>
      </div>
    </div>
  )
})

// ── Queue View ─────────────────────────────────────────────────────────────────
function QueueView({ os }) {
  const db       = useDatabase()
  const dispatch = useDatabaseDispatch()
  const { takeSnapshot } = useSnapshots()
  const [msg,         setMsg]         = useState(null)
  const [lastPolled,  setLastPolled]  = useState(null)
  const [checking,    setChecking]    = useState(false)
  const [, setTick] = useState(0) // force re-render to update "X ago" display

  const doImport = useCallback((task) => {
    takeSnapshot('pre-import')
    const result = processOutscraperRows(
      task.resultData,
      `${task.city}, ${task.state}`,
      db.dbRecords,
      db.dbBlocklist,
      db.dbAreas,
    )
    dispatch({ type: 'IMPORT', dbRecords: result.allRecords, dbClusters: result.dbClusters, dbAreas: result.dbAreas })
    os.markImported(task.taskId, { added: result.added, updated: result.updated, dupes: result.dupes })
    setMsg({ text: `"${task.city}, ${task.state}" imported — ${result.added} added, ${result.updated} updated, ${result.dupes} skipped.`, type: 'ok' })
  }, [db, dispatch, takeSnapshot, os]) // eslint-disable-line react-hooks/exhaustive-deps

  const [fetching, setFetching] = useState(null) // taskId currently being fetched

  const doFetchAndImport = useCallback(async (task) => {
    const urls = buildProxiedUrls(task)
    if (!urls) { setMsg({ text: 'Cannot build download URL — missing tags.', type: 'err' }); return }
    setFetching(task.taskId)
    try {
      let resp = null
      for (const url of urls) {
        const r = await fetch(url)
        if (r.ok) { resp = r; break }
      }
      if (!resp) throw new Error('JSON not found on S3 (tried submission date + 3 days)')
      const rows = await resp.json()
      // Update task with fetched data
      os.setTasks(prev => prev.map(t => t.taskId === task.taskId
        ? { ...t, status: 'completed', resultData: rows, recordCount: rows.length }
        : t
      ))
      // Import immediately
      takeSnapshot('pre-import')
      const result = processOutscraperRows(
        rows,
        `${task.city}, ${task.state}`,
        db.dbRecords,
        db.dbBlocklist,
        db.dbAreas,
      )
      dispatch({ type: 'IMPORT', dbRecords: result.allRecords, dbClusters: result.dbClusters, dbAreas: result.dbAreas })
      os.markImported(task.taskId, { added: result.added, updated: result.updated, dupes: result.dupes })
      setMsg({ text: `"${task.city}, ${task.state}" fetched & imported — ${result.added} added, ${result.updated} updated, ${result.dupes} skipped.`, type: 'ok' })
    } catch (e) {
      setMsg({ text: `Fetch failed: ${e.message}`, type: 'err' })
    } finally {
      setFetching(null)
    }
  }, [db, dispatch, takeSnapshot, os]) // eslint-disable-line react-hooks/exhaustive-deps

  const onComplete = useCallback((t) => {
    if (os.config.autoImport) doImport(t)
  }, [doImport, os.config.autoImport]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doCheck() {
    setChecking(true)
    try {
      const t = await os.pollNow(onComplete)
      setLastPolled(t)
    } finally {
      setChecking(false)
    }
  }

  // Check for webhook results stored in Supabase by the Edge Function
  const checkWebhookResults = useCallback(async () => {
    if (!supabase) return
    try {
      const { data: rows, error } = await supabase
        .from('webhook_results')
        .select('*')
        .eq('imported', false)
        .order('received_at', { ascending: true })
      if (error || !rows?.length) return

      let totalAdded = 0, totalUpdated = 0, totalDupes = 0
      for (const row of rows) {
        let resultData = row.result_data || []

        // If Edge Function couldn't fetch results (no API key set), try from the app
        if (!resultData.length && row.results_location && os.apiKey) {
          try {
            const fetched = await pollTask(os.apiKey, row.task_id)
            if (fetched.data?.length) {
              resultData = fetched.data
              if (resultData.length > 0 && Array.isArray(resultData[0]) && !resultData[0]?.name) resultData = resultData.flat()
            }
          } catch (e) { console.warn('[Webhook] fallback fetch failed:', e.message) }
        }

        if (!resultData.length) continue

        // Parse area from title ("Columbia, SC — 2026-03-24")
        const titleMatch = (row.title || '').match(/^([^,]+),\s*([A-Z]{2})\s*[—-]/)
        const area = titleMatch ? `${titleMatch[1].trim()}, ${titleMatch[2]}` : row.tags || 'Webhook Import'

        takeSnapshot('pre-import')
        const result = processOutscraperRows(resultData, area, db.dbRecords, db.dbBlocklist, db.dbAreas)
        dispatch({ type: 'IMPORT', dbRecords: result.allRecords, dbClusters: result.dbClusters, dbAreas: result.dbAreas })
        totalAdded += result.added; totalUpdated += result.updated; totalDupes += result.dupes

        // Mark as imported in Supabase
        await supabase.from('webhook_results').update({ imported: true, imported_at: new Date().toISOString() }).eq('id', row.id)

        // Update matching local task if exists
        const matchId = row.task_id
        os.setTasks(prev => prev.map(t => {
          if (t.taskId === matchId || t.queueTaskId === matchId) {
            return { ...t, status: 'completed', resultData, recordCount: resultData.length, imported: true, importCounts: { added: result.added, updated: result.updated, dupes: result.dupes } }
          }
          return t
        }))
      }

      if (totalAdded || totalUpdated) {
        setMsg({ text: `Webhook: ${rows.length} task${rows.length !== 1 ? 's' : ''} auto-imported — ${totalAdded} added, ${totalUpdated} updated, ${totalDupes} skipped.`, type: 'ok' })
      }
    } catch (e) {
      console.warn('[Webhook] check failed:', e.message)
    }
  }, [db, dispatch, takeSnapshot, os]) // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: check webhook results, fetch from Outscraper, then start polling
  useEffect(() => {
    checkWebhookResults()

    os.fetchFromOutscraper()
      .then(() => {
        const hasPending = loadOsTasks().some(t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'expired')
        if (hasPending) { doCheck(); os.startPolling(onComplete) }
      })
      .catch(() => {
        // Fall back: start polling based on whatever is in localStorage
        const hasPending = os.tasks.some(t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'expired')
        if (hasPending) { doCheck(); os.startPolling(onComplete) }
      })

    const ticker = setInterval(() => setTick(n => n + 1), 15_000)
    return () => { os.stopPolling(); clearInterval(ticker) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasPending = os.tasks.some(t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'expired')
  const agoSecs = lastPolled ? Math.round((Date.now() - lastPolled) / 1000) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
        <span style={dot(checking ? '#f59e0b' : '#22c55e', checking)} />
        {checking ? 'Checking…' : lastPolled ? `Last checked ${agoSecs}s ago` : hasPending ? 'Polling every 30s' : 'Ready'}
        {hasPending && <Button size="sm" onClick={doCheck} disabled={checking}>Check now</Button>}
        {supabase && <Button size="sm" onClick={checkWebhookResults}>Check Webhook</Button>}
        <Button size="sm" onClick={doCheck} disabled={checking} style={{ marginLeft: 'auto' }}>
          {checking ? 'Checking…' : 'Refresh'}
        </Button>
      </div>
      {msg && (
        <div style={{ fontSize: 12, marginBottom: 8, color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>
          {msg.text}
        </div>
      )}
      <AddByIdRow os={os} />
      {!os.tasks.length && (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text2)', fontSize: 13 }}>
          No tasks yet — paste a task ID above, or submit a scrape from Search.
        </div>
      )}
      {[...os.tasks].reverse().map(task => (
        <TaskCard key={task.taskId} task={task} doImport={doImport} doFetchAndImport={doFetchAndImport} fetching={fetching} os={os} />
      ))}
    </div>
  )
}

// ── Settings View ──────────────────────────────────────────────────────────────
function SettingsView({ os }) {
  const [keyVal,        setKeyVal]        = useState(os.apiKey)
  const [showKey,       setShowKey]       = useState(false)
  const [catsVal,       setCatsVal]       = useState(os.config.categories)
  const [autoImport,    setAutoImport]    = useState(os.config.autoImport)
  const [zipBatchSize,  setZipBatchSize]  = useState(os.config.zipBatchSize ?? 10)
  const [useEnrichments,   setUseEnrichments]   = useState(os.config.useEnrichments !== false)
  const [exactMatch,       setExactMatch]       = useState(os.config.exactMatch === true)
  const [minRating,        setMinRating]        = useState(os.config.minRating ?? 0)
  const [minReviews,       setMinReviews]       = useState(os.config.minReviews ?? 0)
  const [webhookUrl,       setWebhookUrl]       = useState(os.config.webhookUrl ?? '')
  const [usePhoneEnricher, setUsePhoneEnricher] = useState(os.config.usePhoneEnricher === true)
  const [useCompanyData,   setUseCompanyData]   = useState(os.config.useCompanyData === true)
  const [saved,            setSaved]            = useState(false)

  function handleSave() {
    os.setApiKey(keyVal.trim())
    os.setConfig({
      ...os.config,
      categories: catsVal.trim(), autoImport,
      zipBatchSize: Number(zipBatchSize) || 10,
      useEnrichments, exactMatch,
      minRating: Number(minRating) || 0,
      minReviews: Number(minReviews) || 0,
      webhookUrl: webhookUrl.trim(),
      usePhoneEnricher, useCompanyData,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Outscraper API Settings</div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>API Key</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={keyVal}
            onChange={e => setKeyVal(e.target.value)}
            placeholder="Paste your Outscraper API key"
            style={{ flex: 1 }}
          />
          <Button size="sm" onClick={() => setShowKey(v => !v)}>{showKey ? 'Hide' : 'Show'}</Button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Default categories (comma-separated)</div>
        <textarea
          value={catsVal}
          onChange={e => setCatsVal(e.target.value)}
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>ZIPs per task (batch size)</div>
          <input
            type="number"
            min={1}
            max={100}
            value={zipBatchSize}
            onChange={e => setZipBatchSize(e.target.value)}
            style={{ width: 80 }}
          />
          <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))', marginTop: 3 }}>
            Columbia had 38 ZIPs → 4 tasks of 10
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Min rating</div>
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={minRating}
            onChange={e => setMinRating(e.target.value)}
            style={{ width: 80 }}
          />
          <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))', marginTop: 3 }}>
            0 = no filter (default)
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Min reviews</div>
          <input
            type="number"
            min={0}
            max={1000}
            value={minReviews}
            onChange={e => setMinReviews(e.target.value)}
            style={{ width: 80 }}
          />
          <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))', marginTop: 3 }}>
            0 = no filter (default)
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={useEnrichments} onChange={e => setUseEnrichments(e.target.checked)} />
          Enrich results (contact names, emails, phone validation)
        </label>
        <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))', marginTop: 3, marginLeft: 20 }}>
          Disable for faster scrapes — no contact data, just business listings
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={exactMatch} onChange={e => setExactMatch(e.target.checked)} />
          Exact category match only
        </label>
        <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))', marginTop: 3, marginLeft: 20 }}>
          Off (default): Google may include adjacent categories (bars in restaurant searches). On: stricter, fewer but cleaner results.
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={usePhoneEnricher} onChange={e => setUsePhoneEnricher(e.target.checked)} />
          Phone validation (carrier type, line type)
        </label>
        <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))', marginTop: 3, marginLeft: 20 }}>
          Validates phone numbers — identifies carrier and whether landline/mobile/VoIP
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={useCompanyData} onChange={e => setUseCompanyData(e.target.checked)} />
          US company data (employee count, revenue, NAICS)
        </label>
        <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))', marginTop: 3, marginLeft: 20 }}>
          Adds employee count, annual revenue, and NAICS industry codes (US businesses only)
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Webhook URL (optional)</div>
        <input
          type="url"
          value={webhookUrl}
          onChange={e => setWebhookUrl(e.target.value)}
          placeholder="https://your-endpoint.com/webhook"
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: 11, color: 'var(--text3, var(--text2))', marginTop: 3 }}>
          Outscraper POSTs full results to this URL on completion — captures data even when app is closed
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={autoImport}
            onChange={e => setAutoImport(e.target.checked)}
          />
          Auto-import when scrape completes
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="primary" onClick={handleSave}>Save settings</Button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green-text)' }}>Saved.</span>}
      </div>
    </div>
  )
}

// ── OutscraperPanel ────────────────────────────────────────────────────────────
export default function OutscraperPanel() {
  const os = useOutscraper()
  const hasPending = os.tasks.some(t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'expired')
  const [view, setView] = useState(!os.apiKey ? 'Settings' : hasPending ? 'Queue' : 'Search')

  // Expose setView to child components via the os object (search view needs it)
  os._setView = setView

  return (
    <div>
      {/* Internal sub-tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {VIEWS.map(v => (
          <button key={v} onClick={() => setView(v)} style={subTabBtn(view === v)}>
            {v}
            {v === 'Queue' && os.tasks.length > 0 && (
              <span style={{
                marginLeft: 5, fontSize: 11, background: 'var(--accent)', color: '#fff',
                borderRadius: 10, padding: '1px 5px', lineHeight: 1,
              }}>
                {os.tasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === 'Search'   && <SearchView   os={os} />}
      {view === 'Queue'    && <QueueView    os={os} />}
      {view === 'Settings' && <SettingsView os={os} />}
    </div>
  )
}
