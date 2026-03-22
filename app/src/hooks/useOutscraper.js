import { useState, useRef, useEffect, useCallback } from 'react'
import {
  loadOsApiKey, saveOsApiKey,
  loadOsConfig, saveOsConfig,
  loadOsTasks, saveOsTasks,
  buildQueries, submitScrape, pollTask,
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

  // startPolling — 30s interval; calls onTaskComplete(updatedTask) when a task finishes
  const startPolling = useCallback((onTaskComplete) => {
    stopPolling()
    onCompleteRef.current = onTaskComplete

    pollingRef.current = setInterval(async () => {
      let changed = false
      const snapshot = loadOsTasks()

      for (let i = 0; i < snapshot.length; i++) {
        const t = snapshot[i]
        if (t.status === 'completed' || t.status === 'failed') continue
        try {
          const result    = await pollTask(apiKeyRef.current, t.taskId)
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
            if (progress !== t.progress || etaSecs !== t.etaSecs) {
              snapshot[i] = { ...t, status: newStatus || 'running', progress, etaSecs }
              changed = true
            }
          }
        } catch (e) { /* keep polling on transient errors */ }
      }

      if (changed) {
        saveOsTasks(snapshot)
        _setTasks([...snapshot])
      }
    }, 30_000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  return {
    apiKey, setApiKey,
    config, setConfig,
    tasks,  setTasks,
    submit,
    startPolling, stopPolling,
    markImported, removeTask, retryTask,
  }
}
