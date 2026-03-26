import { test, expect } from '@playwright/test'
import { clearStorage, goTab, goCanvassSubtab, makeDbRecord, seedCanvassStop } from './helpers'
import { type Page } from '@playwright/test'

// ── Coordinate clusters for deterministic tests ──────────────────────────────

// Cluster A: tight group in downtown Myrtle Beach (~0.3mi spread)
const CLUSTER_A = [
  { lt: 33.6891, lg: -78.8867 },
  { lt: 33.6895, lg: -78.8860 },
  { lt: 33.6888, lg: -78.8870 },
  { lt: 33.6893, lg: -78.8863 },
  { lt: 33.6890, lg: -78.8865 },
]

// Cluster B: tight group ~5 miles north (North Myrtle Beach)
const CLUSTER_B = [
  { lt: 33.7500, lg: -78.8800 },
  { lt: 33.7505, lg: -78.8795 },
  { lt: 33.7498, lg: -78.8803 },
]

// Isolated point ~20 miles south
const ISOLATED = { lt: 33.5200, lg: -79.0500 }

// User GPS position — right next to Cluster A
const GPS_NEAR_A = { latitude: 33.6892, longitude: -78.8866 }

function makeGeoRecords() {
  return [
    ...CLUSTER_A.map((c, i) => makeDbRecord({ id: `a-${i}`, n: `A Restaurant ${i}`, ...c, ar: 'Myrtle Beach' })),
    ...CLUSTER_B.map((c, i) => makeDbRecord({ id: `b-${i}`, n: `B Restaurant ${i}`, ...c, ar: 'North Myrtle Beach' })),
    makeDbRecord({ id: 'iso-1', n: 'Isolated Place', ...ISOLATED, ar: 'Georgetown' }),
  ]
}

async function seedDb(page: Page, records: Record<string, unknown>[], areas?: string[]) {
  const areaList = areas || [...new Set(records.map((r) => r.ar).filter(Boolean))]
  await page.evaluate(({ records, areas }) => {
    localStorage.setItem('vs_db', JSON.stringify(records))
    localStorage.setItem('vs_db_areas', JSON.stringify(areas))
    localStorage.setItem('vs_db_block', JSON.stringify([]))
  }, { records, areas: areaList })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearStorage(page)
  await page.reload()
})

// ══════════════════════════════════════════════════════════════════════════════
// autoAssignDay — tested via Week Planner UI
// ══════════════════════════════════════════════════════════════════════════════

test.describe('autoAssignDay', () => {

  test('picks densest cluster as anchor — Cluster A fills first', async ({ page }) => {
    await seedDb(page, makeGeoRecords())
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    // Set stops/day to 4, expand Monday, auto-fill
    await page.locator('input[type="number"]').fill('4')
    await page.locator('input[type="number"]').blur()
    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    await expect(page.getByText(/4 stops assigned to Monday/)).toBeVisible()
    // Cluster A records should be assigned (densest = 5 records)
    await expect(page.getByText('A Restaurant 0')).toBeVisible()
  })

  test('fills with wider radius when zone has fewer stops', async ({ page }) => {
    // 3 tight + 2 far — request 5 to force wider fill
    const records = [
      ...CLUSTER_A.slice(0, 3).map((c, i) => makeDbRecord({ id: `a-${i}`, n: `A Spot ${i}`, ...c })),
      makeDbRecord({ id: 'far-1', n: 'Far Place', lt: 33.7200, lg: -78.9000 }),
      makeDbRecord({ id: 'far-2', n: 'Farther Place', ...ISOLATED }),
    ]
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('input[type="number"]').fill('5')
    await page.locator('input[type="number"]').blur()
    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    await expect(page.getByText(/5 stops assigned to Monday/)).toBeVisible()
  })

  test('skips records without coordinates and reports count', async ({ page }) => {
    const records = [
      makeDbRecord({ id: 'good-1', n: 'Has Coords', lt: 33.69, lg: -78.89 }),
      makeDbRecord({ id: 'good-2', n: 'Has Coords 2', lt: 33.6905, lg: -78.8895 }),
      makeDbRecord({ id: 'no-lt', n: 'No Lat', lt: null, lg: -78.89 }),
      makeDbRecord({ id: 'no-lg', n: 'No Lng', lt: 33.69, lg: undefined }),
      makeDbRecord({ id: 'no-both', n: 'No Coords', lt: null, lg: null }),
    ]
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    // Should assign 2 and mention the skipped records
    await expect(page.getByText(/2 stops assigned to Monday/)).toBeVisible()
  })

  test('respects area filter', async ({ page }) => {
    await seedDb(page, makeGeoRecords())
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    // Select North Myrtle Beach area
    await page.locator('select').filter({ hasText: 'All areas' }).selectOption('North Myrtle Beach')
    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    // Only 3 records in NMB
    await expect(page.getByText(/3 stops assigned to Monday/)).toBeVisible()
    await expect(page.getByText('B Restaurant 0')).toBeVisible()
  })

  test('skips non-unworked records', async ({ page }) => {
    const records = [
      makeDbRecord({ id: 'ok-1', n: 'Good One', lt: 33.69, lg: -78.89 }),
      makeDbRecord({ id: 'ok-2', n: 'Good Two', lt: 33.6905, lg: -78.8895 }),
      makeDbRecord({ id: 'canvassed', n: 'Already Done', lt: 33.6902, lg: -78.8892, st: 'canvassed' }),
      makeDbRecord({ id: 'in-canvass', n: 'In Canvass', lt: 33.6903, lg: -78.8891, st: 'in_canvass' }),
    ]
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    await expect(page.getByText(/2 stops assigned to Monday/)).toBeVisible()
  })

  test('skips day-assigned records', async ({ page }) => {
    const records = [
      makeDbRecord({ id: 'ok', n: 'Available', lt: 33.69, lg: -78.89 }),
      makeDbRecord({ id: 'taken', n: 'Already Assigned', lt: 33.6905, lg: -78.8895, da: 'Tuesday' }),
    ]
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    await expect(page.getByText(/1 stops? assigned to Monday/)).toBeVisible()
  })

  test('skips records on cooldown', async ({ page }) => {
    const futureDate = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10)
    const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const records = [
      makeDbRecord({ id: 'ok', n: 'No Cooldown', lt: 33.69, lg: -78.89 }),
      makeDbRecord({ id: 'ok-expired', n: 'Cooldown Expired', lt: 33.6905, lg: -78.8895, co: pastDate }),
      makeDbRecord({ id: 'blocked', n: 'On Cooldown', lt: 33.6902, lg: -78.8892, co: futureDate }),
    ]
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    // 2 assigned (ok + expired), 1 skipped (future cooldown)
    await expect(page.getByText(/2 stops assigned to Monday/)).toBeVisible()
  })

  test('returns empty when no eligible records', async ({ page }) => {
    const records = [
      makeDbRecord({ id: 'x', n: 'Done', lt: 33.69, lg: -78.89, st: 'canvassed' }),
    ]
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    await expect(page.getByText(/No unworked records/)).toBeVisible()
  })

  test('single record still works', async ({ page }) => {
    const records = [makeDbRecord({ id: 'solo', n: 'Lonely Place', lt: 33.69, lg: -78.89 })]
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('span').filter({ hasText: /^Monday$/ }).click()
    await page.getByRole('button', { name: 'Auto-fill', exact: true }).first().click()

    await expect(page.getByText(/1 stops? assigned to Monday/)).toBeVisible()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// autoFillWeek — sequential day filling
// ══════════════════════════════════════════════════════════════════════════════

test.describe('autoFillWeek', () => {
  test('fills all 5 days with no duplicate assignments', async ({ page }) => {
    // 25 records spread out so each day gets 5
    const records = Array.from({ length: 25 }, (_, i) =>
      makeDbRecord({
        id: `w-${i}`,
        n: `W Restaurant ${i}`,
        lt: 33.6891 + (i % 5) * 0.001 + Math.floor(i / 5) * 0.012,
        lg: -78.8867 + (i % 5) * 0.001,
      })
    )
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('input[type="number"]').fill('5')
    await page.locator('input[type="number"]').blur()
    await page.getByRole('button', { name: 'Auto-fill Week' }).click()

    await expect(page.getByText(/stops assigned across 5 days/)).toBeVisible()
    // Verify each day has stops by expanding and checking
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      await page.locator('span').filter({ hasText: new RegExp(`^${day}$`) }).click()
      // Should show record names, not "No stops assigned"
      await expect(page.getByText('No stops assigned').first()).not.toBeVisible()
      await page.locator('span').filter({ hasText: new RegExp(`^${day}$`) }).click()
    }
  })

  test('partial fill when fewer records than slots', async ({ page }) => {
    const records = Array.from({ length: 7 }, (_, i) =>
      makeDbRecord({ id: `p-${i}`, n: `P Restaurant ${i}`, lt: 33.69 + i * 0.003, lg: -78.89 })
    )
    await seedDb(page, records)
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('input[type="number"]').fill('5')
    await page.locator('input[type="number"]').blur()
    await page.getByRole('button', { name: 'Auto-fill Week' }).click()

    // 7 records across 25 slots — should assign all 7
    await expect(page.getByText(/7 stops assigned/)).toBeVisible()
  })

  test('area filter applies across all days', async ({ page }) => {
    await seedDb(page, makeGeoRecords())
    await page.reload()
    await goTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await page.locator('select').filter({ hasText: 'All areas' }).selectOption('North Myrtle Beach')
    await page.getByRole('button', { name: 'Auto-fill Week' }).click()

    // Only 3 NMB records total
    await expect(page.getByText(/3 stops assigned/)).toBeVisible()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Fill Near Me — GPS-based queue loading (mocked geolocation)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Fill Near Me', () => {
  test.beforeEach(async ({ page }) => {
    await seedDb(page, makeGeoRecords())
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')
  })

  test('loads closest stops to GPS position', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(GPS_NEAR_A)

    await page.getByRole('button', { name: /Fill Near Me/ }).click()
    await expect(page.getByText(/Loaded \d+ stops/)).toBeVisible({ timeout: 10000 })

    // Cluster A stops should load (closest to GPS_NEAR_A)
    for (let i = 0; i < 5; i++) {
      await expect(page.getByText(`A Restaurant ${i}`)).toBeVisible()
    }
  })

  test('respects area filter', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(GPS_NEAR_A)

    // Area dropdown only shows when dbAreas > 1 — our seed has 3 areas
    await page.locator('select').last().selectOption('North Myrtle Beach')
    await page.getByRole('button', { name: /Fill Near Me/ }).click()
    await expect(page.getByText(/Loaded \d+ stops/)).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('B Restaurant 0')).toBeVisible()
    await expect(page.getByText('A Restaurant 0')).not.toBeVisible()
  })

  test('does not load day-assigned records', async ({ page, context }) => {
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('vs_db') || '[]')
      db.forEach((r: { id: string; da: string }) => {
        if (r.id === 'a-0' || r.id === 'a-1') r.da = 'Monday'
      })
      localStorage.setItem('vs_db', JSON.stringify(db))
    })
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(GPS_NEAR_A)

    await page.getByRole('button', { name: /Fill Near Me/ }).click()
    await expect(page.getByText(/Loaded \d+ stops/)).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('A Restaurant 0')).not.toBeVisible()
    await expect(page.getByText('A Restaurant 1')).not.toBeVisible()
    await expect(page.getByText('A Restaurant 2')).toBeVisible()
  })

  test('does not load records already in canvass', async ({ page, context }) => {
    await seedCanvassStop(page, { name: 'A Restaurant 0', date: new Date().toLocaleDateString() })
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(GPS_NEAR_A)

    await page.getByRole('button', { name: /Fill Near Me/ }).click()
    await expect(page.getByText(/Loaded \d+ stops/)).toBeVisible({ timeout: 10000 })

    // Only one card with this name (the existing one, not a duplicate)
    const cards = page.locator('[class*="card"]').filter({ hasText: 'A Restaurant 0' })
    await expect(cards).toHaveCount(1)
  })

  test('shows warning when records have no coordinates', async ({ page, context }) => {
    const noCoordRecords = Array.from({ length: 5 }, (_, i) =>
      makeDbRecord({ id: `nc-${i}`, n: `No Coord ${i}`, lt: null, lg: null })
    )
    await seedDb(page, noCoordRecords)
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(GPS_NEAR_A)

    await page.getByRole('button', { name: /Fill Near Me/ }).click()
    await expect(page.getByText(/missing coordinates/)).toBeVisible({ timeout: 10000 })
  })

  test('shows error when GPS permission denied', async ({ page }) => {
    await page.getByRole('button', { name: /Fill Near Me/ }).click()
    await expect(page.getByText(/permission denied|unavailable|timed out/i)).toBeVisible({ timeout: 15000 })
  })

  test('shows error when no records exist', async ({ page, context }) => {
    await page.evaluate(() => {
      localStorage.setItem('vs_db', '[]')
      localStorage.setItem('vs_db_areas', '[]')
    })
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(GPS_NEAR_A)

    await page.getByRole('button', { name: /Fill Near Me/ }).click()
    await expect(page.getByText(/No records|import data/i)).toBeVisible({ timeout: 10000 })
  })

  test('does not load records on cooldown', async ({ page, context }) => {
    const futureDate = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10)
    await page.evaluate((co) => {
      const db = JSON.parse(localStorage.getItem('vs_db') || '[]')
      db.forEach((r: { id: string; co: string }) => {
        if (r.id.startsWith('a-')) r.co = co
      })
      localStorage.setItem('vs_db', JSON.stringify(db))
    }, futureDate)
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(GPS_NEAR_A)

    await page.getByRole('button', { name: /Fill Near Me/ }).click()
    await expect(page.getByText(/Loaded \d+ stops/)).toBeVisible({ timeout: 10000 })

    // Cluster A on cooldown — should load from B instead
    await expect(page.getByText('B Restaurant 0')).toBeVisible()
    await expect(page.getByText('A Restaurant 0')).not.toBeVisible()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RouteXL GPS injection
// ══════════════════════════════════════════════════════════════════════════════

test.describe('RouteXL GPS injection', () => {
  test('injects __home__ waypoint and strips it from result', async ({ page, context }) => {
    const today = new Date().toLocaleDateString()
    for (let i = 0; i < 3; i++) {
      await seedCanvassStop(page, {
        id: `rxl-${i}`,
        name: `Route Stop ${i}`,
        addr: `${100 + i} Main St, Myrtle Beach SC`,
        date: today,
        status: 'Not visited yet',
        lat: 33.69 + i * 0.005,
        lng: -78.89,
      })
    }

    // Set RouteXL credentials
    await page.evaluate(() => {
      localStorage.setItem('vs_rxl_user', 'testuser')
      localStorage.setItem('vs_rxl_pass', 'testpass')
    })
    await page.reload()
    await goTab(page, 'Route')
    await expect(page.getByText('Route Stop 0')).toBeVisible()

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(GPS_NEAR_A)

    // Intercept RouteXL API and verify __home__ in request
    let capturedBody: string | null = null
    await page.route('**/tour/', async route => {
      capturedBody = route.request().postData()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          route: {
            '0': { name: '__home__', arrival: 0, distance: 0 },
            '1': { name: 'rxl-0', arrival: 5, distance: 2 },
            '2': { name: 'rxl-1', arrival: 10, distance: 5 },
            '3': { name: 'rxl-2', arrival: 15, distance: 8 },
          }
        }),
      })
    })

    await page.getByRole('button', { name: /Optimize/i }).click()
    await expect(page.getByText(/Route optimized/)).toBeVisible({ timeout: 15000 })

    // __home__ was sent in API request
    expect(capturedBody).toBeTruthy()
    expect(capturedBody).toContain('__home__')
    expect(capturedBody).toContain(String(GPS_NEAR_A.latitude))

    // __home__ is NOT shown in the UI
    await expect(page.getByText('__home__')).not.toBeVisible()
  })
})
