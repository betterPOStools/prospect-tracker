// Startup sync + realtime subscriptions for all tables.
// Called once from DataProvider on mount.
// - Checks 15-min cache freshness before hitting Supabase
// - Fetches records, leads, stops, activities in parallel
// - Subscribes to realtime postgres_changes for all four tables
// - Echoes from own mutations are ignored via a 2-second echo window

import { useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { cache } from '../lib/storage'
import { useRecordsDispatch } from '../store/RecordsContext'
import { useLeadsDispatch } from '../store/LeadsContext'
import { useStopsDispatch } from '../store/StopsContext'
import type { ProspectRecord, Lead, CanvassStop, Activity } from '../types'

const ECHO_WINDOW_MS = 2000

export function useSupabase() {
  const recordsDispatch = useRecordsDispatch()
  const leadsDispatch   = useLeadsDispatch()
  const stopsDispatch   = useStopsDispatch()

  // Track our own recent mutation IDs to suppress realtime echoes
  const recentMutations = useRef<Set<string>>(new Set())

  const suppressEcho = useCallback((id: string) => {
    recentMutations.current.add(id)
    setTimeout(() => recentMutations.current.delete(id), ECHO_WINDOW_MS)
  }, [])

  // ── Initial load ─────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (cache.isCacheFresh()) return   // skip if cache is <15 min old

    const [recordsRes, leadsRes, stopsRes, activitiesRes] = await Promise.all([
      supabase.from('prospect.records').select('*').order('score', { ascending: false }),
      supabase.from('prospect.leads').select('*').order('updated_at', { ascending: false }),
      supabase.from('prospect.canvass_stops').select('*').order('updated_at', { ascending: false }),
      supabase.from('prospect.activities').select('*').order('created_at', { ascending: true }),
    ])

    if (recordsRes.data) {
      const records = recordsRes.data as ProspectRecord[]
      recordsDispatch({ type: 'SET_ALL', records })
    }

    if (leadsRes.data) {
      const leads = leadsRes.data as Lead[]
      leadsDispatch({ type: 'SET_ALL', leads })
    }

    if (stopsRes.data) {
      const stops = stopsRes.data as CanvassStop[]

      // Inline activities into their stops
      if (activitiesRes.data) {
        const activities = activitiesRes.data as Activity[]
        const byStop = new Map<string, Activity[]>()
        for (const act of activities) {
          if (!act.stop_id) continue
          const list = byStop.get(act.stop_id) ?? []
          list.push(act)
          byStop.set(act.stop_id, list)
        }
        const hydrated = stops.map((s) => ({ ...s, activities: byStop.get(s.id) ?? [] }))
        stopsDispatch({ type: 'SET_ALL', stops: hydrated })
      } else {
        stopsDispatch({ type: 'SET_ALL', stops })
      }
    }

    cache.setSyncedAt(new Date().toISOString())
  }, [recordsDispatch, leadsDispatch, stopsDispatch])

  // ── Realtime subscriptions ───────────────────────────────────────────────

  useEffect(() => {
    loadAll()

    const channel = supabase
      .channel('prospect-realtime')

      // Records
      .on(
        'postgres_changes',
        { event: '*', schema: 'prospect', table: 'records' },
        (payload) => {
          const id = (payload.new as ProspectRecord)?.id ?? (payload.old as { id?: string })?.id
          if (id && recentMutations.current.has(id)) return

          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string }
            if (old.id) recordsDispatch({ type: 'DELETE', id: old.id })
          } else {
            recordsDispatch({ type: 'UPSERT', record: payload.new as ProspectRecord })
          }
        },
      )

      // Leads
      .on(
        'postgres_changes',
        { event: '*', schema: 'prospect', table: 'leads' },
        (payload) => {
          const id = (payload.new as Lead)?.id ?? (payload.old as { id?: string })?.id
          if (id && recentMutations.current.has(id)) return

          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string }
            if (old.id) leadsDispatch({ type: 'DELETE', id: old.id })
          } else if (payload.eventType === 'INSERT') {
            leadsDispatch({ type: 'ADD', lead: payload.new as Lead })
          } else {
            leadsDispatch({ type: 'UPDATE', lead: payload.new as Lead })
          }
        },
      )

      // Canvass stops
      .on(
        'postgres_changes',
        { event: '*', schema: 'prospect', table: 'canvass_stops' },
        (payload) => {
          const id = (payload.new as CanvassStop)?.id ?? (payload.old as { id?: string })?.id
          if (id && recentMutations.current.has(id)) return

          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string }
            if (old.id) stopsDispatch({ type: 'DELETE', id: old.id })
          } else if (payload.eventType === 'INSERT') {
            stopsDispatch({ type: 'ADD', stop: payload.new as CanvassStop })
          } else {
            stopsDispatch({ type: 'UPDATE', stop: payload.new as CanvassStop })
          }
        },
      )

      // Activities — append to their parent stop
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'prospect', table: 'activities' },
        (payload) => {
          const act = payload.new as Activity
          if (!act.stop_id) return
          stopsDispatch({ type: 'APPEND_ACTIVITY', stop_id: act.stop_id, activity: act })
        },
      )

      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadAll, recordsDispatch, leadsDispatch, stopsDispatch])

  return { suppressEcho, reload: loadAll }
}
