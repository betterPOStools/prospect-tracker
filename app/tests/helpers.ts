import { type Page } from '@playwright/test'

// ── Storage keys ──────────────────────────────────────────────────────────────

export const LS_KEYS = [
  'vs_p3','vs_c1','vs_db','vs_dbc',
  'vs_db_areas','vs_db_block','vs_db_snapshots',
  'vs_drive_fid','vs_endday','vs_theme',
]

export async function clearStorage(page: Page) {
  // Block Supabase so cloud sync doesn't restore real data during tests
  await page.route('**supabase.co**', route => route.abort())
  await page.evaluate((keys) => keys.forEach(k => localStorage.removeItem(k)), LS_KEYS)
}

// ── Navigation ────────────────────────────────────────────────────────────────

export async function goTab(page: Page, label: string) {
  await page.getByRole('tab', { name: label }).click()
}

// Canvass subtab buttons contain badge counts like "Follow Up (3)", so use partial match.
// Use button tag to avoid matching the container div which also has "subtab" in its class.
export async function goCanvassSubtab(page: Page, label: string) {
  await page.locator('button[class*="subtab"]').filter({ hasText: label }).click()
}

// ── Canvass helpers ───────────────────────────────────────────────────────────

export async function addStop(page: Page, name: string, opts: {
  status?: string, addr?: string, phone?: string, notes?: string
} = {}) {
  await goTab(page, 'Canvass')
  await goCanvassSubtab(page, '+ Add Stop')
  await page.getByPlaceholder('Business name *').fill(name)
  if (opts.addr)   await page.getByPlaceholder('Full address (paste from Google Maps)').fill(opts.addr)
  if (opts.phone)  await page.getByPlaceholder('Phone number').fill(opts.phone)
  if (opts.notes)  await page.getByPlaceholder('Notes / first impression').fill(opts.notes)
  if (opts.status) await page.locator('select').first().selectOption(opts.status)
  await page.getByTestId('submit-stop').click()
  // After adding, app redirects to Queue subtab — wait for card to appear.
  await page.locator('[class*="card"]').filter({ hasText: name }).first().waitFor({ state: 'visible' })
}

// Seed a canvass stop directly in localStorage (no UI interaction)
export async function seedCanvassStop(page: Page, overrides: Record<string, unknown> = {}) {
  const stop = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: 'Seeded Stop',
    status: 'Come back later',
    addr: '100 Main St, Myrtle Beach SC 29577',
    phone: '843-555-1234',
    notes: 'Test note',
    date: new Date(Date.now() - 86400000).toLocaleDateString(),
    added: new Date(Date.now() - 86400000).toISOString(),
    ...overrides,
  }
  await page.evaluate((s) => {
    const list = JSON.parse(localStorage.getItem('vs_c1') || '[]')
    list.push(s)
    localStorage.setItem('vs_c1', JSON.stringify(list))
  }, stop)
  return stop
}

// ── Leads helpers ─────────────────────────────────────────────────────────────

export async function seedLead(page: Page, overrides: Record<string, unknown> = {}) {
  const lead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: 'Seeded Lead',
    addr: '200 Ocean Blvd, Myrtle Beach SC',
    phone: '843-555-9999',
    email: 'lead@test.com',
    current: 'Toast',
    owner: 'John Doe',
    website: 'https://example.com',
    notes: 'Seeded test lead',
    status: 'Open',
    added: new Date().toLocaleDateString(),
    ...overrides,
  }
  await page.evaluate((p) => {
    const list = JSON.parse(localStorage.getItem('vs_p3') || '[]')
    list.push(p)
    localStorage.setItem('vs_p3', JSON.stringify(list))
  }, lead)
  return lead
}

// ── Database helpers ──────────────────────────────────────────────────────────

export function makeDbRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: `db_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    n: 'Test Restaurant',
    a: '123 Test St, Myrtle Beach SC 29577',
    ci: 'Myrtle Beach',
    zi: '29577',
    ph: '843-555-0001',
    web: 'https://testrestaurant.com',
    em: 'info@testrestaurant.com',
    ty: 'restaurant',
    rt: 4.2,
    rv: 85,
    sc: 90,
    pr: 'Hot',
    st: 'unworked',
    zo: 'Zone-1',
    ar: 'Myrtle Beach',
    da: '',
    cn: 'Jane Manager',
    ct: 'Manager',
    nt: '',
    ...overrides,
  }
}

export async function seedDatabase(page: Page, records: Record<string, unknown>[], clusters?: Record<string, unknown>[]) {
  const ids = records.map((r) => r.id)
  const defaultClusters = clusters || [{ id: 'zone-1', nm: 'Zone 1', cnt: records.length, mb: ids }]
  await page.evaluate(({ records, clusters }) => {
    localStorage.setItem('vs_db',       JSON.stringify(records))
    localStorage.setItem('vs_dbc',      JSON.stringify(clusters))
    localStorage.setItem('vs_db_areas', JSON.stringify([]))
    localStorage.setItem('vs_db_block', JSON.stringify([]))
  }, { records, clusters: defaultClusters })
}
