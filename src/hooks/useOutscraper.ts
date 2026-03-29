import { useState, useCallback } from 'react'
import { settings } from '../lib/storage'
import { supabase } from '../lib/supabase'
import {
  submitScrape, pollTask, listTasks, getTaskConfig, extractTaskId,
  processOutscraperRows, withDefaults,
} from '../data/outscraper'
import type { OsConfig } from '../data/outscraper'
import { useRecords, useRecordsDispatch } from '../store/RecordsContext'
import type { OutscraperTask, TaskStatus } from '../types'

export function useOutscraper() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const records  = useRecords()
  const dispatch = useRecordsDispatch()

  const apiKey = settings.getOsKey()
  const config: OsConfig = withDefaults(settings.getOsCfg() as Partial<OsConfig>)

  // ── Submit a new scrape task ─────────────────────────────────────────────

  const submit = useCallback(
    async (title: string, queries: string[]): Promise<string | null> => {
      setLoading(true)
      setError(null)
      try {
        const resp = await submitScrape(apiKey, title, queries, config) as { id?: string; task_id?: string }
        const rawId = resp?.id ?? resp?.task_id ?? ''
        const taskId = extractTaskId(String(rawId))

        // Persist task to Supabase
        await supabase.schema('prospect').from('outscraper_tasks').insert({
          task_id: taskId,
          title,
          status: 'pending' as TaskStatus,
          config: config as unknown as Record<string, unknown>,
        })

        return taskId
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Submit failed')
        return null
      } finally {
        setLoading(false)
      }
    },
    [apiKey, config],
  )

  // ── Poll a task and import results when complete ─────────────────────────

  const poll = useCallback(
    async (requestId: string, area: string): Promise<{ status: string; added: number; updated: number } | null> => {
      setLoading(true)
      setError(null)
      try {
        const resp = await pollTask(apiKey, requestId) as {
          status?: string
          data?: unknown[]
          results?: unknown[]
        }
        const status = resp?.status ?? 'pending'

        if (status === 'Success' || status === 'success') {
          const rows = resp?.data ?? resp?.results ?? []
          const { allRecords, added, updated } = processOutscraperRows(
            rows,
            area,
            records,
            [],  // blocklist managed separately in Utilities
            [],
          )
          dispatch({ type: 'UPSERT_MANY', records: allRecords })

          // Mark task complete in Supabase
          await supabase
            .from('prospect.outscraper_tasks')
            .update({ status: 'completed' as TaskStatus, record_count: added + updated, completed_at: new Date().toISOString() })
            .eq('task_id', requestId)

          return { status, added, updated }
        }

        if (status === 'Error' || status === 'error') {
          await supabase
            .from('prospect.outscraper_tasks')
            .update({ status: 'failed' as TaskStatus })
            .eq('task_id', requestId)
        }

        return { status, added: 0, updated: 0 }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Poll failed')
        return null
      } finally {
        setLoading(false)
      }
    },
    [apiKey, records, dispatch],
  )

  // ── Fetch stored tasks from Supabase ──────────────────────────────────────

  const fetchTasks = useCallback(async (): Promise<OutscraperTask[]> => {
    const { data, error: err } = await supabase
      .from('prospect.outscraper_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (err) return []
    return (data ?? []) as OutscraperTask[]
  }, [])

  // ── List raw tasks from Outscraper API ────────────────────────────────────

  const fetchApiTasks = useCallback(async () => {
    return listTasks(apiKey)
  }, [apiKey])

  const fetchApiTaskConfig = useCallback(async (taskId: string) => {
    return getTaskConfig(apiKey, taskId)
  }, [apiKey])

  return {
    loading,
    error,
    config,
    submit,
    poll,
    fetchTasks,
    fetchApiTasks,
    fetchApiTaskConfig,
  }
}
