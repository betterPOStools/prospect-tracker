import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { PendingMutation } from '../types'
import { mutationQueue } from '../lib/storage'
import { getNetworkStatus } from '../lib/platform'
import { supabase } from '../lib/supabase'

interface OfflineContextValue {
  isOnline: boolean
  queueLength: number
  enqueue: (mutation: Omit<PendingMutation, 'attempts'>) => void
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true)
  const [queueLength, setQueueLength] = useState(() => mutationQueue.get().length)

  const flushQueue = useCallback(async () => {
    const queue = mutationQueue.get()
    if (!queue.length) return

    for (const mutation of queue) {
      let success = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (mutation.operation === 'delete') {
            await supabase.from(mutation.table).delete().eq('id', mutation.record_id)
          } else {
            await supabase.from(mutation.table).upsert(mutation.payload)
          }
          success = true
          break
        } catch {
          // retry
        }
      }
      if (success) {
        mutationQueue.remove(mutation.id)
      }
    }
    setQueueLength(mutationQueue.get().length)
  }, [])

  // Detect online/offline changes
  useEffect(() => {
    let cleanup: (() => void) | undefined

    async function setup() {
      const online = await getNetworkStatus()
      setIsOnline(online)

      const handleOnline = () => setIsOnline(true)
      const handleOffline = () => setIsOnline(false)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      cleanup = () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }

    void setup()
    return () => cleanup?.()
  }, [])

  // Flush queue when coming back online
  useEffect(() => {
    if (!isOnline) return
    void flushQueue()
  }, [isOnline, flushQueue])

  const enqueue = useCallback((mutation: Omit<PendingMutation, 'attempts'>) => {
    mutationQueue.push({ ...mutation, attempts: 0 })
    setQueueLength(mutationQueue.get().length)
  }, [])

  return (
    <OfflineContext value={{ isOnline, queueLength, enqueue }}>
      {children}
    </OfflineContext>
  )
}

export function useOffline() {
  const ctx = useContext(OfflineContext)
  if (ctx === null) throw new Error('useOffline must be used within OfflineProvider')
  return ctx
}
