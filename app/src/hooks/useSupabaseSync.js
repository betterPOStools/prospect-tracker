import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const TABLE          = 'app_state'
const ROW_ID         = 1
const DEBOUNCE_MS    = 1500
const ECHO_WINDOW_MS = 2000

export function useSupabaseSync() {
  const [status,     setStatus]     = useState('idle')
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [error,      setError]      = useState(null)

  const writeTimerRef     = useRef(null)
  const lastWriteTimeRef  = useRef(null)
  const channelRef        = useRef(null)

  const enabled = !!supabase

  async function loadFromSupabase() {
    if (!enabled) return null
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('payload, updated_at')
        .eq('id', ROW_ID)
        .maybeSingle()
      if (error) throw error
      return data
    } catch (e) {
      console.warn('[SupabaseSync] startup load failed:', e.message)
      return null
    }
  }

  const writeToSupabase = useCallback((payload) => {
    if (!enabled) return
    clearTimeout(writeTimerRef.current)
    writeTimerRef.current = setTimeout(async () => {
      setStatus('syncing')
      try {
        const now = new Date().toISOString()
        const { error } = await supabase
          .from(TABLE)
          .upsert({ id: ROW_ID, payload, updated_at: now }, { onConflict: 'id' })
        if (error) throw error
        lastWriteTimeRef.current = Date.now()
        const ts = new Date()
        setLastSyncAt(ts)
        localStorage.setItem('vs_supabase_synced_at', ts.toISOString())
        setStatus('synced')
        setTimeout(() => setStatus(s => s === 'synced' ? 'idle' : s), 3000)
      } catch (e) {
        setStatus('error')
        setError(e.message)
        console.warn('[SupabaseSync] write failed:', e.message)
      }
    }, DEBOUNCE_MS)
  }, [enabled])

  function subscribeRealtime({ onUpdate }) {
    if (!enabled) return () => {}

    const channel = supabase
      .channel('app_state_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: TABLE, filter: `id=eq.${ROW_ID}` },
        (event) => {
          if (lastWriteTimeRef.current && Date.now() - lastWriteTimeRef.current < ECHO_WINDOW_MS) return
          const incoming = event.new
          if (!incoming?.payload) return
          onUpdate(incoming.payload, incoming.updated_at)
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearTimeout(writeTimerRef.current)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  return { enabled, status, lastSyncAt, error, loadFromSupabase, writeToSupabase, subscribeRealtime }
}
