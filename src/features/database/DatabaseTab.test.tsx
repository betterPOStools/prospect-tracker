import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ProspectRecord } from '../../types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Supabase — must be mocked before importing anything that uses it
const mockSupabase = {
  from: () => ({
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
    in: vi.fn().mockResolvedValue({ error: null }),
    not: vi.fn().mockResolvedValue({ error: null }),
  }),
}
vi.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
  db: mockSupabase,
}))

// Platform — not native in tests
vi.mock('../../lib/platform', () => ({
  isNative: false,
  isAndroid: false,
  applyPlatformClass: vi.fn(),
  getNetworkStatus: vi.fn().mockResolvedValue(true),
  exportFile: vi.fn(),
  openUrl: vi.fn(),
}))

// @tanstack/react-virtual — mock to render all items in jsdom (no scroll height)
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
    const size = estimateSize()
    const items = Array.from({ length: count }, (_, i) => ({
      key: i,
      index: i,
      start: i * size,
      size,
    }))
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
      measureElement: () => undefined,
    }
  },
}))

// Leaflet / react-leaflet — not needed in unit tests
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  CircleMarker: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="circle-marker">{children}</div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
  useMap: () => ({
    fitBounds: vi.fn(),
  }),
}))

vi.mock('leaflet/dist/leaflet.css', () => ({}))

// Storage — avoid localStorage issues in tests
vi.mock('../../lib/storage', () => ({
  cache: {
    getRecords: () => [],
    setRecords: vi.fn(),
    getLeads: () => [],
    setLeads: vi.fn(),
    getStops: () => [],
    setStops: vi.fn(),
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

import { RecordsProvider, useRecordsDispatch } from '../../store/RecordsContext'
import { StopsProvider } from '../../store/StopsContext'

function makeRecord(overrides: Partial<ProspectRecord> = {}): ProspectRecord {
  return {
    id: crypto.randomUUID(),
    name: 'Test Restaurant',
    score: 80,
    priority: 'Hot',
    status: 'unworked',
    is_chain: false,
    dropped_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Wrapper that seeds records into context before rendering the target component.
 */
function SeedRecords({
  records,
  children,
}: {
  records: ProspectRecord[]
  children: React.ReactNode
}) {
  const dispatch = useRecordsDispatch()
  React.useEffect(() => {
    dispatch({ type: 'SET_ALL', records })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children}</>
}

function renderWithProviders(
  ui: React.ReactElement,
  records: ProspectRecord[] = [],
) {
  return render(
    <RecordsProvider>
      <StopsProvider>
        <SeedRecords records={records}>{ui}</SeedRecords>
      </StopsProvider>
    </RecordsProvider>,
  )
}

// ── Lazy import targets ───────────────────────────────────────────────────────

// Import after mocks
const DatabaseTabModule = await import('./DatabaseTab')
const DatabaseTab = DatabaseTabModule.default

const BrowsePanelModule = await import('./BrowsePanel')
const BrowsePanel = BrowsePanelModule.default

const PlannerPanelModule = await import('./PlannerPanel')
const PlannerPanel = PlannerPanelModule.default

// ── DatabaseTab tests ─────────────────────────────────────────────────────────

describe('DatabaseTab', () => {
  it('renders the stats row with correct counts', async () => {
    const records = [
      makeRecord({ priority: 'Fire', status: 'unworked' }),
      makeRecord({ priority: 'Hot', status: 'unworked' }),
      makeRecord({ priority: 'Warm', status: 'canvassed' }),
      makeRecord({ priority: 'Cold', status: 'converted' }),
      makeRecord({ priority: 'Dead', status: 'in_canvass' }),
    ]
    renderWithProviders(<DatabaseTab />, records)

    // Wait for seed effect
    await vi.waitFor(() => {
      expect(screen.getByLabelText('Database statistics')).toBeInTheDocument()
    })

    const statsRow = screen.getByLabelText('Database statistics')
    expect(statsRow.textContent).toContain('5')   // Total
    expect(statsRow.textContent).toContain('1')   // Fire count appears
    expect(statsRow.textContent).toContain('Unworked')
    expect(statsRow.textContent).toContain('Worked')
  })

  it('renders Browse/Planner/Map sub-tabs', () => {
    renderWithProviders(<DatabaseTab />)
    expect(screen.getByText('Browse')).toBeInTheDocument()
    expect(screen.getByText('Planner')).toBeInTheDocument()
    expect(screen.getByText('Map')).toBeInTheDocument()
  })

  it('shows BrowsePanel by default', () => {
    const records = [makeRecord()]
    renderWithProviders(<DatabaseTab />, records)
    // BrowsePanel renders a search input
    expect(screen.getByLabelText('Search records')).toBeInTheDocument()
  })

  it('switches to PlannerPanel when Planner sub-tab is clicked', () => {
    renderWithProviders(<DatabaseTab />)
    fireEvent.click(screen.getByText('Planner'))
    // PlannerPanel renders day selector buttons with full aria-label
    expect(screen.getByLabelText('Monday')).toBeInTheDocument()
  })
})

// ── BrowsePanel tests ─────────────────────────────────────────────────────────

describe('BrowsePanel', () => {
  const records = [
    makeRecord({ id: '1', name: 'Hot Spot Diner', priority: 'Hot', status: 'unworked', area: 'North' }),
    makeRecord({ id: '2', name: 'Cold Corner Cafe', priority: 'Cold', status: 'canvassed', area: 'South' }),
    makeRecord({ id: '3', name: 'Fire Grill', priority: 'Fire', status: 'unworked', area: 'North' }),
    makeRecord({ id: '4', name: 'Warm Bistro', priority: 'Warm', status: 'converted', area: 'East' }),
  ]

  // Helper to get count text from the "Showing X of Y" element
  function getShowingText() {
    // The text is split across spans inside a single container
    const el = document.querySelector('[data-testid="browse-count-bar"]')
    return el?.textContent ?? ''
  }

  it('shows all records initially', async () => {
    renderWithProviders(<BrowsePanel />, records)
    await vi.waitFor(() => {
      expect(getShowingText()).toMatch(/4.*of.*4/)
    })
  })

  it('filters by priority', async () => {
    renderWithProviders(<BrowsePanel />, records)
    await vi.waitFor(() => {
      expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument()
    })
    // Wait for records to seed
    await vi.waitFor(() => {
      expect(getShowingText()).toMatch(/4.*of.*4/)
    })
    const select = screen.getByLabelText('Filter by priority')
    fireEvent.change(select, { target: { value: 'Fire' } })
    expect(getShowingText()).toMatch(/1.*of.*4/)
  })

  it('filters by search text', async () => {
    renderWithProviders(<BrowsePanel />, records)
    await vi.waitFor(() => {
      expect(getShowingText()).toMatch(/4.*of.*4/)
    })
    const searchInput = screen.getByLabelText('Search records')
    fireEvent.change(searchInput, { target: { value: 'hot spot' } })
    expect(getShowingText()).toMatch(/1.*of.*4/)
  })

  it('filters by status', async () => {
    renderWithProviders(<BrowsePanel />, records)
    await vi.waitFor(() => {
      expect(getShowingText()).toMatch(/4.*of.*4/)
    })
    const select = screen.getByLabelText('Filter by status')
    fireEvent.change(select, { target: { value: 'canvassed' } })
    expect(getShowingText()).toMatch(/1.*of.*4/)
  })

  it('filters by area', async () => {
    renderWithProviders(<BrowsePanel />, records)
    await vi.waitFor(() => {
      expect(getShowingText()).toMatch(/4.*of.*4/)
    })
    const select = screen.getByLabelText('Filter by area')
    fireEvent.change(select, { target: { value: 'North' } })
    expect(getShowingText()).toMatch(/2.*of.*4/)
  })

  it('shows empty state when no records match filter', async () => {
    renderWithProviders(<BrowsePanel />, records)
    await vi.waitFor(() => {
      expect(screen.getByLabelText('Search records')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText('Search records'), {
      target: { value: 'zzz no match zzz' },
    })
    expect(screen.getByText('No records match')).toBeInTheDocument()
  })

  it('shows bulk action bar when records are selected', async () => {
    renderWithProviders(<BrowsePanel />, records)
    // Wait for seed + filter count to update so we know records are loaded
    await vi.waitFor(() => {
      expect(getShowingText()).toMatch(/4.*of.*4/)
    })
    // The "Hide on hold" checkbox and row checkboxes are all checkboxes
    const checkboxes = screen.getAllByRole('checkbox')
    // First checkbox is "Hide on hold" toggle; row checkboxes come after
    // Find a row checkbox by aria-label pattern
    const rowCheckbox = checkboxes.find(
      (cb) => cb.getAttribute('aria-label')?.startsWith('Select '),
    )
    expect(rowCheckbox).toBeTruthy()
    fireEvent.click(rowCheckbox!)
    expect(screen.getByText("Add to Today's Canvass")).toBeInTheDocument()
  })

  it('enters inline edit mode on double-click', async () => {
    renderWithProviders(<BrowsePanel />, records)
    await vi.waitFor(() => {
      expect(getShowingText()).toMatch(/4.*of.*4/)
    })
    // Double-click the first record row
    const row = screen.getByTestId('record-row-1')
    fireEvent.doubleClick(row)
    // Inline edit inputs should appear
    expect(screen.getByLabelText('Edit name')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit priority')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit status')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit area')).toBeInTheDocument()
    expect(screen.getByLabelText('Edit day')).toBeInTheDocument()
    expect(screen.getByLabelText('Save inline edit')).toBeInTheDocument()
    expect(screen.getByLabelText('Cancel inline edit')).toBeInTheDocument()
  })

  it('exits inline edit mode on cancel click', async () => {
    renderWithProviders(<BrowsePanel />, records)
    await vi.waitFor(() => {
      expect(getShowingText()).toMatch(/4.*of.*4/)
    })
    // Enter edit mode
    const row = screen.getByTestId('record-row-1')
    fireEvent.doubleClick(row)
    expect(screen.getByLabelText('Edit name')).toBeInTheDocument()
    // Click cancel
    fireEvent.click(screen.getByLabelText('Cancel inline edit'))
    // Edit inputs should be gone, row should be back
    expect(screen.queryByLabelText('Edit name')).not.toBeInTheDocument()
    expect(screen.getByTestId('record-row-1')).toBeInTheDocument()
  })
})

// ── PlannerPanel tests ────────────────────────────────────────────────────────

describe('PlannerPanel', () => {
  it('renders day rows for Mon through Fri', () => {
    renderWithProviders(<PlannerPanel />)
    // Day selector buttons use full day name as aria-label
    expect(screen.getByLabelText(/^Monday/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Tuesday/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Wednesday/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Thursday/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Friday/)).toBeInTheDocument()
  })

  it('shows unassigned count', async () => {
    const unassigned = [
      makeRecord({ status: 'unworked', day: undefined }),
      makeRecord({ status: 'unworked', day: undefined }),
    ]
    const assigned = [makeRecord({ status: 'unworked', day: 'Monday' })]
    renderWithProviders(<PlannerPanel />, [...unassigned, ...assigned])
    await vi.waitFor(() => {
      expect(screen.getByText(/unassigned unworked records/)).toBeInTheDocument()
    })
    // 2 unassigned unworked
    expect(screen.getByText(/unassigned unworked records/).textContent).toMatch(/2/)
  })

  it('renders Clear Week button', () => {
    renderWithProviders(<PlannerPanel />)
    expect(screen.getByText('Clear Week')).toBeInTheDocument()
  })

  it('renders anchor search input', () => {
    renderWithProviders(<PlannerPanel />)
    expect(screen.getByLabelText('Search anchor')).toBeInTheDocument()
  })

  it('renders Fill button for selected day', () => {
    renderWithProviders(<PlannerPanel />)
    // Button text includes the short day name
    const fillButton = screen.getByRole('button', { name: /^Fill /i })
    expect(fillButton).toBeInTheDocument()
  })

  it('does NOT render Near Me button when not native', () => {
    renderWithProviders(<PlannerPanel />)
    expect(screen.queryByText('Near Me')).not.toBeInTheDocument()
  })

  it('shows assigned stops in day rows', async () => {
    const records = [
      makeRecord({ status: 'unworked', day: 'Monday' }),
      makeRecord({ status: 'unworked', day: 'Monday' }),
      makeRecord({ status: 'unworked', day: 'Friday' }),
    ]
    renderWithProviders(<PlannerPanel />, records)

    await vi.waitFor(() => {
      // Monday row shows 2 stops and has Canvass/Clear buttons
      const canvassButtons = screen.getAllByRole('button', { name: /Canvass/i })
      expect(canvassButtons.length).toBeGreaterThanOrEqual(1)
    })
  })
})
