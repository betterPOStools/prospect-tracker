import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RouteTab from './RouteTab'
import type { CanvassStop } from '../../types'

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock StopsContext
const mockStops: CanvassStop[] = []
vi.mock('../../store/StopsContext', () => ({
  useStops: () => mockStops,
  useStopsDispatch: () => vi.fn(),
}))

// Mock OfflineContext
vi.mock('../../store/OfflineContext', () => ({
  useOffline: () => ({ isOnline: true, queueLength: 0, enqueue: vi.fn() }),
}))

// Mock storage settings
vi.mock('../../lib/storage', () => ({
  settings: {
    getRxlUser: () => 'testuser',
    getRxlPass: () => 'testpass',
    getMapsApp: () => 'google' as const,
  },
  cache: {
    getStops: () => [],
    setStops: vi.fn(),
  },
  mutationQueue: {
    get: () => [],
    set: vi.fn(),
    push: vi.fn(),
    remove: vi.fn(),
  },
  migration: {
    isComplete: () => true,
    markComplete: vi.fn(),
    hasLegacyData: () => false,
  },
}))

// Mock platform (non-native)
vi.mock('../../lib/platform', () => ({
  isNative: false,
  isAndroid: false,
  openUrl: vi.fn(),
  applyPlatformClass: vi.fn(),
  getNetworkStatus: vi.fn(() => Promise.resolve(true)),
  exportFile: vi.fn(),
}))

// Mock routeXL
vi.mock('./routeXL', () => ({
  optimizeRoute: vi.fn(),
  geocodeAddress: vi.fn(),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStop(overrides: Partial<CanvassStop> & { id: string }): CanvassStop {
  return {
    name: `Stop ${overrides.id}`,
    address: `${overrides.id} Main St`,
    status: 'queued' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function getTodayName(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RouteTab', () => {
  beforeEach(() => {
    // Clear mockStops array between tests
    mockStops.length = 0
  })

  it('renders empty state when no stops for today', () => {
    // mockStops is empty — no stops assigned to today and no queued stops
    render(<RouteTab />)
    expect(screen.getByText('No stops for today')).toBeInTheDocument()
  })

  it('renders stop list with correct count when stops are assigned to today', () => {
    const today = getTodayName()
    const stops = [
      makeStop({ id: '1', name: 'Pizza Place', day: today }),
      makeStop({ id: '2', name: 'Burger Barn', day: today }),
      makeStop({ id: '3', name: 'Taco Town', day: today }),
    ]
    mockStops.push(...stops)

    render(<RouteTab />)

    // Header should show correct count and day
    expect(screen.getByText(new RegExp(`3 stops for ${today}`))).toBeInTheDocument()

    // All stop names should be visible
    expect(screen.getByText('Pizza Place')).toBeInTheDocument()
    expect(screen.getByText('Burger Barn')).toBeInTheDocument()
    expect(screen.getByText('Taco Town')).toBeInTheDocument()
  })

  it('falls back to queued/not_visited stops when no day-assigned stops exist', () => {
    const stops = [
      makeStop({ id: '1', name: 'Queued Stop', status: 'queued' }),
      makeStop({ id: '2', name: 'Canvassed Stop', status: 'canvassed' }),
      makeStop({ id: '3', name: 'Not Visited Stop', status: 'not_visited' }),
    ]
    mockStops.push(...stops)

    render(<RouteTab />)

    expect(screen.getByText('Queued Stop')).toBeInTheDocument()
    expect(screen.getByText('Not Visited Stop')).toBeInTheDocument()
    // Canvassed stop should NOT appear (not queued/not_visited)
    expect(screen.queryByText('Canvassed Stop')).not.toBeInTheDocument()
  })

  it('renders leg button after every 10 stops', () => {
    const today = getTodayName()
    // Create 15 stops — should produce 2 legs (10 + 5)
    for (let i = 1; i <= 15; i++) {
      mockStops.push(makeStop({ id: String(i), name: `Stop ${i}`, day: today }))
    }

    render(<RouteTab />)

    // Should show "Start Leg 1 in Maps" and "Start Leg 2 in Maps"
    const legButtons = screen.getAllByText(/Start Leg \d+ in Maps/)
    // With 2 legs: Leg 1 header + Leg 1 between-legs + Leg 2 header = 3 elements
    // (Leg 2 is last so no "after" button)
    expect(legButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('leg button does not appear for a single leg of fewer than 10 stops', () => {
    const today = getTodayName()
    for (let i = 1; i <= 5; i++) {
      mockStops.push(makeStop({ id: String(i), name: `Stop ${i}`, day: today }))
    }

    render(<RouteTab />)

    const legButtons = screen.queryAllByText(/Start Leg \d+ in Maps/)
    expect(legButtons.length).toBe(0)
  })

  it('copy addresses copies correct text to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'Alpha Diner', address: '100 Elm St', day: today }),
      makeStop({ id: '2', name: 'Beta Cafe', address: '200 Oak Ave', day: today }),
    )

    render(<RouteTab />)

    const copyBtn = screen.getByRole('button', { name: /copy addresses/i })
    fireEvent.click(copyBtn)

    // Wait for async clipboard write
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })

    const copiedText = writeText.mock.calls[0][0] as string
    expect(copiedText).toContain('100 Elm St')
    expect(copiedText).toContain('200 Oak Ave')
    // Addresses should be newline-separated (numbered list)
    expect(copiedText).toBe('1. 100 Elm St\n2. 200 Oak Ave')
  })

  it('navigate button opens google maps URL for single stop', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'Test Restaurant', address: '123 Test Blvd', day: today }),
    )

    render(<RouteTab />)

    const navButton = screen.getAllByRole('button', { name: /navigate to/i })[0]
    fireEvent.click(navButton)

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('maps.google.com'),
      '_blank',
    )
    expect(openSpy.mock.calls[0][0]).toContain(encodeURIComponent('123 Test Blvd'))

    openSpy.mockRestore()
  })

  it('shows warning banner when stops exceed 20 (RouteXL free limit)', () => {
    const today = getTodayName()
    for (let i = 1; i <= 21; i++) {
      mockStops.push(makeStop({ id: String(i), name: `Stop ${i}`, day: today }))
    }

    render(<RouteTab />)

    expect(
      screen.getByText(/RouteXL free tier supports max 20 stops/i),
    ).toBeInTheDocument()
  })

  it('shows geocode button only when some stops are missing lat/lng', () => {
    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'Has Coords', address: '1 A St', day: today, lat: 30.1, lng: -97.1 }),
      makeStop({ id: '2', name: 'Missing Coords', address: '2 B St', day: today }),
    )

    render(<RouteTab />)

    expect(screen.getByText(/geocode missing/i)).toBeInTheDocument()
  })

  it('disables geocode button when all stops have lat/lng', () => {
    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'Has Coords', address: '1 A St', day: today, lat: 30.1, lng: -97.1 }),
    )

    render(<RouteTab />)

    const btn = screen.getByRole('button', { name: /geocode missing/i })
    expect(btn).toBeDisabled()
  })

  // ── Day selector tests ──────────────────────────────────────────────────

  it('renders day selector with Today as default selection', () => {
    const today = getTodayName()
    mockStops.push(makeStop({ id: '1', name: 'Stop A', day: today }))

    render(<RouteTab />)

    const daySelector = screen.getByTestId('day-selector')
    expect(daySelector).toBeInTheDocument()

    // "Today" button should exist
    const todayBtn = screen.getByRole('button', { name: 'Today' })
    expect(todayBtn).toBeInTheDocument()
    // "Today" should have the active style (blue bg)
    expect(todayBtn.className).toContain('bg-[#1a2744]')

    // Day abbreviation buttons should also exist
    expect(screen.getByRole('button', { name: 'Mon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fri' })).toBeInTheDocument()
  })

  it('day selector filters stops by selected day', () => {
    mockStops.push(
      makeStop({ id: '1', name: 'Monday Stop', day: 'Monday' }),
      makeStop({ id: '2', name: 'Tuesday Stop', day: 'Tuesday' }),
      makeStop({ id: '3', name: 'Wednesday Stop', day: 'Wednesday' }),
    )

    render(<RouteTab />)

    // Click Monday
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }))

    // Monday stop should be visible
    expect(screen.getByText('Monday Stop')).toBeInTheDocument()
    // Tuesday stop should NOT be visible
    expect(screen.queryByText('Tuesday Stop')).not.toBeInTheDocument()

    // Header should show Monday
    expect(screen.getByText(/1 stop for Monday/)).toBeInTheDocument()
  })

  it('day selector shows empty state for day with no stops', () => {
    mockStops.push(makeStop({ id: '1', name: 'Monday Stop', day: 'Monday' }))

    render(<RouteTab />)

    // Click Wednesday — no stops assigned
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }))

    expect(screen.getByText('No stops for Wednesday')).toBeInTheDocument()
  })

  it('day selector shows day buttons in empty state', () => {
    // No stops at all
    render(<RouteTab />)

    const daySelector = screen.getByTestId('day-selector')
    expect(daySelector).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
  })

  // ── Progress footer tests ──────────────────────────────────────────────

  it('progress footer shows correct visited counts', () => {
    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'Canvassed Stop', day: today, status: 'canvassed' }),
      makeStop({ id: '2', name: 'Come Back Stop', day: today, status: 'come_back_later' }),
      makeStop({ id: '3', name: 'Queued Stop', day: today, status: 'queued' }),
      makeStop({ id: '4', name: 'Not Visited Stop', day: today, status: 'not_visited' }),
    )

    render(<RouteTab />)

    const footer = screen.getByTestId('progress-footer')
    expect(footer).toBeInTheDocument()
    // canvassed + come_back_later = 2 visited out of 4 total
    expect(footer).toHaveTextContent('2 of 4 visited')
  })

  it('progress footer shows 0 visited when none completed', () => {
    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'Queued 1', day: today, status: 'queued' }),
      makeStop({ id: '2', name: 'Queued 2', day: today, status: 'queued' }),
    )

    render(<RouteTab />)

    const footer = screen.getByTestId('progress-footer')
    expect(footer).toHaveTextContent('0 of 2 visited')
  })

  // ── Coordinate toggle tests ──────────────────────────────────────────────

  it('shows coordinate toggle when some stops have lat/lng', () => {
    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'With Coords', day: today, lat: 30.0, lng: -97.0 }),
      makeStop({ id: '2', name: 'Without Coords', day: today }),
    )

    render(<RouteTab />)

    const toggle = screen.getByTestId('coords-toggle')
    expect(toggle).toBeInTheDocument()
    // Default should show "Address" label
    expect(toggle).toHaveTextContent('Address')
  })

  it('hides coordinate toggle when no stops have lat/lng', () => {
    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'No Coords 1', day: today }),
      makeStop({ id: '2', name: 'No Coords 2', day: today }),
    )

    render(<RouteTab />)

    expect(screen.queryByTestId('coords-toggle')).not.toBeInTheDocument()
  })

  it('coordinate toggle switches between Address and Coords mode', () => {
    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'With Coords', day: today, lat: 30.0, lng: -97.0 }),
    )

    render(<RouteTab />)

    const toggle = screen.getByTestId('coords-toggle')
    expect(toggle).toHaveTextContent('Address')

    // Click to switch to coords mode
    fireEvent.click(toggle)
    expect(toggle).toHaveTextContent('Coords')

    // Click again to switch back
    fireEvent.click(toggle)
    expect(toggle).toHaveTextContent('Address')
  })

  it('coordinate toggle in coords mode uses lat/lng in map URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'Coord Stop', address: '123 Main St', day: today, lat: 30.123, lng: -97.456 }),
    )

    render(<RouteTab />)

    // Enable coords mode
    const toggle = screen.getByTestId('coords-toggle')
    fireEvent.click(toggle)

    // Click navigate
    const navButton = screen.getAllByRole('button', { name: /navigate to/i })[0]
    fireEvent.click(navButton)

    expect(openSpy).toHaveBeenCalledWith(
      'https://maps.google.com/?q=30.123,-97.456',
      '_blank',
    )

    openSpy.mockRestore()
  })
})
