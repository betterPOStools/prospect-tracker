// Shared test utilities for component tests.
// Provides a wrapper that includes all context providers without Supabase/platform deps.

import { render, type RenderOptions } from '@testing-library/react'
import { RecordsProvider } from '../store/RecordsContext'
import { LeadsProvider } from '../store/LeadsContext'
import { StopsProvider } from '../store/StopsContext'
import { OfflineProvider } from '../store/OfflineContext'

function AllProviders({ children }: { children: React.ReactNode }) {
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

function renderWithProviders(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export { renderWithProviders }
export * from '@testing-library/react'
