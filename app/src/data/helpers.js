export function uid() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 6)
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

function isOpenNow(openTime, closeTime) {
  const open = parseTime(openTime)
  const close = parseTime(closeTime)
  if (open === null || close === null) return null
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  if (close < open) return cur >= open || cur < close
  return cur >= open && cur < close
}
