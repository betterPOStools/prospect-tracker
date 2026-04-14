// Derive behavioral signals for a Prospect Tracker record by joining against
// its canvass-stop history. Pure function — no side effects, no I/O.
//
// The AI prioritization layer uses these signals. See
// docs/adr/ADR-001-ai-prioritization-layer.md for why we derive at call-time
// rather than persist fields on the Record schema.

const OVERDUE_STATUSES = new Set(['Come back later', 'Decision maker unavailable'])
const OVERDUE_THRESHOLD_DAYS = 7
const MAX_RECENT_NOTES = 2
const NOTE_TRUNCATE_CHARS = 200
const MS_PER_DAY = 86_400_000

/**
 * @param {{id:string}} record
 * @param {Array<{fromDb?:string, lastContact?:string, status?:string, notesLog?:Array}>} stops
 * @param {Date} [now] — injected for determinism in tests
 * @returns {{lastContact:(string|null), touchCount:number, daysSinceContact:(number|null), isOverdue:boolean, recentNotes:Array<{ts:string,text:string}>}}
 */
export function deriveSignals(record, stops, now = new Date()) {
  const related = (stops || []).filter(s => s && s.fromDb === record.id)
  if (related.length === 0) {
    return { lastContact: null, touchCount: 0, daysSinceContact: null, isOverdue: false, recentNotes: [] }
  }

  const lastContact = pickLastContact(related)
  const touchCount = related.reduce((acc, s) => acc + countHumanTouches(s), 0)
  const daysSinceContact = lastContact ? diffInDays(now, new Date(lastContact)) : null
  const isOverdue = related.some(s => isStopOverdue(s, now))
  const recentNotes = pickRecentNotes(related)

  return { lastContact, touchCount, daysSinceContact, isOverdue, recentNotes }
}

function pickLastContact(stops) {
  let latest = null
  stops.forEach(s => {
    if (s.lastContact && (!latest || s.lastContact > latest)) latest = s.lastContact
  })
  return latest
}

// BUSINESS RULE: system-generated notes (e.g. "Contact: Jane Doe") don't count
// as human touches — only notes the rep typed themselves.
function countHumanTouches(stop) {
  const log = stop.notesLog || []
  return log.filter(n => n && !n.system).length
}

function isStopOverdue(stop, now) {
  if (!OVERDUE_STATUSES.has(stop.status)) return false
  if (!stop.lastContact) return false
  return diffInDays(now, new Date(stop.lastContact)) >= OVERDUE_THRESHOLD_DAYS
}

function pickRecentNotes(stops) {
  const notes = []
  stops.forEach(s => (s.notesLog || []).forEach(n => {
    if (!n || n.system || !n.text) return
    notes.push({ ts: n.ts, text: String(n.text).slice(0, NOTE_TRUNCATE_CHARS) })
  }))
  notes.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  return notes.slice(0, MAX_RECENT_NOTES)
}

function diffInDays(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY)
}
