export const CANVASS_ACTIVE = [
  'Not visited yet',
  'No answer / closed',
  'Not interested',
  'Come back later',
  'Decision maker unavailable',
]

export const FOLLOWUP_STATUSES  = ['Come back later', 'Decision maker unavailable']
export const ARCHIVED_STATUSES  = ['Converted', 'Not interested']

// Maps canvass status → DB record status
export const CANVASS_TO_DB_STATUS = {
  'Converted':          'converted',
  'Not interested':     'canvassed',
  'No answer / closed': 'canvassed',
}
