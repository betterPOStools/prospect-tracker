import { calcScore, calcPriority } from './scoring.js'
import { buildClusters } from './clustering.js'
import { isBlocklisted } from './blocklist.js'

// ── localStorage keys (isolated from main store — never synced to Drive/Supabase) ──
const OS_KEYS = {
  apiKey: 'vs_os_key',
  config: 'vs_os_cfg',
  tasks:  'vs_os_tasks',
}

const DEFAULT_CATEGORIES =
  'restaurant, bar and grill, seafood restaurant, pizza restaurant, brewery, bar, night club'

function parse(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) }
  catch { return fallback }
}

export function loadOsApiKey()      { return localStorage.getItem(OS_KEYS.apiKey) || '' }
export function saveOsApiKey(key)   { localStorage.setItem(OS_KEYS.apiKey, key) }

export function loadOsConfig() {
  const cfg = parse(OS_KEYS.config, {})
  if (!cfg.categories) cfg.categories = DEFAULT_CATEGORIES
  if (cfg.autoImport === undefined) cfg.autoImport = true
  return cfg
}
export function saveOsConfig(cfg)   { localStorage.setItem(OS_KEYS.config, JSON.stringify(cfg)) }

export function loadOsTasks()       { return parse(OS_KEYS.tasks, []) }
export function saveOsTasks(tasks)  { localStorage.setItem(OS_KEYS.tasks, JSON.stringify(tasks)) }

// ── ZIP lookup via Zippopotam.us (free, no key, CORS-enabled) ──────────────────
export async function lookupZips(city, stateAbbr) {
  const url = `https://api.zippopotam.us/us/${stateAbbr.toLowerCase()}/${encodeURIComponent(city.toLowerCase())}`
  let resp
  try {
    resp = await fetch(url)
  } catch (e) {
    throw new Error('Network error looking up ZIP codes. Check your connection.')
  }
  if (resp.status === 404) {
    throw new Error(`No ZIP codes found for "${city}, ${stateAbbr}". Check the spelling.`)
  }
  if (!resp.ok) {
    throw new Error(`ZIP lookup failed (HTTP ${resp.status}). Try again.`)
  }
  const data = await resp.json()
  const places = data.places || []
  if (!places.length) {
    throw new Error(`No ZIP codes found for "${city}, ${stateAbbr}". Check the spelling.`)
  }
  const zips = [...new Set(places.map(p => p['post code']).filter(Boolean))]
  return zips
}

// ── Query builder ──────────────────────────────────────────────────────────────
export function buildQueries(zips, city, state, categoriesString) {
  const cats = categoriesString.split(',').map(c => c.trim()).filter(Boolean)
  const queries = []
  zips.forEach(zip => {
    cats.forEach(cat => {
      queries.push(`${cat}, ${zip}, ${city}, ${state}, US`)
    })
  })
  return queries
}

// ── API submit & poll ──────────────────────────────────────────────────────────
export async function submitScrape(apiKey, title, queries) {
  const payload = {
    service_name: 'google_maps_service_v2',
    title,
    queries,
    input_file: null,
    enrich: false,
    settings: {
      output_columns: [
        'name', 'subtypes', 'category', 'phone', 'website', 'street', 'city', 'state',
        'state_code', 'postal_code', 'company_name', 'company_phone', 'company_linkedin',
        'company_facebook', 'company_instagram', 'company_x', 'company_youtube',
        'full_name', 'first_name', 'last_name', 'title', 'email',
        'email.emails_validator.status', 'contact_phone', 'contact_facebook',
        'contact_instagram', 'latitude', 'longitude', 'rating', 'reviews',
        'business_status', 'working_hours_csv_compatible', 'menu_link',
        'place_id', 'google_id', 'chain_info.chain',
      ],
      output_extension: 'xlsx',
    },
    tags: 'value-systems, ' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    enrichments: ['contacts_n_leads', 'company_insights_service', 'emails_validator_service'],
    categories: [],
    locations: [],
    language: 'en',
    region: 'US',
    limit: 500,
    organizationsPerQueryLimit: 500,
    filters: [
      { key: 'business_status', labelKey: 'title.operationalOnly', operator: 'equals', value: ['operational'] },
      { key: 'phone', labelKey: 'title.withPhone', operator: 'is not blank', value: null },
    ],
    exactMatch: false,
    useZipCodes: true,
    dropDuplicates: true,
    dropEmailDuplicates: true,
    ignoreWithoutEmails: false,
    UISettings: { isCustomCategories: false, isCustomLocations: false, isCustomQueries: true },
    enrichments_kwargs: {
      contacts_n_leads: { contacts_per_company: 1, general_emails: false, preferred_contacts: ['decision makers'] },
    },
    org: 'os',
  }

  const resp = await fetch('https://api.outscraper.cloud/tasks', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`Outscraper API error: ${resp.status}`)
  return await resp.json()
}

export async function pollTask(apiKey, taskId) {
  const resp = await fetch(`https://api.outscraper.cloud/tasks/${taskId}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!resp.ok) throw new Error(`Poll error: ${resp.status}`)
  return await resp.json()
}

// ── Row processor — shared by XLSX import and API import ───────────────────────
// Extracted verbatim from ImportBar.jsx to ensure identical dedup/scoring logic.
//
// rows          — raw array from SheetJS or Outscraper API JSON
// area          — string label for this import batch
// existingRecords — current db.dbRecords
// blocklist     — current db.dbBlocklist
// existingAreas — current db.dbAreas
//
// Returns { allRecords, dbClusters, dbAreas, added, updated, dupes }

export function processOutscraperRows(rows, area, existingRecords, blocklist, existingAreas) {
  // Flatten arrays-of-arrays (Outscraper API may return one sub-array per query)
  if (rows.length > 0 && Array.isArray(rows[0]) && !rows[0]?.name) {
    rows = rows.flat()
  }

  const existingById   = Object.fromEntries(existingRecords.map(r => [r.id, r]))
  const existingByName = Object.fromEntries(existingRecords.map(r => [(r.n + '|' + r.zi).toLowerCase(), r]))

  let added = 0, updated = 0, dupes = 0
  const newRecords   = []
  const seenInImport = new Set()

  rows.forEach(row => {
    const name = row.name || row['Business Name'] || ''
    if (!name) return
    if (isBlocklisted(name, blocklist)) { dupes++; return }

    const lat     = parseFloat(row.latitude  || row.lat || 0)
    const lng     = parseFloat(row.longitude || row.lng || 0)
    const zip     = String(row.postal_code || row.ZIP || '')
    const placeId = row.place_id || row.google_id || ''
    const dedupKey = placeId
      ? `pid_${placeId}`
      : `nm_${name.toLowerCase().replace(/\W/g, '')}_${zip}`

    if (seenInImport.has(dedupKey)) { dupes++; return }
    seenInImport.add(dedupKey)

    const id = placeId
      ? `db_${placeId}`
      : `db_${name.replace(/\W/g, '_')}_${zip}`

    const fresh = {
      id, n: name,
      ty:  row.subtypes  || row.category   || row.Type     || '',
      a:   row.address   || (row.street ? (row.street + ', ' + (row.city || '') + ', ' + (row.state_code || '') + ' ' + zip) : '') || row.Address || '',
      ci:  row.city      || row.City  || '',
      zi:  zip,
      ph:  String(row.phone || row.Phone || ''),
      web: row.website   || row.Website || '',
      mn:  row.menu_link || row['Menu Link'] || '',
      em:  row.email     || row.Email || '',
      es:  row['email.emails_validator.status'] || row['Email Status'] || '',
      lt: lat, lg: lng,
      rt:  parseFloat(row.rating  || row['Google Rating'] || 0),
      rv:  parseInt(row.reviews   || row['Review Count']  || 0),
      ch:  row['chain_info.chain'] === 'True' || row['Is Chain'] === 'Yes' || false,
      fb:  row.company_facebook  || row.Facebook  || '',
      ig:  row.company_instagram || row.Instagram || '',
      cn:  row.full_name         || row['Contact Name']  || '',
      ct:  row.title             || row['Contact Title'] || '',
      hr:  row.working_hours_csv_compatible || '',
      pi:  placeId,
      ar:  area,
      zo:  '',
      da:  '',
      st:  'unworked',
    }

    const cleanedScore = parseInt(row['Lead Score'] || 0)
    fresh.sc = Math.max(calcScore(fresh), cleanedScore)
    fresh.pr = calcPriority(fresh.sc)

    const existing = existingById[id] || existingByName[(name + '|' + zip).toLowerCase()]
    if (existing) {
      fresh.st = existing.st
      fresh.zo = existing.zo
      fresh.da = existing.da
      fresh.ar = existing.ar || area
      updated++
    } else {
      added++
    }

    newRecords.push(fresh)
  })

  const importedIds = new Set(newRecords.map(r => r.id))
  const kept        = existingRecords.filter(r => !importedIds.has(r.id))
  const allRecords  = [...kept, ...newRecords]

  const dbClusters   = buildClusters(allRecords)
  const memberToZone = {}
  dbClusters.forEach(c => c.mb.forEach(mid => { memberToZone[mid] = c.id }))
  allRecords.forEach(r => { if (!r.zo || !existingById[r.id]?.zo) r.zo = memberToZone[r.id] || '' })

  const dbAreas = [...new Set([...existingAreas, area])]

  return { allRecords, dbClusters, dbAreas, added, updated, dupes }
}
