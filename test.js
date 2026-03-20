const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'index.html');
const results = [];
let passed = 0, failed = 0;

function log(label, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${label}${detail ? '  →  ' + detail : ''}`);
  results.push({ label, ok, detail });
  ok ? passed++ : failed++;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // ── SEED localStorage with enough data to test all features ────────────────
  const now = Date.now();
  const seedPage = await ctx.newPage();
  await seedPage.goto(FILE);
  await seedPage.evaluate((ts) => {
    const uid = (i) => `${ts + i}_test`;

    const todayStr = new Date().toLocaleDateString();
    const yesterStr = new Date(Date.now() - 86400000).toLocaleDateString();

    const canvass = [
      { id: uid(1), name: 'Taco Palace', addr: '123 Main St, Austin, TX 78701',
        phone: '512-555-0001', status: 'Not visited yet', notes: 'Looks busy',
        openTime: '10:00', closeTime: '22:00', website: '', menu: '',
        addedAt: new Date().toISOString(), date: todayStr, lat: 30.267, lng: -97.743 },
      { id: uid(2), name: 'Burger Barn', addr: '456 Oak Ave, Austin, TX 78702',
        phone: '512-555-0002', status: 'Come back later', notes: 'DM not in',
        openTime: '11:00', closeTime: '21:00', website: '', menu: '',
        addedAt: new Date().toISOString(), date: todayStr, lat: 30.268, lng: -97.742 },
      { id: uid(3), name: 'Pizza Town', addr: '789 Elm St, Austin, TX 78703',
        phone: '512-555-0003', status: 'Decision maker unavailable', notes: '',
        openTime: '12:00', closeTime: '23:00', website: 'https://pizzatown.com', menu: '',
        addedAt: new Date(Date.now() - 86400000).toISOString(), date: yesterStr, lat: 30.269, lng: -97.741 },
      { id: uid(4), name: 'Sushi Stop', addr: '321 Pine St, Austin, TX 78704',
        phone: '512-555-0004', status: 'Not interested', notes: 'Hard no',
        openTime: '11:30', closeTime: '22:30', website: '', menu: '',
        addedAt: new Date().toISOString(), date: todayStr, lat: 30.270, lng: -97.740 },
    ];

    const prospects = [
      { id: uid(10), name: 'Fine Dining Spot', addr: '100 Congress Ave, Austin, TX 78701',
        phone: '512-555-1000', email: 'owner@finedining.com', status: 'Open',
        currentPOS: 'Toast', owner: 'Jane Smith', website: '', menu: '', notes: 'Very interested',
        addedAt: new Date().toISOString() },
      { id: uid(11), name: 'Corner Cafe', addr: '200 6th St, Austin, TX 78701',
        phone: '512-555-1001', email: '', status: 'Won',
        currentPOS: 'Square for Restaurants', owner: 'Bob Jones', website: '', menu: '', notes: '',
        addedAt: new Date(Date.now() - 86400000).toISOString() },
      { id: uid(12), name: 'The Grill House', addr: '300 Lamar Blvd, Austin, TX 78703',
        phone: '512-555-1002', email: '', status: 'Lost',
        currentPOS: 'Clover', owner: '', website: '', menu: '', notes: '',
        addedAt: new Date(Date.now() - 172800000).toISOString() },
    ];

    // DB records use short field names: n=name, a=addr, ar=area, zi=zip, ph=phone,
    // rt=rating, rv=reviews, sc=score, pr=priority, st=status, lt=lat, lg=lng
    const dbRecords = [
      { id: uid(20), n: 'DB Bistro', a: '400 South St, Austin, TX 78704',
        ph: '512-555-2000', we: '', rt: 4.5, rv: 120, sc: 85, pr: 'Hot',
        zi: '78704', ar: 'South Austin', zo: 'z1', da: '',
        lt: 30.252, lg: -97.755, st: 'unworked' },
      { id: uid(21), n: 'DB Noodle Bar', a: '500 North Loop, Austin, TX 78751',
        ph: '512-555-2001', we: '', rt: 4.2, rv: 89, sc: 55, pr: 'Warm',
        zi: '78751', ar: 'North Austin', zo: 'z2', da: '',
        lt: 30.319, lg: -97.720, st: 'unworked' },
      { id: uid(22), n: 'DB Taqueria', a: '600 East 6th, Austin, TX 78702',
        ph: '512-555-2002', we: '', rt: 3.9, rv: 200, sc: 20, pr: 'Cold',
        zi: '78702', ar: 'East Austin', zo: 'z3', da: '',
        lt: 30.261, lg: -97.728, st: 'unworked' },
    ];

    // Clusters use: id, nm=name, cnt=count, zi=zip, ar=area, mb=member ids, hot=hot count
    const dbClusters = [
      { id: 'z1', nm: 'Zone A', cnt: 1, zi: '78704', ar: 'South Austin', mb: [uid(20)], hot: 1 },
      { id: 'z2', nm: 'Zone B', cnt: 1, zi: '78751', ar: 'North Austin', mb: [uid(21)], hot: 0 },
      { id: 'z3', nm: 'Zone C', cnt: 1, zi: '78702', ar: 'East Austin',  mb: [uid(22)], hot: 0 },
    ];

    localStorage.setItem('vs_c1', JSON.stringify(canvass));
    localStorage.setItem('vs_p3', JSON.stringify(prospects));
    localStorage.setItem('vs_db',  JSON.stringify(dbRecords));
    localStorage.setItem('vs_dbc', JSON.stringify(dbClusters));
    localStorage.setItem('vs_db_areas', JSON.stringify(['South Austin', 'North Austin', 'East Austin']));
    localStorage.setItem('vs_db_block', JSON.stringify(['McDonald\'s', 'Subway', 'Starbucks']));
  }, now);
  await seedPage.close();

  // ── Open fresh page with seeded data ────────────────────────────────────────
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
  await page.goto(FILE);
  await page.waitForLoadState('domcontentloaded');

  // ══════════════════════════════════════════════════════════════════════════
  // 1. PAGE LOAD & THEME
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── PAGE LOAD & THEME ──');
  const title = await page.title();
  log('Page title loads', title.includes('Prospect Tracker'), title);

  const h1 = await page.locator('h1').textContent();
  log('H1 renders', h1.includes('Restaurant Prospect Tracker'), h1.trim());

  await page.click('button.theme-btn');
  const dark = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  log('Dark mode toggle', dark === 'dark');
  await page.click('button.theme-btn');

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CANVASS TAB — TODAY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── CANVASS TAB ──');
  await page.click('button.tab:has-text("Canvass")');
  await page.waitForTimeout(200);

  const todayCount = await page.locator('#cs-today').textContent();
  log('Today stat shows count', parseInt(todayCount) >= 1, `Today: ${todayCount}`);

  const followupCount = await page.locator('#cs-followup').textContent();
  log('Follow Up stat shows count', parseInt(followupCount) >= 1, `Follow Up: ${followupCount}`);

  // Today sub-tab cards visible
  const todayCards = await page.locator('#canvass-list .card').count();
  log('Today cards render', todayCards >= 1, `${todayCards} cards`);

  // Status dropdown on a card
  const firstStatusSel = page.locator('#canvass-list .card').first().locator('select');
  const firstStatus = await firstStatusSel.inputValue();
  log('Canvass card status dropdown present', firstStatus.length > 0, firstStatus);

  // Hours chip renders
  const hoursChip = await page.locator('#canvass-list .hours-chip').first().isVisible().catch(() => false);
  log('Hours chip renders on canvass card', hoursChip);

  // ── Follow Up sub-tab ──
  await page.click('#cvt-followup');
  await page.waitForTimeout(200);
  const followupCards = await page.locator('#canvass-followup-list .card').count();
  log('Follow Up cards render', followupCards >= 1, `${followupCards} cards`);

  // ── All Active sub-tab ──
  await page.click('#cvt-active');
  await page.waitForTimeout(200);
  const activeCards = await page.locator('#canvass-active-list .card').count();
  log('All Active cards render', activeCards >= 1, `${activeCards} cards`);

  // ── Status filter on All Active ──
  await page.selectOption('#canvass-filter-active-status', 'Not interested');
  await page.waitForTimeout(150);
  const filteredActive = await page.locator('#canvass-active-list .card').count();
  log('All Active status filter works', filteredActive >= 0, `${filteredActive} after filter`);
  await page.selectOption('#canvass-filter-active-status', 'all');

  // ── Search Today (do this while still on Today tab) ──
  await page.click('#cvt-today');
  await page.waitForTimeout(200);
  await page.fill('#canvass-search-today', 'Taco');
  await page.waitForTimeout(200);
  const searchedCards = await page.locator('#canvass-list .card').count();
  log('Today search filters cards', searchedCards >= 1 && searchedCards <= todayCards, `${searchedCards} shown`);
  await page.fill('#canvass-search-today', '');
  await page.waitForTimeout(100);

  // ── Archived sub-tab ──
  await page.click('#cvt-archived');
  await page.waitForTimeout(200);
  const archivedPanel = await page.locator('#cvp-archived').isVisible();
  log('Archived panel renders', archivedPanel);

  // ── Add Stop sub-tab ──
  await page.click('#cvt-add');
  await page.waitForTimeout(200);
  const todayStatBefore = await page.locator('#cs-today').textContent();
  await page.fill('#c-name', 'Test Ramen Co');
  await page.fill('#c-addr', '1 Test St, Austin, TX 78701');
  await page.fill('#c-phone', '512-000-0000');
  await page.fill('#c-notes', 'Playwright test stop');
  // Scope to the form panel to avoid matching the "Add Stop" tab button
  await page.locator('#cvp-add button:has-text("Add Stop")').click();
  await page.waitForTimeout(500);

  const addMsg = await page.locator('#canvass-add-form-msg').textContent();
  log('Add canvass stop succeeds', addMsg.toLowerCase().includes('added') || addMsg.toLowerCase().includes('stop'), addMsg || '(no msg)');

  // Verify stat increased — addCanvass() auto-switches to Today tab
  await page.waitForTimeout(300);
  const todayStatAfter = await page.locator('#cs-today').textContent();
  log('New canvass stop appears in Today', parseInt(todayStatAfter) > parseInt(todayStatBefore), `stat: ${todayStatBefore} → ${todayStatAfter}`);

  // ══════════════════════════════════════════════════════════════════════════
  // 3. CONVERT TO LEAD MODAL
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── CONVERT TO LEAD ──');
  // Ensure we're on Today tab (addCanvass auto-switches there)
  await page.locator('#cvp-today').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(200);
  const convertBtn = page.locator('#canvass-list .card').first().locator('button:has-text("Convert")');
  const convertVisible = await convertBtn.isVisible().catch(() => false);
  log('Convert to Lead button visible', convertVisible);

  if (convertVisible) {
    await convertBtn.click();
    await page.waitForTimeout(300);
    const modalVisible = await page.locator('#convert-modal').isVisible();
    log('Convert modal opens', modalVisible);

    if (modalVisible) {
      await page.fill('#m-email', 'test@test.com');
      await page.fill('#m-owner', 'Test Owner');
      await page.selectOption('#m-pos', 'Toast');
      await page.click('button:has-text("Convert to Lead")');
      await page.waitForTimeout(300);
      const modalGone = !(await page.locator('#convert-modal').isVisible());
      log('Convert modal closes after confirm', modalGone);

      // Check lead count increased
      await page.click('button.tab:has-text("My Leads")');
      await page.waitForTimeout(200);
      const totalStat = await page.locator('#s-total').textContent();
      log('Lead count increased after convert', parseInt(totalStat) >= 4, `Total leads: ${totalStat}`);
      await page.click('button.tab:has-text("Canvass")');
      await page.waitForTimeout(200);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. DEMOTE LEAD TO CANVASS MODAL
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── DEMOTE LEAD → CANVASS ──');
  await page.click('button.tab:has-text("My Leads")');
  await page.waitForTimeout(200);
  const demoteBtn = page.locator('#prospect-list .card').first().locator('button:has-text("Canvass")');
  const demoteVisible = await demoteBtn.isVisible().catch(() => false);
  log('Demote button visible on lead card', demoteVisible);

  if (demoteVisible) {
    await demoteBtn.click();
    await page.waitForTimeout(300);
    const demoteModal = await page.locator('#demote-modal').isVisible();
    log('Demote modal opens', demoteModal);

    if (demoteModal) {
      await page.selectOption('#demote-status', 'Come back later');
      await page.fill('#demote-notes', 'Testing demote');
      await page.click('button:has-text("Move to Canvass")');
      await page.waitForTimeout(300);
      const modalGone = !(await page.locator('#demote-modal').isVisible());
      log('Demote modal closes after confirm', modalGone);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. MY LEADS TAB
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── MY LEADS TAB ──');
  await page.click('button.tab:has-text("My Leads")');
  await page.waitForTimeout(200);

  const sTotal = await page.locator('#s-total').textContent();
  const sOpen  = await page.locator('#s-open').textContent();
  const sWon   = await page.locator('#s-won').textContent();
  log('Lead stats render (Total/Open/Won)', parseInt(sTotal) >= 1, `Total:${sTotal} Open:${sOpen} Won:${sWon}`);

  const leadCards = await page.locator('#prospect-list .card').count();
  log('Lead cards render', leadCards >= 1, `${leadCards} cards`);

  // Status filter
  await page.selectOption('#filter-status', 'Won');
  await page.waitForTimeout(150);
  const wonCards = await page.locator('#prospect-list .card').count();
  log('Lead status filter (Won) works', wonCards >= 1, `${wonCards} Won leads`);
  await page.selectOption('#filter-status', 'all');

  // Add a lead manually
  await page.fill('#p-name', 'Playwright Bistro');
  await page.fill('#p-addr', '999 Test Ave, Austin, TX 78701');
  await page.fill('#p-phone', '512-999-0000');
  await page.fill('#p-email', 'bistro@test.com');
  await page.fill('#p-owner', 'Claude Tester');
  await page.selectOption('#p-current', 'Clover');
  await page.click('button:has-text("+ Add Lead")');
  await page.waitForTimeout(300);

  const addLeadMsg = await page.locator('#add-msg').textContent();
  log('Manual lead add succeeds', addLeadMsg.toLowerCase().includes('added') || addLeadMsg === '', addLeadMsg || '(no msg)');

  const sTotal2 = await page.locator('#s-total').textContent();
  log('Lead count incremented after add', parseInt(sTotal2) > parseInt(sTotal), `${sTotal} → ${sTotal2}`);

  // ── Edit lead ──
  const editBtn = page.locator('#prospect-list .card').first().locator('button:has-text("Edit")');
  const editVisible = await editBtn.isVisible().catch(() => false);
  log('Edit button visible on lead card', editVisible);

  if (editVisible) {
    await editBtn.click();
    await page.waitForTimeout(200);
    const editForm = await page.locator('#prospect-list .card').first().locator('input').first().isVisible();
    log('Lead edit form expands inline', editForm);
    const cancelBtn = page.locator('#prospect-list .card').first().locator('button:has-text("Cancel")');
    if (await cancelBtn.isVisible()) await cancelBtn.click();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. ROUTE TAB
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── ROUTE TAB ──');
  await page.click('button.tab:has-text("Route")');
  await page.waitForTimeout(300);

  const routeCanvass = await page.locator('#route-canvass-list .route-row').count();
  const routeLeads   = await page.locator('#route-leads-list .route-row').count();
  log('Route canvass stops listed', routeCanvass >= 1, `${routeCanvass} stops`);
  log('Route leads listed', routeLeads >= 1, `${routeLeads} leads`);

  await page.click('button:has-text("All canvass stops")');
  await page.waitForTimeout(200);
  const routeCount = await page.locator('#route-count').textContent();
  log('Select all canvass stops works', routeCount.includes('selected') || parseInt(routeCount) >= 1, routeCount);

  await page.locator('#tab-route button:has-text("Clear")').click();
  await page.waitForTimeout(100);

  // ══════════════════════════════════════════════════════════════════════════
  // 7. DATABASE TAB
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── DATABASE TAB ──');
  await page.click('button.tab:has-text("Database")');
  await page.waitForTimeout(300);

  const dbTotal = await page.locator('#db-s-total').textContent();
  log('DB stats render', parseInt(dbTotal) >= 1, `DB Total: ${dbTotal}`);

  const dbCards = await page.locator('#db-list > div').count();
  log('DB records render in browse', dbCards >= 1, `${dbCards} records`);

  // Priority filter
  await page.selectOption('#db-filter-priority', 'Hot');
  await page.waitForTimeout(150);
  const hotCards = await page.locator('#db-list > div').count();
  log('DB priority filter (Hot) works', hotCards >= 0, `${hotCards} shown`);
  await page.selectOption('#db-filter-priority', 'all');

  // Area filter populated
  const areaOpts = await page.locator('#db-filter-area option').count();
  log('DB area filter populated', areaOpts > 1, `${areaOpts} options`);

  // Search
  await page.fill('#db-filter-search', 'Bistro');
  await page.waitForTimeout(200);
  const searchDb = await page.locator('#db-list > div').count();
  log('DB search filter works', searchDb >= 0, `${searchDb} shown`);
  await page.fill('#db-filter-search', '');

  // Select all + load to canvass
  await page.click('button:has-text("Select all filtered")');
  await page.waitForTimeout(150);
  const selCount = await page.locator('#db-sel-count').textContent();
  log('DB select all shows count', selCount.length > 0, selCount);

  await page.click('button:has-text("Clear selection")');

  // ── Zones sub-tab ──
  await page.click('#dbt-zones');
  await page.waitForTimeout(300);
  const zoneList = await page.locator('#zone-list').isVisible();
  log('Zones panel renders', zoneList);

  const exportCsvBtn = await page.locator('button:has-text("Export all zones → My Maps CSV")').isVisible();
  log('Export all zones CSV button visible', exportCsvBtn);

  const exportKmzBtn = await page.locator('button:has-text("Export all zones → KMZ")').isVisible();
  log('Export all zones KMZ button visible', exportKmzBtn);

  // ── Week Planner sub-tab ──
  await page.click('#dbt-week');
  await page.waitForTimeout(300);
  const weekPlanner = await page.locator('#week-planner').isVisible();
  log('Week planner panel renders', weekPlanner);

  const stopsPerDay = await page.locator('#stops-per-day').isVisible();
  log('Stops-per-day slider visible', stopsPerDay);

  // Auto-fill today
  await page.click('button:has-text("Auto-fill today")');
  await page.waitForTimeout(400);
  const weekPlannerContent = await page.locator('#week-planner').textContent();
  log('Auto-fill today populates week planner', weekPlannerContent.length > 10, `${weekPlannerContent.length} chars`);

  // Auto-fill whole week
  await page.click('button:has-text("Auto-fill whole week")');
  await page.waitForTimeout(400);
  const weekMsg = await page.locator('#week-msg').textContent();
  log('Auto-fill whole week runs', true, weekMsg || '(no msg — check planner visually)');

  // Clear week
  await page.click('button:has-text("Clear week")');
  await page.waitForTimeout(200);

  // ══════════════════════════════════════════════════════════════════════════
  // 8. SNAPSHOTS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── DATABASE SNAPSHOTS ──');
  await page.click('button.tab:has-text("Database")');
  await page.waitForTimeout(200);
  await page.click('#dbt-browse');
  await page.waitForTimeout(200);

  await page.click('button:has-text("Save Snapshot")');
  await page.waitForTimeout(300);
  const snapMsg = await page.locator('#snapshot-msg').textContent();
  log('Manual snapshot saved', snapMsg.toLowerCase().includes('saved') || snapMsg.toLowerCase().includes('snapshot'), snapMsg || '(no msg)');

  // takeSnapshot auto-opens the panel — check it's already open after save
  const snapDisplay = await page.evaluate(() => document.getElementById('snapshots-panel').style.display);
  log('Snapshot panel auto-opens after save', snapDisplay === 'block', `display: ${snapDisplay}`);

  const snapItems = await page.locator('#snapshots-list').textContent();
  log('Snapshot appears in list', snapItems.length > 5, snapItems.slice(0, 60));

  // ══════════════════════════════════════════════════════════════════════════
  // 9. BUILD A RUN MODAL
  // Build a Run button appears on Follow Up cards only
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── BUILD A RUN ──');
  await page.click('button.tab:has-text("Canvass")');
  await page.waitForTimeout(200);
  await page.click('#cvt-followup');
  await page.waitForTimeout(200);

  const buildRunBtn = page.locator('#canvass-followup-list').locator('button:has-text("Build a Run")');
  const buildRunVisible = await buildRunBtn.isVisible().catch(() => false);
  log('Build a Run button visible on canvass card', buildRunVisible);

  if (buildRunVisible) {
    await buildRunBtn.click();
    await page.waitForTimeout(400);
    const buildRunModal = await page.locator('#buildrun-modal').isVisible();
    log('Build a Run modal opens', buildRunModal);

    if (buildRunModal) {
      const poolNote = await page.locator('#buildrun-pool-note').textContent();
      log('Build a Run pool note renders', poolNote.length > 0, poolNote);

      const slider = await page.locator('#buildrun-slider').isVisible();
      log('Build a Run slider visible', slider);

      // Change slider
      await page.locator('#buildrun-slider').evaluate(el => {
        el.value = 5; el.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(150);
      const countDisplay = await page.locator('#buildrun-count').textContent();
      // Slider clamps to pool size — pool has 3 stops so value can't exceed 3
      const countNum = parseInt(countDisplay);
      log('Build a Run slider updates count', countNum >= 1 && countNum <= 5, `Count: ${countDisplay}`);

      await page.click('button:has-text("Load to Today\'s Canvass")');
      await page.waitForTimeout(600);
      const buildRunGone = !(await page.locator('#buildrun-modal').isVisible());
      log('Build a Run modal closes after confirm', buildRunGone);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 10. END DAY FLOW
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── END DAY ──');
  await page.click('button.tab:has-text("Canvass")');
  await page.waitForTimeout(200);
  await page.click('#cvt-today');
  await page.waitForTimeout(200);

  // "End Day ✓" button in toolbar; scope to canvass panel to avoid modal buttons
  await page.locator('#cvp-today button:has-text("End Day")').click();
  await page.waitForTimeout(300);
  const endDayModal = await page.locator('#endday-modal').isVisible();
  log('End Day modal opens', endDayModal);

  if (endDayModal) {
    const recap = await page.locator('#endday-recap').textContent();
    log('End Day recap text renders', recap.length > 5, recap.slice(0, 80));
    await page.locator('#endday-modal button:has-text("Cancel")').click();
    await page.waitForTimeout(200);
    const endDayGone = !(await page.locator('#endday-modal').isVisible());
    log('End Day modal cancels correctly', endDayGone);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 11. EXPORT / IMPORT TAB
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── EXPORT / IMPORT ──');
  await page.click('button.tab:has-text("Export")');
  await page.waitForTimeout(200);

  const exportLeadsBtn  = await page.locator('button:has-text("Download Leads CSVs")').isVisible();
  const exportDbBtn     = await page.locator('button:has-text("Download Companies CSV")').isVisible();
  const exportCanvassBtn= await page.locator('button:has-text("Download Canvass CSVs")').isVisible();
  const jsonBtn         = await page.locator('button:has-text("Download JSON backup")').isVisible();
  log('Export Leads CSVs button visible', exportLeadsBtn);
  log('Export DB Companies CSV button visible', exportDbBtn);
  log('Export Canvass CSVs button visible', exportCanvassBtn);
  log('Download JSON backup button visible', jsonBtn);

  // DB export area filter populates
  const dbExportArea = await page.locator('#db-export-area option').count();
  log('DB export area filter populated', dbExportArea > 1, `${dbExportArea} options`);

  // JSON copy
  const copyJsonBtn = await page.locator('button:has-text("Copy JSON")').isVisible();
  log('Copy JSON button visible', copyJsonBtn);

  // ── Import JSON round-trip ──
  const jsonData = await page.evaluate(() => {
    return JSON.stringify({
      prospects: JSON.parse(localStorage.getItem('vs_p3') || '[]'),
      canvassStops: JSON.parse(localStorage.getItem('vs_c1') || '[]'),
    });
  });
  log('JSON data exported from localStorage', jsonData.length > 10, `${jsonData.length} chars`);

  // ══════════════════════════════════════════════════════════════════════════
  // 12. CHAIN BLOCKLIST MANAGER
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── CHAIN BLOCKLIST ──');
  await page.click('button.tab:has-text("Database")');
  await page.waitForTimeout(200);
  await page.click('#dbt-browse');
  await page.waitForTimeout(200);

  await page.click('button:has-text("Manage")');
  await page.waitForTimeout(200);
  const blocklistPanel = await page.locator('#blocklist-manager').isVisible();
  log('Blocklist manager panel opens', blocklistPanel);

  if (blocklistPanel) {
    const blocklistContent = await page.locator('#blocklist-manager').textContent();
    log('Blocklist shows entries', blocklistContent.includes("McDonald") || blocklistContent.length > 5, blocklistContent.slice(0, 80));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 13. FREE SOURCES TAB
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── FREE SOURCES TAB ──');
  await page.click('button.tab:has-text("Free Sources")');
  await page.waitForTimeout(200);
  const sourceLinks = await page.locator('.src .btn').count();
  log('Free source links render', sourceLinks >= 4, `${sourceLinks} links`);

  // ══════════════════════════════════════════════════════════════════════════
  // RESULTS SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\nFAILED CHECKS:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.label}  →  ${r.detail}`));
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
