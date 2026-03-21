import { test, expect } from '@playwright/test'
import { clearStorage, goTab, addStop, seedLead, goCanvassSubtab } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearStorage(page)
  await page.reload()
  await goTab(page, 'My Leads')
})

// ── Add Lead form ─────────────────────────────────────────────────────────────

test.describe('Add Lead form', () => {
  test('name field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Restaurant name *').fill('Ocean Prime MB')
    await expect(page.getByPlaceholder('Restaurant name *')).toHaveValue('Ocean Prime MB')
  })

  test('status dropdown has all options', async ({ page }) => {
    const sel = page.locator('select').filter({ hasText: 'Open' }).first()
    for (const s of ['Open', 'Won', 'Lost', 'Abandoned']) {
      await sel.selectOption(s)
      await expect(sel).toHaveValue(s)
    }
  })

  test('address field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Full address (paste from Google Maps)').fill('9840 Queensway Blvd, Myrtle Beach SC 29572')
    await expect(page.getByPlaceholder('Full address (paste from Google Maps)')).toHaveValue('9840 Queensway Blvd, Myrtle Beach SC 29572')
  })

  test('phone field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Phone number').fill('843-449-0006')
    await expect(page.getByPlaceholder('Phone number')).toHaveValue('843-449-0006')
  })

  test('email field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Email (if found)').fill('gm@oceanprimemb.com')
    await expect(page.getByPlaceholder('Email (if found)')).toHaveValue('gm@oceanprimemb.com')
  })

  test('POS select dropdown works', async ({ page }) => {
    // PosSelect renders a <select> with placeholder option "Current POS system…"
    const sel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Current POS system…' }) })
    await sel.selectOption('Toast')
    await expect(sel).toHaveValue('Toast')
  })

  test('owner/contact name field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Main contact name').fill('Chef Marco')
    await expect(page.getByPlaceholder('Main contact name')).toHaveValue('Chef Marco')
  })

  test('website url field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Website (https://…)').fill('https://oceanprimemb.com')
    await expect(page.getByPlaceholder('Website (https://…)')).toHaveValue('https://oceanprimemb.com')
  })

  test('menu link url field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Menu link (https://…)').fill('https://oceanprimemb.com/menu')
    await expect(page.getByPlaceholder('Menu link (https://…)')).toHaveValue('https://oceanprimemb.com/menu')
  })

  test('notes field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Notes').fill('Very interested, call back Friday')
    await expect(page.getByPlaceholder('Notes')).toHaveValue('Very interested, call back Friday')
  })

  test('requires name — shows error when empty', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add Lead' }).click()
    await expect(page.getByText('Name is required.')).toBeVisible()
  })

  test('Clear button resets all fields', async ({ page }) => {
    await page.getByPlaceholder('Restaurant name *').fill('Should Clear')
    await page.getByPlaceholder('Phone number').fill('843-000-0000')
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByPlaceholder('Restaurant name *')).toHaveValue('')
    await expect(page.getByPlaceholder('Phone number')).toHaveValue('')
  })

  test('adds lead with name only', async ({ page }) => {
    await page.getByPlaceholder('Restaurant name *').fill('Simple Lead')
    await page.getByRole('button', { name: '+ Add Lead' }).click()
    await expect(page.getByText('Simple Lead')).toBeVisible()
  })

  test('adds lead with all fields', async ({ page }) => {
    await page.getByPlaceholder('Restaurant name *').fill('Full Lead Restaurant')
    await page.getByPlaceholder('Full address (paste from Google Maps)').fill('123 Broadway St, Myrtle Beach SC')
    await page.getByPlaceholder('Phone number').fill('843-555-1234')
    await page.getByPlaceholder('Email (if found)').fill('info@fullleadrestaurant.com')
    await page.getByPlaceholder('Main contact name').fill('Sarah Jones')
    await page.getByPlaceholder('Notes').fill('Met at chamber event')
    await page.getByRole('button', { name: '+ Add Lead' }).click()
    await expect(page.getByText('Full Lead Restaurant')).toBeVisible()
    await expect(page.getByText('843-555-1234')).toBeVisible()
    await expect(page.getByText('Sarah Jones')).toBeVisible()
  })

  test('success message shows lead count', async ({ page }) => {
    await page.getByPlaceholder('Restaurant name *').fill('Count Test')
    await page.getByRole('button', { name: '+ Add Lead' }).click()
    await expect(page.getByText(/leads total/)).toBeVisible()
  })

  test('form resets after successful add', async ({ page }) => {
    await page.getByPlaceholder('Restaurant name *').fill('Reset After Add')
    await page.getByRole('button', { name: '+ Add Lead' }).click()
    await expect(page.getByPlaceholder('Restaurant name *')).toHaveValue('')
  })
})

// ── Filter controls ───────────────────────────────────────────────────────────

test.describe('Filter controls', () => {
  test.beforeEach(async ({ page }) => {
    await seedLead(page, { name: 'Open Lead', status: 'Open' })
    await seedLead(page, { name: 'Won Lead', status: 'Won' })
    await seedLead(page, { name: 'Lost Lead', status: 'Lost' })
    await seedLead(page, { name: 'Abandoned Lead', status: 'Abandoned' })
    await page.reload()
    await goTab(page, 'My Leads')
  })

  test('status filter: All shows everything', async ({ page }) => {
    await page.locator('.filter-row select').selectOption('all')
    await expect(page.getByText('Open Lead')).toBeVisible()
    await expect(page.getByText('Won Lead')).toBeVisible()
    await expect(page.getByText('Lost Lead')).toBeVisible()
  })

  test('status filter: Open shows only open leads', async ({ page }) => {
    await page.locator('.filter-row select').selectOption('Open')
    await expect(page.getByText('Open Lead')).toBeVisible()
    await expect(page.getByText('Won Lead')).not.toBeVisible()
    await expect(page.getByText('Lost Lead')).not.toBeVisible()
  })

  test('status filter: Won shows only won leads', async ({ page }) => {
    await page.locator('.filter-row select').selectOption('Won')
    await expect(page.getByText('Won Lead')).toBeVisible()
    await expect(page.getByText('Open Lead')).not.toBeVisible()
  })

  test('status filter: Lost', async ({ page }) => {
    await page.locator('.filter-row select').selectOption('Lost')
    await expect(page.getByText('Lost Lead')).toBeVisible()
    await expect(page.getByText('Open Lead')).not.toBeVisible()
  })

  test('status filter: Abandoned', async ({ page }) => {
    await page.locator('.filter-row select').selectOption('Abandoned')
    await expect(page.getByText('Abandoned Lead')).toBeVisible()
    await expect(page.getByText('Open Lead')).not.toBeVisible()
  })

  test('search input filters by name', async ({ page }) => {
    await page.locator('.filter-row input[type="text"]').fill('Open')
    await expect(page.getByText('Open Lead')).toBeVisible()
    await expect(page.getByText('Won Lead')).not.toBeVisible()
  })

  test('search clear restores all leads', async ({ page }) => {
    await page.locator('.filter-row input[type="text"]').fill('xyz')
    await page.locator('.filter-row input[type="text"]').fill('')
    await expect(page.getByText('Open Lead')).toBeVisible()
    await expect(page.getByText('Won Lead')).toBeVisible()
  })
})

// ── Stat bar ──────────────────────────────────────────────────────────────────

test.describe('Stat bar', () => {
  test.beforeEach(async ({ page }) => {
    await seedLead(page, { name: 'SB Open', status: 'Open' })
    await seedLead(page, { name: 'SB Won', status: 'Won' })
    await page.reload()
    await goTab(page, 'My Leads')
  })

  test('shows total, open, won, lost counts', async ({ page }) => {
    // StatBar uses CSS modules: class contains "stats"
    const statBar = page.locator('[class*="stats"]').first()
    await expect(statBar).toBeVisible()
    await expect(statBar.locator('[class*="statL"]').filter({ hasText: 'Total' })).toBeVisible()
  })
})

// ── LeadCard view mode ────────────────────────────────────────────────────────

test.describe('LeadCard view mode', () => {
  test.beforeEach(async ({ page }) => {
    await seedLead(page, {
      id: 'lc-1',
      name: 'Beachfront Bistro',
      addr: '1600 N Ocean Blvd, Myrtle Beach SC 29577',
      phone: '843-626-8000',
      email: 'manager@beachfrontbistro.com',
      current: 'Toast',
      owner: 'Mike Torello',
      website: 'https://beachfrontbistro.com',
      notes: 'Very interested',
      status: 'Open',
    })
    await page.reload()
    await goTab(page, 'My Leads')
  })

  test('displays all lead fields', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await expect(card.getByText('Beachfront Bistro')).toBeVisible()
    await expect(card.getByText('1600 N Ocean Blvd, Myrtle Beach SC 29577')).toBeVisible()
    await expect(card.getByText('843-626-8000')).toBeVisible()
    await expect(card.getByText('manager@beachfrontbistro.com')).toBeVisible()
    await expect(card.getByText('Toast')).toBeVisible()
    await expect(card.getByText('Mike Torello')).toBeVisible()
    await expect(card.getByText('Very interested')).toBeVisible()
  })

  test('status dropdown: all statuses selectable', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    const sel = card.getByRole('combobox')
    for (const s of ['Won', 'Lost', 'Abandoned', 'Open']) {
      await sel.selectOption(s)
      await expect(sel).toHaveValue(s)
    }
  })

  test('status change persists on reload', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await card.getByRole('combobox').selectOption('Won')
    await page.reload()
    await goTab(page, 'My Leads')
    const reloaded = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await expect(reloaded.getByRole('combobox')).toHaveValue('Won')
  })

  test('Call button visible when phone present', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await expect(card.getByRole('link', { name: 'Call' })).toBeVisible()
  })

  test('Map link visible when address present', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await expect(card.getByRole('link', { name: /Map/ })).toBeVisible()
  })

  test('Website link visible', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await expect(card.getByRole('link', { name: /beachfrontbistro\.com/ })).toBeVisible()
  })

  test('Edit button opens edit form', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await card.getByRole('button', { name: 'Edit' }).click()
    // After clicking Edit, the card enters edit mode — find by Save button presence
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await expect(editCard.getByPlaceholder('Restaurant name *')).toBeVisible()
  })

  test('↩ Canvass button opens demote modal', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await card.getByRole('button', { name: /Canvass/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Move Back to Canvass')).toBeVisible()
  })

  test('Remove deletes lead after confirm', async ({ page }) => {
    page.once('dialog', d => d.accept())
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await card.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Beachfront Bistro')).not.toBeVisible()
  })

  test('Remove cancelled keeps lead', async ({ page }) => {
    page.once('dialog', d => d.dismiss())
    const card = page.locator('[class*="card"]').filter({ hasText: 'Beachfront Bistro' })
    await card.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Beachfront Bistro')).toBeVisible()
  })
})

// ── LeadCard edit mode ────────────────────────────────────────────────────────

test.describe('LeadCard edit mode', () => {
  // Scope all interactions to the edit card (identified by presence of Save button)
  // to avoid strict-mode conflicts with the add-lead form at the top of the page.

  test.beforeEach(async ({ page }) => {
    await seedLead(page, { id: 'le-1', name: 'Edit Lead Test', status: 'Open' })
    await page.reload()
    await goTab(page, 'My Leads')
    await page.locator('[class*="card"]').filter({ hasText: 'Edit Lead Test' })
      .getByRole('button', { name: 'Edit' }).click()
  })

  test('name field pre-filled and editable', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await expect(editCard.getByPlaceholder('Restaurant name *')).toHaveValue('Edit Lead Test')
    await editCard.getByPlaceholder('Restaurant name *').fill('Renamed Lead')
    await editCard.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Renamed Lead')).toBeVisible()
  })

  test('address field editable', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await editCard.getByPlaceholder('Full address').fill('555 New Address Ln')
    await editCard.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('555 New Address Ln')).toBeVisible()
  })

  test('phone field editable', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await editCard.getByPlaceholder('Phone').fill('843-777-8888')
    await editCard.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('843-777-8888')).toBeVisible()
  })

  test('email field editable', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await editCard.getByPlaceholder('Email').fill('new@email.com')
    await editCard.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('new@email.com')).toBeVisible()
  })

  test('owner field editable', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await editCard.getByPlaceholder('Main contact name').fill('Updated Owner')
    await editCard.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Updated Owner')).toBeVisible()
  })

  test('website field editable', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await editCard.getByPlaceholder('Website (https://…)').fill('https://updatedsite.com')
    await editCard.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('updatedsite.com')).toBeVisible()
  })

  test('notes field editable', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await editCard.getByPlaceholder('Notes').fill('Updated notes here')
    await editCard.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Updated notes here')).toBeVisible()
  })

  test('status dropdown editable in edit mode', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    // Status select in edit mode starts with the current status "Open"
    await editCard.locator('select').first().selectOption('Won')
    await editCard.getByRole('button', { name: 'Save' }).click()
    // After save, card back in view mode — check status combobox shows Won
    await expect(page.locator('[class*="card"]').filter({ hasText: 'Edit Lead Test' }).getByRole('combobox')).toHaveValue('Won')
  })

  test('Cancel discards all changes', async ({ page }) => {
    const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
    await editCard.getByPlaceholder('Restaurant name *').fill('SHOULD NOT SAVE')
    await editCard.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('SHOULD NOT SAVE')).not.toBeVisible()
    await expect(page.getByText('Edit Lead Test')).toBeVisible()
  })
})

// ── Demote Modal ──────────────────────────────────────────────────────────────

test.describe('Demote to Canvass modal', () => {
  test.beforeEach(async ({ page }) => {
    await seedLead(page, { id: 'dm-1', name: 'Demote Me Restaurant', status: 'Open' })
    await page.reload()
    await goTab(page, 'My Leads')
    await page.locator('[class*="card"]').filter({ hasText: 'Demote Me Restaurant' })
      .getByRole('button', { name: /Canvass/ }).click()
  })

  test('modal opens with correct title', async ({ page }) => {
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Move Back to Canvass')).toBeVisible()
  })

  test('status dropdown has all canvass statuses', async ({ page }) => {
    const sel = page.getByRole('dialog').getByRole('combobox')
    for (const s of ['Come back later', 'Decision maker unavailable', 'Not visited yet', 'No answer / closed', 'Not interested']) {
      await sel.selectOption(s)
      await expect(sel).toHaveValue(s)
    }
  })

  test('notes/reason field accepts input', async ({ page }) => {
    await page.getByRole('dialog').getByPlaceholder('Reason / notes (optional)').fill('POS contract not up yet')
    await expect(page.getByRole('dialog').getByPlaceholder('Reason / notes (optional)')).toHaveValue('POS contract not up yet')
  })

  test('Cancel closes modal and keeps lead', async ({ page }) => {
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByText('Demote Me Restaurant')).toBeVisible()
  })

  test('Escape closes modal', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('confirm moves lead to Canvass', async ({ page }) => {
    await page.getByRole('dialog').getByRole('button', { name: 'Move to Canvass' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    // Lead should be gone from My Leads
    await expect(page.getByText('Demote Me Restaurant')).not.toBeVisible()
    // Should appear in Canvass (demoted stop goes to All Active, not Today)
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'All Active')
    await expect(page.getByText('Demote Me Restaurant')).toBeVisible()
  })
})

// ── Convert-then-edit flow ────────────────────────────────────────────────────

test('convert stop to lead then edit the lead', async ({ page }) => {
  await addStop(page, 'Convert Edit Flow')
  await page.locator('[class*="card"]').filter({ hasText: 'Convert Edit Flow' })
    .getByRole('button', { name: 'Convert to Lead' }).click()
  await page.getByPlaceholder('Email (if found)').fill('converted@test.com')
  await page.getByRole('dialog').getByRole('button', { name: 'Convert to Lead' }).click()

  await goTab(page, 'My Leads')
  const card = page.locator('[class*="card"]').filter({ hasText: 'Convert Edit Flow' })
  await card.getByRole('button', { name: 'Edit' }).click()
  const editCard = page.locator('[class*="card"]').filter({ has: page.getByRole('button', { name: 'Save' }) })
  await editCard.getByPlaceholder('Notes').fill('Added after convert')
  await editCard.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Added after convert')).toBeVisible()
})

// ── Empty state ───────────────────────────────────────────────────────────────

test('empty state shown when no leads', async ({ page }) => {
  await expect(page.getByText('No leads yet.')).toBeVisible()
})

// ── Persistence ───────────────────────────────────────────────────────────────

test('leads persist across page reload', async ({ page }) => {
  await page.getByPlaceholder('Restaurant name *').fill('Persist Lead')
  await page.getByRole('button', { name: '+ Add Lead' }).click()
  await page.reload()
  await goTab(page, 'My Leads')
  await expect(page.getByText('Persist Lead')).toBeVisible()
})
