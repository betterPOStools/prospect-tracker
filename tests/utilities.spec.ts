import { test, expect, type Page } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Navigate to the Utilities tab and wait for Analytics to be visible. */
async function goUtilities(page: Page) {
  await page.locator('nav').getByRole('button', { name: /Utilities/ }).click()
  // Analytics is the default sub-tab — wait for its heading
  await expect(page.getByText('Pipeline Overview')).toBeVisible()
}

/** Navigate to a specific Utilities sub-tab by clicking its label. */
async function goUtilSub(page: Page, label: string) {
  // Scope to the utilities top-level sub-tabs bar to avoid ambiguity with
  // inner sub-tab bars (e.g. Import has its own Search/Queue/Settings tabs).
  await page.getByTestId('utilities-sub-tabs').getByRole('button', { name: label }).click()
}

/** Block all Supabase traffic so the DB is never hit during tests. */
async function blockSupabase(page: Page) {
  await page.route('**supabase.co**', (route) => route.abort())
  await page.route('**supabase.io**', (route) => route.abort())
}

/** Seed records into the localStorage key the app reads on startup. */
async function seedRecords(page: Page, records: Record<string, unknown>[]) {
  await page.evaluate((recs) => {
    localStorage.setItem('pt_records_cache', JSON.stringify(recs))
  }, records)
}

/** Return a minimal prospect record fixture. */
function makeRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: 'Test Restaurant',
    address: '123 Main St, Wilmington NC 28401',
    area: 'Wilmington NC',
    city: 'Wilmington',
    zip: '28401',
    phone: '910-555-0001',
    website: 'https://testrestaurant.com',
    email: 'info@testrestaurant.com',
    type: 'restaurant',
    rating: 4.2,
    reviews: 85,
    score: 72,
    priority: 'Hot',
    status: 'unworked',
    lat: 34.2257,
    lng: -77.9447,
    contact_name: '',
    contact_title: '',
    notes: '',
    last_visit: '',
    ...overrides,
  }
}

// ── beforeEach: fresh page, no real Supabase calls, navigate to Utilities ─────

test.beforeEach(async ({ page }) => {
  await blockSupabase(page)
  await page.goto('http://localhost:5173')
  await expect(page.getByText('Restaurant Prospect Tracker')).toBeVisible()
  // Clear relevant localStorage state so tests start clean
  await page.evaluate(() => {
    const keysToRemove = [
      // Current cache keys
      'pt_records_cache', 'pt_leads_cache', 'pt_stops_cache',
      'pt_activities_cache', 'pt_tasks_cache',
      'pt_cache_synced_at', 'pt_mutation_queue', 'pt_migration_complete',
      // Settings (local-only)
      'vs_blocklist',
      'vs_home_addr', 'vs_office_addr',
      'vs_os_key', 'vs_os_cfg', 'vs_maps_app',
    ]
    keysToRemove.forEach((k) => localStorage.removeItem(k))
    // Remove any snapshots
    const snapKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('pt_snapshot_')) snapKeys.push(k)
    }
    snapKeys.forEach((k) => localStorage.removeItem(k))
  })
  await goUtilities(page)
})

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════════════════════════

test('Analytics: default sub-tab shows Pipeline Overview heading', async ({ page }) => {
  await expect(page.getByText('Pipeline Overview')).toBeVisible()
})

test('Analytics: all five priority stat boxes are rendered', async ({ page }) => {
  for (const label of ['Fire', 'Hot', 'Warm', 'Cold', 'Dead']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
})

test('Analytics: pipeline stat boxes show numeric values', async ({ page }) => {
  // With empty data every count should be 0
  await expect(page.getByText('Pipeline Overview')).toBeVisible()
  // The total count appears as a standalone large number before "total records"
  await expect(page.getByText('total records', { exact: true })).toBeVisible()
  // Status boxes for Unworked / Worked / Conv. Rate must be present
  await expect(page.getByText('Unworked', { exact: true })).toBeVisible()
  await expect(page.getByText('Worked', { exact: true })).toBeVisible()
  await expect(page.getByText('Conv. Rate', { exact: true })).toBeVisible()
})

test('Analytics: Data Quality section renders', async ({ page }) => {
  await expect(page.getByText('Data Quality')).toBeVisible()
  // With no records shows the empty state
  await expect(page.getByText('No records yet.')).toBeVisible()
})

test('Analytics: Territory Coverage section renders', async ({ page }) => {
  await expect(page.getByText('Territory Coverage')).toBeVisible()
  await expect(page.getByText('No areas imported yet.')).toBeVisible()
})

test('Analytics: Lead Pipeline section renders with stat boxes', async ({ page }) => {
  await expect(page.getByText('Lead Pipeline')).toBeVisible()
  for (const label of ['Total', 'Open', 'Won', 'Lost', 'Win Rate']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
})

test('Analytics: Canvass Performance section renders', async ({ page }) => {
  await expect(page.getByText('Canvass Performance')).toBeVisible()
  await expect(page.getByText('Today Worked', { exact: true })).toBeVisible()
  await expect(page.getByText('Today Conv.', { exact: true })).toBeVisible()
  await expect(page.getByText('Avg Stops/Day', { exact: true })).toBeVisible()
})

test('Analytics: mobile viewport renders pipeline stat boxes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByText('Pipeline Overview')).toBeVisible()
  await expect(page.getByText('Fire', { exact: true })).toBeVisible()
  await expect(page.getByText('Hot', { exact: true })).toBeVisible()
})

// ════════════════════════════════════════════════════════════════════════════
// IMPORT
// ════════════════════════════════════════════════════════════════════════════

test('Import: switching to Import sub-tab shows inner sub-tabs', async ({ page }) => {
  await goUtilSub(page, 'Import')
  // Search / Queue / Settings inner sub-tabs
  const importSubTabs = page.getByTestId('import-sub-tabs')
  await expect(importSubTabs.getByRole('button', { name: 'Search' })).toBeVisible()
  await expect(importSubTabs.getByRole('button', { name: 'Queue' })).toBeVisible()
  await expect(importSubTabs.getByRole('button', { name: 'Settings' })).toBeVisible()
})

test('Import: Search sub-tab renders city + state inputs', async ({ page }) => {
  await goUtilSub(page, 'Import')
  // City placeholder from CityAutocomplete
  await expect(page.getByPlaceholder('Wilmington', { exact: true })).toBeVisible()
  // State input
  await expect(page.getByPlaceholder('NC', { exact: true })).toBeVisible()
})

test('Import: city autocomplete fires Nominatim and shows suggestions', async ({ page }) => {
  // Mock Nominatim before navigating to Import
  await page.route('**nominatim.openstreetmap.org**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          type: 'city',
          address: { city: 'Wilmington', state: 'North Carolina', country_code: 'us' },
        },
        {
          type: 'city',
          address: { city: 'Wilmington', state: 'Delaware', country_code: 'us' },
        },
      ]),
    })
  })

  await goUtilSub(page, 'Import')
  const cityInput = page.getByPlaceholder('Wilmington', { exact: true })
  await cityInput.fill('Wil')
  // Suggestions list should appear (debounce is 500ms in source)
  await expect(page.getByText('Wilmington, NC')).toBeVisible({ timeout: 2_000 })
  await expect(page.getByText('Wilmington, DE')).toBeVisible()
})

test('Import: selecting city autocomplete suggestion populates state', async ({ page }) => {
  await page.route('**nominatim.openstreetmap.org**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          type: 'city',
          address: { city: 'Charlotte', state: 'North Carolina', country_code: 'us' },
        },
      ]),
    })
  })

  await goUtilSub(page, 'Import')
  await page.getByPlaceholder('Wilmington', { exact: true }).fill('Char')
  await expect(page.getByText('Charlotte, NC')).toBeVisible({ timeout: 2_000 })
  await page.getByText('Charlotte, NC').click()
  // City input should now read "Charlotte"
  await expect(page.getByPlaceholder('Wilmington', { exact: true })).toHaveValue('Charlotte')
  // State input should be auto-filled
  await expect(page.getByPlaceholder('NC', { exact: true })).toHaveValue('NC')
})

test('Import: ZIP lookup button is disabled until city + state filled', async ({ page }) => {
  await goUtilSub(page, 'Import')
  const zipBtn = page.getByRole('button', { name: /Look Up ZIPs/i })
  await expect(zipBtn).toBeDisabled()
  await page.getByPlaceholder('Wilmington', { exact: true }).fill('Wilmington')
  await page.getByPlaceholder('NC', { exact: true }).fill('NC')
  await expect(zipBtn).not.toBeDisabled()
})

test('Import: Queue sub-tab auto-loads tasks on mount', async ({ page }) => {
  // Mock Supabase outscraper_tasks query — returns two tasks
  await page.route('**outscraper_tasks**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          task_id: 'task_abc123',
          title: 'Wilmington NC — 2026-03-29',
          status: 'pending',
          record_count: null,
          created_at: '2026-03-29T10:00:00Z',
          completed_at: null,
        },
        {
          id: 2,
          task_id: 'task_def456',
          title: 'Charlotte NC — 2026-03-28',
          status: 'completed',
          record_count: 312,
          created_at: '2026-03-28T09:00:00Z',
          completed_at: '2026-03-28T09:30:00Z',
        },
      ]),
    })
  })

  await goUtilSub(page, 'Import')
  await page.getByTestId('import-sub-tabs').getByRole('button', { name: 'Queue' }).click()
  // Both task titles should appear
  await expect(page.getByText('Wilmington NC — 2026-03-29')).toBeVisible({ timeout: 3_000 })
  await expect(page.getByText('Charlotte NC — 2026-03-28')).toBeVisible()
})

test('Import: Queue shows status badges for tasks', async ({ page }) => {
  await page.route('**outscraper_tasks**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          task_id: 'task_pending',
          title: 'Pending Task',
          status: 'pending',
          record_count: null,
          created_at: '2026-03-29T10:00:00Z',
          completed_at: null,
        },
      ]),
    })
  })

  await goUtilSub(page, 'Import')
  await page.getByTestId('import-sub-tabs').getByRole('button', { name: 'Queue' }).click()
  // Status badge for "pending" has bg-yellow-100 (warning variant)
  await expect(page.locator('.bg-yellow-100').filter({ hasText: 'pending' })).toBeVisible({ timeout: 3_000 })
  // Pending tasks have a Poll button
  await expect(page.getByRole('button', { name: 'Poll' })).toBeVisible()
})

test('Import: Queue shows empty state when no tasks exist', async ({ page }) => {
  await page.route('**outscraper_tasks**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await goUtilSub(page, 'Import')
  await page.getByTestId('import-sub-tabs').getByRole('button', { name: 'Queue' }).click()
  await expect(page.getByText('No tasks found.')).toBeVisible({ timeout: 3_000 })
})

test('Import: Settings sub-tab shows API key and config fields', async ({ page }) => {
  await goUtilSub(page, 'Import')
  await page.getByTestId('import-sub-tabs').getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByPlaceholder('os_••••••••')).toBeVisible()
  await expect(page.getByText('ZIPs per Task')).toBeVisible()
  await expect(page.getByText('Min Rating')).toBeVisible()
  await expect(page.getByText('Auto Import on Poll')).toBeVisible()
})

test('Import: Settings save button works', async ({ page }) => {
  await goUtilSub(page, 'Import')
  await page.getByTestId('import-sub-tabs').getByRole('button', { name: 'Settings' }).click()
  const saveBtn = page.getByRole('button', { name: /Save Settings/i })
  await saveBtn.click()
  // After saving the button briefly shows "Saved!"
  await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible({ timeout: 1_500 })
})

test('Import: file import form requires area label to enable button', async ({ page }) => {
  await goUtilSub(page, 'Import')
  const importBtn = page.getByRole('button', { name: /Import File/i })
  await expect(importBtn).toBeDisabled()
  await page.getByPlaceholder('Wilmington NC').fill('Test Area')
  // Still disabled because no file selected
  await expect(importBtn).toBeDisabled()
})

test('Import: mobile viewport — sub-tabs and city input visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await goUtilSub(page, 'Import')
  await expect(page.getByTestId('import-sub-tabs').getByRole('button', { name: 'Search' })).toBeVisible()
  await expect(page.getByPlaceholder('Wilmington', { exact: true })).toBeVisible()
})

// ════════════════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════════════════

test('Export: panel renders all section headings', async ({ page }) => {
  await goUtilSub(page, 'Export')
  await expect(page.getByText('Full Backup (JSON)')).toBeVisible()
  await expect(page.getByText('Restore from JSON')).toBeVisible()
  await expect(page.getByText('Export KMZ (Google Earth)')).toBeVisible()
  await expect(page.getByText('Export CSV')).toBeVisible()
})

test('Export: Download Backup button is present and clickable', async ({ page }) => {
  await goUtilSub(page, 'Export')
  const btn = page.getByRole('button', { name: 'Download Backup' })
  await expect(btn).toBeVisible()
  await expect(btn).not.toBeDisabled()
})

test('Export: JSON backup triggers file download', async ({ page }) => {
  await goUtilSub(page, 'Export')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Backup' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/prospect-backup.*\.json/)
})

test('Export: KMZ export button visible', async ({ page }) => {
  await goUtilSub(page, 'Export')
  await expect(page.getByRole('button', { name: 'Export KMZ' })).toBeVisible()
})

test('Export: KMZ export triggers file download', async ({ page }) => {
  await goUtilSub(page, 'Export')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export KMZ' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/prospects.*\.kmz/)
})

test('Export: CSV section shows Records, Leads, and Canvass buttons', async ({ page }) => {
  await goUtilSub(page, 'Export')
  await expect(page.getByRole('button', { name: 'Records CSV' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leads CSV' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Canvass Log CSV' })).toBeVisible()
})

test('Export: Records CSV triggers file download', async ({ page }) => {
  await goUtilSub(page, 'Export')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Records CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/records.*\.csv/)
})

test('Export: Leads CSV triggers file download', async ({ page }) => {
  await goUtilSub(page, 'Export')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Leads CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/leads.*\.csv/)
})

test('Export: Canvass Log CSV triggers file download', async ({ page }) => {
  await goUtilSub(page, 'Export')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Canvass Log CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/canvass-log.*\.csv/)
})

test('Export: Restore from File button disabled until file chosen', async ({ page }) => {
  await goUtilSub(page, 'Export')
  await expect(page.getByRole('button', { name: 'Restore from File' })).toBeDisabled()
})

test('Export: restore confirm modal opens after choosing file', async ({ page }) => {
  await goUtilSub(page, 'Export')

  // Build a minimal valid backup JSON buffer
  const backup = JSON.stringify({ records: [], leads: [], stops: [], exportedAt: new Date().toISOString() })
  await page.evaluate((content) => {
    const dt = new DataTransfer()
    dt.items.add(new File([content], 'backup.json', { type: 'application/json' }))
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept=".json"]')
    if (input) {
      Object.defineProperty(input, 'files', { value: dt.files })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, backup)

  // The "Restore from File" button should now be enabled
  const restoreBtn = page.getByRole('button', { name: 'Restore from File' })
  await expect(restoreBtn).not.toBeDisabled({ timeout: 2_000 })
  await restoreBtn.click()

  // Confirm modal should appear
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Confirm Restore')).toBeVisible()
})

test('Export: restore modal Cancel closes without restoring', async ({ page }) => {
  await goUtilSub(page, 'Export')

  const backup = JSON.stringify({ records: [], leads: [], stops: [], exportedAt: new Date().toISOString() })
  await page.evaluate((content) => {
    const dt = new DataTransfer()
    dt.items.add(new File([content], 'backup.json', { type: 'application/json' }))
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept=".json"]')
    if (input) {
      Object.defineProperty(input, 'files', { value: dt.files })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, backup)

  await page.getByRole('button', { name: 'Restore from File' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('Export: mobile viewport — all CSV buttons visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await goUtilSub(page, 'Export')
  await expect(page.getByRole('button', { name: 'Records CSV' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leads CSV' })).toBeVisible()
})

// ════════════════════════════════════════════════════════════════════════════
// BACKUPS
// ════════════════════════════════════════════════════════════════════════════

test('Backups: panel renders with Snapshot History heading', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await expect(page.getByText('Snapshot History')).toBeVisible()
  await expect(page.getByText('Saved locally — not synced to Supabase')).toBeVisible()
})

test('Backups: empty state shown when no snapshots exist', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await expect(page.getByText(/No snapshots saved yet/)).toBeVisible()
})

test('Backups: Save Snapshot button creates a new snapshot entry', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  // An entry with a date/time string should now appear
  // The "No snapshots" message should be gone
  await expect(page.getByText(/No snapshots saved yet/)).not.toBeVisible()
  // "Clear All" appears once snapshots exist
  await expect(page.getByRole('button', { name: 'Clear All' })).toBeVisible()
})

test('Backups: multiple snapshots are listed after multiple saves', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  // Brief pause so timestamps differ
  await page.waitForTimeout(50)
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  // At least two Restore buttons should be present
  const restoreBtns = page.getByRole('button', { name: 'Restore' })
  await expect(restoreBtns).toHaveCount(2)
})

test('Backups: Restore button opens confirm modal', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  await page.getByRole('button', { name: 'Restore' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Restore Snapshot' })).toBeVisible()
})

test('Backups: restore modal Cancel closes without applying', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  await page.getByRole('button', { name: 'Restore' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('Backups: delete button removes snapshot from list', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()

  // The × button deletes the snapshot
  await page.getByRole('button', { name: '×' }).first().click()
  await expect(page.getByText(/No snapshots saved yet/)).toBeVisible()
})

test('Backups: Clear All button opens confirm modal', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  await page.getByRole('button', { name: 'Clear All' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Clear All Snapshots')).toBeVisible()
})

test('Backups: Clear All confirm removes all snapshots', async ({ page }) => {
  await goUtilSub(page, 'Backups')
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  await page.getByRole('button', { name: 'Clear All' }).click()
  await page.getByRole('button', { name: 'Yes, Delete All' }).click()
  await expect(page.getByText(/No snapshots saved yet/)).toBeVisible()
})

test('Backups: snapshot shows record/lead/stop counts', async ({ page }) => {
  // Seed a record so the snapshot has a non-zero count
  await seedRecords(page, [makeRecord({ name: 'Snap Record' })])
  await page.reload()
  await blockSupabase(page)
  await goUtilities(page)
  await goUtilSub(page, 'Backups')
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  // The count line should show "1 records"
  await expect(page.getByText(/1 records/)).toBeVisible()
})

test('Backups: mobile viewport — Save Snapshot and list visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await goUtilSub(page, 'Backups')
  await expect(page.getByRole('button', { name: 'Save Snapshot' })).toBeVisible()
  await page.getByRole('button', { name: 'Save Snapshot' }).click()
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()
})

// ════════════════════════════════════════════════════════════════════════════
// BLOCKLIST
// ════════════════════════════════════════════════════════════════════════════

test('Blocklist: panel renders heading and term count', async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  await expect(page.getByRole('heading', { name: 'Blocklist', level: 3 })).toBeVisible()
  // Default terms are loaded; count label should mention "terms"
  await expect(page.getByText(/terms — case-insensitive partial match/)).toBeVisible()
})

test("Blocklist: default terms include 'starbucks' and 'mcdonald's'", async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  // Default blocklist renders as pill badges
  await expect(page.getByText("mcdonald's")).toBeVisible()
  await expect(page.getByText('starbucks')).toBeVisible()
})

test('Blocklist: Add term button is disabled when input is empty', async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled()
})

test('Blocklist: adding a new term appears in the list', async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  await page.getByPlaceholder('Add a term…').fill('test chain')
  await page.getByRole('button', { name: 'Add' }).click()
  // Input should clear
  await expect(page.getByPlaceholder('Add a term…')).toHaveValue('')
  // New pill should appear
  await expect(page.getByText('test chain')).toBeVisible()
})

test('Blocklist: pressing Enter adds a term', async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  await page.getByPlaceholder('Add a term…').fill('enter term')
  await page.keyboard.press('Enter')
  await expect(page.getByText('enter term')).toBeVisible()
})

test('Blocklist: duplicate terms are not added', async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  await page.getByPlaceholder('Add a term…').fill('starbucks')
  await page.getByRole('button', { name: 'Add' }).click()
  // Count should not increase — starbucks already in default list
  // The input just clears (or stays if it detects a dupe and ignores)
  // Either way, only one 'starbucks' pill should exist
  const pills = page.locator('span.rounded-full').filter({ hasText: 'starbucks' })
  await expect(pills).toHaveCount(1)
})

test('Blocklist: removing a term via × button removes it from list', async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  // Add a custom term first so we have a known target
  await page.getByPlaceholder('Add a term…').fill('removable term')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('removable term')).toBeVisible()
  // Click the × button for that specific term
  await page.getByRole('button', { name: 'Remove removable term' }).click()
  await expect(page.getByText('removable term')).not.toBeVisible()
})

test('Blocklist: Reset to Defaults restores standard blocklist', async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  // Remove starbucks first
  await page.getByRole('button', { name: 'Remove starbucks' }).click()
  await expect(page.getByText('starbucks')).not.toBeVisible()
  // Reset
  await page.getByRole('button', { name: 'Reset to Defaults' }).click()
  // starbucks should be back
  await expect(page.getByText('starbucks')).toBeVisible()
})

test('Blocklist: term list persists in localStorage after add', async ({ page }) => {
  await goUtilSub(page, 'Blocklist')
  await page.getByPlaceholder('Add a term…').fill('persist test')
  await page.getByRole('button', { name: 'Add' }).click()

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('vs_blocklist')
    return raw ? JSON.parse(raw) : []
  })
  expect(stored).toContain('persist test')
})

test('Blocklist: mobile viewport — add term input and list visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await goUtilSub(page, 'Blocklist')
  await expect(page.getByPlaceholder('Add a term…')).toBeVisible()
  await expect(page.getByText('starbucks')).toBeVisible()
})

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════════════

test('Settings: panel renders all section headings', async ({ page }) => {
  await goUtilSub(page, 'Settings')
  await expect(page.getByText('Appearance')).toBeVisible()
  await expect(page.getByText('Navigation')).toBeVisible()
  await expect(page.getByText('Route Endpoints')).toBeVisible()
  await expect(page.getByText('RouteXL Credentials')).toBeVisible()
  await expect(page.getByText('Outscraper')).toBeVisible()
})

test('Settings: Dark Mode toggle is a switch element', async ({ page }) => {
  await goUtilSub(page, 'Settings')
  const toggle = page.getByRole('switch', { name: 'Dark Mode' })
  await expect(toggle).toBeVisible()
})

test('Settings: Dark Mode toggle changes theme', async ({ page }) => {
  await goUtilSub(page, 'Settings')
  const html = page.locator('html')
  const hasDarkBefore = await html.evaluate((el) => el.classList.contains('dark'))
  await page.getByRole('switch', { name: 'Dark Mode' }).click()
  const hasDarkAfter = await html.evaluate((el) => el.classList.contains('dark'))
  expect(hasDarkBefore).not.toBe(hasDarkAfter)
})

test('Settings: route provider select has Google Maps and Waze options', async ({ page }) => {
  await goUtilSub(page, 'Settings')
  const select = page.getByLabel('Route Provider')
  await expect(select).toBeVisible()
  await expect(select.getByRole('option', { name: 'Google Maps' })).toBeAttached()
  await expect(select.getByRole('option', { name: 'Waze' })).toBeAttached()
})

test('Settings: route provider selection persists to localStorage', async ({ page }) => {
  await goUtilSub(page, 'Settings')
  await page.getByLabel('Route Provider').selectOption('waze')

  const stored = await page.evaluate(() => localStorage.getItem('vs_maps_app'))
  expect(stored).toBe('waze')
})

test('Settings: Home Address input saves to localStorage on change', async ({ page }) => {
  await goUtilSub(page, 'Settings')
  await page.getByPlaceholder('123 Main St, Wilmington, NC 28401').fill('999 Oak Ave, Durham NC 27701')

  const stored = await page.evaluate(() => localStorage.getItem('vs_home_addr'))
  expect(stored).toBe('999 Oak Ave, Durham NC 27701')
})

test('Settings: Office Address input saves to localStorage on change', async ({ page }) => {
  await goUtilSub(page, 'Settings')
  await page.getByPlaceholder('456 Office Rd, Wilmington, NC 28403').fill('100 Commerce St, Raleigh NC 27601')

  const stored = await page.evaluate(() => localStorage.getItem('vs_office_addr'))
  expect(stored).toBe('100 Commerce St, Raleigh NC 27601')
})

test('Settings: dark mode state reflected in toggle aria-checked', async ({ page }) => {
  await goUtilSub(page, 'Settings')
  const toggle = page.getByRole('switch', { name: 'Dark Mode' })
  const initialChecked = await toggle.getAttribute('aria-checked')
  await toggle.click()
  const afterChecked = await toggle.getAttribute('aria-checked')
  expect(initialChecked).not.toBe(afterChecked)
})

test('Settings: mobile viewport — all sections visible via scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await goUtilSub(page, 'Settings')
  await expect(page.getByText('Appearance')).toBeVisible()
  await expect(page.getByText('Dark Mode')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 9999))
  await expect(page.getByText('Outscraper')).toBeVisible()
})
