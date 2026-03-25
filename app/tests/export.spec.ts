import { test, expect } from '@playwright/test'
import { clearStorage, goTab, seedLead, seedCanvassStop } from './helpers'

async function goExport(page) {
  await goTab(page, 'Utilities')
  await page.getByRole('button', { name: 'Export' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearStorage(page)
  await page.reload()
  await goExport(page)
})

// ── Section visibility ─────────────────────────────────────────────────────────

test('Full Backup section is visible', async ({ page }) => {
  await expect(page.getByText('Full Backup (JSON)')).toBeVisible()
})

test('Export to CSV section is visible', async ({ page }) => {
  await expect(page.getByText('Export to CSV')).toBeVisible()
})

test('Git Sync Workflow section is visible', async ({ page }) => {
  await expect(page.getByText('Git Sync Workflow')).toBeVisible()
})

test('Auto File Sync section is visible', async ({ page }) => {
  await expect(page.getByText('Auto File Sync')).toBeVisible()
})

// ── Export buttons ────────────────────────────────────────────────────────────

test('Export Backup JSON triggers file download', async ({ page }) => {
  // Seed some data first
  await seedLead(page, { name: 'Export Test Lead' })
  await page.reload()
  await goExport(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Backup JSON' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/prospect-tracker-backup.*\.json/)
})

test('Export DB Records CSV shows error when no DB records', async ({ page }) => {
  await page.getByRole('button', { name: /DB Records/ }).click()
  await expect(page.getByText('No DB records to export.')).toBeVisible()
})

test('Export Leads CSV shows error when no leads', async ({ page }) => {
  await page.getByRole('button', { name: /Leads \(/ }).click()
  await expect(page.getByText('No leads to export.')).toBeVisible()
})

test('Export Canvass CSV shows error when no canvass stops', async ({ page }) => {
  await page.getByRole('button', { name: /Canvass Log/ }).click()
  await expect(page.getByText('No canvass stops to export.')).toBeVisible()
})

test('Export Leads CSV triggers download when leads exist', async ({ page }) => {
  await seedLead(page, { name: 'CSV Export Lead' })
  await page.reload()
  await goExport(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Leads \(/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/leads.*\.csv/)
})

test('Export Canvass CSV triggers download when canvass stops exist', async ({ page }) => {
  await seedCanvassStop(page, { name: 'CSV Canvass Stop', status: 'Not visited yet', date: new Date().toLocaleDateString() })
  await page.reload()
  await goExport(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Canvass Log/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/canvass-log.*\.csv/)
})

test('export shows flash message after export', async ({ page }) => {
  await seedLead(page, { name: 'Flash Test Lead' })
  await page.reload()
  await goExport(page)
  await page.getByRole('button', { name: 'Export Backup JSON' }).click()
  await expect(page.getByText(/backup exported/)).toBeVisible()
})

// ── Import from JSON ──────────────────────────────────────────────────────────

test('Import from JSON file input is present', async ({ page }) => {
  await expect(page.getByText('Import from JSON', { exact: true })).toBeVisible()
  // The hidden file input
  await expect(page.locator('input[type="file"][accept=".json"]')).toBeAttached()
})

test('Import from JSON: full round-trip backup and restore', async ({ page }) => {
  // Seed data
  await seedLead(page, { id: 'rt-1', name: 'Round Trip Lead' })
  await seedCanvassStop(page, { id: 'rt-2', name: 'Round Trip Stop', status: 'Not visited yet', date: new Date().toLocaleDateString() })
  await page.reload()
  await goExport(page)

  // Export
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Backup JSON' }).click(),
  ])
  const backupPath = await download.path()
  expect(backupPath).toBeTruthy()

  // Clear storage
  await clearStorage(page)
  await page.reload()
  await goExport(page)

  // Import
  page.once('dialog', d => d.accept())
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(backupPath!)

  await expect(page.getByText(/Restored/)).toBeVisible()

  // Verify data came back
  await goTab(page, 'My Leads')
  await expect(page.getByText('Round Trip Lead')).toBeVisible()

  await goTab(page, 'Canvass')
  await expect(page.getByText('Round Trip Stop')).toBeVisible({ timeout: 10000 })
})

test('Import from JSON: cancelled confirm dialog aborts import', async ({ page }) => {
  await seedLead(page, { id: 'imp-1', name: 'Import Cancel Test' })
  await page.reload()
  await goExport(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Backup JSON' }).click(),
  ])
  const backupPath = await download.path()

  // Clear and try to import — but dismiss the confirm dialog
  await clearStorage(page)
  await page.reload()
  await goExport(page)

  page.once('dialog', d => d.dismiss())
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(backupPath!)

  // No "Restored" message
  await expect(page.getByText(/Restored/)).not.toBeVisible()
})

// ── Record counts shown on buttons ───────────────────────────────────────────

test('CSV buttons show record counts', async ({ page }) => {
  // With no data, should show (0)
  await expect(page.getByRole('button', { name: /DB Records \(0\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Leads \(0\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Canvass Log \(0\)/ })).toBeVisible()
})

test('lead count updates after adding a lead', async ({ page }) => {
  await seedLead(page, { name: 'Count Update Lead' })
  await page.reload()
  await goExport(page)
  await expect(page.getByRole('button', { name: /Leads \(1\)/ })).toBeVisible()
})

// ── Git Sync instructions content ─────────────────────────────────────────────

test('Git Sync section shows step-by-step instructions', async ({ page }) => {
  await expect(page.getByText('1. Export')).toBeVisible()
  await expect(page.getByText('2. Commit')).toBeVisible()
  await expect(page.getByText('3. Pull')).toBeVisible()
})
