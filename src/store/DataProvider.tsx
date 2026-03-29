import { useEffect } from 'react'
import { RecordsProvider } from './RecordsContext'
import { LeadsProvider } from './LeadsContext'
import { StopsProvider } from './StopsContext'
import { OfflineProvider } from './OfflineContext'
import { applyPlatformClass } from '../lib/platform'
import { useSupabase } from '../hooks/useSupabase'

// Inner component so useSupabase runs after all context providers are mounted.
function SyncLayer({ children }: { children: React.ReactNode }) {
  useSupabase()
  return <>{children}</>
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyPlatformClass()
  }, [])

  return (
    <OfflineProvider>
      <RecordsProvider>
        <LeadsProvider>
          <StopsProvider>
            <SyncLayer>{children}</SyncLayer>
          </StopsProvider>
        </LeadsProvider>
      </RecordsProvider>
    </OfflineProvider>
  )
}
