import { useEffect } from 'react'
import { RecordsProvider } from './RecordsContext'
import { LeadsProvider } from './LeadsContext'
import { StopsProvider } from './StopsContext'
import { OfflineProvider } from './OfflineContext'
import { applyPlatformClass } from '../lib/platform'

export function DataProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyPlatformClass()
  }, [])

  return (
    <OfflineProvider>
      <RecordsProvider>
        <LeadsProvider>
          <StopsProvider>{children}</StopsProvider>
        </LeadsProvider>
      </RecordsProvider>
    </OfflineProvider>
  )
}
