import { useState, useEffect } from 'react'
import { useOffline } from '../store/OfflineContext'
import { cache } from '../lib/storage'

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export default function SyncStatus() {
  const { isOnline, queueLength } = useOffline()
  const [syncedAt, setSyncedAt] = useState(() => cache.getSyncedAt())

  useEffect(() => {
    const id = setInterval(() => setSyncedAt(cache.getSyncedAt()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!isOnline) {
    return (
      <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Offline
      </div>
    )
  }

  if (queueLength > 0) {
    return (
      <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-yellow-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
        Syncing {queueLength}…
      </div>
    )
  }

  const rel = relativeTime(syncedAt)
  return (
    <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      {rel ? `Cloud · ${rel}` : 'Cloud sync ready'}
    </div>
  )
}
