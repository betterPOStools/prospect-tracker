// One-time migration from old localStorage schema (abbreviated field names)
// to the new normalized schema (full field names) ready for Supabase insert.
//
// Old keys:
//   vs_db   — stringified ProspectRecord[] with abbreviated fields (n, ty, a, ci, zi, …)
//   vs_c1   — stringified CanvassStop[]  (old format)
//   vs_p3   — stringified Lead[] (old format)
//
// After migration completes, the flag in storage.ts (migration.markComplete) is set
// so this never runs again.

import { calcScore, calcPriority } from './scoring'
import type { ProspectRecord, Lead, CanvassStop } from '../types'

// ── Field-name maps ───────────────────────────────────────────────────────────

// Old abbreviated ProspectRecord shape
interface LegacyRecord {
  id?: string
  n?:   string   // name
  ty?:  string   // type
  a?:   string   // address
  ci?:  string   // city
  zi?:  string   // zip
  ph?:  string   // phone
  em?:  string   // email
  web?: string   // website
  mn?:  string   // menu_link
  lt?:  number   // lat
  lg?:  number   // lng
  rt?:  number   // rating
  rv?:  number   // reviews
  ch?:  boolean  // is_chain
  fb?:  string   // facebook
  ig?:  string   // instagram
  cn?:  string   // contact_name
  ct?:  string   // contact_title
  hr?:  string   // working_hours (CSV string in old format)
  pi?:  string   // place_id
  pc?:  string   // phone_carrier
  pt?:  string   // phone_type
  emp?: number   // employees
  rev?: string   // revenue
  nai?: string   // naics_code
  nad?: string   // naics_description
  ar?:  string   // area
  da?:  string   // day
  grp?: string   // group
  sc?:  number   // score
  pr?:  string   // priority
  df?:  number   // dropped_count
  st?:  string   // status
  no?:  string   // notes
  created_at?: string
  updated_at?: string
}

interface LegacyStop {
  id?: string
  n?:   string   // name
  ph?:  string   // phone
  a?:   string   // address
  st?:  string   // status
  ar?:  string   // area
  da?:  string   // day
  fup?: string   // follow_up_date
  lc?:  string   // last_contact
  grp?: string   // group
  rid?: string   // record_id
  created_at?: string
  updated_at?: string
}

interface LegacyLead {
  id?: string
  n?:   string   // name
  st?:  string   // status
  ph?:  string   // phone
  a?:   string   // address
  pos?: string   // pos_type
  no?:  string   // notes
  fup?: string   // follow_up
  lc?:  string   // last_contact
  rid?: string   // record_id
  created_at?: string
  updated_at?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

const now = () => new Date().toISOString()

// ── Record migration ──────────────────────────────────────────────────────────

export function isLegacyRecord(r: unknown): r is LegacyRecord {
  if (!r || typeof r !== 'object') return false
  const obj = r as Record<string, unknown>
  // Legacy records use abbreviated keys; new records use full names
  return 'n' in obj && !('name' in obj)
}

export function migrateLegacyRecords(): ProspectRecord[] {
  return migrateLegacyRecordsFromData(parseJson<LegacyRecord>('vs_db'))
}

export function migrateLegacyRecordsFromData(legacy: LegacyRecord[]): ProspectRecord[] {
  return legacy.map((r): ProspectRecord => {
    const partial: Partial<ProspectRecord> = {
      id:               r.id ?? `migrated_${Math.random().toString(36).slice(2)}`,
      name:             r.n ?? '',
      type:             r.ty ?? undefined,
      address:          r.a ?? undefined,
      city:             r.ci ?? undefined,
      zip:              r.zi ?? undefined,
      phone:            r.ph ?? undefined,
      email:            r.em ?? undefined,
      website:          r.web ?? undefined,
      menu_link:        r.mn ?? undefined,
      lat:              r.lt ?? undefined,
      lng:              r.lg ?? undefined,
      rating:           r.rt ?? undefined,
      reviews:          r.rv ?? undefined,
      is_chain:         r.ch ?? false,
      facebook:         r.fb ?? undefined,
      instagram:        r.ig ?? undefined,
      contact_name:     r.cn ?? undefined,
      contact_title:    r.ct ?? undefined,
      place_id:         r.pi ?? undefined,
      phone_carrier:    r.pc ?? undefined,
      phone_type:       r.pt ?? undefined,
      employees:        r.emp != null ? String(r.emp) : undefined,
      revenue:          r.rev ?? undefined,
      naics_code:       r.nai ?? undefined,
      naics_description: r.nad ?? undefined,
      area:             r.ar ?? undefined,
      day:              r.da ?? undefined,
      group:            r.grp ?? undefined,
      notes:            r.no ?? undefined,
      dropped_count:    r.df ?? 0,
      status:           (r.st as ProspectRecord['status']) ?? 'unworked',
      score:            0,
      priority:         'Cold',
      created_at:       r.created_at ?? now(),
      updated_at:       r.updated_at ?? now(),
    }

    partial.score    = r.sc ?? calcScore(partial)
    partial.priority = r.pr
      ? (r.pr as ProspectRecord['priority'])
      : calcPriority(partial.score!)

    return partial as ProspectRecord
  }).filter((r) => r.name)
}

// ── Stop migration ────────────────────────────────────────────────────────────

export function migrateLegacyStopsFromData(legacy: LegacyStop[]): CanvassStop[] {
  return legacy.map((s): CanvassStop => ({
    id:            s.id ?? `migrated_stop_${Math.random().toString(36).slice(2)}`,
    name:          s.n ?? '',
    phone:         s.ph ?? undefined,
    address:       s.a ?? undefined,
    status:        (s.st as CanvassStop['status']) ?? 'queued',
    area:          s.ar ?? undefined,
    day:           s.da ?? undefined,
    follow_up_date: s.fup ?? undefined,
    last_contact:  s.lc ?? undefined,
    group:         s.grp ?? undefined,
    record_id:     s.rid ?? undefined,
    created_at:    s.created_at ?? now(),
    updated_at:    s.updated_at ?? now(),
  })).filter((s) => s.name)
}

export function migrateLegacyStops(): CanvassStop[] {
  return migrateLegacyStopsFromData(parseJson<LegacyStop>('vs_c1'))
}

// ── Lead migration ────────────────────────────────────────────────────────────

export function migrateLegacyLeadsFromData(legacy: LegacyLead[]): Lead[] {
  return legacy.map((l): Lead => ({
    id:           l.id ?? `migrated_lead_${Math.random().toString(36).slice(2)}`,
    name:         l.n ?? '',
    status:       (l.st as Lead['status']) ?? 'Open',
    phone:        l.ph ?? undefined,
    address:      l.a ?? undefined,
    pos_type:     l.pos ?? undefined,
    notes:        l.no ?? undefined,
    follow_up:    l.fup ?? undefined,
    last_contact: l.lc ?? undefined,
    record_id:    l.rid ?? undefined,
    created_at:   l.created_at ?? now(),
    updated_at:   l.updated_at ?? now(),
  })).filter((l) => l.name)
}

export function migrateLegacyLeads(): Lead[] {
  return migrateLegacyLeadsFromData(parseJson<LegacyLead>('vs_p3'))
}

// ── Full migration bundle ─────────────────────────────────────────────────────

export interface MigrationBundle {
  records: ProspectRecord[]
  stops: CanvassStop[]
  leads: Lead[]
}

export function runMigration(): MigrationBundle {
  return {
    records: migrateLegacyRecords(),
    stops:   migrateLegacyStops(),
    leads:   migrateLegacyLeads(),
  }
}

// ── V1 backup format importer ─────────────────────────────────────────────────
// Handles the { version:1, prospects, canvass, dbRecords, dbAreas, dbBlocklist } shape.

interface V1Canvass {
  id: string
  name: string
  phone?: string
  addr?: string
  lat?: number
  lng?: number
  status?: string
  followUp?: string
  lastContact?: string
  fromDb?: string
  notes?: string
  notesLog?: Array<{ ts: string; text: string; type: string }>
  added?: string
}

interface V1Prospect {
  id: string
  name: string
  status?: string
  phone?: string
  addr?: string
  city?: string
  current?: string
  notes?: string
  added?: string
}

function parseDate(val: string | undefined): string {
  if (!val) return now()
  // Already ISO
  if (val.includes('T')) return val
  // MM/DD/YYYY
  const parts = val.split('/')
  if (parts.length === 3) {
    const [m, d, y] = parts
    return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`).toISOString()
  }
  return now()
}

function mapV1StopStatus(s: string | undefined): CanvassStop['status'] {
  switch (s) {
    case 'Converted':       return 'converted'
    case 'Not visited yet': return 'not_visited'
    case 'Come back later': return 'come_back_later'
    case 'DM unavailable':  return 'dm_unavailable'
    case 'Canvassed':       return 'canvassed'
    case 'Dropped':
    case 'Duplicate':       return 'dropped'
    default:                return 'queued'
  }
}

export function migrateV1File(obj: Record<string, unknown>): MigrationBundle {
  const records = migrateLegacyRecordsFromData(
    (obj['dbRecords'] as LegacyRecord[] | undefined) ?? []
  )

  const stops: CanvassStop[] = ((obj['canvass'] as V1Canvass[] | undefined) ?? []).map((c) => {
    const notesText = c.notesLog?.map((e) => e.text).filter(Boolean).join('\n') ?? c.notes ?? ''
    return {
      id:             c.id,
      name:           c.name,
      phone:          c.phone || undefined,
      address:        c.addr || undefined,
      lat:            c.lat ?? undefined,
      lng:            c.lng ?? undefined,
      status:         mapV1StopStatus(c.status),
      follow_up_date: c.followUp || undefined,
      last_contact:   c.lastContact || undefined,
      record_id:      c.fromDb || undefined,
      notes:          notesText || undefined,
      area:           undefined,
      day:            undefined,
      group:          undefined,
      created_at:     parseDate(c.added),
      updated_at:     c.lastContact ?? parseDate(c.added),
    }
  }).filter((s) => s.name)

  const leads: Lead[] = ((obj['prospects'] as V1Prospect[] | undefined) ?? []).map((p) => ({
    id:           p.id,
    name:         p.name,
    status:       (p.status as Lead['status']) ?? 'Open',
    phone:        p.phone || undefined,
    address:      [p.addr, p.city].filter(Boolean).join(', ') || undefined,
    pos_type:     p.current || undefined,
    notes:        p.notes || undefined,
    follow_up:    undefined,
    last_contact: undefined,
    record_id:    undefined,
    created_at:   parseDate(p.added),
    updated_at:   parseDate(p.added),
  })).filter((l) => l.name)

  return { records, stops, leads }
}

// ── File-based legacy import ──────────────────────────────────────────────────
// Accepts a parsed JSON backup from the old app and converts it to the new schema.
// Handles several possible export shapes from the legacy app.

export function migrateLegacyFile(raw: unknown): MigrationBundle {
  if (!raw || typeof raw !== 'object') return { records: [], stops: [], leads: [] }

  const obj = raw as Record<string, unknown>

  // V1 backup: { version: 1, prospects, canvass, dbRecords, ... }
  if (obj['version'] === 1 && Array.isArray(obj['dbRecords'])) {
    return migrateV1File(obj)
  }

  // Shape 1: { vs_db: "...", vs_c1: "...", vs_p3: "..." } (localStorage dump)
  if (typeof obj['vs_db'] === 'string') {
    try {
      const records = JSON.parse(obj['vs_db'] as string) as LegacyRecord[]
      const stops   = typeof obj['vs_c1'] === 'string' ? JSON.parse(obj['vs_c1'] as string) as LegacyStop[] : []
      const leads   = typeof obj['vs_p3'] === 'string' ? JSON.parse(obj['vs_p3'] as string) as LegacyLead[] : []
      return {
        records: migrateLegacyRecordsFromData(records),
        stops:   migrateLegacyStopsFromData(stops),
        leads:   migrateLegacyLeadsFromData(leads),
      }
    } catch { /* fall through */ }
  }

  // Shape 2: bare array of legacy records
  if (Array.isArray(raw) && raw.length > 0 && isLegacyRecord(raw[0])) {
    return {
      records: migrateLegacyRecordsFromData(raw as LegacyRecord[]),
      stops: [],
      leads: [],
    }
  }

  // Shape 3: { records: LegacyRecord[], leads?: [...], stops?: [...] }
  const recordsRaw = Array.isArray(obj['records']) ? obj['records'] : []
  const leadsRaw   = Array.isArray(obj['leads'])   ? obj['leads']   : []
  const stopsRaw   = Array.isArray(obj['stops'])   ? obj['stops']   : []

  if (recordsRaw.length > 0 && isLegacyRecord(recordsRaw[0])) {
    return {
      records: migrateLegacyRecordsFromData(recordsRaw as LegacyRecord[]),
      stops:   migrateLegacyStopsFromData(stopsRaw as LegacyStop[]),
      leads:   migrateLegacyLeadsFromData(leadsRaw as LegacyLead[]),
    }
  }

  return { records: [], stops: [], leads: [] }
}
