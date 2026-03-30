import type { ProspectRecord, Lead, CanvassStop, Activity, OutscraperTask, PendingMutation } from '../types'

// ── Cache keys ──────────────────────────────────────────────────────────────

const KEYS = {
  RECORDS: 'pt_records_cache',
  LEADS: 'pt_leads_cache',
  STOPS: 'pt_stops_cache',
  ACTIVITIES: 'pt_activities_cache',
  TASKS: 'pt_tasks_cache',
  CACHE_SYNCED_AT: 'pt_cache_synced_at',
  MUTATION_QUEUE: 'pt_mutation_queue',
  MIGRATION_COMPLETE: 'pt_migration_complete',
  // Settings (local-only)
  OS_KEY: 'vs_os_key',
  OS_CFG: 'vs_os_cfg',
  RXL_USER: 'vs_rxl_user',
  RXL_PASS: 'vs_rxl_pass',
  THEME: 'vs_theme',
  MAPS_APP: 'vs_maps_app',
  CU_KEY: 'vs_cu_key',
  CU_EMAIL: 'vs_cu_email',
  CU_PIPELINE: 'vs_cu_pipeline',
} as const

// ── Generic helpers ─────────────────────────────────────────────────────────

function getJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function setJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded — cache write fails silently; Supabase is authoritative
    console.warn('[storage] localStorage write failed for key:', key)
  }
}

// ── Cache read/write ────────────────────────────────────────────────────────

export const cache = {
  getRecords: () => getJson<ProspectRecord[]>(KEYS.RECORDS, []),
  setRecords: (v: ProspectRecord[]) => setJson(KEYS.RECORDS, v),

  getLeads: () => getJson<Lead[]>(KEYS.LEADS, []),
  setLeads: (v: Lead[]) => setJson(KEYS.LEADS, v),

  getStops: () => getJson<CanvassStop[]>(KEYS.STOPS, []),
  setStops: (v: CanvassStop[]) => setJson(KEYS.STOPS, v),

  getActivities: () => getJson<Activity[]>(KEYS.ACTIVITIES, []),
  setActivities: (v: Activity[]) => setJson(KEYS.ACTIVITIES, v),

  getTasks: () => getJson<OutscraperTask[]>(KEYS.TASKS, []),
  setTasks: (v: OutscraperTask[]) => setJson(KEYS.TASKS, v),

  getSyncedAt: () => localStorage.getItem(KEYS.CACHE_SYNCED_AT),
  setSyncedAt: (iso: string) => localStorage.setItem(KEYS.CACHE_SYNCED_AT, iso),

  isCacheFresh: (maxAgeMs = 15 * 60 * 1000): boolean => {
    const ts = localStorage.getItem(KEYS.CACHE_SYNCED_AT)
    if (!ts) return false
    return Date.now() - new Date(ts).getTime() < maxAgeMs
  },
}

// ── Mutation queue ──────────────────────────────────────────────────────────

export const mutationQueue = {
  get: () => getJson<PendingMutation[]>(KEYS.MUTATION_QUEUE, []),
  set: (v: PendingMutation[]) => setJson(KEYS.MUTATION_QUEUE, v),
  push: (m: PendingMutation) => {
    const q = mutationQueue.get()
    mutationQueue.set([...q, m])
  },
  remove: (id: string) => {
    mutationQueue.set(mutationQueue.get().filter((m) => m.id !== id))
  },
}

// ── Settings ────────────────────────────────────────────────────────────────

export const settings = {
  getOsKey: () => localStorage.getItem(KEYS.OS_KEY) ?? (import.meta.env.VITE_OUTSCRAPER_API_KEY as string | undefined) ?? '',
  setOsKey: (v: string) => localStorage.setItem(KEYS.OS_KEY, v),

  getOsCfg: () => getJson<Record<string, unknown>>(KEYS.OS_CFG, {}),
  setOsCfg: (v: Record<string, unknown>) => setJson(KEYS.OS_CFG, v),

  getRxlUser: () => localStorage.getItem(KEYS.RXL_USER) ?? '',
  setRxlUser: (v: string) => localStorage.setItem(KEYS.RXL_USER, v),

  getRxlPass: () => localStorage.getItem(KEYS.RXL_PASS) ?? '',
  setRxlPass: (v: string) => localStorage.setItem(KEYS.RXL_PASS, v),

  getTheme: () => (localStorage.getItem(KEYS.THEME) ?? 'light') as 'light' | 'dark',
  setTheme: (v: 'light' | 'dark') => localStorage.setItem(KEYS.THEME, v),

  getMapsApp: () => (localStorage.getItem(KEYS.MAPS_APP) ?? 'google') as 'google' | 'waze',
  setMapsApp: (v: 'google' | 'waze') => localStorage.setItem(KEYS.MAPS_APP, v),

  getCopperApiKey: () => localStorage.getItem(KEYS.CU_KEY) ?? (import.meta.env.VITE_COPPER_API_KEY as string | undefined) ?? '',
  setCopperApiKey: (v: string) => localStorage.setItem(KEYS.CU_KEY, v),

  getCopperEmail: () => localStorage.getItem(KEYS.CU_EMAIL) ?? '',
  setCopperEmail: (v: string) => localStorage.setItem(KEYS.CU_EMAIL, v),

  getCopperPipeline: () => getJson<{ pipeline_id: number; stage_id: number } | null>(KEYS.CU_PIPELINE, null),
  setCopperPipeline: (v: { pipeline_id: number; stage_id: number }) => setJson(KEYS.CU_PIPELINE, v),
}

// ── Migration flag ──────────────────────────────────────────────────────────

export const migration = {
  isComplete: () => localStorage.getItem(KEYS.MIGRATION_COMPLETE) === '1',
  markComplete: () => localStorage.setItem(KEYS.MIGRATION_COMPLETE, '1'),
  hasLegacyData: () => !!localStorage.getItem('vs_db'),
}
