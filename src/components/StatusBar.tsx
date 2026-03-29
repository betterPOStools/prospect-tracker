import { useOffline } from '../store/OfflineContext'

export default function StatusBar() {
  const { isOnline, queueLength } = useOffline()

  if (isOnline && queueLength === 0) return null

  return (
    <div
      className={`shrink-0 px-3 py-1 text-center text-xs font-medium ${
        isOnline ? 'bg-yellow-50 text-yellow-800' : 'bg-red-50 text-red-800'
      }`}
    >
      {!isOnline && '● Offline'}
      {isOnline && queueLength > 0 && `Syncing ${queueLength} pending change${queueLength !== 1 ? 's' : ''}…`}
    </div>
  )
}
