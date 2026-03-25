export function uid() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 6)
}

export function getRouteProvider() {
  try { return JSON.parse(localStorage.getItem('vs_settings') || '{}').routeProvider || 'google' } catch { return 'google' }
}

export function navUrl(addr) {
  const p = getRouteProvider()
  if (p === 'waze') return `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
}

export const POS_OPTIONS = [
  'Toast',
  'Square for Restaurants',
  'Clover',
  'Lightspeed',
  'TouchBistro',
  'Revel Systems',
  'Aloha (NCR)',
  'Micros (Oracle)',
  'Heartland',
  'SpotOn',
  'Shift4 (Harbortouch)',
  'PAX',
  'None / Unknown',
]

// Returns { label, isOpen } for hours chip display
export function hoursChip(openTime, closeTime) {
  if (!openTime && !closeTime) return null
  const label = (openTime || '?') + ' – ' + (closeTime || '?')
  const isOpen = isOpenNow(openTime, closeTime)
  return { label, isOpen }
}

function parseTime(t) {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i)
  if (!m) return null
  let h = parseInt(m[1]), min = parseInt(m[2])
  const mer = (m[3] || '').toLowerCase()
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  return h * 60 + min
}

// Parse Outscraper working_hours_csv_compatible → { openTime, closeTime } for today
// Format: "Monday: 11:00 AM - 10:00 PM | Tuesday: 9:00 AM - 11:00 PM | ..."
export function parseWorkingHours(hrCsv) {
  if (!hrCsv) return { openTime: '', closeTime: '' }
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
  const parts = hrCsv.split('|').map(s => s.trim())
  const today = parts.find(p => p.startsWith(dayName + ':'))
  if (!today) return { openTime: '', closeTime: '' }
  const range = today.slice(today.indexOf(':') + 1).trim()
  if (/closed/i.test(range)) return { openTime: '', closeTime: '' }
  const m = range.match(/^([\d:]+\s*[APap][Mm]?)\s*[-–]\s*([\d:]+\s*[APap][Mm]?)$/)
  if (!m) return { openTime: '', closeTime: '' }
  const to24 = (s) => {
    const p = s.trim().match(/^(\d{1,2}):(\d{2})\s*([APap][Mm]?)$/i)
    if (!p) return ''
    let h = parseInt(p[1]), min = p[2]
    const mer = (p[3] || '').toUpperCase()
    if (mer === 'PM' && h < 12) h += 12
    if (mer === 'AM' && h === 12) h = 0
    return String(h).padStart(2, '0') + ':' + min
  }
  return { openTime: to24(m[1]), closeTime: to24(m[2]) }
}

function isOpenNow(openTime, closeTime) {
  const open = parseTime(openTime)
  const close = parseTime(closeTime)
  if (open === null || close === null) return null
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  if (close < open) return cur >= open || cur < close
  return cur >= open && cur < close
}
