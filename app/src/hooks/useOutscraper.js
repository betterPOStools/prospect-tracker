import { useState, useRef, useEffect, useCallback } from 'react'
import {
  loadOsApiKey, saveOsApiKey,
  loadOsConfig, saveOsConfig,
  loadOsTasks, saveOsTasks,
  buildQueries, submitScrape, pollTask, listTasks,
} from '../data/outscraper.js'

export function useOutscraper() {
  const [apiKey, _setApiKey] = useState(() => loadOsApiKey())
  const [config, _setConfig] = useState(() => loadOsConfig())
  const [tasks,  _setTasks]  = useState(() => loadOsTasks())

  const pollingRef     = useRef(null)
  const onCompleteRef  = useRef(null)  // stable ref so interval closure always sees latest callback
  const apiKeyRef      = useRef(apiKey)

  // Keep refs in sync
  useEffect(() => { apiKeyRef.current = apiKey }, [apiKey])

  function setApiKey(key) { _setApiKey(key); saveOsApiKey(key) }
  function setConfig(cfg) { _setConfig(cfg); saveOsConfig(cfg) }
  function setTasks(next) {
    const resolved = typeof next === 'function' ? next(tasks) : next
    _setTasks(resolved)
    saveOsTasks(resolved)
  }

  // submit — builds queries from known zips (already looked up by component) and submits
  const submit = useCallback(async ({ city, state, zips }) => {
    const queries = buildQueries(zips, city, state, config.categories)
    const today   = new Date().toISOString().slice(0, 10)
    const title   = `${city}, ${state} \u2014 ${today}`
    const resp    = await submitScrape(apiKeyRef.current, title, queries)
    const taskId  = resp?.id || resp?.task_id
    if (!taskId) throw new Error('No task ID returned from Outscraper.')

    const task = {
      taskId,
      queueTaskId: resp.queue_task_id || null,
      tags: resp.metadata?.tags || resp.tags || '',
      city,
      state,
      zips: zips.join(', '),
      queryCount: queries.length,
      submittedAt: new Date().toISOString(),
      status: 'pending',
      resultData: [],
      recordCount: 0,
      imported: false,
      importCounts: null,
      error: null,
      etaSecs: resp?.estimated_time_seconds ?? resp?.time_left ?? resp?.eta ?? null,
    }

    setTasks(prev => [...prev, task])
    return task
  }, [config.categories]) // eslint-disable-line react-hooks/exhaustive-deps

  // shared poll cycle — polls all pending tasks once, returns Date of completion
  const runPoll = useCallback(async () => {
    let changed = false
    const snapshot = loadOsTasks()

    for (let i = 0; i < snapshot.length; i++) {
      const t = snapshot[i]
      if (t.status === 'completed' || t.status === 'failed') continue
      try {
        const pollId    = t.queueTaskId || t.taskId
        const result    = await pollTask(apiKeyRef.current, pollId)
        const newStatus = (result.status || '').toLowerCase()

        if (['success', 'finished', 'done'].includes(newStatus)) {
          let data = result.data || []
          // Flatten arrays-of-arrays (one sub-array per query)
          if (data.length > 0 && Array.isArray(data[0]) && !data[0]?.name) {
            data = data.flat()
          }
          snapshot[i] = { ...t, status: 'completed', resultData: data, recordCount: data.length, completedAt: new Date().toISOString() }
          changed = true
          onCompleteRef.current?.(snapshot[i])
        } else if (['failed', 'error'].includes(newStatus)) {
          snapshot[i] = { ...t, status: 'failed', error: result.error || 'Unknown error' }
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
      saveOsTasks(snapshot)
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
        const taskId  = r.id || r.task_id || r.taskId
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
