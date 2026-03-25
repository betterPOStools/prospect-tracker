// Paste this into the browser console to seed test data for the map view.
// Run once, then refresh the app.
(() => {
  const restaurants = [
    // Austin, TX area
    { n: "Joe's Italian Grill",     a: "1234 Congress Ave, Austin, TX 78701",    ci: "Austin",    zi: "78701", lt: 30.2672, lg: -97.7431, rt: 4.5, rv: 220, ph: "512-555-0101", web: "https://example.com", em: "joe@example.com", cn: "Joe Martini", ct: "Owner" },
    { n: "Taco Palace",             a: "456 S Lamar Blvd, Austin, TX 78704",     ci: "Austin",    zi: "78704", lt: 30.2510, lg: -97.7700, rt: 4.2, rv: 180, ph: "512-555-0102", web: "https://example.com", em: "info@taco.com", cn: "Maria Lopez", ct: "Manager" },
    { n: "BBQ Barn",                a: "789 E 6th St, Austin, TX 78702",         ci: "Austin",    zi: "78702", lt: 30.2669, lg: -97.7320, rt: 4.8, rv: 450, ph: "512-555-0103", web: "https://example.com", em: "", cn: "", ct: "" },
    { n: "Sushi Supreme",           a: "321 S 1st St, Austin, TX 78704",         ci: "Austin",    zi: "78704", lt: 30.2520, lg: -97.7530, rt: 4.1, rv: 95, ph: "512-555-0104", web: "", em: "sushi@example.com", cn: "Ken Tanaka", ct: "Chef" },
    { n: "Pizza Planet",            a: "567 Burnet Rd, Austin, TX 78756",        ci: "Austin",    zi: "78756", lt: 30.3210, lg: -97.7520, rt: 3.9, rv: 310, ph: "512-555-0105", web: "https://example.com", em: "pizza@example.com", cn: "", ct: "" },
    { n: "The Breakfast Club",      a: "890 N Lamar Blvd, Austin, TX 78703",     ci: "Austin",    zi: "78703", lt: 30.2810, lg: -97.7550, rt: 4.6, rv: 520, ph: "512-555-0106", web: "https://example.com", em: "hello@breakfast.com", cn: "Amy Chen", ct: "Owner" },
    { n: "Curry House",             a: "234 W 5th St, Austin, TX 78701",         ci: "Austin",    zi: "78701", lt: 30.2680, lg: -97.7480, rt: 4.3, rv: 140, ph: "512-555-0107", web: "https://example.com", em: "curry@example.com", cn: "Raj Patel", ct: "Owner" },
    { n: "Burger Bliss",            a: "678 S Congress Ave, Austin, TX 78704",   ci: "Austin",    zi: "78704", lt: 30.2440, lg: -97.7490, rt: 3.5, rv: 60, ph: "512-555-0108", web: "", em: "", cn: "", ct: "" },
    { n: "Noodle Bar",              a: "901 E Cesar Chavez, Austin, TX 78702",   ci: "Austin",    zi: "78702", lt: 30.2590, lg: -97.7280, rt: 4.7, rv: 200, ph: "512-555-0109", web: "https://example.com", em: "noodle@example.com", cn: "Lin Wei", ct: "Manager" },
    { n: "El Rancho Grande",        a: "345 E Riverside Dr, Austin, TX 78741",   ci: "Austin",    zi: "78741", lt: 30.2380, lg: -97.7350, rt: 4.0, rv: 110, ph: "512-555-0110", web: "https://example.com", em: "", cn: "Carlos Rivera", ct: "Owner" },
    // Round Rock / Cedar Park
    { n: "Wing World",              a: "123 Main St, Round Rock, TX 78664",      ci: "Round Rock", zi: "78664", lt: 30.5083, lg: -97.6789, rt: 3.8, rv: 75, ph: "512-555-0201", web: "", em: "", cn: "", ct: "" },
    { n: "Thai Orchid",             a: "456 Palm Valley Blvd, Round Rock, TX 78664", ci: "Round Rock", zi: "78664", lt: 30.5120, lg: -97.6650, rt: 4.4, rv: 190, ph: "512-555-0202", web: "https://example.com", em: "thai@example.com", cn: "Siri P.", ct: "Owner" },
    { n: "Cedar Park Diner",        a: "789 Cypress Creek Rd, Cedar Park, TX 78613", ci: "Cedar Park", zi: "78613", lt: 30.5170, lg: -97.8200, rt: 4.1, rv: 130, ph: "512-555-0203", web: "https://example.com", em: "diner@example.com", cn: "Bill Turner", ct: "Manager" },
    { n: "Lakeline Steakhouse",     a: "321 Lakeline Blvd, Cedar Park, TX 78613", ci: "Cedar Park", zi: "78613", lt: 30.4950, lg: -97.8050, rt: 4.6, rv: 280, ph: "512-555-0204", web: "https://example.com", em: "steak@example.com", cn: "Dave Brown", ct: "Owner" },
    // San Marcos / New Braunfels
    { n: "River Grill",             a: "123 Hopkins St, San Marcos, TX 78666",   ci: "San Marcos",   zi: "78666", lt: 29.8833, lg: -97.9414, rt: 4.2, rv: 160, ph: "512-555-0301", web: "https://example.com", em: "river@example.com", cn: "Sarah Kim", ct: "Owner" },
    { n: "Gruene Smokehouse",       a: "456 Gruene Rd, New Braunfels, TX 78130", ci: "New Braunfels", zi: "78130", lt: 29.7380, lg: -98.1060, rt: 4.9, rv: 600, ph: "830-555-0302", web: "https://example.com", em: "smoke@example.com", cn: "Tom Gruene", ct: "Owner" },
    { n: "Comal Cantina",           a: "789 Seguin Ave, New Braunfels, TX 78130", ci: "New Braunfels", zi: "78130", lt: 29.7030, lg: -98.1240, rt: 3.7, rv: 45, ph: "830-555-0303", web: "", em: "", cn: "", ct: "" },
    { n: "Guadalupe Café",          a: "234 Guadalupe St, San Marcos, TX 78666", ci: "San Marcos",   zi: "78666", lt: 29.8770, lg: -97.9380, rt: 4.0, rv: 85, ph: "512-555-0304", web: "https://example.com", em: "cafe@example.com", cn: "", ct: "" },
    // Georgetown
    { n: "Square Bistro",           a: "123 Main St, Georgetown, TX 78626",     ci: "Georgetown", zi: "78626", lt: 30.6326, lg: -97.6779, rt: 4.5, rv: 210, ph: "512-555-0401", web: "https://example.com", em: "bistro@example.com", cn: "Nancy Ellis", ct: "Owner" },
    { n: "Wolf Ranch Grill",        a: "456 Wolf Ranch Pkwy, Georgetown, TX 78628", ci: "Georgetown", zi: "78628", lt: 30.6450, lg: -97.7100, rt: 3.6, rv: 50, ph: "512-555-0402", web: "", em: "", cn: "", ct: "" },
  ];

  function calcScore(r) {
    let s = 70;
    if ((r.rt||0) >= 4.5) s += 15; else if ((r.rt||0) >= 4.0) s += 5;
    if ((r.rv||0) >= 200) s += 15; else if ((r.rv||0) >= 100) s += 10;
    if (r.fb || r.ig) s += 5;
    if (r.em) s += 5;
    if (r.mn) s += 3;
    if (r.cn) s += 5;
    if (r.hr) s += 3;
    if (r.ch) s -= 30;
    if ((r.rt||0) < 3.0) s -= 20; else if ((r.rt||0) < 4.0) s -= 10;
    if ((r.rv||0) < 10) s -= 20; else if ((r.rv||0) < 30) s -= 10;
    if (!r.em) s -= 10;
    if (!r.web) s -= 5;
    if (!r.ph) s -= 10;
    return Math.max(s, 0);
  }
  function calcPriority(s) {
    if (s >= 95) return 'Fire';
    if (s >= 75) return 'Hot';
    if (s >= 55) return 'Warm';
    if (s >= 35) return 'Cold';
    return 'Dead';
  }

  const records = restaurants.map((r, i) => {
    const sc = calcScore(r);
    const pr = calcPriority(sc);
    const statuses = ['unworked','unworked','unworked','in_canvass','canvassed'];
    return {
      id: 'db_seed_' + i,
      ...r,
      ty: 'restaurant',
      sc, pr,
      st: statuses[i % statuses.length],
      ar: r.ci + ', TX',
      zo: '',
      da: '',
      grp: '',
      df: 0,
      ch: false,
      pi: 'seed_place_' + i,
      fb: '', ig: '', hr: '', mn: '', es: '',
      pc: '', pt: '', emp: 0, rev: '', nai: '', nad: '',
      nt: '',
      _ts: {},
    };
  });

  // Build clusters
  const zipGroups = {};
  records.forEach(r => {
    if (!zipGroups[r.zi]) zipGroups[r.zi] = [];
    zipGroups[r.zi].push(r);
  });
  const clusters = Object.entries(zipGroups).map(([zip, members], i) => {
    const lats = members.filter(m => m.lt).map(m => m.lt);
    const lngs = members.filter(m => m.lg).map(m => m.lg);
    const lt = lats.reduce((a,b) => a+b, 0) / lats.length;
    const lg = lngs.reduce((a,b) => a+b, 0) / lngs.length;
    const hot = members.filter(m => m.pr === 'Fire' || m.pr === 'Hot').length;
    return {
      id: 'zone_' + zip + '_0',
      nm: zip + ' — ' + members[0].ci,
      zi: zip,
      lt, lg,
      cnt: members.length,
      hot,
      mb: members.map(m => m.id),
      zone: 'zone_' + zip + '_0',
    };
  });

  // Assign zones back
  clusters.forEach(c => {
    c.mb.forEach(id => {
      const r = records.find(r => r.id === id);
      if (r) r.zo = c.id;
    });
  });

  const areas = [...new Set(records.map(r => r.ar))];

  // Also create a couple canvass stops for route layer
  const today = new Date().toLocaleDateString();
  const now = new Date().toISOString();
  const canvassStops = records.slice(0, 5).map((r, i) => ({
    id: 'canvass_seed_' + i,
    name: r.n,
    addr: r.a,
    phone: r.ph,
    email: r.em,
    website: r.web,
    menu: '',
    notes: '',
    status: i === 0 ? 'Not visited yet' : i === 1 ? 'Dropped folder' : 'Not visited yet',
    date: today,
    added: now,
    lat: r.lt,
    lng: r.lg,
    fromDb: r.id,
    score: r.sc,
    priority: r.pr,
    history: [],
    notesLog: [],
  }));

  localStorage.setItem('vs_db', JSON.stringify(records));
  localStorage.setItem('vs_dbc', JSON.stringify(clusters));
  localStorage.setItem('vs_db_areas', JSON.stringify(areas));
  localStorage.setItem('vs_c1', JSON.stringify(canvassStops));

  console.log(`Seeded: ${records.length} records, ${clusters.length} clusters, ${canvassStops.length} canvass stops`);
  console.log('Refresh the page to see the data.');
})();
