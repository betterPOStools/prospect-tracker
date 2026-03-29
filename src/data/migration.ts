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

export function migrateLegacyRecords(): ProspectRecord[] {
  const legacy = parseJson<LegacyRecord>('vs_db')
  if (!legacy.length) return []

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

export function migrateLegacyStops(): CanvassStop[] {
  const legacy = parseJson<LegacyStop>('vs_c1')
  if (!legacy.length) return []

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

// ── Lead migration ────────────────────────────────────────────────────────────

export function migrateLegacyLeads(): Lead[] {
  const legacy = parseJson<LegacyLead>('vs_p3')
  if (!legacy.length) return []

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
