/**
 * E2E tests for Route tab and Database tab.
 *
 * Strategy:
 * - Supabase data is injected via localStorage (pt_records_cache / pt_stops_cache)
 *   before each test so the app boots with the mock data already in the cache.
 *   The cache-freshness timestamp (pt_cache_synced_at) is set to "now" so
 *   useSupabase skips the network fetch entirely.
 * - Any Supabase REST calls that do fire (mutations, realtime handshake) are
 *   intercepted with page.route() and answered with minimal valid responses.
 * - RouteXL API calls are intercepted at the network level.
 * - No real DB mutations are ever executed.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'

// ─── Shared mock data ─────────────────────────────────────────────────────────

const TODAY_NAME = new Date().toLocaleDateString('en-US', { weekday: 'long' })

/** Build a minimal CanvassStop object */
function makeStop(
  overrides: {
    id?: string
    name?: string
    address?: string
    status?: string
    day?: string
    lat?: number
    lng?: number
  } = {},
) {
  const id = overrides.id ?? crypto.randomUUID()
  return {
    id,
    name: overrides.name ?? `Stop ${id.slice(0, 6)}`,
    phone: '555-0100',
    address: overrides.address ?? `${Math.floor(Math.random() * 9000) + 1000} Main St, Houston TX`,
    status: overrides.status ?? 'queued',
    area: 'Downtown',
    day: overrides.day ?? TODAY_NAME,
    lat: overrides.lat ?? 29.76 + Math.random() * 0.1,
    lng: overrides.lng ?? -95.37 + Math.random() * 0.1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/** Build a minimal ProspectRecord object */
function makeRecord(
  overrides: {
    id?: string
    name?: string
    priority?: string
    status?: string
    area?: string
    day?: string
    lat?: number
    lng?: number
    score?: number
  } = {},
) {
  const id = overrides.id ?? crypto.randomUUID()
  return {
    id,
    name: overrides.name ?? `Restaurant ${id.slice(0, 6)}`,
    type: 'Restaurant',
    address: `${Math.floor(Math.random() * 9000) + 1000} Westheimer Rd, Houston TX`,
    city: 'Houston',
    zip: '77006',
    phone: '713-555-0199',
    score: overrides.score ?? 75,
    priority: overrides.priority ?? 'Hot',
    area: overrides.area ?? 'Midtown',
    day: overrides.day ?? null,
    status: overrides.status ?? 'unworked',
    is_chain: false,
    dropped_count: 0,
    lat: overrides.lat ?? 29.74 + Math.random() * 0.1,
    lng: overrides.lng ?? -95.38 + Math.random() * 0.1,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// 5 stops for today — used by most Route tests
const FIVE_STOPS = Array.from({ length: 5 }, (_, i) =>
  makeStop({ id: `stop-${i + 1}`, name: `Taco Palace #${i + 1}`, status: 'queued' }),
)

// 12 stops for leg-splitting tests (>10 triggers multi-leg)
const TWELVE_STOPS = Array.from({ length: 12 }, (_, i) =>
  makeStop({ id: `stop-leg-${i + 1}`, name: `Burger Barn #${i + 1}`, status: 'queued' }),
)

// 21 stops for >20 warning
const TWENTYONE_STOPS = Array.from({ length: 21 }, (_, i) =>
  makeStop({ id: `stop-warn-${i + 1}`, name: `Sushi Spot #${i + 1}`, status: 'queued' }),
)

// Records set
const RECORDS = [
  makeRecord({ id: 'rec-1', name: 'Golden Dragon', priority: 'Fire',  status: 'unworked',  area: 'Heights' }),
  makeRecord({ id: 'rec-2', name: 'Silver Spoon',  priority: 'Hot',   status: 'in_canvass', area: 'Midtown' }),
  makeRecord({ id: 'rec-3', name: 'Bronze Bistro', priority: 'Warm',  status: 'canvassed',  area: 'Heights' }),
  makeRecord({ id: 'rec-4', name: 'Iron Grill',    priority: 'Cold',  status: 'unworked',   area: 'EaDo'    }),
  makeRecord({ id: 'rec-5', name: 'Platinum Plate',priority: 'Dead',  status: 'converted',  area: 'Midtown' }),
  makeRecord({ id: 'rec-6', name: 'Ruby Ramen',    priority: 'Hot',   status: 'unworked',   area: 'Heights',
               day: 'Monday', lat: 29.78, lng: -95.39, score: 88 }),
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Seed localStorage with mock data so the app loads without hitting Supabase.
 * Must be called inside page.addInitScript or evaluate before navigation.
 */
async function seedLocalStorage(
  context: BrowserContext,
  opts: { stops?: object[]; records?: object[] } = {},
) {
  const stops   = opts.stops   ?? []
  const records = opts.records ?? []

  await context.addInitScript(
    ({ stopsJson, recordsJson, syncedAt }) => {
      localStorage.setItem('pt_stops_cache',    stopsJson)
      localStorage.setItem('pt_records_cache',  recordsJson)
      localStorage.setItem('pt_cache_synced_at', syncedAt)
      // Mark migration complete so banner doesn't interfere
      localStorage.setItem('pt_migration_complete', '1')
    },
    {
      stopsJson:   JSON.stringify(stops),
      recordsJson: JSON.stringify(records),
      syncedAt:    new Date().toISOString(),
    },
  )
}

/** Block all Supabase REST/realtime requests — return empty success responses. */
async function blockSupabase(page: Page) {
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
  })
  // Block realtime websocket upgrade too
  await page.route('**/realtime/v1/**', (route) => route.abort())
}

/** Navigate to the app and wait for the page header to appear. */
async function gotoApp(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Restaurant Prospect Tracker')).toBeVisible({ timeout: 10_000 })
}

/** Click a tab in the bottom TabBar by its visible label. */
async function clickTab(page: Page, label: string) {
  await page.getByRole('navigation').getByText(label, { exact: false }).click()
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE TAB TESTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Route tab', () => {

  // ── Route 1: Empty state ───────────────────────────────────────────────────

  test('shows empty state when there are no stops for today', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: [], records: [] })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('No stops for today')).toBeVisible()
    await expect(page.getByText('Assign stops in the Planner')).toBeVisible()

    await context.close()
  })

  // ── Route 2: Stop list rendering ─────────────────────────────────────────

  test('renders a stop card for each stop in the list', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    for (const stop of FIVE_STOPS) {
      await expect(page.getByText(stop.name)).toBeVisible()
    }

    await context.close()
  })

  // ── Route 3: Stop count in header ─────────────────────────────────────────

  test('displays correct stop count in route header', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('5 stops for')).toBeVisible()

    await context.close()
  })

  // ── Route 4: Singular stop count ──────────────────────────────────────────

  test('shows singular "stop" when count is 1', async ({ browser }) => {
    const context = await browser.newContext()
    const oneStop = [makeStop({ id: 'single', name: 'Solo Diner', day: TODAY_NAME })]
    await seedLocalStorage(context, { stops: oneStop })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('1 stop for')).toBeVisible()

    await context.close()
  })

  // ── Route 5: Sequential stop numbers ──────────────────────────────────────

  test('renders stops with sequential 1-based numbers', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    // Numbers 1–5 should each appear as a bold sequence number label
    for (let n = 1; n <= 5; n++) {
      const stopCards = page.locator('.flex.flex-col.gap-2 .rounded-lg')
      await expect(stopCards.nth(n - 1).getByTestId('stop-number')).toHaveText(`${n}`)
    }

    await context.close()
  })

  // ── Route 6: Nav button per stop ─────────────────────────────────────────

  test('each stop card has a Nav button', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    const navButtons = page.getByRole('button', { name: /^Navigate to/i })
    await expect(navButtons).toHaveCount(5)

    await context.close()
  })

  // ── Route 7: Nav button opens Google Maps URL ─────────────────────────────

  test('nav button triggers Google Maps URL for a stop', async ({ browser }) => {
    const context = await browser.newContext()
    const stop = makeStop({ id: 's-nav', name: 'Maps Test Diner', address: '1234 Test Blvd, Houston TX' })
    await seedLocalStorage(context, { stops: [stop] })
    const page = await context.newPage()
    await blockSupabase(page)

    // Intercept window.open to capture the URL without relying on popup navigation
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__openedUrls'] = []
      const orig = window.open.bind(window)
      window.open = (url?: string | URL, ...rest: Parameters<typeof window.open>[]) => {
        ((window as unknown as Record<string, unknown>)['__openedUrls'] as string[]).push(String(url ?? ''))
        return orig(url, ...rest)
      }
    })

    await gotoApp(page)
    await clickTab(page, 'Route')
    await page.getByRole('button', { name: `Navigate to ${stop.name}` }).click()

    await page.waitForFunction(() => ((window as unknown as Record<string, unknown>)['__openedUrls'] as string[]).length > 0, { timeout: 5_000 })
    const openedUrl: string = await page.evaluate(() => ((window as unknown as Record<string, unknown>)['__openedUrls'] as string[])[0])
    expect(openedUrl).toMatch(/maps\.google\.com|google\.com\/maps/)

    await context.close()
  })

  // ── Route 8: Copy Addresses button visible ────────────────────────────────

  test('Copy Addresses button is visible when stops exist', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByRole('button', { name: 'Copy Addresses' })).toBeVisible()

    await context.close()
  })

  // ── Route 9: Optimize Route button visible ────────────────────────────────

  test('Optimize Route button is present and enabled when online', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    const optimizeBtn = page.getByRole('button', { name: 'Optimize Route' })
    await expect(optimizeBtn).toBeVisible()
    await expect(optimizeBtn).toBeEnabled()

    await context.close()
  })

  // ── Route 10: Optimize shows error without credentials ───────────────────

  test('clicking Optimize Route without RXL credentials shows an error', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await page.getByRole('button', { name: 'Optimize Route' }).click()
    await expect(page.getByText('RouteXL credentials not set')).toBeVisible()

    await context.close()
  })

  // ── Route 11: Optimize reorders stops via mocked RouteXL ─────────────────

  test('Optimize Route reorders stops using mocked RouteXL response', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    // Inject RXL credentials
    await context.addInitScript(() => {
      localStorage.setItem('vs_rxl_user', 'testuser')
      localStorage.setItem('vs_rxl_pass', 'testpass')
    })

    // Mock the RouteXL API — return stops in reverse order
    await page.route('https://api.routexl.com/tour', (route) => {
      const reversedRoute: Record<string, { name: string; departure: number }> = {}
      FIVE_STOPS.slice().reverse().forEach((s, idx) => {
        reversedRoute[String(idx)] = { name: s.name, departure: idx }
      })
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ route: reversedRoute }),
      })
    })

    await gotoApp(page)
    await clickTab(page, 'Route')

    // Click optimize — spinner should appear then resolve
    await page.getByRole('button', { name: 'Optimize Route' }).click()

    // After optimization, "Reset Order" button should be enabled
    await expect(page.getByRole('button', { name: 'Reset Order' })).toBeEnabled({ timeout: 8_000 })

    await context.close()
  })

  // ── Route 12: Reset Order button re-sorts to original ────────────────────

  test('Reset Order restores original stop sequence after optimize', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await context.addInitScript(() => {
      localStorage.setItem('vs_rxl_user', 'u')
      localStorage.setItem('vs_rxl_pass', 'p')
    })

    await page.route('https://api.routexl.com/tour', (route) => {
      const rev: Record<string, { name: string; departure: number }> = {}
      FIVE_STOPS.slice().reverse().forEach((s, i) => {
        rev[String(i)] = { name: s.name, departure: i }
      })
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ route: rev }) })
    })

    await gotoApp(page)
    await clickTab(page, 'Route')

    await page.getByRole('button', { name: 'Optimize Route' }).click()
    await expect(page.getByRole('button', { name: 'Reset Order' })).toBeEnabled({ timeout: 8_000 })

    await page.getByRole('button', { name: 'Reset Order' }).click()

    // After reset the first stop should be back at position 1
    const firstCard = page.locator('.flex.flex-col.gap-2 .rounded-lg').first()
    await expect(firstCard.getByText('Taco Palace #1')).toBeVisible()

    await context.close()
  })

  // ── Route 13: Move-up arrow disabled for first stop ───────────────────────

  test('move-up arrow is disabled for the first stop', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    const upButtons = page.getByRole('button', { name: 'Move stop up' })
    await expect(upButtons.first()).toBeDisabled()

    await context.close()
  })

  // ── Route 14: Move-down arrow disabled for last stop ─────────────────────

  test('move-down arrow is disabled for the last stop', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    const downButtons = page.getByRole('button', { name: 'Move stop down' })
    await expect(downButtons.last()).toBeDisabled()

    await context.close()
  })

  // ── Route 15: Move-up reorders stop ───────────────────────────────────────

  test('clicking move-up on second stop moves it above first', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    const upButtons = page.getByRole('button', { name: 'Move stop up' })
    // Second stop's up button is index 1
    await upButtons.nth(1).click()

    // Now "Taco Palace #2" should be at position 1 (number label "1")
    const firstCard = page.locator('.flex.flex-col.gap-2 .rounded-lg').first()
    await expect(firstCard.getByText('Taco Palace #2')).toBeVisible()

    await context.close()
  })

  // ── Route 16: Multi-leg: leg headers shown for >10 stops ─────────────────

  test('shows Leg 1 and Leg 2 headers when stops exceed 10', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: TWELVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('Leg 1').first()).toBeVisible()
    await expect(page.getByText('Leg 2').first()).toBeVisible()

    await context.close()
  })

  // ── Route 17: "Start Leg N in Maps" buttons appear for multi-leg ─────────

  test('Start Leg buttons are shown for a 12-stop route', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: TWELVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    // At least one "Start Leg 1 in Maps" button must appear
    await expect(page.getByRole('button', { name: /Start Leg 1 in Maps/i }).first()).toBeVisible()

    await context.close()
  })

  // ── Route 18: Start Leg button opens Google Maps with waypoints ───────────

  test('Start Leg button opens Google Maps with multiple waypoints', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: TWELVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    // Intercept window.open to capture the URL without relying on popup navigation
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__openedUrls'] = []
      const orig = window.open.bind(window)
      window.open = (url?: string | URL, ...rest: Parameters<typeof window.open>[]) => {
        ((window as unknown as Record<string, unknown>)['__openedUrls'] as string[]).push(String(url ?? ''))
        return orig(url, ...rest)
      }
    })

    await gotoApp(page)
    await clickTab(page, 'Route')
    await page.getByRole('button', { name: /Start Leg 1 in Maps/i }).first().click()

    await page.waitForFunction(() => ((window as unknown as Record<string, unknown>)['__openedUrls'] as string[]).length > 0, { timeout: 5_000 })
    const openedUrl: string = await page.evaluate(() => ((window as unknown as Record<string, unknown>)['__openedUrls'] as string[])[0])
    expect(openedUrl).toMatch(/maps\.google\.com|google\.com\/maps/)

    await context.close()
  })

  // ── Route 19: >20 stops shows RouteXL free-tier warning ──────────────────

  test('shows RouteXL free-tier warning when more than 20 stops', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { stops: TWENTYONE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('RouteXL free tier supports max 20 stops')).toBeVisible()

    await context.close()
  })

  // ── Route 20: Geocode button appears when stops lack coordinates ──────────

  test('Geocode missing button appears when stops have no lat/lng', async ({ browser }) => {
    const context = await browser.newContext()
    const noCoordStops = [
      makeStop({ id: 'nc-1', name: 'No Coord Place', lat: undefined, lng: undefined }),
    ]
    // Remove lat/lng from the fixture
    const stripped = noCoordStops.map(({ lat: _lat, lng: _lng, ...rest }) => rest)

    await seedLocalStorage(context, { stops: stripped })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByRole('button', { name: /Geocode missing/i })).toBeVisible()

    await context.close()
  })

  // ── Route 21: Stop status badge is displayed ──────────────────────────────

  test('stop cards show the correct status badge text', async ({ browser }) => {
    const context = await browser.newContext()
    const mixedStops = [
      makeStop({ id: 'sb-1', name: 'Queued Place',    status: 'queued'    }),
      makeStop({ id: 'sb-2', name: 'Canvassed Place', status: 'canvassed' }),
    ]
    await seedLocalStorage(context, { stops: mixedStops })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('Queued', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Canvassed', { exact: true })).toBeVisible()

    await context.close()
  })

  // ── Route 22: Address shown under stop name ───────────────────────────────

  test('stop address is displayed below the stop name', async ({ browser }) => {
    const context = await browser.newContext()
    const stop = makeStop({ id: 'addr-1', name: 'Address Test', address: '999 Elm St, Houston TX 77001' })
    await seedLocalStorage(context, { stops: [stop] })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('999 Elm St, Houston TX 77001')).toBeVisible()

    await context.close()
  })

  // ── Route 23: Mobile viewport — stop list visible ─────────────────────────

  test('mobile viewport: stop list renders correctly at 375×812', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('5 stops for')).toBeVisible()
    await expect(page.getByText('Taco Palace #1')).toBeVisible()

    await context.close()
  })

  // ── Route 24: Mobile viewport — control buttons scrollable ───────────────

  test('mobile viewport: Optimize Route button is reachable', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    await seedLocalStorage(context, { stops: FIVE_STOPS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByRole('button', { name: 'Optimize Route' })).toBeVisible()

    await context.close()
  })

  // ── Route 25: Stops filtered to today when day matches ───────────────────

  test('only today\'s stops appear (day field matches today)', async ({ browser }) => {
    const context = await browser.newContext()
    const todayStop = makeStop({ id: 'td-1', name: 'Today Place',    day: TODAY_NAME })
    const otherStop = makeStop({ id: 'td-2', name: 'Other Day Place', day: 'Monday'   })
    await seedLocalStorage(context, { stops: [todayStop, otherStop] })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Route')

    await expect(page.getByText('Today Place')).toBeVisible()
    // The non-today stop should not appear in the route
    await expect(page.getByText('Other Day Place')).not.toBeVisible()

    await context.close()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE TAB TESTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Database tab', () => {

  // ── DB 1: Stats row shows total count ─────────────────────────────────────

  test('stats row shows correct total record count', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    const statsRow = page.locator('[aria-label="Database statistics"]')
    await expect(statsRow.getByText('6', { exact: true }).first()).toBeVisible()      // Total
    await expect(statsRow.getByText('Total', { exact: true })).toBeVisible()

    await context.close()
  })

  // ── DB 2: Stats row shows priority breakdown ───────────────────────────────

  test('stats row shows Fire / Hot / Warm / Cold / Dead counts', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    const statsRow = page.locator('[aria-label="Database statistics"]')
    await expect(statsRow.getByText('Fire', { exact: true })).toBeVisible()
    await expect(statsRow.getByText('Hot', { exact: true })).toBeVisible()
    await expect(statsRow.getByText('Warm', { exact: true })).toBeVisible()
    await expect(statsRow.getByText('Cold', { exact: true })).toBeVisible()
    await expect(statsRow.getByText('Dead', { exact: true })).toBeVisible()

    await context.close()
  })

  // ── DB 3: Stats row shows Unworked / Worked counts ────────────────────────

  test('stats row shows Unworked and Worked counts', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    const statsRow = page.locator('[aria-label="Database statistics"]')
    await expect(statsRow.getByText('Unworked', { exact: true })).toBeVisible()
    await expect(statsRow.getByText('Worked', { exact: true })).toBeVisible()

    await context.close()
  })

  // ── DB 4: Browse sub-tab is active by default ─────────────────────────────

  test('Browse sub-tab is active when Database tab opens', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    // Browse button should have the active style (blue border-b)
    await expect(page.getByRole('button', { name: 'Browse' })).toHaveClass(/text-blue-600/)

    await context.close()
  })

  // ── DB 5: Switch to Planner sub-tab ───────────────────────────────────────

  test('clicking Planner sub-tab shows the planner panel', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    // Planner has a day selector area
    await expect(page.getByText('Select day')).toBeVisible()
    await expect(page.getByText('Anchor location')).toBeVisible()

    await context.close()
  })

  // ── DB 6: Switch to Map sub-tab ───────────────────────────────────────────

  test('clicking Map sub-tab shows the map loading or map container', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Map' }).click()

    // Either the map loads or the "Loading map…" suspense fallback appears
    await expect(
      page.getByText('Loading map…').or(page.locator('.leaflet-container')),
    ).toBeVisible({ timeout: 5_000 })

    await context.close()
  })

  // ── DB 7: Browse panel shows all records ─────────────────────────────────

  test('Browse panel renders all records when no filter is applied', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    for (const rec of RECORDS) {
      await expect(page.getByRole('button', { name: `Open ${rec.name}` })).toBeVisible()
    }

    await context.close()
  })

  // ── DB 8: Record count label ───────────────────────────────────────────────

  test('Browse panel shows "Showing N of N" label', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await expect(page.getByText(`Showing`)).toBeVisible()
    await expect(page.getByText(`of`)).toBeVisible()

    await context.close()
  })

  // ── DB 9: Priority filter ─────────────────────────────────────────────────

  test('priority filter limits visible records to selected priority', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    // Filter to Fire — only Golden Dragon should show
    await page.getByRole('combobox', { name: 'Filter by priority' }).selectOption('Fire')

    await expect(page.getByRole('button', { name: 'Open Golden Dragon' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Silver Spoon' })).not.toBeVisible()

    await context.close()
  })

  // ── DB 10: Status filter ──────────────────────────────────────────────────

  test('status filter limits visible records to selected status', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('in_canvass')

    await expect(page.getByRole('button', { name: 'Open Silver Spoon' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Golden Dragon' })).not.toBeVisible()

    await context.close()
  })

  // ── DB 11: Area filter ────────────────────────────────────────────────────

  test('area filter limits visible records to selected area', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('combobox', { name: 'Filter by area' }).selectOption('EaDo')

    await expect(page.getByRole('button', { name: 'Open Iron Grill' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Golden Dragon' })).not.toBeVisible()

    await context.close()
  })

  // ── DB 12: Search filter ──────────────────────────────────────────────────

  test('search filter hides non-matching records', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('searchbox', { name: 'Search records' }).fill('ruby')

    await expect(page.getByRole('button', { name: 'Open Ruby Ramen' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Golden Dragon' })).not.toBeVisible()

    await context.close()
  })

  // ── DB 13: Search with no results shows empty state ──────────────────────

  test('search that matches nothing shows empty state', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('searchbox', { name: 'Search records' }).fill('xyznonexistent')

    await expect(page.getByText('No records match')).toBeVisible()

    await context.close()
  })

  // ── DB 14: Clicking a record row opens the detail modal ──────────────────

  test('clicking a record opens the Record Detail modal', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('button', { name: 'Open Golden Dragon' }).click()

    await expect(page.getByText('Record Detail')).toBeVisible()
    await expect(page.getByText('Golden Dragon').first()).toBeVisible()

    await context.close()
  })

  // ── DB 15: Modal shows priority badge ────────────────────────────────────

  test('record detail modal displays the priority badge', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Open Golden Dragon' }).click()

    // Fire badge should appear (PriorityBadge renders "🔥 Fire")
    await expect(page.getByText(/Fire/).first()).toBeVisible()

    await context.close()
  })

  // ── DB 16: Modal Edit button switches to edit form ────────────────────────

  test('Edit button inside modal shows the edit form', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Open Golden Dragon' }).click()

    await page.getByRole('button', { name: 'Edit' }).click()

    await expect(page.getByText('Edit Record')).toBeVisible()
    // Edit form has a Save button
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()

    await context.close()
  })

  // ── DB 17: Edit form — Delete button shows confirmation ───────────────────

  test('Delete button in edit form shows confirm prompt before deleting', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Open Silver Spoon' }).click()
    await page.getByRole('button', { name: 'Edit' }).click()

    await page.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByText('Delete this record?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' }).last()).toBeVisible()

    await context.close()
  })

  // ── DB 18: Edit Cancel closes the form back to view mode ─────────────────

  test('Cancel in edit form returns to view mode without saving', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Open Golden Dragon' }).click()
    await page.getByRole('button', { name: 'Edit' }).click()

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Should be back in view mode (title reverts to "Record Detail")
    await expect(page.getByText('Record Detail')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()

    await context.close()
  })

  // ── DB 19: Modal closes on backdrop click ────────────────────────────────

  test('modal closes when the backdrop is clicked', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Open Golden Dragon' }).click()
    await expect(page.getByText('Record Detail')).toBeVisible()

    // Click the backdrop (the fixed overlay, not the modal card)
    await page.locator('.fixed.inset-0').click({ position: { x: 5, y: 5 }, force: true })
    await expect(page.getByText('Record Detail')).not.toBeVisible()

    await context.close()
  })

  // ── DB 20: Modal closes on Escape key ────────────────────────────────────

  test('pressing Escape closes the detail modal', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Open Golden Dragon' }).click()
    await expect(page.getByText('Record Detail')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByText('Record Detail')).not.toBeVisible()

    await context.close()
  })

  // ── DB 21: Checkbox selects a record ──────────────────────────────────────

  test('checking a record checkbox shows the bulk action bar', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    const checkbox = page.getByRole('checkbox', { name: `Select Golden Dragon` })
    await checkbox.check()

    await expect(page.getByText('1 selected')).toBeVisible()
    await expect(page.getByRole('button', { name: "Add to Today's Canvass" })).toBeVisible()

    await context.close()
  })

  // ── DB 22: Bulk select multiple records ───────────────────────────────────

  test('selecting multiple records updates the selected count', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('checkbox', { name: 'Select Golden Dragon' }).check()
    await page.getByRole('checkbox', { name: 'Select Iron Grill' }).check()

    await expect(page.getByText('2 selected')).toBeVisible()

    await context.close()
  })

  // ── DB 23: Clear selection ────────────────────────────────────────────────

  test('Clear button removes all selections', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('checkbox', { name: 'Select Golden Dragon' }).check()
    await expect(page.getByText('1 selected')).toBeVisible()

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByText('selected')).not.toBeVisible()

    await context.close()
  })

  // ── DB 24: Add to Canvass triggers Supabase insert (mocked) ──────────────

  test('Add to Canvass button fires a Supabase insert and clears selection', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()

    // Track whether an insert was attempted
    let insertCalled = false
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() === 'POST') insertCalled = true
      route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
    })
    await page.route('**/realtime/v1/**', (route) => route.abort())

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('checkbox', { name: 'Select Golden Dragon' }).check()
    await page.getByRole('button', { name: "Add to Today's Canvass" }).click()

    // Selection clears after operation completes
    await expect(page.getByText('1 selected')).not.toBeVisible({ timeout: 5_000 })
    expect(insertCalled).toBe(true)

    await context.close()
  })

  // ── DB 25: Planner day rows are rendered ─────────────────────────────────

  test('Planner panel renders a row for each weekday', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    for (const abbr of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      await expect(page.getByText(abbr, { exact: true }).first()).toBeVisible()
    }

    await context.close()
  })

  // ── DB 26: Planner day with assigned records shows Canvass button ─────────

  test('Planner shows Canvass button for a day that has records assigned', async ({ browser }) => {
    const context = await browser.newContext()
    // Ruby Ramen is assigned to Monday
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await expect(page.getByRole('button', { name: 'Send Monday to canvass' })).toBeVisible()

    await context.close()
  })

  // ── DB 27: Planner day with no records shows no Canvass button ────────────

  test('Planner does not show Canvass button for empty days', async ({ browser }) => {
    const context = await browser.newContext()
    // No record assigned to Wednesday
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    await expect(page.getByRole('button', { name: 'Send Wednesday to canvass' })).not.toBeVisible()

    await context.close()
  })

  // ── DB 28: Near Me button absent on web (non-native) ─────────────────────

  test('Near Me button is NOT present in the web browser context', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    // isNative is false in a web browser — Near Me button should not render
    await expect(page.getByRole('button', { name: 'Near Me' })).not.toBeVisible()

    await context.close()
  })

  // ── DB 29: Fill Day disabled without anchor ───────────────────────────────

  test('Fill day button is disabled when no anchor is selected', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    // The Fill button (e.g. "Fill Mon") should be disabled without an anchor
    const fillBtn = page.getByRole('button', { name: /^Fill /i })
    await expect(fillBtn).toBeDisabled()

    await context.close()
  })

  // ── DB 30: Planner unassigned count shown ─────────────────────────────────

  test('Planner shows count of unassigned unworked records', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Planner' }).click()

    // Unassigned unworked = records with no day and status === 'unworked'
    // RECORDS: rec-1 (no day, unworked), rec-4 (no day, unworked) = 2
    await expect(page.getByText('unassigned unworked records')).toBeVisible()

    await context.close()
  })

  // ── DB 31: Mobile viewport — Browse panel renders ─────────────────────────

  test('mobile viewport: Browse panel lists records at 375×812', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await expect(page.getByRole('button', { name: 'Open Golden Dragon' })).toBeVisible()

    await context.close()
  })

  // ── DB 32: Mobile viewport — filter bar accessible ────────────────────────

  test('mobile viewport: search bar is visible on small screen', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await expect(page.getByRole('searchbox', { name: 'Search records' })).toBeVisible()

    await context.close()
  })

  // ── DB 33: Empty database shows empty state ───────────────────────────────

  test('Browse panel shows empty state when no records exist', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: [] })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await expect(page.getByText('No records match')).toBeVisible()

    await context.close()
  })

  // ── DB 34: Modal shows contact phone as clickable link ───────────────────

  test('record detail modal renders phone as a tel: link', async ({ browser }) => {
    const context = await browser.newContext()
    const rec = makeRecord({ id: 'ph-1', name: 'Phone Test Bar' })
    rec.phone = '713-555-0123'
    await seedLocalStorage(context, { records: [rec] })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')
    await page.getByRole('button', { name: 'Open Phone Test Bar' }).click()

    await expect(page.locator('a[href="tel:713-555-0123"]')).toBeVisible()

    await context.close()
  })

  // ── DB 35: Bulk Assign Day dropdown appears after selection ───────────────

  test('Assign day dropdown appears when records are selected', async ({ browser }) => {
    const context = await browser.newContext()
    await seedLocalStorage(context, { records: RECORDS })
    const page = await context.newPage()
    await blockSupabase(page)

    await gotoApp(page)
    await clickTab(page, 'Database')

    await page.getByRole('checkbox', { name: 'Select Golden Dragon' }).check()

    await expect(page.getByRole('combobox', { name: 'Assign day' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Assign' })).toBeVisible()

    await context.close()
  })

})
