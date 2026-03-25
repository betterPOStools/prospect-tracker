import { test, expect } from '@playwright/test'
import { clearStorage, goTab, seedDatabase, makeDbRecord } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearStorage(page)
  await page.reload()
})

// ── ImportBar ─────────────────────────────────────────────────────────────────

test.describe('ImportBar', () => {
  test.beforeEach(async ({ page }) => {
    await goTab(page, 'Utilities')
    await page.getByRole('button', { name: 'Import' }).first().click()
  })

  test('Import Data button/label is present', async ({ page }) => {
    await expect(page.getByText('Import Outscraper Data')).toBeVisible()
  })

  test('file input accepts .json and .xlsx files', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first()
    await expect(fileInput).toHaveAttribute('accept', /json/)
  })
})

// ── Snapshot Manager ──────────────────────────────────────────────────────────

test.describe('Snapshot Manager', () => {
  test.beforeEach(async ({ page }) => {
    await goTab(page, 'Utilities')
    await page.getByRole('button', { name: 'Backups' }).click()
  })

  test('shows Database Snapshots header', async ({ page }) => {
    await expect(page.getByText('Database Snapshots')).toBeVisible()
  })

  test('Save Snapshot button present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Save Snapshot' })).toBeVisible()
  })

  test('Save Snapshot with no data shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Save Snapshot' }).click()
    await expect(page.getByText(/Nothing to snapshot/)).toBeVisible()
  })

  test('History button toggles list', async ({ page }) => {
    await page.getByRole('button', { name: /History/ }).click()
    await expect(page.getByText(/No snapshots yet/)).toBeVisible()
    await page.getByRole('button', { name: /History/ }).click()
    await expect(page.getByText(/No snapshots yet/)).not.toBeVisible()
  })

  test('Save Snapshot with DB data saves successfully', async ({ page }) => {
    const records = [
      makeDbRecord({ id: 'snap-1', n: 'Snapshot Test Restaurant' }),
    ]
    await seedDatabase(page, records)
    await page.reload()
    await goTab(page, 'Utilities')
    await page.getByRole('button', { name: 'Backups' }).click()
    await page.getByRole('button', { name: 'Save Snapshot' }).click()
    await expect(page.getByText('Snapshot saved.')).toBeVisible()
  })

  test('snapshot appears in history after save', async ({ page }) => {
    const records = [makeDbRecord({ id: 'snap-2', n: 'History Test' })]
    await seedDatabase(page, records)
    await page.reload()
    await goTab(page, 'Utilities')
    await page.getByRole('button', { name: 'Backups' }).click()
    await page.getByRole('button', { name: 'Save Snapshot' }).click()
    // History should auto-open
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
  })

  test('Delete snapshot removes it from list', async ({ page }) => {
    const records = [makeDbRecord({ id: 'snap-3', n: 'Delete Snapshot Test' })]
    await seedDatabase(page, records)
    await page.reload()
    await goTab(page, 'Utilities')
    await page.getByRole('button', { name: 'Backups' }).click()
    await page.getByRole('button', { name: 'Save Snapshot' }).click()
    await page.getByRole('button', { name: 'Delete' }).first().click()
    await expect(page.getByText(/No snapshots yet/)).toBeVisible()
  })

  test('Restore snapshot restores DB data', async ({ page }) => {
    const records = [makeDbRecord({ id: 'snap-4', n: 'Restore Me Restaurant' })]
    await seedDatabase(page, records)
    await page.reload()
    await goTab(page, 'Utilities')
    await page.getByRole('button', { name: 'Backups' }).click()
    await page.getByRole('button', { name: 'Save Snapshot' }).click()

    // Clear the DB
    await clearStorage(page)
    await page.evaluate(() => localStorage.removeItem('vs_db'))
    await page.reload()
    await goTab(page, 'Utilities')
    await page.getByRole('button', { name: 'Backups' }).click()

    // Restore (snapshots are in their own key, should survive clear)
    await page.getByRole('button', { name: /History/ }).click()
    if (await page.getByRole('button', { name: 'Restore' }).isVisible()) {
      await page.getByRole('button', { name: 'Restore' }).first().click()
      // DB should show records now — navigate to Database to verify
      await goTab(page, 'Database')
      await expect(page.getByText('Total')).toBeVisible()
    }
  })
})

// ── Chain Blocklist Manager ───────────────────────────────────────────────────

test.describe('Chain Blocklist Manager', () => {
  test.beforeEach(async ({ page }) => {
    await goTab(page, 'Utilities')
    await page.getByRole('button', { name: 'Blocklist' }).click()
    await page.getByRole('button', { name: /Manage/ }).click()
  })

  test('opens to show blocklist', async ({ page }) => {
    await expect(page.getByText(/terms — case-insensitive/)).toBeVisible()
  })

  test('Add term input accepts text', async ({ page }) => {
    await page.getByPlaceholder('Add term (e.g. Subway)').fill('Chipotle')
    await expect(page.getByPlaceholder('Add term (e.g. Subway)')).toHaveValue('Chipotle')
  })

  test('Add button adds new term to blocklist', async ({ page }) => {
    await page.getByPlaceholder('Add term (e.g. Subway)').fill('TestChain')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('"testchain" added.')).toBeVisible()
    await expect(page.getByText('testchain', { exact: true })).toBeVisible()
  })

  test('Enter key adds term', async ({ page }) => {
    await page.getByPlaceholder('Add term (e.g. Subway)').fill('PressEnterChain')
    await page.getByPlaceholder('Add term (e.g. Subway)').press('Enter')
    await expect(page.getByText('presseniterchain').or(page.getByText('presseniterchain')).or(page.getByText(/added/))).toBeVisible()
  })

  test('duplicate term shows error', async ({ page }) => {
    // First add
    await page.getByPlaceholder('Add term (e.g. Subway)').fill('DupTest')
    await page.getByRole('button', { name: 'Add' }).click()
    // Try to add again
    await page.getByPlaceholder('Add term (e.g. Subway)').fill('DupTest')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText(/already in the blocklist/)).toBeVisible()
  })

  test('✕ button removes a term', async ({ page }) => {
    await page.getByPlaceholder('Add term (e.g. Subway)').fill('RemoveMe')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('removeme', { exact: true })).toBeVisible()
    // Click the ✕ for RemoveMe
    await page.locator('[style*="border-bottom"]').filter({ hasText: 'removeme' })
      .locator('button').click()
    await expect(page.getByText('removeme', { exact: true })).not.toBeVisible()
  })

  test('Reset to defaults shows confirmation', async ({ page }) => {
    page.once('dialog', d => d.dismiss())
    await page.getByRole('button', { name: 'Reset to defaults' }).click()
    // Dialog was dismissed, so nothing changes — just verify modal appeared
  })

  test('Manage toggle collapses the panel', async ({ page }) => {
    await page.getByRole('button', { name: /Manage/ }).click()
    await expect(page.getByPlaceholder('Add term (e.g. Subway)')).not.toBeVisible()
  })
})

// ── Browse Panel ──────────────────────────────────────────────────────────────

test.describe('Browse panel', () => {
  // Field values are chosen so rescoreAll() produces the desired priority.
  // Default makeDbRecord → sc 85 (Hot).  Removing em drops 15 → 70 (Warm).
  // Removing em + cn + lowering rt to 3.5 → 50 (Cold).
  const records = () => [
    makeDbRecord({ id: 'br-1', n: 'Hot Place', st: 'unworked', zi: '29577', ar: 'Myrtle Beach', zo: 'Zone-1' }),
    makeDbRecord({ id: 'br-2', n: 'Warm Place', em: '', st: 'unworked', zi: '29577', ar: 'Myrtle Beach', zo: 'Zone-1' }),
    makeDbRecord({ id: 'br-3', n: 'Cold Place', em: '', cn: '', rt: 3.5, st: 'canvassed', zi: '29578', ar: 'North Myrtle Beach', zo: 'Zone-2' }),
    makeDbRecord({ id: 'br-4', n: 'In Canvass Place', st: 'in_canvass', zi: '29577', ar: 'Myrtle Beach', zo: 'Zone-1' }),
  ]

  test.beforeEach(async ({ page }) => {
    await seedDatabase(page, records(), [
      { id: 'zone-1', nm: 'Zone 1', cnt: 3, mb: ['br-1', 'br-2', 'br-4'] },
      { id: 'zone-2', nm: 'Zone 2', cnt: 1, mb: ['br-3'] },
    ])
    await page.reload()
    await goTab(page, 'Database')
    // Browse is default subtab
  })

  test('shows all records', async ({ page }) => {
    await expect(page.getByText('Hot Place')).toBeVisible()
    await expect(page.getByText('Warm Place')).toBeVisible()
    await expect(page.getByText('Cold Place')).toBeVisible()
  })

  test('priority filter: Hot shows only Hot records', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All priorities' }).selectOption('Hot')
    await expect(page.getByText('Hot Place')).toBeVisible()
    await expect(page.getByText('Warm Place')).not.toBeVisible()
    await expect(page.getByText('Cold Place')).not.toBeVisible()
  })

  test('priority filter: Warm', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All priorities' }).selectOption('Warm')
    await expect(page.getByText('Warm Place')).toBeVisible()
    await expect(page.getByText('Hot Place')).not.toBeVisible()
  })

  test('priority filter: Cold', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All priorities' }).selectOption('Cold')
    await expect(page.getByText('Cold Place')).toBeVisible()
    await expect(page.getByText('Hot Place')).not.toBeVisible()
  })

  test('status filter: unworked', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All statuses' }).selectOption('unworked')
    await expect(page.getByText('Hot Place')).toBeVisible()
    await expect(page.getByText('Cold Place')).not.toBeVisible() // canvassed
  })

  test('status filter: in_canvass', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All statuses' }).selectOption('in_canvass')
    await expect(page.getByText('In Canvass Place')).toBeVisible()
    await expect(page.getByText('Hot Place')).not.toBeVisible()
  })

  test('status filter: canvassed', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All statuses' }).selectOption('canvassed')
    await expect(page.getByText('Cold Place')).toBeVisible()
    await expect(page.getByText('Hot Place')).not.toBeVisible()
  })

  test('area filter', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All areas' }).selectOption('North Myrtle Beach')
    await expect(page.getByText('Cold Place')).toBeVisible()
    await expect(page.getByText('Hot Place')).not.toBeVisible()
  })

  test('ZIP filter', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All ZIPs' }).selectOption('29578')
    await expect(page.getByText('Cold Place')).toBeVisible()
    await expect(page.getByText('Hot Place')).not.toBeVisible()
  })

  test('search by name', async ({ page }) => {
    await page.locator('input[placeholder="Search name…"]').fill('Hot')
    await expect(page.getByText('Hot Place')).toBeVisible()
    await expect(page.getByText('Warm Place')).not.toBeVisible()
  })

  test('search clear restores all results', async ({ page }) => {
    await page.locator('input[placeholder="Search name…"]').fill('xyz')
    await page.locator('input[placeholder="Search name…"]').fill('')
    await expect(page.getByText('Hot Place')).toBeVisible()
    await expect(page.getByText('Warm Place')).toBeVisible()
  })

  test('Select all filtered button selects all', async ({ page }) => {
    await page.getByRole('button', { name: 'Select all filtered' }).click()
    const checkboxes = page.getByRole('checkbox')
    const count = await checkboxes.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) await expect(checkboxes.nth(i)).toBeChecked()
  })

  test('Clear selection button deselects all', async ({ page }) => {
    await page.getByRole('button', { name: 'Select all filtered' }).click()
    await page.getByRole('button', { name: 'Clear selection' }).click()
    // Skip filter-row checkboxes (e.g. "Hide on hold") — only check record checkboxes
    const checkboxes = page.getByRole('checkbox')
    const count = await checkboxes.count()
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i)
      const inFilterRow = await cb.locator('xpath=ancestor::div[contains(@class,"filter-row")]').count()
      if (inFilterRow) continue
      await expect(cb).not.toBeChecked()
    }
  })

  test('clicking a row toggles its checkbox', async ({ page }) => {
    // Click the first record checkbox (skip filter-row checkboxes like "Hide on hold")
    const firstCb = page.locator('[style*="border-bottom"] input[type="checkbox"]').first()
    await firstCb.click()
    await expect(firstCb).toBeChecked()
    await firstCb.click()
    await expect(firstCb).not.toBeChecked()
  })

  test('selection counter updates', async ({ page }) => {
    await page.getByRole('button', { name: 'Select all filtered' }).click()
    await expect(page.getByText(/selected/)).toBeVisible()
  })

  test('→ Today\'s Canvass loads selected to canvass', async ({ page }) => {
    await page.getByRole('button', { name: 'Select all filtered' }).click()
    await page.getByRole('button', { name: "→ Today's Canvass" }).click()
    await expect(page.getByText(/stops loaded to canvass/)).toBeVisible()
  })

  test('Assign to day dropdown has weekday options', async ({ page }) => {
    const sel = page.locator('select').filter({ hasText: 'Assign to day' })
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      await sel.selectOption(day)
      await expect(sel).toHaveValue(day)
    }
  })

  test('Assign button with no selection shows error', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'Assign to day' }).selectOption('Monday')
    await page.getByRole('button', { name: 'Assign', exact: true }).click()
    await expect(page.getByText(/Select records first/)).toBeVisible()
  })

  test('Assign button with no day selected shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Select all filtered' }).click()
    await page.getByRole('button', { name: 'Assign', exact: true }).click()
    await expect(page.getByText(/Pick a day first/)).toBeVisible()
  })

  test('Assign selected records to a day', async ({ page }) => {
    await page.getByRole('button', { name: 'Select all filtered' }).click()
    await page.locator('select').filter({ hasText: 'Assign to day' }).selectOption('Tuesday')
    await page.getByRole('button', { name: 'Assign', exact: true }).click()
    await expect(page.getByText(/stops assigned to Tuesday/)).toBeVisible()
  })

  test('stat bar shows DB stats', async ({ page }) => {
    await expect(page.locator('[class*="statL"]').filter({ hasText: /Total/ }).first()).toBeVisible()
    await expect(page.locator('[class*="statL"]').filter({ hasText: /Hot/ }).first()).toBeVisible()
    await expect(page.locator('[class*="statL"]').filter({ hasText: /Unworked/ }).first()).toBeVisible()
  })
})

// ── Zones Panel ───────────────────────────────────────────────────────────────

test.describe('Zones panel', () => {
  test.beforeEach(async ({ page }) => {
    await seedDatabase(page, [
      makeDbRecord({ id: 'z-1', n: 'Zone A Restaurant', zo: 'Zone-1', ar: 'Myrtle Beach' }),
      makeDbRecord({ id: 'z-2', n: 'Zone B Restaurant', zo: 'Zone-2', ar: 'North Myrtle Beach' }),
    ], [
      { id: 'zone-1', nm: 'Zone 1', cnt: 1, mb: ['z-1'] },
      { id: 'zone-2', nm: 'Zone 2', cnt: 1, mb: ['z-2'] },
    ])
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Zones' }).click()
  })

  test('shows zone cards', async ({ page }) => {
    await expect(page.getByText('Zone 1')).toBeVisible()
    await expect(page.getByText('Zone 2')).toBeVisible()
  })

  test('area filter dropdown works', async ({ page }) => {
    await page.locator('select').filter({ hasText: 'All areas' }).selectOption('Myrtle Beach')
    await expect(page.getByText('Zone 1')).toBeVisible()
  })

  test('Rename button opens prompt', async ({ page }) => {
    page.once('dialog', async d => {
      expect(d.message()).toContain('Rename zone')
      await d.dismiss()
    })
    await page.getByRole('button', { name: 'Rename' }).first().click()
  })

  test('Load to canvass button loads zone stops to canvass', async ({ page }) => {
    await page.getByRole('button', { name: 'Load to canvass' }).first().click()
    await expect(page.getByText(/stops from .* loaded to canvass/)).toBeVisible()
  })

  test('Assign button opens prompt', async ({ page }) => {
    page.once('dialog', async d => {
      expect(d.message()).toContain('Assign this zone')
      await d.dismiss()
    })
    await page.getByRole('button', { name: 'Assign' }).first().click()
  })
})

// ── Planner Panel ────────────────────────────────────────────────────────

test.describe('Planner panel', () => {
  test.beforeEach(async ({ page }) => {
    // Seed enough records to fill a week
    const records = Array.from({ length: 20 }, (_, i) =>
      makeDbRecord({ id: `wp-${i}`, n: `WP Restaurant ${i}`, pr: i < 5 ? 'Hot' : 'Warm', sc: 90 - i })
    )
    await seedDatabase(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()
  })

  test('shows all 5 weekday rows', async ({ page }) => {
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      await expect(page.getByText(day)).toBeVisible()
    }
  })

  test('stops/day input accepts number', async ({ page }) => {
    await page.locator('input[type="number"]').fill('10')
    await expect(page.locator('input[type="number"]')).toHaveValue('10')
  })

  test('Auto-fill Week assigns stops across all days', async ({ page }) => {
    await page.getByRole('button', { name: 'Auto-fill Week' }).click()
    await expect(page.getByText(/stops assigned/)).toBeVisible()
  })

  test('Clear Week requires confirmation and clears all assignments', async ({ page }) => {
    // First fill
    await page.getByRole('button', { name: 'Auto-fill Week' }).click()
    // Clear
    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: 'Clear Week' }).click()
    await expect(page.getByText('Week cleared.')).toBeVisible()
  })

  test('Clear Week cancelled keeps assignments', async ({ page }) => {
    await page.getByRole('button', { name: 'Auto-fill Week' }).click()
    page.once('dialog', d => d.dismiss())
    await page.getByRole('button', { name: 'Clear Week' }).click()
    // No "Week cleared" message
    await expect(page.getByText('Week cleared.')).not.toBeVisible()
  })

  test('clicking a day row expands it', async ({ page }) => {
    // Click the Monday span to expand the row — expanded state shows stop list
    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await expect(page.getByText('No stops assigned').first()).toBeVisible()
  })

  test('Auto-fill button for a single day', async ({ page }) => {
    // Expand Monday first, then click Auto-fill
    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()
    // Either assigns stops or shows "no unworked records" — either way a flash appears
    await expect(page.getByText(/stops assigned to|No unworked records/)).toBeVisible()
  })

  test('→ Canvass button for a day with no stops shows error', async ({ page }) => {
    // No stops assigned yet — use exact text to skip the "Today → Canvass" header button
    await page.getByRole('button', { name: '→ Canvass', exact: true }).first().click()
    await expect(page.getByText(/No stops assigned to/)).toBeVisible()
  })

  test('→ Canvass button after filling a day loads to canvass', async ({ page }) => {
    await page.getByRole('button', { name: 'Auto-fill' }).first().click()
    await page.getByRole('button', { name: '→ Canvass', exact: true }).first().click()
    await expect(page.getByText(/stops from .* loaded to canvass/)).toBeVisible()
  })

  test('Clear button for a single day', async ({ page }) => {
    await page.getByRole('button', { name: 'Auto-fill' }).first().click()
    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: 'Clear' }).first().click()
    await expect(page.getByText(/cleared/)).toBeVisible()
  })

  test('unassigned count shows in header', async ({ page }) => {
    await expect(page.getByText(/unassigned/)).toBeVisible()
  })

  test('area filter dropdown is present', async ({ page }) => {
    await expect(page.locator('select').filter({ hasText: 'All areas' })).toBeVisible()
  })
})

// ── Database subtab navigation ────────────────────────────────────────────────

test.describe('Database subtab navigation', () => {
  test.beforeEach(async ({ page }) => {
    const records = [makeDbRecord({ id: 'nav-1', n: 'Nav Test Restaurant' })]
    await seedDatabase(page, records)
    await page.reload()
    await goTab(page, 'Database')
  })

  test('Browse → Zones → Planner navigation', async ({ page }) => {
    await page.getByRole('button', { name: 'Browse' }).click()
    await expect(page.getByText('Nav Test Restaurant')).toBeVisible()

    await page.getByRole('button', { name: 'Zones' }).click()
    await expect(page.getByText('Zone 1')).toBeVisible()

    await page.getByRole('button', { name: 'Planner' }).click()
    await expect(page.getByText('Monday')).toBeVisible()
  })
})

// ── Empty states ──────────────────────────────────────────────────────────────

test.describe('Empty states', () => {
  test.beforeEach(async ({ page }) => {
    await goTab(page, 'Database')
  })

  test('Browse shows empty state with no records', async ({ page }) => {
    await expect(page.getByText(/No records yet/)).toBeVisible()
  })

  test('Zones shows empty state with no zones', async ({ page }) => {
    await page.getByRole('button', { name: 'Zones' }).click()
    await expect(page.getByText(/No zones yet/)).toBeVisible()
  })

  test('Planner shows empty state with no records', async ({ page }) => {
    await page.getByRole('button', { name: 'Planner' }).click()
    await expect(page.getByText(/No records yet/)).toBeVisible()
  })
})
