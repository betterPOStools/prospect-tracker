import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ProspectRecord, Lead, CanvassStop } from '../../types'

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  },
}))

vi.mock('../../lib/platform', () => ({
  isNative: false,
  exportFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/storage', () => ({
  settings: {
    getOsKey: vi.fn(() => ''),
    setOsKey: vi.fn(),
    getOsCfg: vi.fn(() => ({})),
    setOsCfg: vi.fn(),
    getRxlUser: vi.fn(() => ''),
    setRxlUser: vi.fn(),
    getRxlPass: vi.fn(() => ''),
    setRxlPass: vi.fn(),
    getTheme: vi.fn(() => 'light' as const),
    setTheme: vi.fn(),
    getMapsApp: vi.fn(() => 'google' as const),
    setMapsApp: vi.fn(),
  },
}))

vi.mock('../../store/OfflineContext', () => ({
  useOffline: vi.fn(() => ({ isOnline: true, queueLength: 0, enqueue: vi.fn() })),
}))

// ── Context mocks ─────────────────────────────────────────────────────────────

const mockRecordsDispatch = vi.fn()
const mockLeadsDispatch = vi.fn()
const mockStopsDispatch = vi.fn()

vi.mock('../../store/RecordsContext', () => ({
  useRecords: vi.fn(),
  useRecordsDispatch: () => mockRecordsDispatch,
}))

vi.mock('../../store/LeadsContext', () => ({
  useLeads: vi.fn(),
  useLeadsDispatch: () => mockLeadsDispatch,
}))

vi.mock('../../store/StopsContext', () => ({
  useStops: vi.fn(),
  useStopsDispatch: () => mockStopsDispatch,
}))

vi.mock('../../hooks/useOutscraper', () => ({
  useOutscraper: vi.fn(() => ({
    loading: false,
    error: null,
    config: {
      categories: 'restaurant',
      autoImport: true,
      zipBatchSize: 10,
      useEnrichments: true,
      exactMatch: false,
      minRating: 0,
      minReviews: 0,
      webhookUrl: '',
      usePhoneEnricher: false,
      useCompanyData: false,
    },
    submit: vi.fn().mockResolvedValue('task123'),
    poll: vi.fn().mockResolvedValue({ status: 'pending', added: 0, updated: 0 }),
    fetchTasks: vi.fn().mockResolvedValue([]),
    fetchApiTasks: vi.fn().mockResolvedValue([]),
    fetchApiTaskConfig: vi.fn().mockResolvedValue({}),
  })),
}))

vi.mock('../../hooks/useTheme', () => ({
  useTheme: vi.fn(() => ({
    theme: 'light' as const,
    toggle: vi.fn(),
    setTheme: vi.fn(),
  })),
}))

vi.mock('../../data/canvassLog', () => ({
  loadCanvassLog: vi.fn(() => []),
}))

vi.mock('jszip', () => {
  const MockJSZip = vi.fn().mockImplementation(() => ({
    file: vi.fn(),
    generateAsync: vi.fn().mockResolvedValue(new Blob(['KMZ'])),
  }))
  return { default: MockJSZip }
})

import { useRecords } from '../../store/RecordsContext'
import { useLeads } from '../../store/LeadsContext'
import { useStops } from '../../store/StopsContext'
import { useTheme } from '../../hooks/useTheme'
import { exportFile } from '../../lib/platform'
import AnalyticsPanel from './AnalyticsPanel'
import BlocklistPanel from './BlocklistPanel'
import SettingsPanel from './SettingsPanel'
import ExportPanel from './ExportPanel'
import UtilitiesTab from './UtilitiesTab'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ProspectRecord> = {}): ProspectRecord {
  return {
    id: crypto.randomUUID(),
    name: 'Test Business',
    score: 50,
    priority: 'Warm',
    status: 'unworked',
    is_chain: false,
    dropped_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: crypto.randomUUID(),
    name: 'Test Lead',
    status: 'Open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

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

const SAMPLE_RECORDS: ProspectRecord[] = [
  makeRecord({ priority: 'Fire', status: 'unworked', score: 85 }),
  makeRecord({ priority: 'Hot', status: 'in_canvass', score: 70 }),
  makeRecord({ priority: 'Warm', status: 'canvassed', score: 55 }),
  makeRecord({ priority: 'Cold', status: 'converted', score: 30 }),
  makeRecord({ priority: 'Dead', status: 'unworked', score: 10 }),
]

const SAMPLE_LEADS: Lead[] = [
  makeLead({ status: 'Open' }),
  makeLead({ status: 'Won' }),
  makeLead({ status: 'Lost' }),
]

// ── AnalyticsPanel tests ──────────────────────────────────────────────────────

describe('AnalyticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useLeads).mockReturnValue(SAMPLE_LEADS)
    vi.mocked(useStops).mockReturnValue([])
  })

  it('renders pipeline stats with correct counts', () => {
    vi.mocked(useRecords).mockReturnValue(SAMPLE_RECORDS)
    render(<AnalyticsPanel />)

    // Total records — may appear in multiple places, just confirm at least one
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1)

    // Priority counts — one of each
    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThanOrEqual(5) // Fire, Hot, Warm, Cold, Dead = 1 each

    // Section headers
    expect(screen.getByText('Pipeline Overview')).toBeInTheDocument()
    expect(screen.getByText('Data Quality')).toBeInTheDocument()
    expect(screen.getByText('Territory Coverage')).toBeInTheDocument()
    expect(screen.getByText('Lead Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Canvass Performance')).toBeInTheDocument()
  })

  it('shows N/A for conversion rate when no worked records', () => {
    vi.mocked(useRecords).mockReturnValue([makeRecord({ status: 'unworked' })])
    render(<AnalyticsPanel />)
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1)
  })

  it('renders empty records state without crashing', () => {
    vi.mocked(useRecords).mockReturnValue([])
    render(<AnalyticsPanel />)
    expect(screen.getByText('No records yet.')).toBeInTheDocument()
  })

  it('shows lead pipeline totals', () => {
    vi.mocked(useRecords).mockReturnValue([])
    render(<AnalyticsPanel />)
    // 3 leads total
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
  })
})

// ── BlocklistPanel tests ──────────────────────────────────────────────────────

describe('BlocklistPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders default blocklist terms', () => {
    render(<BlocklistPanel />)
    // "starbucks" is in DEFAULT_BLOCKLIST
    expect(screen.getByText(/starbucks/i)).toBeInTheDocument()
  })

  it('shows term count in description', () => {
    render(<BlocklistPanel />)
    expect(screen.getByText(/terms — case-insensitive/)).toBeInTheDocument()
  })

  it('adds a new term', () => {
    render(<BlocklistPanel />)
    const input = screen.getByPlaceholderText('Add a term…')
    fireEvent.change(input, { target: { value: 'test-chain' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('test-chain')).toBeInTheDocument()
  })

  it('removes a term via × button', () => {
    render(<BlocklistPanel />)
    // Add a unique term first so we can target it precisely
    const input = screen.getByPlaceholderText('Add a term…')
    fireEvent.change(input, { target: { value: 'unique-remove-me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('unique-remove-me')).toBeInTheDocument()

    const removeBtn = screen.getByRole('button', { name: 'Remove unique-remove-me' })
    fireEvent.click(removeBtn)
    expect(screen.queryByText('unique-remove-me')).not.toBeInTheDocument()
  })

  it('resets to defaults', () => {
    render(<BlocklistPanel />)
    // Add custom term
    const input = screen.getByPlaceholderText('Add a term…')
    fireEvent.change(input, { target: { value: 'custom-biz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('custom-biz')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }))
    expect(screen.queryByText('custom-biz')).not.toBeInTheDocument()
  })

  it('persists changes to localStorage', () => {
    render(<BlocklistPanel />)
    const input = screen.getByPlaceholderText('Add a term…')
    fireEvent.change(input, { target: { value: 'persist-me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const stored = JSON.parse(localStorage.getItem('vs_blocklist') ?? '[]') as string[]
    expect(stored).toContain('persist-me')
  })
})

// ── SettingsPanel tests ───────────────────────────────────────────────────────

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders all settings sections', () => {
    render(<SettingsPanel />)
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Route Endpoints')).toBeInTheDocument()
    expect(screen.getByText('RouteXL Credentials')).toBeInTheDocument()
    expect(screen.getByText('Outscraper')).toBeInTheDocument()
  })

  it('shows dark mode toggle with correct initial state', () => {
    render(<SettingsPanel />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('calls toggle when dark mode switch clicked', () => {
    const mockToggle = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      theme: 'light',
      toggle: mockToggle,
      setTheme: vi.fn(),
    })
    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('switch', { name: 'Dark Mode' }))
    expect(mockToggle).toHaveBeenCalledOnce()
  })

  it('shows dark state when theme is dark', () => {
    vi.mocked(useTheme).mockReturnValue({
      theme: 'dark',
      toggle: vi.fn(),
      setTheme: vi.fn(),
    })
    render(<SettingsPanel />)
    const toggle = screen.getByRole('switch', { name: 'Dark Mode' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})

// ── ExportPanel tests ─────────────────────────────────────────────────────────

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRecords).mockReturnValue(SAMPLE_RECORDS)
    vi.mocked(useLeads).mockReturnValue(SAMPLE_LEADS)
    vi.mocked(useStops).mockReturnValue([makeStop()])
  })

  it('renders export sections', () => {
    render(<ExportPanel />)
    expect(screen.getByText('Full Backup (JSON)')).toBeInTheDocument()
    expect(screen.getByText('Restore from JSON')).toBeInTheDocument()
    expect(screen.getByText('Export KMZ (Google Earth)')).toBeInTheDocument()
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })

  it('calls exportFile when Download Backup is clicked', async () => {
    render(<ExportPanel />)
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }))
    // Wait for async op
    await vi.waitFor(() => {
      expect(exportFile).toHaveBeenCalledOnce()
    })
    const [, filename, mime] = vi.mocked(exportFile).mock.calls[0]
    expect(filename).toMatch(/prospect-backup-\d+\.json/)
    expect(mime).toBe('application/json')
  })

  it('includes records count in backup description', () => {
    render(<ExportPanel />)
    expect(screen.getAllByText(/5 records/).length).toBeGreaterThanOrEqual(1)
  })
})

// ── UtilitiesTab integration test ─────────────────────────────────────────────

describe('UtilitiesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRecords).mockReturnValue([])
    vi.mocked(useLeads).mockReturnValue([])
    vi.mocked(useStops).mockReturnValue([])
    localStorage.clear()
  })

  it('renders Analytics tab by default', () => {
    render(<UtilitiesTab />)
    expect(screen.getByText('Pipeline Overview')).toBeInTheDocument()
  })

  it('switches to Import tab', () => {
    render(<UtilitiesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(screen.getByText('Submit Outscraper Search')).toBeInTheDocument()
  })

  it('switches to Export tab', () => {
    render(<UtilitiesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(screen.getByText('Full Backup (JSON)')).toBeInTheDocument()
  })

  it('switches to Backups tab', () => {
    render(<UtilitiesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Backups' }))
    expect(screen.getByText('Snapshot History')).toBeInTheDocument()
  })

  it('switches to Blocklist tab', () => {
    render(<UtilitiesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Blocklist' }))
    expect(screen.getByText(/case-insensitive partial match/)).toBeInTheDocument()
  })

  it('switches to Settings tab', () => {
    render(<UtilitiesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByText('Appearance')).toBeInTheDocument()
  })
})
