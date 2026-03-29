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
    // Addresses should be newline-separated
    expect(copiedText).toBe('100 Elm St\n200 Oak Ave')
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

  it('does not show geocode button when all stops have lat/lng', () => {
    const today = getTodayName()
    mockStops.push(
      makeStop({ id: '1', name: 'Has Coords', address: '1 A St', day: today, lat: 30.1, lng: -97.1 }),
    )

    render(<RouteTab />)

    expect(screen.queryByText(/geocode missing/i)).not.toBeInTheDocument()
  })
})
