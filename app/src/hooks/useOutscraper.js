import { useState, useRef, useEffect, useCallback } from 'react'
import {
  loadOsApiKey, saveOsApiKey,
  loadOsConfig, saveOsConfig,
  loadOsTasks, saveOsTasks,
  buildQueries, submitScrape, pollTask, listTasks, getTaskConfig,
  extractTaskId,
} from '../data/outscraper.js'
import { supabase } from '../lib/supabase.js'

const OS_ROW_ID      = 2   // separate row in app_state table — never conflicts with main sync (id=1)
const SYNC_DEBOUNCE  = 1500

export function useOutscraper() {
  const [apiKey, _setApiKey] = useState(() => loadOsApiKey())
  const [config, _setConfig] = useState(() => loadOsConfig())
  const [tasks,  _setTasks]  = useState(() => loadOsTasks())

  const pollingRef     = useRef(null)
  const onCompleteRef  = useRef(null)
  const apiKeyRef      = useRef(apiKey)
  const syncTimerRef   = useRef(null)

  // Keep refs in sync
  useEffect(() => { apiKeyRef.current = apiKey }, [apiKey])

  // On mount: merge Supabase task metadata with localStorage
  useEffect(() => {
    if (!supabase) return
    supabase.from('app_state').select('payload').eq('id', OS_ROW_ID).maybeSingle()
      .then(({ data }) => {
        const remote = data?.payload?.osTasks
        if (!remote?.length) return
        _setTasks(prev => {
          const localById = Object.fromEntries(prev.map(t => [t.taskId, t]))
          const merged = [...prev]
          remote.forEach(r => {
            if (!localById[r.taskId]) merged.push(r) // add tasks this device hasn't seen
            else {
              // local wins for resultData; remote status/importCounts may be newer
              const idx = merged.findIndex(t => t.taskId === r.taskId)
              merged[idx] = { ...r, resultData: merged[idx].resultData || [] }
            }
          })
          saveOsTasks(merged)
          return merged
        })
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setApiKey(key) { _setApiKey(key); saveOsApiKey(key) }
  function setConfig(cfg) { _setConfig(cfg); saveOsConfig(cfg) }

  // Strip resultData before syncing — it can be large and is ephemeral (2hr window)
  function stripForSync(taskList) {
    return taskList.map(({ resultData, ...rest }) => rest)
  }

  function syncToSupabase(taskList) {
    if (!supabase) return
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      try {
        await supabase.from('app_state').upsert(
          { id: OS_ROW_ID, payload: { osTasks: stripForSync(taskList) }, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        )
      } catch (e) { console.warn('[OsTasks] sync failed:', e.message) }
    }, SYNC_DEBOUNCE)
  }

  function persistTasks(taskList) {
    saveOsTasks(taskList)
    syncToSupabase(taskList)
  }

  function setTasks(next) {
    const resolved = typeof next === 'function' ? next(tasks) : next
    _setTasks(resolved)
    persistTasks(resolved)
  }

  // submit — splits ZIPs into batches, submits one task per batch
  const submit = useCallback(async ({ city, state, zips }) => {
    const batchSize = config.zipBatchSize || zips.length
    const chunks    = []
    for (let i = 0; i < zips.length; i += batchSize) chunks.push(zips.slice(i, i + batchSize))

    const newTasks = []
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk   = chunks[ci]
      const queries = buildQueries(chunk, city, state, config.categories)
      const today   = new Date().toISOString().slice(0, 10)
      const suffix  = chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : ''
      const title   = `${city}, ${state} \u2014 ${today}${suffix}`
      const localTags = `${city}, ${state}`
      const resp    = await submitScrape(apiKeyRef.current, title, queries, {
        useEnrichments: config.useEnrichments !== false,
        exactMatch:     config.exactMatch === true,
        minRating:      Number(config.minRating)  || 0,
        minReviews:     Number(config.minReviews)  || 0,
        webhookUrl:     config.webhookUrl || '',
        usePhoneEnricher: config.usePhoneEnricher === true,
        useCompanyData:   config.useCompanyData === true,
      })
      const taskId  = extractTaskId(resp?.id || resp?.task_id)
      if (!taskId) throw new Error('No task ID returned from Outscraper.')

      // Fetch task config to get queue_task_id (needed for polling /requests/)
      let queueTaskId = resp.queue_task_id || null
      if (!queueTaskId) {
        try {
          const cfg = await getTaskConfig(apiKeyRef.current, taskId)
          queueTaskId = cfg.queue_task_id || null
        } catch {}
      }

      newTasks.push({
        taskId,
        queueTaskId,
        tags:        resp.metadata?.tags || resp.tags || localTags,
        city, state,
        zips:        chunk.join(', '),
        queryCount:  queries.length,
        submittedAt: new Date().toISOString(),
        status:      'pending',
        resultData:  [],
        recordCount: 0,
        imported:    false,
        importCounts: null,
        error:       null,
        etaSecs:     resp?.estimated_time_seconds ?? resp?.time_left ?? resp?.eta ?? null,
      })
    }

    setTasks(prev => [...prev, ...newTasks])
    return newTasks
  }, [config.categories, config.zipBatchSize, config.useEnrichments]) // eslint-disable-line react-hooks/exhaustive-deps

  // shared poll cycle — polls all pending tasks once, returns Date of completion
  const runPoll = useCallback(async () => {
    let changed = false
    const snapshot = loadOsTasks()

    for (let i = 0; i < snapshot.length; i++) {
      const t = snapshot[i]
      if (t.status === 'completed' || t.status === 'failed' || t.status === 'expired') continue
      try {
        // If we don't have a queueTaskId, fetch it from task config
        if (!t.queueTaskId) {
          try {
            const cfg = await getTaskConfig(apiKeyRef.current, t.taskId)
            if (cfg.queue_task_id) {
              t.queueTaskId = cfg.queue_task_id
              snapshot[i] = { ...t }
              changed = true
            }
          } catch {}
        }
        const pollId    = t.queueTaskId || t.taskId
        const result    = await pollTask(apiKeyRef.current, pollId)
        const newStatus = (result.status || '').toLowerCase()

        if (['success', 'finished', 'done'].includes(newStatus)) {
          let data = result.data || []
          if (data.length > 0 && Array.isArray(data[0]) && !data[0]?.name) data = data.flat()
          snapshot[i] = { ...t, status: 'completed', resultData: data, recordCount: data.length, completedAt: new Date().toISOString() }
          changed = true
          onCompleteRef.current?.(snapshot[i])
        } else if (['failed', 'error'].includes(newStatus)) {
          snapshot[i] = { ...t, status: 'failed', error: result.error || 'Unknown error' }
          changed = true
        } else if (newStatus === 'pending' && !result.data && Object.keys(result).length <= 3) {
          // Results expired from /requests/ endpoint (2-hour window)
          snapshot[i] = { ...t, status: 'expired' }
          changed = true
        } else {
          const progress = result.total_results_count || 0
          const etaSecs  = result.estimated_time_seconds ?? result.time_left ?? result.eta ?? t.etaSecs ?? null
          if (progress !== t.progress || etaSecs !== t.etaSecs || newStatus !== (t.status || '')) {
            snapshot[i] = { ...t, status: newStatus || t.status || 'pending', progress, etaSecs }
            changed = true
          }
        }
      } catch (e) { /* keep polling on transient errors */ }
    }

    if (changed) {
      persistTasks(snapshot)
      _setTasks([...snapshot])
    }
    return new Date()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // startPolling — 30s interval; calls onTaskComplete(updatedTask) when a task finishes
  const startPolling = useCallback((onTaskComplete) => {
    stopPolling()
    onCompleteRef.current = onTaskComplete
    pollingRef.current = setInterval(runPoll, 30_000)
  }, [runPoll]) // eslint-disable-line react-hooks/exhaustive-deps

  // pollNow — immediate single poll (for manual refresh or on-mount check)
  const pollNow = useCallback((onTaskComplete) => {
    if (onTaskComplete) onCompleteRef.current = onTaskComplete
    return runPoll()
  }, [runPoll])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }, [])

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling])

  function markImported(taskId, importCounts) {
    setTasks(prev => prev.map(t =>
      t.taskId === taskId ? { ...t, imported: true, importCounts } : t
    ))
  }

  function removeTask(taskId) {
    setTasks(prev => prev.filter(t => t.taskId !== taskId))
  }

  function retryTask(taskId) {
    setTasks(prev => prev.map(t =>
      t.taskId === taskId ? { ...t, status: 'pending', error: null } : t
    ))
  }

  // fetchFromOutscraper — loads all tasks from the API and merges with local tracking data
  const fetchFromOutscraper = useCallback(async () => {
    if (!apiKeyRef.current) return
    const resp = await listTasks(apiKeyRef.current)
    // API returns { data: [...] } or an array directly
    const remote = Array.isArray(resp) ? resp : (resp.data || [])
    if (!remote.length) return // reseller doesn't support list endpoint — don't wipe local tasks

    setTasks(prev => {
      const localById = Object.fromEntries(prev.map(t => [t.taskId, t]))
      const merged = remote.map(r => {
        const taskId  = extractTaskId(r.id || r.task_id || r.taskId)
        const local   = localById[taskId] || {}
        const status  = (r.status || '').toLowerCase()
        const isFin   = ['success', 'finished', 'done', 'completed'].includes(status)
        let data = r.data || local.resultData || []
        if (data.length > 0 && Array.isArray(data[0]) && !data[0]?.name) data = data.flat()

        // Parse city/state from metadata.title or title ("Columbia, SC — 2026-03-22")
        const meta       = r.metadata || {}
        const rawTitle   = meta.title || r.title || ''
        const titleMatch = rawTitle.match(/^([^,]+),\s*([A-Z]{2})\s*[—-]/)
        const city  = local.city  || (titleMatch ? titleMatch[1].trim() : rawTitle || 'Unknown')
        const state = local.state || (titleMatch ? titleMatch[2] : '')

        return {
          taskId,
          queueTaskId: r.queue_task_id  || local.queueTaskId || null,
          tags:        (r.metadata?.tags || r.tags || local.tags || ''),
          city,
          state,
          zips:        local.zips        || '',
          queryCount:  meta.queries_amount || r.queries_count || r.queryCount || local.queryCount || 0,
          submittedAt: r.created || r.created_at || r.submittedAt || local.submittedAt || new Date().toISOString(),
          status:      isFin ? 'completed' : (['failed', 'error'].includes(status) ? 'failed' : status || 'pending'),
          resultData:  isFin ? data : (local.resultData || []),
          recordCount: r.total_results_count || (isFin ? data.length : 0) || local.recordCount || 0,
          imported:    local.imported    || false,
          importCounts:local.importCounts|| null,
          error:       r.error           || local.error || null,
          etaSecs:     r.estimated_time_seconds ?? r.time_left ?? r.eta ?? local.etaSecs ?? null,
        }
      })
      return merged
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    apiKey, setApiKey,
    config, setConfig,
    tasks,  setTasks,
    submit,
    startPolling, stopPolling, pollNow, fetchFromOutscraper,
    markImported, removeTask, retryTask,
  }
}
