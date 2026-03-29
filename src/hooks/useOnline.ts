import { useOffline } from '../store/OfflineContext'

export function useOnline() {
  const { isOnline, queueLength } = useOffline()
  return { isOnline, queueLength }
}
