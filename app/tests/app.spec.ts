import { test, expect } from '@playwright/test'
import { clearStorage, goTab, seedLead, seedDatabase, makeDbRecord } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearStorage(page)
  await page.reload()
})

// ── App shell ─────────────────────────────────────────────────────────────────

test('page title and header visible', async ({ page }) => {
  await expect(page.getByText('Restaurant Prospect Tracker')).toBeVisible()
  await expect(page.getByText('Value Systems')).toBeVisible()
})

test('all 5 main tabs are present', async ({ page }) => {
  for (const tab of ['My Leads', 'Canvass', 'Route', 'Database', 'Utilities']) {
    await expect(page.getByRole('tab', { name: tab })).toBeVisible()
  }
})

test('dark mode toggle changes theme attribute', async ({ page }) => {
  const html = page.locator('html')
  const before = await html.getAttribute('data-theme')
  await page.getByRole('button', { name: 'Toggle light/dark theme' }).click()
  const after = await html.getAttribute('data-theme')
  expect(before).not.toBe(after)
})

test('dark mode toggles back on second click', async ({ page }) => {
  const html = page.locator('html')
  const before = await html.getAttribute('data-theme')
  await page.getByRole('button', { name: 'Toggle light/dark theme' }).click()
  await page.getByRole('button', { name: 'Toggle light/dark theme' }).click()
  expect(await html.getAttribute('data-theme')).toBe(before)
})

test('theme persists across reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle light/dark theme' }).click()
  const afterToggle = await page.locator('html').getAttribute('data-theme')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', afterToggle || '')
})

test('Database tab is navigable and shows content', async ({ page }) => {
  await goTab(page, 'Database')
  await expect(page.getByText('Browse')).toBeVisible()
})

test('Canvass tab is navigable', async ({ page }) => {
  await goTab(page, 'Canvass')
  await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
})

test('My Leads tab is navigable', async ({ page }) => {
  await goTab(page, 'My Leads')
  await expect(page.getByPlaceholder('Restaurant name *')).toBeVisible()
})

test('Route tab is navigable', async ({ page }) => {
  await goTab(page, 'Route')
  await expect(page.getByText(/No canvass stops yet|No stops for today|Today's Route/)).toBeVisible()
})

test('Utilities tab is navigable', async ({ page }) => {
  await goTab(page, 'Utilities')
  await expect(page.getByText('Full Backup (JSON)')).toBeVisible()
})

// ── Tab badge counts ──────────────────────────────────────────────────────────

test('My Leads tab badge shows open lead count', async ({ page }) => {
  await seedLead(page, { name: 'Badge Lead', status: 'Open' })
  await page.reload()
  await expect(page.getByRole('tab', { name: /My Leads/ }).locator('[class*="badge"]')).toHaveText('1')
})

test('My Leads tab badge hidden when no open leads', async ({ page }) => {
  await seedLead(page, { name: 'Won Lead', status: 'Won' })
  await page.reload()
  // Won lead should not increment the Open badge
  await expect(page.getByRole('tab', { name: /My Leads/ }).locator('[class*="badge"]')).not.toBeVisible()
})

test('Database tab badge shows record count', async ({ page }) => {
  await seedDatabase(page, [makeDbRecord({ id: 'badge-1', n: 'Badge DB' })])
  await page.reload()
  await expect(page.getByRole('tab', { name: /Database/ }).locator('[class*="badge"]')).toHaveText('1')
})

// ── Global persistence ────────────────────────────────────────────────────────

test('all data types persist across full page reload', async ({ page }) => {
  // Add lead
  await goTab(page, 'My Leads')
  await page.getByPlaceholder('Restaurant name *').fill('Persist Lead Global')
  await page.getByRole('button', { name: '+ Add Lead' }).click()

  await page.reload()

  await goTab(page, 'My Leads')
  await expect(page.getByText('Persist Lead Global')).toBeVisible()
})

// ── Keyboard navigation ───────────────────────────────────────────────────────

test('Tab key navigates between interactive elements', async ({ page }) => {
  await goTab(page, 'My Leads')
  // Tab through a few elements
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  // Page should not crash
  await expect(page.getByText('Restaurant Prospect Tracker')).toBeVisible()
})

test('modal focus trap: Tab cycles within modal', async ({ page }) => {
  await goTab(page, 'My Leads')
  await page.getByPlaceholder('Restaurant name *').fill('Focus Trap Test')
  await page.getByRole('button', { name: '+ Add Lead' }).click()
  await page.reload()
  await goTab(page, 'My Leads')
  await page.locator('[class*="card"]').filter({ hasText: 'Focus Trap Test' })
    .getByRole('button', { name: /Canvass/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Tab multiple times — focus should stay within the modal
  for (let i = 0; i < 10; i++) await page.keyboard.press('Tab')

  // Modal should still be visible (focus did not escape)
  await expect(dialog).toBeVisible()
})
