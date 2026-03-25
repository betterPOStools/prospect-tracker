export const CANVASS_ACTIVE = [
  'Not visited yet',
  'No answer / closed',
  'Not interested',
  'Come back later',
  'Decision maker unavailable',
  'Dropped folder',
]

export const FOLLOWUP_STATUSES  = ['Come back later', 'Decision maker unavailable']
export const COMPLETED_STATUSES = ['Converted', 'Not interested']

export const REMOVAL_STATUSES = [
  'Permanently closed',
  'Incorrect address',
  'Duplicate',
  'Wrong business type',
  'Already a customer',
]

// Removal statuses that should also add the business name to the blocklist
export const BLOCKLIST_ON_REMOVAL = ['Permanently closed', 'Wrong business type']

// Maps canvass status → DB record status
export const CANVASS_TO_DB_STATUS = {
  'Converted':          'converted',
  'Not interested':     'canvassed',
  'No answer / closed': 'canvassed',
  'Dropped folder':     'canvassed',
}
