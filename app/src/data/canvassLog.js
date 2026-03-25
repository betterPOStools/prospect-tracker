// Daily canvass log — accumulates End Day summaries in localStorage (local-only, not synced)

const CANVASS_LOG_KEY = 'vs_canvass_log'
const MAX_ENTRIES = 90

export function loadCanvassLog() {
  try {
    const raw = localStorage.getItem(CANVASS_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function appendDaySummary({ date, total, notVis, noAns, cbl, dmu, notInt, converted }) {
  const log = loadCanvassLog()

  // Format date as YYYY-MM-DD if not already
  const d = typeof date === 'string' && date.includes('-') ? date
    : new Date(date).toISOString().slice(0, 10)

  const entry = { date: d, total, notVis, noAns, cbl, dmu, notInt, converted }

  // Dedupe: update existing entry for same date
  const idx = log.findIndex(e => e.date === d)
  if (idx >= 0) log[idx] = entry
  else log.push(entry)

  // Sort by date, trim oldest
  log.sort((a, b) => a.date.localeCompare(b.date))
  while (log.length > MAX_ENTRIES) log.shift()

  localStorage.setItem(CANVASS_LOG_KEY, JSON.stringify(log))
  return log
}
