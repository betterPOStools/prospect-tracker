// Outscraper API integration — query submission, task polling, and row processing.
// Config/API key storage delegates to src/lib/storage.ts (settings.getOsCfg / getOsKey).

import { z } from 'zod'
import { calcScore, calcPriority } from './scoring'
import { isBlocklisted } from './blocklist'
import type { ProspectRecord } from '../types'

// ── Config ────────────────────────────────────────────────────────────────────

export interface OsConfig {
  categories: string
  autoImport: boolean
  zipBatchSize: number
  useEnrichments: boolean
  exactMatch: boolean
  minRating: number
  minReviews: number
  webhookUrl: string
  usePhoneEnricher: boolean
  useCompanyData: boolean
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const DEFAULT_WEBHOOK_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/outscraper-webhook`
  : ''

export const DEFAULT_OS_CONFIG: OsConfig = {
  categories: 'restaurant, bar and grill, seafood restaurant, pizza restaurant, brewery, bar, night club',
  autoImport: true,
  zipBatchSize: 10,
  useEnrichments: true,
  exactMatch: false,
  minRating: 0,
  minReviews: 0,
  webhookUrl: DEFAULT_WEBHOOK_URL,
  usePhoneEnricher: false,
  useCompanyData: false,
}

// Merges stored config with defaults so missing keys always have values.
export function withDefaults(stored: Partial<OsConfig>): OsConfig {
  return { ...DEFAULT_OS_CONFIG, ...stored }
}

// ── Task ID normalizer ────────────────────────────────────────────────────────
// API sometimes returns base64(userId + "," + taskId) instead of the raw task ID.

export function extractTaskId(id: string): string {
  if (!id) return id
  try {
    const decoded = atob(id)
    const comma = decoded.lastIndexOf(',')
    if (comma !== -1) {
      const candidate = decoded.slice(comma + 1)
      if (/^[a-z0-9]{10,}$/.test(candidate)) return candidate
    }
  } catch {
    // not base64 — return as-is
  }
  return id
}

// ── ZIP lookup via Zippopotam.us ──────────────────────────────────────────────

export async function lookupZips(city: string, stateAbbr: string): Promise<string[]> {
  const url = `https://api.zippopotam.us/us/${stateAbbr.toLowerCase()}/${encodeURIComponent(city.toLowerCase())}`
  let resp: Response
  try {
    resp = await fetch(url)
  } catch {
    throw new Error('Network error looking up ZIP codes. Check your connection.')
  }
  if (resp.status === 404) {
    throw new Error(`No ZIP codes found for "${city}, ${stateAbbr}". Check the spelling.`)
  }
  if (!resp.ok) {
    throw new Error(`ZIP lookup failed (HTTP ${resp.status}). Try again.`)
  }
  const data = await resp.json() as { places?: Array<{ 'post code'?: string }> }
  const places = data.places ?? []
  if (!places.length) {
    throw new Error(`No ZIP codes found for "${city}, ${stateAbbr}". Check the spelling.`)
  }
  return [...new Set(places.map((p) => p['post code']).filter((z): z is string => !!z))]
}

// ── Query builder ─────────────────────────────────────────────────────────────

export function buildQueries(zips: string[], city: string, state: string, categoriesString: string): string[] {
  const cats = categoriesString.split(',').map((c) => c.trim()).filter(Boolean)
  const queries: string[] = []
  zips.forEach((zip) => {
    cats.forEach((cat) => {
      queries.push(`${cat}, ${zip}, ${city}, ${state}, US`)
    })
  })
  return queries
}

// ── API: submit scrape ────────────────────────────────────────────────────────

export async function submitScrape(
  apiKey: string,
  title: string,
  queries: string[],
  cfg: Partial<OsConfig> = {},
): Promise<unknown> {
  const {
    useEnrichments, exactMatch, minRating, minReviews, webhookUrl,
    usePhoneEnricher, useCompanyData,
  } = withDefaults(cfg)

  const enrichmentList: string[] = useEnrichments
    ? ['contacts_n_leads', 'company_insights_service', 'emails_validator_service']
    : []
  if (usePhoneEnricher) enrichmentList.push('phones_enricher')
  if (useCompanyData)   enrichmentList.push('us_companies_data_enricher')

  const outputColumns = [
    'name', 'subtypes', 'category', 'phone', 'website', 'street', 'city', 'state',
    'state_code', 'postal_code', 'company_name', 'company_phone', 'company_linkedin',
    'company_facebook', 'company_instagram', 'company_x', 'company_youtube',
    'full_name', 'first_name', 'last_name', 'title', 'email',
    'email.emails_validator.status', 'contact_phone', 'contact_facebook',
    'contact_instagram', 'latitude', 'longitude', 'rating', 'reviews',
    'business_status', 'working_hours_csv_compatible', 'menu_link',
    'place_id', 'google_id', 'chain_info.chain',
  ]
  if (usePhoneEnricher) outputColumns.push('phone_enricher.carrier', 'phone_enricher.type')
  if (useCompanyData)   outputColumns.push('employees', 'annual_revenue', 'naics_code', 'naics_description')

  const filters: Array<Record<string, unknown>> = [
    { key: 'business_status', labelKey: 'title.operationalOnly', operator: 'equals', value: ['operational'] },
    { key: 'phone', labelKey: 'title.withPhone', operator: 'is not blank', value: null },
  ]
  if (minRating  > 0) filters.push({ key: 'rating',  operator: 'greater than or equals', value: minRating })
  if (minReviews > 0) filters.push({ key: 'reviews', operator: 'greater than or equals', value: minReviews })

  const payload: Record<string, unknown> = {
    service_name: 'google_maps_service_v2',
    title,
    queries,
    input_file: null,
    enrich: false,
    settings: { output_columns: outputColumns, output_extension: 'json' },
    tags: title.replace(/\s*[—-]\s*\d{4}-\d{2}-\d{2}.*$/, ''),
    enrichments: enrichmentList,
    categories: [],
    locations: [],
    language: 'en',
    region: 'US',
    limit: 500,
    organizationsPerQueryLimit: 500,
    filters,
    exactMatch,
    useZipCodes: true,
    dropDuplicates: true,
    dropEmailDuplicates: true,
    ignoreWithoutEmails: false,
    UISettings: { isCustomCategories: false, isCustomLocations: false, isCustomQueries: true },
    enrichments_kwargs: useEnrichments
      ? { contacts_n_leads: { contacts_per_company: 1, general_emails: false, preferred_contacts: ['decision makers'] } }
      : {},
    org: 'os',
  }
  if (webhookUrl) payload.webhook = webhookUrl

  const resp = await fetch('https://api.outscraper.cloud/tasks', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(`Outscraper API error: ${resp.status}`)
  return resp.json()
}

// ── API: task management ──────────────────────────────────────────────────────

export async function listTasks(apiKey: string): Promise<unknown> {
  const resp = await fetch('https://api.outscraper.cloud/tasks', {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!resp.ok) throw new Error(`Failed to list tasks: ${resp.status}`)
  return resp.json()
}

export async function getTaskConfig(apiKey: string, taskId: string): Promise<unknown> {
  const resp = await fetch(`https://api.outscraper.cloud/tasks/${taskId}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!resp.ok) throw new Error(`Task fetch error: ${resp.status}`)
  return resp.json()
}

export async function pollTask(apiKey: string, requestId: string): Promise<unknown> {
  const resp = await fetch(`https://api.outscraper.cloud/requests/${requestId}`, {
    headers: { 'X-API-KEY': apiKey },
  })
  if (!resp.ok) throw new Error(`Poll error: ${resp.status}`)
  return resp.json()
}

// ── Zod schema for raw Outscraper rows ────────────────────────────────────────

export const OutscraperRowSchema = z.object({
  name:                            z.string().optional(),
  subtypes:                        z.string().optional(),
  category:                        z.string().optional(),
  phone:                           z.union([z.string(), z.number()]).optional(),
  website:                         z.string().optional(),
  street:                          z.string().optional(),
  city:                            z.string().optional(),
  state:                           z.string().optional(),
  state_code:                      z.string().optional(),
  postal_code:                     z.union([z.string(), z.number()]).optional(),
  full_name:                       z.string().optional(),
  title:                           z.string().optional(),
  email:                           z.string().optional(),
  'email.emails_validator.status': z.string().optional(),
  latitude:                        z.union([z.string(), z.number()]).optional(),
  longitude:                       z.union([z.string(), z.number()]).optional(),
  rating:                          z.union([z.string(), z.number()]).optional(),
  reviews:                         z.union([z.string(), z.number()]).optional(),
  company_facebook:                z.string().optional(),
  company_instagram:               z.string().optional(),
  working_hours_csv_compatible:    z.string().optional(),
  menu_link:                       z.string().optional(),
  place_id:                        z.string().optional(),
  google_id:                       z.string().optional(),
  'chain_info.chain':              z.string().optional(),
  'phone_enricher.carrier':        z.string().optional(),
  'phone_enricher.type':           z.string().optional(),
  employees:                       z.union([z.string(), z.number()]).optional(),
  annual_revenue:                  z.string().optional(),
  naics_code:                      z.union([z.string(), z.number()]).optional(),
  naics_description:               z.string().optional(),
  // Allow CSV file import field names
  'Business Name':                 z.string().optional(),
  Address:                         z.string().optional(),
  City:                            z.string().optional(),
  ZIP:                             z.union([z.string(), z.number()]).optional(),
  Phone:                           z.union([z.string(), z.number()]).optional(),
  Website:                         z.string().optional(),
  Email:                           z.string().optional(),
  'Email Status':                  z.string().optional(),
  'Contact Name':                  z.string().optional(),
  'Contact Title':                 z.string().optional(),
  Facebook:                        z.string().optional(),
  Instagram:                       z.string().optional(),
  'Google Rating':                 z.union([z.string(), z.number()]).optional(),
  'Review Count':                  z.union([z.string(), z.number()]).optional(),
  'Is Chain':                      z.string().optional(),
  'Menu Link':                     z.string().optional(),
  'Lead Score':                    z.union([z.string(), z.number()]).optional(),
}).passthrough()

export type OutscraperRow = z.infer<typeof OutscraperRowSchema>

// ── Row processor ─────────────────────────────────────────────────────────────
//
// Shared by file import and API import.
// Returns allRecords (existing + new/updated), dbAreas, and counts.

export interface ProcessResult {
  allRecords: ProspectRecord[]
  dbAreas: string[]
  added: number
  updated: number
  dupes: number
  invalid: number
}

export function processOutscraperRows(
  rawRows: unknown[],
  area: string,
  existingRecords: ProspectRecord[],
  blocklist: string[],
  existingAreas: string[],
): ProcessResult {
  // Flatten arrays-of-arrays (Outscraper API returns one sub-array per query)
  let rows = rawRows.flat()
  if (rows.length > 0 && Array.isArray(rows[0])) {
    rows = (rows as unknown[][]).flat()
  }

  // Validate + filter rows — skip rows that don't match the schema
  let invalid = 0
  const validRows: OutscraperRow[] = []
  for (const row of rows) {
    const result = OutscraperRowSchema.safeParse(row)
    if (result.success) {
      validRows.push(result.data)
    } else {
      invalid++
    }
  }

  const existingById   = new Map(existingRecords.map((r) => [r.id, r]))
  const existingByName = new Map(existingRecords.map((r) => [`${r.name}|${r.zip ?? ''}`.toLowerCase(), r]))

  let added = 0, updated = 0, dupes = 0
  const newRecords: ProspectRecord[] = []
  const seenInImport = new Set<string>()
  const now = new Date().toISOString()

  for (const row of validRows) {
    const name = row.name ?? row['Business Name'] ?? ''
    if (!name) continue
    if (isBlocklisted(name, blocklist)) { dupes++; continue }

    const lat     = parseFloat(String(row.latitude  ?? row.lat ?? 0)) || undefined
    const lng     = parseFloat(String(row.longitude ?? row.lng ?? 0)) || undefined
    const zip     = String(row.postal_code ?? row.ZIP ?? '')
    const placeId = row.place_id ?? row.google_id ?? ''
    const dedupKey = placeId
      ? `pid_${placeId}`
      : `nm_${name.toLowerCase().replace(/\W/g, '')}_${zip}`

    if (seenInImport.has(dedupKey)) { dupes++; continue }
    seenInImport.add(dedupKey)

    const id = placeId
      ? `db_${placeId}`
      : `db_${name.replace(/\W/g, '_')}_${zip}`

    const street = row.street ?? ''
    const city   = row.city ?? row.City ?? ''
    const stCode = row.state_code ?? ''
    const address = row.Address
      ?? (street ? `${street}, ${city}, ${stCode} ${zip}`.trim() : '')

    const fresh: ProspectRecord = {
      id,
      name,
      type:               row.subtypes ?? row.category ?? undefined,
      address:            address || undefined,
      city:               city || undefined,
      zip:                zip || undefined,
      phone:              row.phone != null  ? String(row.phone)  : row.Phone != null ? String(row.Phone) : undefined,
      email:              row.email ?? row.Email ?? undefined,
      website:            row.website ?? row.Website ?? undefined,
      menu_link:          row.menu_link ?? row['Menu Link'] ?? undefined,
      lat:                lat && lat !== 0 ? lat : undefined,
      lng:                lng && lng !== 0 ? lng : undefined,
      rating:             parseFloat(String(row.rating ?? row['Google Rating'] ?? 0)) || undefined,
      reviews:            parseInt(String(row.reviews ?? row['Review Count'] ?? 0)) || undefined,
      is_chain:           row['chain_info.chain'] === 'True' || row['Is Chain'] === 'Yes',
      facebook:           row.company_facebook ?? row.Facebook ?? undefined,
      instagram:          row.company_instagram ?? row.Instagram ?? undefined,
      contact_name:       row.full_name ?? row['Contact Name'] ?? undefined,
      contact_title:      row.title ?? row['Contact Title'] ?? undefined,
      place_id:           placeId || undefined,
      phone_carrier:      row['phone_enricher.carrier'] ?? undefined,
      phone_type:         row['phone_enricher.type'] ?? undefined,
      employees:          row.employees != null ? String(row.employees) : undefined,
      revenue:            row.annual_revenue ?? undefined,
      naics_code:         row.naics_code != null ? String(row.naics_code) : undefined,
      naics_description:  row.naics_description ?? undefined,
      area,
      day:                undefined,
      group:              undefined,
      notes:              undefined,
      status:             'unworked',
      dropped_count:      0,
      score:              0,
      priority:           'Cold',
      created_at:         now,
      updated_at:         now,
    }

    const importedScore = parseInt(String(row['Lead Score'] ?? 0)) || 0
    fresh.score    = Math.max(calcScore(fresh), importedScore)
    fresh.priority = calcPriority(fresh.score)

    const existing = existingById.get(id) ?? existingByName.get(`${name}|${zip}`.toLowerCase())
    if (existing) {
      fresh.status        = existing.status
      fresh.day           = existing.day
      fresh.group         = existing.group
      fresh.notes         = existing.notes
      fresh.dropped_count = existing.dropped_count
      fresh.area          = existing.area ?? area
      fresh.created_at    = existing.created_at
      updated++
    } else {
      added++
    }

    newRecords.push(fresh)
  }

  const importedIds = new Set(newRecords.map((r) => r.id))
  const kept        = existingRecords.filter((r) => !importedIds.has(r.id))
  const allRecords  = [...kept, ...newRecords]
  const dbAreas     = [...new Set([...existingAreas, area])]

  return { allRecords, dbAreas, added, updated, dupes, invalid }
}
