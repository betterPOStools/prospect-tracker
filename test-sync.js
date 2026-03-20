const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'index.html');
let passed = 0, failed = 0;

function log(label, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${label}${detail ? '  →  ' + detail : ''}`);
  ok ? passed++ : failed++;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function makeProspect(id, name, status='Open') {
  return { id, name, addr:'100 Test St, Austin, TX 78701', phone:'512-000-0000',
           email:'', status, currentPOS:'Toast', owner:'', website:'', menu:'',
           notes:'', addedAt: new Date().toISOString() };
}
function makeCanvass(id, name, date) {
  return { id, name, addr:'200 Test Ave, Austin, TX 78701', phone:'512-000-0001',
           status:'Not visited yet', notes:'', openTime:'10:00', closeTime:'22:00',
           website:'', menu:'', addedAt: new Date().toISOString(), date };
}
function makeDbRec(id, name, priority='Warm') {
  return { id, n:name, a:'300 Test Blvd, Austin, TX 78701', ph:'512-000-0002',
           rt:4.0, rv:50, sc:40, pr:priority, zi:'78701', ar:'Downtown',
           zo:'z1', da:'', lt:30.267, lg:-97.743, st:'unworked' };
}

async function runScenario(ctx, scenarioName, { localProspects=[], localCanvass=[], localDb=[],
  driveData }, checks) {
  console.log(`\n── ${scenarioName} ──`);

  const todayStr = new Date().toLocaleDateString();

  // Seed localStorage and open page
  const seed = await ctx.newPage();
  await seed.goto(FILE);
  await seed.evaluate(({ lp, lc, ld, ts }) => {
    localStorage.clear();
    localStorage.setItem('vs_p3', JSON.stringify(lp));
    localStorage.setItem('vs_c1', JSON.stringify(lc));
    localStorage.setItem('vs_db', JSON.stringify(ld));
    localStorage.setItem('vs_dbc', JSON.stringify([]));
    localStorage.setItem('vs_db_areas', JSON.stringify([]));
    localStorage.setItem('vs_db_block', JSON.stringify([]));
  }, { lp: localProspects, lc: localCanvass, ld: localDb, ts: todayStr });
  await seed.close();

  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));
  await page.goto(FILE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(200);

  // Simulate Drive returning data by calling mergeData() directly
  const result = await page.evaluate((drive) => {
    // Count snapshots before merge
    const snapsBefore = JSON.parse(localStorage.getItem('vs_db_snapshots') || '[]').length;

    mergeData(drive);

    const snapsAfter  = JSON.parse(localStorage.getItem('vs_db_snapshots') || '[]').length;
    const snaps       = JSON.parse(localStorage.getItem('vs_db_snapshots') || '[]');
    const driveLabel  = document.getElementById('drive-label').textContent;

    return {
      snapsBefore, snapsAfter,
      snapshotLabel:  snaps[0] ? snaps[0].label : null,
      snapshotLeads:  snaps[0] ? snaps[0].leads  : null,
      snapshotCanvass:snaps[0] ? snaps[0].canvass : null,
      driveLabel,
      // Read from in-memory arrays — mergeArr updates memory, not localStorage directly
      prospectCount: prospects.length,
      canvassCount:  canvassStops.length,
      dbCount:       dbRecords.length,
    };
  }, driveData);

  await checks(result, page);
  await page.close();
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext();
  const today   = new Date().toLocaleDateString();
  const yest    = new Date(Date.now()-86400000).toLocaleDateString();

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 1: Identical data — Drive matches local exactly
  // Expected: no snapshot, silent (drive bar unchanged by mergeData)
  // ════════════════════════════════════════════════════════════════════════════
  await runScenario(ctx, 'Scenario 1: Identical data (no-op)', {
    localProspects: [makeProspect('p1','Taco Palace')],
    localCanvass:   [makeCanvass('c1','Burger Barn', today)],
    localDb:        [makeDbRec('d1','DB Bistro')],
    driveData: {
      prospects:   [makeProspect('p1','Taco Palace')],
      canvassStops:[makeCanvass('c1','Burger Barn', today)],
      dbRecords:   [makeDbRec('d1','DB Bistro')],
      dbClusters:[], dbAreas:[], dbBlocklist:[],
    }
  }, (r) => {
    log('No snapshot taken (data identical)', r.snapsAfter === r.snapsBefore,
      `snapshots: ${r.snapsBefore} → ${r.snapsAfter}`);
    log('Drive label unchanged by merge', !r.driveLabel.includes('snapshot saved before merge'),
      r.driveLabel);
    log('Prospect count unchanged', r.prospectCount === 1, `${r.prospectCount}`);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 2: Drive has new records local doesn't know about
  // (switching to a new device where Drive has your history)
  // Expected: snapshot taken, message lists new leads + canvass stops
  // ════════════════════════════════════════════════════════════════════════════
  await runScenario(ctx, 'Scenario 2: Drive has new records (new device)', {
    localProspects: [makeProspect('p1','Taco Palace')],
    localCanvass:   [makeCanvass('c1','Burger Barn', today)],
    localDb:        [],
    driveData: {
      prospects:    [makeProspect('p1','Taco Palace'), makeProspect('p2','Sushi Stop'), makeProspect('p3','Pizza Town')],
      canvassStops: [makeCanvass('c1','Burger Barn', today), makeCanvass('c2','Noodle Bar', yest), makeCanvass('c3','Taqueria', yest)],
      dbRecords:    [],
      dbClusters:[], dbAreas:[], dbBlocklist:[],
    }
  }, (r) => {
    log('Snapshot taken before merge', r.snapsAfter > r.snapsBefore,
      `snapshots: ${r.snapsBefore} → ${r.snapsAfter}`);
    log('Snapshot labeled "Before Drive sync"', r.snapshotLabel === 'Before Drive sync',
      r.snapshotLabel);
    log('Drive bar shows new leads count', r.driveLabel.includes('2 new lead'),
      r.driveLabel);
    log('Drive bar shows new canvass count', r.driveLabel.includes('2 new canvass stop'),
      r.driveLabel);
    log('New prospects merged in', r.prospectCount === 3, `${r.prospectCount} prospects`);
    log('New canvass stops merged in', r.canvassCount === 3, `${r.canvassCount} stops`);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 3: Drive has larger DB (you imported on another device)
  // Expected: snapshot, drive bar mentions DB replace with counts
  // ════════════════════════════════════════════════════════════════════════════
  await runScenario(ctx, 'Scenario 3: Drive DB larger (imported on another device)', {
    localProspects: [makeProspect('p1','Taco Palace')],
    localCanvass:   [],
    localDb:        [makeDbRec('d1','DB Bistro')],
    driveData: {
      prospects:    [makeProspect('p1','Taco Palace')],
      canvassStops: [],
      dbRecords:    [makeDbRec('d1','DB Bistro'), makeDbRec('d2','DB Noodle'), makeDbRec('d3','DB Taqueria','Hot')],
      dbClusters:[], dbAreas:['Downtown'], dbBlocklist:[],
    }
  }, (r) => {
    log('Snapshot taken before DB replace', r.snapsAfter > r.snapsBefore,
      `snapshots: ${r.snapsBefore} → ${r.snapsAfter}`);
    log('Drive bar mentions DB replace', r.driveLabel.includes('DB replaced'),
      r.driveLabel);
    log('Drive bar shows record counts', r.driveLabel.includes('3') && r.driveLabel.includes('1'),
      r.driveLabel);
    log('DB records replaced with Drive data', r.dbCount === 3, `${r.dbCount} records`);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 4: Drive has conflicting updates to existing records
  // (e.g. you updated a lead status on another device)
  // Expected: snapshot, message mentions records updated from Drive
  // ════════════════════════════════════════════════════════════════════════════
  await runScenario(ctx, 'Scenario 4: Drive has conflicting updates to existing records', {
    localProspects: [makeProspect('p1','Taco Palace','Open'), makeProspect('p2','Sushi Stop','Open')],
    localCanvass:   [makeCanvass('c1','Burger Barn', today)],
    localDb:        [],
    driveData: {
      prospects:    [makeProspect('p1','Taco Palace','Won'), makeProspect('p2','Sushi Stop','Lost')],
      canvassStops: [makeCanvass('c1','Burger Barn', today)],
      dbRecords:    [],
      dbClusters:[], dbAreas:[], dbBlocklist:[],
    }
  }, async (r, page) => {
    log('Snapshot taken before conflict merge', r.snapsAfter > r.snapsBefore,
      `snapshots: ${r.snapsBefore} → ${r.snapsAfter}`);
    log('Drive bar mentions updated records', r.driveLabel.includes('updated from Drive'),
      r.driveLabel);
    log('Prospect count unchanged (merge not add)', r.prospectCount === 2, `${r.prospectCount}`);
    // Verify Drive's status values won (Drive wins on conflict per mergeArr)
    const statuses = await page.evaluate(() => prospects.map(x => x.status));
    log('Drive status values applied (Drive wins on conflict)',
      statuses.includes('Won') && statuses.includes('Lost'),
      statuses.join(', '));
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 5: Empty local data connecting to Drive for first time
  // Expected: no snapshot (nothing local to protect), data loads normally
  // ════════════════════════════════════════════════════════════════════════════
  await runScenario(ctx, 'Scenario 5: Fresh local + Drive has data (first connect)', {
    localProspects: [],
    localCanvass:   [],
    localDb:        [],
    driveData: {
      prospects:    [makeProspect('p1','Taco Palace'), makeProspect('p2','Sushi Stop')],
      canvassStops: [makeCanvass('c1','Burger Barn', today)],
      dbRecords:    [makeDbRec('d1','DB Bistro','Hot')],
      dbClusters:[], dbAreas:[], dbBlocklist:[],
    }
  }, (r) => {
    log('No snapshot (local was empty, nothing to protect)', r.snapsAfter === r.snapsBefore,
      `snapshots: ${r.snapsBefore} → ${r.snapsAfter}`);
    log('Drive data loaded into local', r.prospectCount === 2 && r.canvassCount === 1 && r.dbCount === 1,
      `${r.prospectCount} leads, ${r.canvassCount} stops, ${r.dbCount} DB`);
  });

  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed+failed} checks`);
  console.log('═'.repeat(60));

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
