// Daily canvass log — accumulates End Day summaries in localStorage.
// Local-only, not synced to Supabase.

const CANVASS_LOG_KEY = 'vs_canvass_log'
const MAX_ENTRIES = 90

export interface DaySummary {
  date: string // YYYY-MM-DD
  total: number
  notVis: number
  noAns: number
  cbl: number
  dmu: number
  notInt: number
  converted: number
}

export function loadCanvassLog(): DaySummary[] {
  try {
    const raw = localStorage.getItem(CANVASS_LOG_KEY)
    return raw ? (JSON.parse(raw) as DaySummary[]) : []
  } catch {
    return []
  }
}

export function appendDaySummary(entry: Omit<DaySummary, 'date'> & { date: string | Date }): DaySummary[] {
  const log = loadCanvassLog()

  const dateStr =
    typeof entry.date === 'string' && entry.date.includes('-')
      ? entry.date
      : new Date(entry.date).toISOString().slice(0, 10)

  const record: DaySummary = { ...entry, date: dateStr }

  const idx = log.findIndex((e) => e.date === dateStr)
  if (idx >= 0) log[idx] = record
  else log.push(record)

  log.sort((a, b) => a.date.localeCompare(b.date))
  while (log.length > MAX_ENTRIES) log.shift()

  localStorage.setItem(CANVASS_LOG_KEY, JSON.stringify(log))
  return log
}
