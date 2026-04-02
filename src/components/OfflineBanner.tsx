import { useState, useEffect, useRef } from 'react'
import { useOffline } from '../store/OfflineContext'

type BannerState = 'hidden' | 'offline' | 'syncing' | 'back-online'

export default function OfflineBanner() {
  const { isOnline, queueLength } = useOffline()
  const [banner, setBanner] = useState<BannerState>('hidden')
  const wasOfflineRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Clear any pending dismiss timer on state change
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = undefined
    }

    if (!isOnline) {
      wasOfflineRef.current = true
      setBanner('offline')
      return
    }

    // Just came back online after being offline
    if (wasOfflineRef.current) {
      if (queueLength > 0) {
        setBanner('syncing')
      } else {
        // Queue already drained (or was empty) -- show brief success
        setBanner('back-online')
        dismissTimerRef.current = setTimeout(() => {
          setBanner('hidden')
          wasOfflineRef.current = false
        }, 3000)
      }
      return
    }

    // Was never offline -- nothing to show
    setBanner('hidden')
  }, [isOnline, queueLength])

  // When syncing completes (queueLength drops to 0 while online), show success briefly
  useEffect(() => {
    if (banner === 'syncing' && queueLength === 0 && isOnline) {
      setBanner('back-online')
      dismissTimerRef.current = setTimeout(() => {
        setBanner('hidden')
        wasOfflineRef.current = false
      }, 3000)
    }
  }, [banner, queueLength, isOnline])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  const isVisible = banner !== 'hidden'

  return (
    <div
      className={`grid shrink-0 transition-[grid-template-rows] duration-300 ease-in-out ${
        isVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="overflow-hidden">
        {banner === 'offline' && (
          <div className="flex items-center gap-2 border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2">
            <svg
              className="h-4 w-4 shrink-0 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs font-medium text-yellow-300">
              You're offline — changes will sync when reconnected
              {queueLength > 0 && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300 leading-none">
                  {queueLength} {queueLength === 1 ? 'change' : 'changes'} pending
                </span>
              )}
            </span>
          </div>
        )}

        {banner === 'syncing' && (
          <div className="flex items-center gap-2 border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2">
            <svg
              className="h-4 w-4 shrink-0 animate-spin text-yellow-400"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-xs font-medium text-yellow-300">
              Back online — syncing {queueLength} {queueLength === 1 ? 'change' : 'changes'}...
            </span>
          </div>
        )}

        {banner === 'back-online' && (
          <div className="flex items-center gap-2 border-b border-green-500/30 bg-green-500/10 px-4 py-2">
            <svg
              className="h-4 w-4 shrink-0 text-green-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs font-medium text-green-300">
              Back online — all changes synced
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
