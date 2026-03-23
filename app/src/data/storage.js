// localStorage keys
const KEYS = {
  prospects:   'vs_p3',
  canvass:     'vs_c1',
  dbRecords:   'vs_db',
  dbClusters:  'vs_dbc',
  dbAreas:     'vs_db_areas',
  dbBlocklist: 'vs_db_block',
  snapshots:   'vs_db_snapshots',
  theme:       'vs_theme',
}

function parse(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) }
  catch { return fallback }
}

export function loadAll() {
  return {
    prospects:   parse(KEYS.prospects,   []),
    canvassStops: parse(KEYS.canvass,    []),
    dbRecords:   parse(KEYS.dbRecords,   []),
    dbClusters:  parse(KEYS.dbClusters,  []),
    dbAreas:     parse(KEYS.dbAreas,     []),
    dbBlocklist: parse(KEYS.dbBlocklist, []),
  }
}

// Per-field timestamps for deterministic merge
function stampTimestamps(current, previous, now) {
  const prevMap = new Map(previous.map(r => [r.id, r]))
  current.forEach(record => {
    if (!record._ts) record._ts = {}
    const prev = prevMap.get(record.id)
    if (!prev) {
      Object.keys(record).forEach(k => { if (k !== '_ts') record._ts[k] = now })
    } else {
      Object.keys(record).forEach(k => { if (k !== '_ts' && record[k] !== prev[k]) record._ts[k] = now })
    }
  })
}

// Cache previous state to avoid re-parsing localStorage on every save.
// stampTimestamps needs the previous records to diff per-field timestamps;
// without this, each save does JSON.parse of the entire previous array.
let _prevProspects = null
let _prevCanvass = null

export function saveProspects(prospects) {
  const now = Date.now()
  const prev = _prevProspects || parse(KEYS.prospects, [])
  stampTimestamps(prospects, prev, now)
  localStorage.setItem(KEYS.prospects, JSON.stringify(prospects))
  _prevProspects = prospects
}

export function saveCanvass(canvassStops) {
  const now = Date.now()
  const prev = _prevCanvass || parse(KEYS.canvass, [])
  stampTimestamps(canvassStops, prev, now)
  localStorage.setItem(KEYS.canvass, JSON.stringify(canvassStops))
  _prevCanvass = canvassStops
}

export function saveDb({ dbRecords, dbClusters, dbAreas, dbBlocklist }) {
  if (dbRecords   !== undefined) localStorage.setItem(KEYS.dbRecords,   JSON.stringify(dbRecords))
  if (dbClusters  !== undefined) localStorage.setItem(KEYS.dbClusters,  JSON.stringify(dbClusters))
  if (dbAreas     !== undefined) localStorage.setItem(KEYS.dbAreas,     JSON.stringify(dbAreas))
  if (dbBlocklist !== undefined) localStorage.setItem(KEYS.dbBlocklist, JSON.stringify(dbBlocklist))
}

export function loadSnapshots() {
  return parse(KEYS.snapshots, [])
}

export function saveSnapshots(snapshots) {
  localStorage.setItem(KEYS.snapshots, JSON.stringify(snapshots))
}

export function loadFromFile(data) {
  if (!data || data.version !== 1) return null
  return {
    prospects:   Array.isArray(data.prospects)   ? data.prospects   : [],
    canvass:     Array.isArray(data.canvass)      ? data.canvass     : [],
    dbRecords:   Array.isArray(data.dbRecords)    ? data.dbRecords   : [],
    dbClusters:  Array.isArray(data.dbClusters)   ? data.dbClusters  : [],
    dbAreas:     Array.isArray(data.dbAreas)      ? data.dbAreas     : [],
    dbBlocklist: Array.isArray(data.dbBlocklist)  ? data.dbBlocklist : [],
    savedAt:     data.savedAt || null,
  }
}

export { KEYS }
