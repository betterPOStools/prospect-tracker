import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Lead } from '../../types'
import LeadsTab from './LeadsTab'

// ── Mock supabase ─────────────────────────────────────────────────────────────

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  },
}))

// ── Mock platform ─────────────────────────────────────────────────────────────

vi.mock('../../lib/platform', () => ({
  isNative: false,
}))

// ── Mock contexts ─────────────────────────────────────────────────────────────

const mockDispatch = vi.fn()

vi.mock('../../store/LeadsContext', () => ({
  useLeads: vi.fn(),
  useLeadsDispatch: () => mockDispatch,
}))

vi.mock('../../store/RecordsContext', () => ({
  useRecords: vi.fn(() => []),
  useRecordsDispatch: () => vi.fn(),
}))

vi.mock('../../store/StopsContext', () => ({
  useStops: vi.fn(() => []),
  useStopsDispatch: () => vi.fn(),
}))

vi.mock('../../store/OfflineContext', () => ({
  useOffline: vi.fn(() => ({ isOnline: true, queueLength: 0, enqueue: vi.fn() })),
}))

import { useLeads } from '../../store/LeadsContext'

// ── Test data ─────────────────────────────────────────────────────────────────

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: crypto.randomUUID(),
    name: 'Test Business',
    status: 'Open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

const SAMPLE_LEADS: Lead[] = [
  makeLead({ id: '1', name: 'Pizza Palace', status: 'Open' }),
  makeLead({ id: '2', name: 'Burger Barn', status: 'Won' }),
  makeLead({ id: '3', name: 'Taco Town', status: 'Lost' }),
  makeLead({ id: '4', name: 'Sushi Spot', status: 'Open' }),
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LeadsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no leads exist', () => {
    vi.mocked(useLeads).mockReturnValue([])
    render(<LeadsTab />)

    expect(screen.getByText('No leads yet')).toBeInTheDocument()
    expect(
      screen.getByText('Add your first lead manually or convert a canvass stop.'),
    ).toBeInTheDocument()
  })

  it('renders lead count in filter bar', () => {
    vi.mocked(useLeads).mockReturnValue(SAMPLE_LEADS)
    render(<LeadsTab />)

    const filterBar = screen.getByTestId('leads-filter-bar')

    // Total count appears in the stats row (may appear more than once with badge)
    const allFours = screen.getAllByText('4')
    expect(allFours.length).toBeGreaterThanOrEqual(1)

    // Each filter button should be present in the filter bar
    expect(filterBar.querySelector('button[aria-pressed="true"]')).toHaveTextContent('All')
    expect(filterBar).toHaveTextContent('Open')
    expect(filterBar).toHaveTextContent('Won')
    expect(filterBar).toHaveTextContent('Lost')

    // Open count = 2, Won = 1, Lost = 1
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)
  })

  it('shows all leads when All filter is active', () => {
    vi.mocked(useLeads).mockReturnValue(SAMPLE_LEADS)
    render(<LeadsTab />)

    expect(screen.getByText('Pizza Palace')).toBeInTheDocument()
    expect(screen.getByText('Burger Barn')).toBeInTheDocument()
    expect(screen.getByText('Taco Town')).toBeInTheDocument()
    expect(screen.getByText('Sushi Spot')).toBeInTheDocument()
  })

  it('filters to only Open leads when Open filter is clicked', () => {
    vi.mocked(useLeads).mockReturnValue(SAMPLE_LEADS)
    render(<LeadsTab />)

    const filterBar = screen.getByTestId('leads-filter-bar')
    const openBtn = Array.from(filterBar.querySelectorAll('button')).find(
      (b) => b.textContent?.startsWith('Open'),
    )!
    fireEvent.click(openBtn)

    expect(screen.getByText('Pizza Palace')).toBeInTheDocument()
    expect(screen.getByText('Sushi Spot')).toBeInTheDocument()
    expect(screen.queryByText('Burger Barn')).not.toBeInTheDocument()
    expect(screen.queryByText('Taco Town')).not.toBeInTheDocument()
  })

  it('filters to only Won leads when Won filter is clicked', () => {
    vi.mocked(useLeads).mockReturnValue(SAMPLE_LEADS)
    render(<LeadsTab />)

    fireEvent.click(screen.getByRole('button', { name: /^Won/ }))

    expect(screen.getByText('Burger Barn')).toBeInTheDocument()
    expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument()
    expect(screen.queryByText('Taco Town')).not.toBeInTheDocument()
  })

  it('filters to only Lost leads when Lost filter is clicked', () => {
    vi.mocked(useLeads).mockReturnValue(SAMPLE_LEADS)
    render(<LeadsTab />)

    fireEvent.click(screen.getByRole('button', { name: /^Lost/ }))

    expect(screen.getByText('Taco Town')).toBeInTheDocument()
    expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument()
    expect(screen.queryByText('Burger Barn')).not.toBeInTheDocument()
  })

  it('shows empty state when filtered results are empty', () => {
    // Only Open leads, click Won → should show no Won leads message
    const onlyOpen = [makeLead({ id: '1', name: 'Pizza Palace', status: 'Open' })]
    vi.mocked(useLeads).mockReturnValue(onlyOpen)
    render(<LeadsTab />)

    fireEvent.click(screen.getByRole('button', { name: /^Won/ }))

    expect(screen.getByText('No won leads')).toBeInTheDocument()
  })

  it('opens Add Lead modal when Add Lead button is clicked', () => {
    vi.mocked(useLeads).mockReturnValue([])
    render(<LeadsTab />)

    // The Add Lead button in the empty state
    const addBtn = screen.getAllByRole('button', { name: /add lead/i })[0]
    fireEvent.click(addBtn)

    // Modal opens — verify by the form placeholder
    expect(screen.getByPlaceholderText('Business name')).toBeInTheDocument()
  })

  it('opens Add Lead modal from the stats row button', () => {
    vi.mocked(useLeads).mockReturnValue(SAMPLE_LEADS)
    render(<LeadsTab />)

    // The stats row has aria-label="Add lead" button with text "+ Add Lead"
    fireEvent.click(screen.getByRole('button', { name: /add lead/i }))

    // Modal form field appears
    expect(screen.getByPlaceholderText('Business name')).toBeInTheDocument()
  })

  it('renders correct status badge color for Open lead', () => {
    vi.mocked(useLeads).mockReturnValue([
      makeLead({ id: '1', name: 'Open Biz', status: 'Open' }),
    ])
    render(<LeadsTab />)

    // There are multiple elements with text "Open" (filter button + badge span).
    // The badge is the <span> with the rounded-full pill classes.
    const badges = screen.getAllByText('Open')
    const badgeSpan = badges.find(
      (el) => el.tagName === 'SPAN' && el.className.includes('rounded-full'),
    )
    expect(badgeSpan).toBeTruthy()
    // info variant (dark) = bg-blue-500/10 text-blue-400
    expect(badgeSpan).toHaveClass('bg-blue-500/10')
    expect(badgeSpan).toHaveClass('text-blue-400')
  })

  it('renders correct status badge color for Won lead', () => {
    vi.mocked(useLeads).mockReturnValue([
      makeLead({ id: '2', name: 'Won Biz', status: 'Won' }),
    ])
    render(<LeadsTab />)

    const badges = screen.getAllByText('Won')
    const badgeSpan = badges.find(
      (el) => el.tagName === 'SPAN' && el.className.includes('rounded-full'),
    )
    expect(badgeSpan).toBeTruthy()
    // success variant (dark) = bg-green-500/15 text-green-400
    expect(badgeSpan).toHaveClass('bg-green-500/15')
    expect(badgeSpan).toHaveClass('text-green-400')
  })

  it('renders correct status badge color for Lost lead', () => {
    vi.mocked(useLeads).mockReturnValue([
      makeLead({ id: '3', name: 'Lost Biz', status: 'Lost' }),
    ])
    render(<LeadsTab />)

    const badges = screen.getAllByText('Lost')
    const badgeSpan = badges.find(
      (el) => el.tagName === 'SPAN' && el.className.includes('rounded-full'),
    )
    expect(badgeSpan).toBeTruthy()
    // danger variant (dark) = bg-red-500/15 text-red-400
    expect(badgeSpan).toHaveClass('bg-red-500/15')
    expect(badgeSpan).toHaveClass('text-red-400')
  })

  it('shows won handoff note on Won leads', () => {
    vi.mocked(useLeads).mockReturnValue([
      makeLead({ id: '2', name: 'Won Biz', status: 'Won' }),
    ])
    render(<LeadsTab />)

    expect(screen.getByText(/Open in Menu Import/)).toBeInTheDocument()
  })
})
