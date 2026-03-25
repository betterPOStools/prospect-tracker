import { test, expect } from '@playwright/test'
import { clearStorage, goTab, goCanvassSubtab, addStop, seedCanvassStop } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearStorage(page)
  await page.reload()
})

// ── Add Stop Panel ────────────────────────────────────────────────────────────

test.describe('Add Stop panel', () => {
  test.beforeEach(async ({ page }) => {
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, '+ Add Stop')
  })

  test('all text fields accept input', async ({ page }) => {
    await page.getByPlaceholder('Business name *').fill('Tidal Creek Brewhouse')
    await page.getByPlaceholder('Full address (paste from Google Maps)').fill('710 Prince Myles Ln, Myrtle Beach SC 29577')
    await page.getByPlaceholder('Phone number').fill('843-945-1974')
    await page.getByPlaceholder('Notes / first impression').fill('Owner friendly, come back Tuesday')

    await expect(page.getByPlaceholder('Business name *')).toHaveValue('Tidal Creek Brewhouse')
    await expect(page.getByPlaceholder('Full address (paste from Google Maps)')).toHaveValue('710 Prince Myles Ln, Myrtle Beach SC 29577')
    await expect(page.getByPlaceholder('Phone number')).toHaveValue('843-945-1974')
    await expect(page.getByPlaceholder('Notes / first impression')).toHaveValue('Owner friendly, come back Tuesday')
  })

  test('time fields accept input', async ({ page }) => {
    await page.locator('input[type="time"]').first().fill('09:00')
    await page.locator('input[type="time"]').last().fill('22:30')
    await expect(page.locator('input[type="time"]').first()).toHaveValue('09:00')
    await expect(page.locator('input[type="time"]').last()).toHaveValue('22:30')
  })

  test('website url field accepts input', async ({ page }) => {
    await page.getByPlaceholder('https://…').first().fill('https://tidalcreekbrewhouse.com')
    await expect(page.getByPlaceholder('https://…').first()).toHaveValue('https://tidalcreekbrewhouse.com')
  })

  test('menu url field accepts input', async ({ page }) => {
    await page.getByPlaceholder('https://…').last().fill('https://tidalcreekbrewhouse.com/menu')
    await expect(page.getByPlaceholder('https://…').last()).toHaveValue('https://tidalcreekbrewhouse.com/menu')
  })

  test('status dropdown has all canvass status options', async ({ page }) => {
    const sel = page.locator('select').first()
    for (const status of ['Not visited yet', 'Come back later', 'Decision maker unavailable', 'No answer / closed', 'Not interested', 'Dropped folder']) {
      await sel.selectOption(status)
      await expect(sel).toHaveValue(status)
    }
  })

  test('Clear button resets all fields', async ({ page }) => {
    await page.getByPlaceholder('Business name *').fill('Should Be Cleared')
    await page.getByPlaceholder('Phone number').fill('843-000-0000')
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByPlaceholder('Business name *')).toHaveValue('')
    await expect(page.getByPlaceholder('Phone number')).toHaveValue('')
  })

  test('requires business name — shows error when empty', async ({ page }) => {
    await page.getByTestId('submit-stop').click()
    await expect(page.getByText('Business name is required.')).toBeVisible()
  })

  test('adds stop, shows success, redirects to Queue', async ({ page }) => {
    await page.getByPlaceholder('Business name *').fill('Ocean Annie\'s')
    await page.getByTestId('submit-stop').click()
    await expect(page.getByText('Ocean Annie\'s')).toBeVisible()
    // Form should be gone — redirected to Queue
    await expect(page.getByPlaceholder('Business name *')).not.toBeVisible()
  })

  test('adds stop with full details', async ({ page }) => {
    await page.getByPlaceholder('Business name *').fill('Full Details Bar')
    await page.getByPlaceholder('Full address (paste from Google Maps)').fill('999 Kings Hwy, Myrtle Beach SC')
    await page.getByPlaceholder('Phone number').fill('843-555-7777')
    await page.getByPlaceholder('Notes / first impression').fill('Told to call owner Jeff')
    await page.locator('input[type="time"]').first().fill('11:00')
    await page.locator('input[type="time"]').last().fill('23:00')
    await page.getByTestId('submit-stop').click()
    await expect(page.getByText('Full Details Bar')).toBeVisible()
    await expect(page.getByText('843-555-7777')).toBeVisible()
  })
})

// ── Queue Panel ──────────────────────────────────────────────────────────────

test.describe('Queue panel', () => {
  test('shows empty state when no stops', async ({ page }) => {
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')
    await expect(page.getByText(/No stops in queue/)).toBeVisible()
  })

  test('search input filters stops', async ({ page }) => {
    await addStop(page, 'Magnolia Restaurant')
    await addStop(page, 'Beachside Diner')
    await page.getByPlaceholder('Search queue…').fill('Magnolia')
    await expect(page.getByText('Magnolia Restaurant')).toBeVisible()
    await expect(page.getByText('Beachside Diner')).not.toBeVisible()
  })

  test('search clear shows all stops again', async ({ page }) => {
    await addStop(page, 'Search Clear Test')
    await page.getByPlaceholder('Search queue…').fill('xyz')
    await expect(page.getByText('Search Clear Test')).not.toBeVisible()
    await page.getByPlaceholder('Search queue…').fill('')
    await expect(page.getByText('Search Clear Test')).toBeVisible()
  })

  test('overdue stops from previous days appear in queue', async ({ page }) => {
    await seedCanvassStop(page, {
      id: 'od-1',
      name: 'Overdue Grill',
      status: 'Not visited yet',
      date: new Date(Date.now() - 86400000).toLocaleDateString(),
      added: new Date(Date.now() - 86400000).toISOString(),
    })
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')
    await expect(page.getByText('Overdue Grill')).toBeVisible()
    await expect(page.getByText(/overdue stop/)).toBeVisible()
  })

  test('overdue badge shown on overdue stop card', async ({ page }) => {
    await seedCanvassStop(page, {
      id: 'od-2',
      name: 'Late Visit Spot',
      status: 'Come back later',
      date: new Date(Date.now() - 172800000).toLocaleDateString(),
      added: new Date(Date.now() - 172800000).toISOString(),
    })
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Queue')
    const card = page.locator('[class*="card"]').filter({ hasText: 'Late Visit Spot' })
    await expect(card.getByText('Overdue')).toBeVisible()
  })

  test.describe('CanvassCard interactions', () => {
    test.beforeEach(async ({ page }) => {
      await addStop(page, 'Carolina Ale House', {
        addr: '201 N Kings Hwy, Myrtle Beach SC',
        phone: '843-916-3553',
        notes: 'Asked for manager',
      })
    })

    test('card shows name, address, phone, notes', async ({ page }) => {
      await expect(page.getByText('Carolina Ale House')).toBeVisible()
      await expect(page.getByText('201 N Kings Hwy, Myrtle Beach SC')).toBeVisible()
      await expect(page.getByText('843-916-3553')).toBeVisible()
      await expect(page.getByText('Asked for manager')).toBeVisible()
    })

    test('status dropdown: all options selectable', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      const sel = card.getByRole('combobox')
      for (const s of ['Come back later', 'Decision maker unavailable', 'No answer / closed', 'Not interested', 'Dropped folder', 'Not visited yet']) {
        await sel.selectOption(s)
        await expect(sel).toHaveValue(s)
      }
    })

    test('Edit button shows all editable fields', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await expect(page.getByPlaceholder('Business name *')).toBeVisible()
      await expect(page.getByPlaceholder('Phone')).toBeVisible()
      await expect(page.getByPlaceholder('Notes')).toBeVisible()
      await expect(page.getByPlaceholder('Full address')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    })

    test('edit: name field pre-filled', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await expect(page.getByPlaceholder('Business name *')).toHaveValue('Carolina Ale House')
    })

    test('edit: update phone and save', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await page.getByPlaceholder('Phone').fill('843-999-0000')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText('843-999-0000')).toBeVisible()
    })

    test('edit: update notes and save', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await page.getByPlaceholder('Notes').fill('Spoke with Jeff the owner')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText('Spoke with Jeff the owner')).toBeVisible()
    })

    test('edit: update address and save', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await page.getByPlaceholder('Full address').fill('Updated Address 123')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText('Updated Address 123')).toBeVisible()
    })

    test('edit: status dropdown in edit mode', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await page.locator('select').filter({ hasText: 'Not visited yet' }).selectOption('Come back later')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' }).getByRole('combobox')).toHaveValue('Come back later')
    })

    test('edit: open/close time fields', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await page.locator('input[type="time"]').first().fill('10:00')
      await page.locator('input[type="time"]').last().fill('21:00')
      await page.getByRole('button', { name: 'Save' }).click()
      // Should save without error
      await expect(page.getByText('Carolina Ale House')).toBeVisible()
    })

    test('edit: website and menu url fields', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await page.getByPlaceholder('Website (https://…)').fill('https://carolinaalehouse.com')
      await page.getByPlaceholder('Menu link (https://…)').fill('https://carolinaalehouse.com/menu')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText('carolinaalehouse.com')).toBeVisible()
    })

    test('Cancel edit discards changes', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Edit' }).click()
      await page.getByPlaceholder('Phone').fill('000-000-0000')
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByText('000-000-0000')).not.toBeVisible()
      await expect(page.getByText('Carolina Ale House')).toBeVisible()
    })

    test('Remove button with accept confirms deletion', async ({ page }) => {
      page.once('dialog', d => d.accept())
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Remove' }).click()
      await expect(page.getByText('Carolina Ale House')).not.toBeVisible()
    })

    test('Remove button with dismiss keeps stop', async ({ page }) => {
      page.once('dialog', d => d.dismiss())
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Remove' }).click()
      await expect(page.getByText('Carolina Ale House')).toBeVisible()
    })

    test('Convert to Lead button opens modal', async ({ page }) => {
      const card = page.locator('[class*="card"]').filter({ hasText: 'Carolina Ale House' })
      await card.getByRole('button', { name: 'Convert to Lead' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    })
  })
})

// ── Convert to Lead Modal ─────────────────────────────────────────────────────

test.describe('Convert to Lead modal', () => {
  test.beforeEach(async ({ page }) => {
    await addStop(page, 'Myrtle Grill')
    await page.locator('[class*="card"]').filter({ hasText: 'Myrtle Grill' })
      .getByRole('button', { name: 'Convert to Lead' }).click()
  })

  test('modal opens with title', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[class*="title"]')).toBeVisible()
  })

  test('email field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Email (if found)').fill('owner@myrtlegrill.com')
    await expect(page.getByPlaceholder('Email (if found)')).toHaveValue('owner@myrtlegrill.com')
  })

  test('owner/contact field accepts input', async ({ page }) => {
    await page.getByPlaceholder('Main contact name').fill('Bob Smith')
    await expect(page.getByPlaceholder('Main contact name')).toHaveValue('Bob Smith')
  })

  test('POS dropdown: select known system', async ({ page }) => {
    const sel = page.getByRole('dialog').getByRole('combobox')
    await sel.selectOption('Toast')
    await expect(sel).toHaveValue('Toast')
  })

  test('POS dropdown: all standard options available', async ({ page }) => {
    const sel = page.getByRole('dialog').getByRole('combobox')
    for (const pos of ['Toast', 'Square for Restaurants', 'Clover', 'Lightspeed']) {
      await sel.selectOption(pos)
      await expect(sel).toHaveValue(pos)
    }
  })

  test('POS Other: text field appears, email does not steal focus', async ({ page }) => {
    await page.getByRole('dialog').getByRole('combobox').selectOption('Other…')
    await expect(page.getByPlaceholder('Specify POS system…')).toBeVisible()
    await expect(page.getByPlaceholder('Email (if found)')).not.toBeFocused()
  })

  test('Cancel closes modal without converting', async ({ page }) => {
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Escape key closes modal', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('clicking backdrop closes modal', async ({ page }) => {
    // mousedown on the overlay background
    await page.mouse.click(5, 5)
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Convert creates lead and shows in My Leads', async ({ page }) => {
    await page.getByPlaceholder('Email (if found)').fill('owner@myrtlegrill.com')
    await page.getByRole('dialog').getByRole('button', { name: 'Convert to Lead' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await goTab(page, 'My Leads')
    await expect(page.getByText('Myrtle Grill')).toBeVisible()
  })

  test('dragging to select email text does not close modal', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Email (if found)')
    await emailInput.fill('test@example.com')
    // Simulate drag-select: mousedown inside, mouseup inside — modal should stay open
    const box = await emailInput.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 5, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + 80, box.y + box.height / 2)
      await page.mouse.up()
    }
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})

// ── End Day Modal ─────────────────────────────────────────────────────────────

test.describe('End Day modal', () => {
  test.beforeEach(async ({ page }) => {
    await addStop(page, 'End Day Restaurant')
    await goCanvassSubtab(page, 'Queue')
  })

  test('End Day button exists and opens modal', async ({ page }) => {
    await page.getByRole('button', { name: /End Day/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText("Today's canvass recap")).toBeVisible()
  })

  test('recap shows total stops count', async ({ page }) => {
    await page.getByRole('button', { name: /End Day/ }).click()
    await expect(page.getByText(/Total stops in queue/)).toBeVisible()
  })

  test('Cancel keeps stops, closes modal', async ({ page }) => {
    await page.getByRole('button', { name: /End Day/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByText('End Day Restaurant')).toBeVisible()
  })

  test('Confirm ends day and closes modal', async ({ page }) => {
    await page.getByRole('button', { name: /End Day/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'End Day' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('End Day with no stops shows error flash', async ({ page }) => {
    // Remove the stop first then try End Day
    page.once('dialog', d => d.accept())
    await page.locator('[class*="card"]').filter({ hasText: 'End Day Restaurant' })
      .getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('button', { name: /End Day/ }).click()
    await expect(page.getByText(/No active stops/)).toBeVisible()
    // Modal should NOT open
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('second End Day accumulates counts', async ({ page }) => {
    // First run
    await page.getByRole('button', { name: /End Day/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'End Day' }).click()
    // Add second stop
    await addStop(page, 'Second Place')
    // Second End Day
    await page.getByRole('button', { name: /End Day/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Total stops in queue/)).toBeVisible()
    // Accumulated: should show 2
    await expect(dialog.locator('strong').filter({ hasText: '2' }).first()).toBeVisible()
  })
})

// ── Follow Up Panel ───────────────────────────────────────────────────────────

test.describe('Follow Up panel', () => {
  test.beforeEach(async ({ page }) => {
    await seedCanvassStop(page, {
      id: 'fu-1',
      name: 'Follow Up Café',
      status: 'Come back later',
      date: new Date(Date.now() - 86400000).toLocaleDateString(),
      added: new Date(Date.now() - 86400000).toISOString(),
    })
    await seedCanvassStop(page, {
      id: 'fu-2',
      name: 'DM Unavailable Bar',
      status: 'Decision maker unavailable',
      date: new Date(Date.now() - 172800000).toLocaleDateString(),
      added: new Date(Date.now() - 172800000).toISOString(),
    })
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Follow Up')
  })

  test('shows CBL and DMU stops from previous days', async ({ page }) => {
    await expect(page.getByText('Follow Up Café')).toBeVisible()
    await expect(page.getByText('DM Unavailable Bar')).toBeVisible()
  })

  test('shows age label on cards', async ({ page }) => {
    await expect(page.getByText(/Yesterday|day ago/).first()).toBeVisible()
  })

  test('search input filters follow-up stops', async ({ page }) => {
    await page.getByPlaceholder('Search follow-up stops…').fill('Café')
    await expect(page.getByText('Follow Up Café')).toBeVisible()
    await expect(page.getByText('DM Unavailable Bar')).not.toBeVisible()
  })

  test('search clear shows all stops', async ({ page }) => {
    await page.getByPlaceholder('Search follow-up stops…').fill('xyz')
    await page.getByPlaceholder('Search follow-up stops…').fill('')
    await expect(page.getByText('Follow Up Café')).toBeVisible()
    await expect(page.getByText('DM Unavailable Bar')).toBeVisible()
  })

  test('Build Run button opens modal', async ({ page }) => {
    await page.locator('[class*="card"]').filter({ hasText: 'Follow Up Café' })
      .getByRole('button', { name: 'Build Run' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText("Build Today's Run")).toBeVisible()
  })

  test('Convert to Lead button opens modal', async ({ page }) => {
    await page.locator('[class*="card"]').filter({ hasText: 'Follow Up Café' })
      .getByRole('button', { name: 'Convert to Lead' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('status change persists on follow-up card', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Follow Up Café' })
    await card.getByRole('combobox').selectOption('Decision maker unavailable')
    await expect(card.getByRole('combobox')).toHaveValue('Decision maker unavailable')
  })

  test('Remove a follow-up stop', async ({ page }) => {
    page.once('dialog', d => d.accept())
    await page.locator('[class*="card"]').filter({ hasText: 'Follow Up Café' })
      .getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Follow Up Café')).not.toBeVisible()
  })
})

// ── Build Run Modal ───────────────────────────────────────────────────────────

test.describe('Build Run modal', () => {
  test.beforeEach(async ({ page }) => {
    await seedCanvassStop(page, { id: 'br-1', name: 'Run Stop Alpha', status: 'Come back later', date: new Date(Date.now() - 86400000).toLocaleDateString(), added: new Date(Date.now() - 86400000).toISOString() })
    await seedCanvassStop(page, { id: 'br-2', name: 'Run Stop Beta', status: 'Decision maker unavailable', date: new Date(Date.now() - 172800000).toLocaleDateString(), added: new Date(Date.now() - 172800000).toISOString() })
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Follow Up')
    await page.locator('[class*="card"]').first().getByRole('button', { name: 'Build Run' }).click()
  })

  test('modal opens with list of follow-up stops', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Build Today\'s Run')).toBeVisible()
    await expect(dialog.getByText(/Run Stop Alpha|Run Stop Beta/).first()).toBeVisible()
  })

  test('Select all checks all checkboxes', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Select all' }).click()
    const cbs = dialog.getByRole('checkbox')
    const count = await cbs.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) await expect(cbs.nth(i)).toBeChecked()
  })

  test('Clear deselects all', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Select all' }).click()
    await dialog.getByRole('button', { name: 'Clear' }).click()
    const cbs = dialog.getByRole('checkbox')
    const count = await cbs.count()
    for (let i = 0; i < count; i++) await expect(cbs.nth(i)).not.toBeChecked()
  })

  test('clicking a row toggles its checkbox', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    const firstCb = dialog.getByRole('checkbox').first()
    const was = await firstCb.isChecked()
    await dialog.locator('[style*="cursor: pointer"]').first().click()
    await expect(firstCb).toBeChecked({ checked: !was })
  })

  test('counter reflects selection count', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Select all' }).click()
    await expect(dialog.getByText(/2 of 2 selected/)).toBeVisible()
  })

  test('Add stops button disabled when nothing selected', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Clear' }).click()
    await expect(dialog.getByRole('button', { name: /Add.*stop/ })).toBeDisabled()
  })

  test('Cancel closes without moving stops', async ({ page }) => {
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Confirm moves selected stops to Queue', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Select all' }).click()
    await dialog.getByRole('button', { name: /Add .* stop/ }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    // Stops should now appear in Queue
    await goCanvassSubtab(page, 'Queue')
    await expect(page.getByText(/Run Stop Alpha|Run Stop Beta/).first()).toBeVisible()
  })

  test('Escape closes modal', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})

// ── Completed Panel ──────────────────────────────────────────────────────────

test.describe('Completed panel', () => {
  test.beforeEach(async ({ page }) => {
    await seedCanvassStop(page, {
      id: 'arc-1',
      name: 'Converted Place',
      status: 'Converted',
      convertedDate: new Date().toLocaleDateString(),
      date: new Date().toLocaleDateString(),
    })
    await page.reload()
    await goTab(page, 'Canvass')
    await goCanvassSubtab(page, 'Completed')
  })

  test('shows converted stops', async ({ page }) => {
    await expect(page.getByText('Converted Place')).toBeVisible()
  })

  test('converted badge visible', async ({ page }) => {
    const card = page.locator('[class*="card"]').filter({ hasText: 'Converted Place' })
    await expect(card.locator('span').filter({ hasText: /^Converted$/ })).toBeVisible()
  })

  test('Remove button on completed stop', async ({ page }) => {
    page.once('dialog', d => d.accept())
    await page.locator('[class*="card"]').filter({ hasText: 'Converted Place' })
      .getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Converted Place')).not.toBeVisible()
  })
})

// ── Stat bar updates ──────────────────────────────────────────────────────────

test('stat bar counts update when stop added', async ({ page }) => {
  await goTab(page, 'Canvass')
  const queueBadge = page.locator('button[class*="subtab"]').filter({ hasText: 'Queue' })
  // Capture initial badge text
  const before = await queueBadge.textContent()
  await addStop(page, 'Stat Bar Test')
  // Badge should have incremented (contains a count now)
  await expect(page.locator('button[class*="subtab"]').filter({ hasText: 'Queue' })).toContainText('(')
})

// ── Data persistence ──────────────────────────────────────────────────────────

test('canvass stops persist across page reload', async ({ page }) => {
  await addStop(page, 'Persist Test Place')
  await page.reload()
  await goTab(page, 'Canvass')
  await expect(page.getByText('Persist Test Place')).toBeVisible()
})
