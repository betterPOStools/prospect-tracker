// ── Tab navigation ──────────────────────────────────────────────────────────

export type TabId = 'leads' | 'canvass' | 'route' | 'database' | 'utilities'

// ── prospect.records ────────────────────────────────────────────────────────

export type RecordStatus = 'unworked' | 'in_canvass' | 'canvassed' | 'converted' | 'on_hold'
export type Priority = 'Fire' | 'Hot' | 'Warm' | 'Cold' | 'Dead'

export interface ProspectRecord {
  id: string
  name: string
  type?: string
  city?: string
  zip?: string
  phone?: string
  email?: string
  address?: string
  website?: string
  menu_link?: string
  score: number
  priority: Priority
  area?: string
  day?: string
  status: RecordStatus
  place_id?: string
  lat?: number
  lng?: number
  rating?: number
  reviews?: number
  is_chain: boolean
  facebook?: string
  instagram?: string
  contact_name?: string
  contact_title?: string
  working_hours?: Record<string, string>
  phone_carrier?: string
  phone_type?: string
  employees?: string
  revenue?: string
  naics_code?: string
  naics_description?: string
  group?: string
  notes?: string
  dropped_count: number
  created_at: string
  updated_at: string
}

// ── prospect.leads ──────────────────────────────────────────────────────────

export type LeadStatus = 'Open' | 'Won' | 'Lost' | 'Abandoned'

export interface Lead {
  id: string
  name: string
  status: LeadStatus
  phone?: string
  email?: string
  address?: string
  contact_name?: string
  contact_title?: string
  pos_type?: string
  website?: string
  menu_link?: string
  notes?: string
  follow_up?: string // YYYY-MM-DD
  last_contact?: string // ISO datetime
  record_id?: string
  copper_company_id?: number
  copper_person_id?: number
  copper_opportunity_id?: number
  activities?: Activity[]
  created_at: string
  updated_at: string
}

// ── prospect.canvass_stops ──────────────────────────────────────────────────

export type StopStatus =
  | 'queued'
  | 'not_visited'
  | 'come_back_later'
  | 'dm_unavailable'
  | 'canvassed'
  | 'converted'
  | 'dropped'

export interface CanvassStop {
  id: string
  name: string
  phone?: string
  address?: string
  status: StopStatus
  area?: string
  day?: string
  lat?: number
  lng?: number
  follow_up_date?: string
  last_contact?: string
  group?: string
  record_id?: string
  created_at: string
  updated_at: string
  activities?: Activity[]
}

// ── prospect.activities ─────────────────────────────────────────────────────

export type ActivityType = 'call' | 'sms' | 'note' | 'status_change'

export interface Activity {
  id: string
  stop_id?: string
  lead_id?: string
  type: ActivityType
  text?: string
  system: boolean
  created_at: string
}

// ── prospect.outscraper_tasks ───────────────────────────────────────────────

export type TaskStatus = 'pending' | 'completed' | 'failed' | 'expired'

export interface OutscraperTask {
  id: string
  task_id: string
  title?: string
  tags?: string
  status: TaskStatus
  record_count?: number
  config?: Record<string, unknown>
  created_at: string
  completed_at?: string
}

// ── Offline mutation queue ──────────────────────────────────────────────────

export type MutationOperation = 'insert' | 'update' | 'delete'

export interface PendingMutation {
  id: string
  table: string
  operation: MutationOperation
  record_id: string
  payload: Record<string, unknown>
  created_at: string
  attempts: number
}

// ── Navigation ──────────────────────────────────────────────────────────────

export type MapsApp = 'google' | 'waze'

// ── Scoring ─────────────────────────────────────────────────────────────────

export const PRIORITIES: Priority[] = ['Fire', 'Hot', 'Warm', 'Cold', 'Dead']

export const PRIORITY_COLOR: Record<Priority, string> = {
  Fire: '#ef4444',
  Hot: '#f97316',
  Warm: '#eab308',
  Cold: '#3b82f6',
  Dead: '#6b7280',
}

export const PRIORITY_EMOJI: Record<Priority, string> = {
  Fire: '🔥',
  Hot: '🥵',
  Warm: '☀️',
  Cold: '🥶',
  Dead: '☠️',
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const
export type Day = (typeof DAYS)[number]
