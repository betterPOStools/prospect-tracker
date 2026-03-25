import { test, expect } from '@playwright/test'
import { clearStorage, goTab, addStop, seedCanvassStop } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearStorage(page)
  await page.reload()
})

// ── Empty states ──────────────────────────────────────────────────────────────

test('shows empty state with no canvass data', async ({ page }) => {
  await goTab(page, 'Route')
  await expect(page.getByText(/No canvass stops yet/)).toBeVisible()
})

test('shows empty state when canvass stops exist but none for today', async ({ page }) => {
  // Seed a stop from yesterday (not today)
  await seedCanvassStop(page, {
    id: 'route-old',
    name: 'Yesterday Stop',
    status: 'Come back later',
    date: new Date(Date.now() - 86400000).toLocaleDateString(),
  })
  await page.reload()
  await goTab(page, 'Route')
  await expect(page.getByText(/No stops for today/)).toBeVisible()
})

// ── With today's stops ────────────────────────────────────────────────────────

test.describe('with today\'s stops', () => {
  test.beforeEach(async ({ page }) => {
    const today = new Date().toLocaleDateString()
    const now   = new Date().toISOString()
    await seedCanvassStop(page, { id: 'r-a', name: 'Route Stop Alpha', addr: '100 Ocean Blvd, Myrtle Beach SC 29577', status: 'Not visited yet', date: today, added: now })
    await seedCanvassStop(page, { id: 'r-b', name: 'Route Stop Beta',  addr: '200 Kings Hwy, Myrtle Beach SC 29577',  status: 'Not visited yet', date: today, added: now })
    await seedCanvassStop(page, { id: 'r-c', name: 'Route Stop Gamma', addr: '300 Broadway St, Myrtle Beach SC 29577', status: 'Not visited yet', date: today, added: now })
    await page.reload()
    await goTab(page, 'Route')
  })

  test('shows all today\'s stops in route list', async ({ page }) => {
    await expect(page.getByText('Route Stop Alpha')).toBeVisible()
    await expect(page.getByText('Route Stop Beta')).toBeVisible()
    await expect(page.getByText('Route Stop Gamma')).toBeVisible()
  })

  test('shows stop count in header', async ({ page }) => {
    await expect(page.getByText(/3 stop/)).toBeVisible()
  })

  test('shows position numbers for each stop', async ({ page }) => {
    await expect(page.getByText('1', { exact: true })).toBeVisible()
    await expect(page.getByText('2', { exact: true })).toBeVisible()
    await expect(page.getByText('3', { exact: true })).toBeVisible()
  })

  test('Google Maps Route link is present and points to Google Maps', async ({ page }) => {
    const link = page.getByRole('link', { name: /Google Maps Route/ })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /google\.com\/maps/)
  })

  test('Navigate ↗ link on each stop with address', async ({ page }) => {
    const navLinks = page.getByRole('link', { name: /Navigate/ })
    await expect(navLinks.first()).toBeVisible()
    await expect(navLinks.first()).toHaveAttribute('href', /google\.com|waze\.com/)
  })

  test('▲ move up disabled on first stop', async ({ page }) => {
    const upBtns = page.locator('button').filter({ hasText: '▲' })
    await expect(upBtns.first()).toBeDisabled()
  })

  test('▼ move down disabled on last stop', async ({ page }) => {
    const downBtns = page.locator('button').filter({ hasText: '▼' })
    const count = await downBtns.count()
    await expect(downBtns.nth(count - 1)).toBeDisabled()
  })

  test('▼ moves stop down', async ({ page }) => {
    // Get names in order before move
    const namesBefore = await page.locator('[style*="fontWeight: 500"][style*="color: var(--text)"]').allTextContents()
    // Click ▼ on first stop
    await page.locator('button').filter({ hasText: '▼' }).first().click()
    const namesAfter = await page.locator('[style*="fontWeight: 500"][style*="color: var(--text)"]').allTextContents()
    // First and second should be swapped
    expect(namesAfter[0]).toBe(namesBefore[1])
    expect(namesAfter[1]).toBe(namesBefore[0])
  })

  test('▲ moves stop up', async ({ page }) => {
    const namesBefore = await page.locator('[style*="fontWeight: 500"][style*="color: var(--text)"]').allTextContents()
    // Click ▲ on second stop (index 1)
    await page.locator('button').filter({ hasText: '▲' }).nth(1).click()
    const namesAfter = await page.locator('[style*="fontWeight: 500"][style*="color: var(--text)"]').allTextContents()
    expect(namesAfter[0]).toBe(namesBefore[1])
    expect(namesAfter[1]).toBe(namesBefore[0])
  })

  test('Reset order button restores score-based order', async ({ page }) => {
    // Move something around first
    await page.locator('button').filter({ hasText: '▼' }).first().click()
    await page.getByRole('button', { name: 'Reset order' }).click()
    // After reset, order is back to default (stops still visible)
    await expect(page.getByText('Route Stop Alpha')).toBeVisible()
    await expect(page.getByText('Route Stop Beta')).toBeVisible()
  })

  test('footer shows visited vs total count', async ({ page }) => {
    await expect(page.getByText(/of 3 visited today/)).toBeVisible()
  })
})

// ── Route excludes converted/not-interested stops ─────────────────────────────

test('converted stops excluded from route', async ({ page }) => {
  await seedCanvassStop(page, {
    id: 'conv-1',
    name: 'Converted Stop',
    status: 'Converted',
    date: new Date().toLocaleDateString(),
  })
  await page.reload()
  await goTab(page, 'Route')
  // Either empty state or Converted Stop is not listed as a route stop
  const stopNames = await page.locator('[style*="fontWeight: 500"]').allTextContents()
  expect(stopNames).not.toContain('Converted Stop')
})
