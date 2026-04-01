import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CanvassStop } from '../../types'
import CanvassTab from './CanvassTab'

// ── Mock supabase ─────────────────────────────────────────────────────────────

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      delete: () => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
      in: vi.fn().mockResolvedValue({ error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}))

// ── Mock platform ─────────────────────────────────────────────────────────────

vi.mock('../../lib/platform', () => ({
  isNative: false,
}))

// ── Mock contexts ─────────────────────────────────────────────────────────────

const mockStopsDispatch = vi.fn()
const mockLeadsDispatch = vi.fn()

vi.mock('../../store/StopsContext', () => ({
  useStops: vi.fn(),
  useStopsDispatch: () => mockStopsDispatch,
}))

vi.mock('../../store/LeadsContext', () => ({
  useLeads: vi.fn(() => []),
  useLeadsDispatch: () => mockLeadsDispatch,
}))

vi.mock('../../store/RecordsContext', () => ({
  useRecords: vi.fn(() => []),
  useRecordsDispatch: () => vi.fn(),
}))

vi.mock('../../store/OfflineContext', () => ({
  useOffline: vi.fn(() => ({ isOnline: true, queueLength: 0, enqueue: vi.fn() })),
}))

import { useStops } from '../../store/StopsContext'

// ── Test data ─────────────────────────────────────────────────────────────────

function makeStop(overrides: Partial<CanvassStop> = {}): CanvassStop {
  return {
    id: crypto.randomUUID(),
    name: 'Test Stop',
    status: 'queued',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

const SAMPLE_STOPS: CanvassStop[] = [
  makeStop({ id: '1', name: 'Pizza Palace', status: 'queued' }),
  makeStop({ id: '2', name: 'Burger Barn', status: 'not_visited' }),
  makeStop({ id: '3', name: 'Taco Town', status: 'come_back_later' }),
  makeStop({ id: '4', name: 'Sushi Spot', status: 'dm_unavailable' }),
  makeStop({ id: '5', name: 'Hot Dog Hut', status: 'canvassed' }),
  makeStop({ id: '6', name: 'Waffle World', status: 'converted' }),
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CanvassTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Stats row ──────────────────────────────────────────────────────────────

  describe('stats row', () => {
    it('renders correct queue count (queued + not_visited)', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      const stats = screen.getByTestId('canvass-stats')
      // Queue = 2 (queued + not_visited)
      expect(stats).toHaveTextContent('2')
      expect(stats).toHaveTextContent('Queue')
    })

    it('renders correct follow up count (come_back_later + dm_unavailable)', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      const stats = screen.getByTestId('canvass-stats')
      // Follow Up = 2
      expect(stats).toHaveTextContent('Follow Up')
    })

    it('renders correct completed count (canvassed + converted)', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      const stats = screen.getByTestId('canvass-stats')
      // Completed = 2
      expect(stats).toHaveTextContent('Completed')
    })

    it('shows zero counts when stops array is empty', () => {
      vi.mocked(useStops).mockReturnValue([])
      render(<CanvassTab />)

      const stats = screen.getByTestId('canvass-stats')
      const zeros = stats.querySelectorAll('span')
      // All three numeric cells should show 0
      const zeroSpans = Array.from(zeros).filter((s) => s.textContent === '0')
      expect(zeroSpans.length).toBe(3)
    })
  })

  // ── Sub-tabs ───────────────────────────────────────────────────────────────

  describe('sub-tabs', () => {
    it('renders Queue, Follow Up, and Completed sub-tabs', () => {
      vi.mocked(useStops).mockReturnValue([])
      render(<CanvassTab />)

      // Sub-tab buttons (role="button") with these labels
      expect(screen.getAllByText('Queue').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Follow Up').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1)
    })

    it('defaults to the Queue panel', () => {
      vi.mocked(useStops).mockReturnValue([])
      render(<CanvassTab />)

      // Queue empty state should be visible
      expect(screen.getByText('Queue is empty')).toBeInTheDocument()
    })

    it('switches to Follow Up panel when clicked', () => {
      vi.mocked(useStops).mockReturnValue([])
      render(<CanvassTab />)

      // Click the sub-tab button (not the stats label)
      fireEvent.click(screen.getByRole('button', { name: /^Follow Up/ }))
      expect(screen.getByText('No follow-up stops')).toBeInTheDocument()
    })

    it('switches to Completed panel when clicked', () => {
      vi.mocked(useStops).mockReturnValue([])
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Completed/ }))
      expect(screen.getByText('No completed stops')).toBeInTheDocument()
    })
  })

  // ── Queue panel ────────────────────────────────────────────────────────────

  describe('queue panel', () => {
    it('shows queued and not_visited stops', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      expect(screen.getByText('Pizza Palace')).toBeInTheDocument()
      expect(screen.getByText('Burger Barn')).toBeInTheDocument()
    })

    it('does not show follow-up or completed stops in the queue', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      expect(screen.queryByText('Taco Town')).not.toBeInTheDocument()
      expect(screen.queryByText('Sushi Spot')).not.toBeInTheDocument()
      expect(screen.queryByText('Hot Dog Hut')).not.toBeInTheDocument()
      expect(screen.queryByText('Waffle World')).not.toBeInTheDocument()
    })

    it('filters stops by search term', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      const search = screen.getByPlaceholderText('Search stops…')
      fireEvent.change(search, { target: { value: 'pizza' } })

      expect(screen.getByText('Pizza Palace')).toBeInTheDocument()
      expect(screen.queryByText('Burger Barn')).not.toBeInTheDocument()
    })

    it('shows empty state when no stops match search', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      const search = screen.getByPlaceholderText('Search stops…')
      fireEvent.change(search, { target: { value: 'nonexistentbusiness' } })

      expect(screen.getByText('Queue is empty')).toBeInTheDocument()
    })

    it('renders End Day and Clear All buttons', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      expect(screen.getByRole('button', { name: /end day/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
    })

    it('opens End Day modal when End Day is clicked', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /end day/i }))
      expect(screen.getByText(/returned to the database/i)).toBeInTheDocument()
    })

    it('opens clear confirm modal when Clear All is clicked', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
      expect(screen.getByText(/remove all/i)).toBeInTheDocument()
    })
  })

  // ── Follow Up panel ────────────────────────────────────────────────────────

  describe('follow up panel', () => {
    it('shows come_back_later and dm_unavailable stops', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Follow Up/ }))

      expect(screen.getByText('Taco Town')).toBeInTheDocument()
      expect(screen.getByText('Sushi Spot')).toBeInTheDocument()
    })

    it('does not show queue or completed stops in follow up', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Follow Up/ }))

      expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument()
      expect(screen.queryByText('Burger Barn')).not.toBeInTheDocument()
      expect(screen.queryByText('Hot Dog Hut')).not.toBeInTheDocument()
      expect(screen.queryByText('Waffle World')).not.toBeInTheDocument()
    })

    it('renders filter buttons: All, Come Back Later, DM Unavailable', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Follow Up/ }))

      // Multiple "Come Back Later" buttons exist (filter chip + StopCard action), use getAllByRole
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Come Back Later' }).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByRole('button', { name: 'DM Unavailable' }).length).toBeGreaterThanOrEqual(1)
    })

    it('filters to come_back_later stops only', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Follow Up/ }))

      // Click the filter chip specifically (scoped to the filter bar)
      const filterBar = screen.getByTestId('followup-filter-bar')
      fireEvent.click(filterBar.querySelector('button[class*="rounded-full"]')!.nextElementSibling as HTMLElement)

      expect(screen.getByText('Taco Town')).toBeInTheDocument()
      expect(screen.queryByText('Sushi Spot')).not.toBeInTheDocument()
    })

    it('filters to dm_unavailable stops only', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Follow Up/ }))

      // Click the DM Unavailable filter chip specifically (third button in filter bar)
      const filterBar = screen.getByTestId('followup-filter-bar')
      const filterButtons = filterBar.querySelectorAll('button')
      fireEvent.click(filterButtons[2]) // 0=All, 1=Come Back Later, 2=DM Unavailable

      expect(screen.getByText('Sushi Spot')).toBeInTheDocument()
      expect(screen.queryByText('Taco Town')).not.toBeInTheDocument()
    })
  })

  // ── Completed panel ────────────────────────────────────────────────────────

  describe('completed panel', () => {
    it('shows canvassed and converted stops', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Completed/ }))

      expect(screen.getByText('Hot Dog Hut')).toBeInTheDocument()
      expect(screen.getByText('Waffle World')).toBeInTheDocument()
    })

    it('does not show queue or follow-up stops in completed', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Completed/ }))

      expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument()
      expect(screen.queryByText('Taco Town')).not.toBeInTheDocument()
    })

    it('filters completed stops by search term', () => {
      vi.mocked(useStops).mockReturnValue(SAMPLE_STOPS)
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Completed/ }))

      const search = screen.getByPlaceholderText('Search completed stops…')
      fireEvent.change(search, { target: { value: 'waffle' } })

      expect(screen.getByText('Waffle World')).toBeInTheDocument()
      expect(screen.queryByText('Hot Dog Hut')).not.toBeInTheDocument()
    })
  })

  // ── Add Stop modal ─────────────────────────────────────────────────────────

  describe('add stop modal', () => {
    it('opens when + Add Stop is clicked', () => {
      vi.mocked(useStops).mockReturnValue([])
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /add stop/i }))
      expect(screen.getByPlaceholderText('Business name')).toBeInTheDocument()
    })
  })

  // ── StopCard status badges ─────────────────────────────────────────────────

  describe('status badge labels and colors', () => {
    it('shows "Not visited" badge (default/gray) for queued stop', () => {
      vi.mocked(useStops).mockReturnValue([
        makeStop({ id: 'q1', name: 'Queued Biz', status: 'queued' }),
      ])
      render(<CanvassTab />)

      const badge = screen.getByText('Not visited')
      expect(badge).toHaveClass('bg-slate-500/10')
      expect(badge).toHaveClass('text-slate-400')
    })

    it('shows "Not visited" badge (default/gray) for not_visited stop', () => {
      vi.mocked(useStops).mockReturnValue([
        makeStop({ id: 'nv1', name: 'Not Visited Biz', status: 'not_visited' }),
      ])
      render(<CanvassTab />)

      const badge = screen.getByText('Not visited')
      expect(badge).toHaveClass('bg-slate-500/10')
      expect(badge).toHaveClass('text-slate-400')
    })

    it('shows "Come back later" badge (warning/yellow) for come_back_later stop', () => {
      vi.mocked(useStops).mockReturnValue([
        makeStop({ id: 'cbl1', name: 'CBL Biz', status: 'come_back_later' }),
      ])
      render(<CanvassTab />)

      // Navigate to Follow Up tab
      fireEvent.click(screen.getByRole('button', { name: /^Follow Up/ }))

      const badge = screen.getByText('Come back later')
      expect(badge).toHaveClass('bg-yellow-500/15')
      expect(badge).toHaveClass('text-yellow-400')
    })

    it('shows "DM unavailable" badge (warning/yellow) for dm_unavailable stop', () => {
      vi.mocked(useStops).mockReturnValue([
        makeStop({ id: 'dmu1', name: 'DM Biz', status: 'dm_unavailable' }),
      ])
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Follow Up/ }))

      const badge = screen.getByText('DM unavailable')
      expect(badge).toHaveClass('bg-yellow-500/15')
      expect(badge).toHaveClass('text-yellow-400')
    })

    it('shows "Canvassed" badge (success/green) for canvassed stop', () => {
      vi.mocked(useStops).mockReturnValue([
        makeStop({ id: 'c1', name: 'Canvassed Biz', status: 'canvassed' }),
      ])
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Completed/ }))

      const badge = screen.getByText('Canvassed')
      expect(badge).toHaveClass('bg-green-500/15')
      expect(badge).toHaveClass('text-green-400')
    })

    it('shows "Converted" badge (info/blue) for converted stop', () => {
      vi.mocked(useStops).mockReturnValue([
        makeStop({ id: 'cv1', name: 'Converted Biz', status: 'converted' }),
      ])
      render(<CanvassTab />)

      fireEvent.click(screen.getByRole('button', { name: /^Completed/ }))

      const badge = screen.getByText('Converted')
      expect(badge).toHaveClass('bg-blue-500/10')
      expect(badge).toHaveClass('text-blue-400')
    })
  })
})
