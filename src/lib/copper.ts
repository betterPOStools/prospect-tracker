// ── Copper CRM one-way push adapter ─────────────────────────────────────────
// Single-file adapter — all Copper types stay local. Delete this file to remove.

import type { Lead, ProspectRecord } from '../types'
import { settings } from './storage'

// ── Types (Copper API shapes) ──────────────────────────────────────────────

export interface CopperCredentials {
  apiKey: string
  email: string
}

interface CopperAddress {
  street: string
  city: string
  state: string
  postal_code: string
}

interface CopperPhone {
  number: string
  category: string
}

interface CopperEmail {
  email: string
  category: string
}

interface CopperWebsite {
  url: string
  category: string
}

interface CopperCompanyPayload {
  name: string
  address?: CopperAddress
  phone_numbers?: CopperPhone[]
  details?: string
  websites?: CopperWebsite[]
  email_domain?: string
}

interface CopperPersonPayload {
  name: string
  company_id: number
  phone_numbers?: CopperPhone[]
  emails?: CopperEmail[]
  title?: string
}

interface CopperOpportunityPayload {
  name: string
  company_id: number
  primary_contact_id: number
  pipeline_id: number
  pipeline_stage_id: number
  status: string
  details?: string
}

export interface CopperPipelineStage {
  id: number
  name: string
  win_probability: number
}

export interface CopperPipeline {
  id: number
  name: string
  stages: CopperPipelineStage[]
}

export interface CopperPushResult {
  company_id: number
  person_id: number
  opportunity_id: number
}

// ── Error ───────────────────────────────────────────────────────────────────

export class CopperError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'CopperError'
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const BASE = 'https://api.copper.com/developer_api/v1'

function copperHeaders(creds: CopperCredentials): HeadersInit {
  return {
    'X-PW-AccessToken': creds.apiKey,
    'X-PW-Application': 'developer_api',
    'X-PW-UserEmail': creds.email,
    'Content-Type': 'application/json',
  }
}

async function copperFetch<T>(
  creds: CopperCredentials,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: copperHeaders(creds),
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new CopperError(resp.status, `Copper API ${resp.status}: ${text}`)
  }
  return resp.json() as Promise<T>
}

/** Best-effort parse "123 Main St, Myrtle Beach, SC 29577" → Copper address */
function parseAddress(raw: string): CopperAddress | undefined {
  if (!raw.trim()) return undefined
  const parts = raw.split(',').map((s) => s.trim())
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1].split(/\s+/)
    return {
      street: parts.slice(0, parts.length - 2).join(', '),
      city: parts[parts.length - 2],
      state: stateZip[0] ?? '',
      postal_code: stateZip[1] ?? '',
    }
  }
  // Can't parse — put everything in street
  return { street: raw, city: '', state: '', postal_code: '' }
}

function mapCopperStatus(status: string): string {
  if (status === 'Won') return 'Won'
  if (status === 'Lost') return 'Lost'
  return 'Open'
}

// ── Config check ────────────────────────────────────────────────────────────

export function isCopperConfigured(): boolean {
  return !!(settings.getCopperApiKey() && settings.getCopperEmail())
}

// ── API functions ───────────────────────────────────────────────────────────

export async function fetchPipelines(creds: CopperCredentials): Promise<CopperPipeline[]> {
  return copperFetch<CopperPipeline[]>(creds, '/pipelines')
}

async function createCompany(
  creds: CopperCredentials,
  lead: Lead,
  record?: ProspectRecord,
): Promise<number> {
  const payload: CopperCompanyPayload = { name: lead.name }

  if (lead.address) payload.address = parseAddress(lead.address)
  if (lead.phone) payload.phone_numbers = [{ number: lead.phone, category: 'work' }]
  if (lead.notes) payload.details = lead.notes
  const ws = lead.website || record?.website
  if (ws) payload.websites = [{ url: ws, category: 'work' }]
  const em = lead.email || record?.email
  if (em) {
    const domain = em.split('@')[1]
    if (domain) payload.email_domain = domain
  }

  const result = await copperFetch<{ id: number }>(creds, '/companies', {
    method: 'POST',
    body: payload,
  })
  return result.id
}

async function createPerson(
  creds: CopperCredentials,
  lead: Lead,
  record: ProspectRecord | undefined,
  companyId: number,
): Promise<number> {
  const contactName = lead.contact_name || record?.contact_name || lead.name
  const payload: CopperPersonPayload = {
    name: contactName,
    company_id: companyId,
  }

  if (lead.phone) payload.phone_numbers = [{ number: lead.phone, category: 'work' }]
  const personEmail = lead.email || record?.email
  if (personEmail) payload.emails = [{ email: personEmail, category: 'work' }]
  const title = lead.contact_title || record?.contact_title
  if (title) payload.title = title

  const result = await copperFetch<{ id: number }>(creds, '/people', {
    method: 'POST',
    body: payload,
  })
  return result.id
}

async function createOpportunity(
  creds: CopperCredentials,
  lead: Lead,
  companyId: number,
  personId: number,
  pipelineId: number,
  stageId: number,
): Promise<number> {
  const payload: CopperOpportunityPayload = {
    name: `${lead.name} — POS Deal`,
    company_id: companyId,
    primary_contact_id: personId,
    pipeline_id: pipelineId,
    pipeline_stage_id: stageId,
    status: mapCopperStatus(lead.status),
  }

  if (lead.notes) payload.details = lead.notes

  const result = await copperFetch<{ id: number }>(creds, '/opportunities', {
    method: 'POST',
    body: payload,
  })
  return result.id
}

// ── Verification ────────────────────────────────────────────────────────────

async function verifyCompany(creds: CopperCredentials, id: number): Promise<void> {
  const company = await copperFetch<{ id: number; name: string }>(creds, `/companies/${id}`)
  if (!company?.id) throw new CopperError(0, `Company ${id} not found after creation`)
}

async function verifyPerson(creds: CopperCredentials, id: number, expectedCompanyId: number): Promise<void> {
  const person = await copperFetch<{ id: number; company_id: number }>(creds, `/people/${id}`)
  if (!person?.id) throw new CopperError(0, `Person ${id} not found after creation`)
  if (person.company_id !== expectedCompanyId) {
    throw new CopperError(0, `Person ${id} linked to company ${person.company_id}, expected ${expectedCompanyId}`)
  }
}

async function verifyOpportunity(
  creds: CopperCredentials,
  id: number,
  expectedCompanyId: number,
  expectedPersonId: number,
): Promise<void> {
  const opp = await copperFetch<{ id: number; company_id: number; primary_contact_id: number }>(
    creds,
    `/opportunities/${id}`,
  )
  if (!opp?.id) throw new CopperError(0, `Opportunity ${id} not found after creation`)
  if (opp.company_id !== expectedCompanyId) {
    throw new CopperError(0, `Opportunity linked to company ${opp.company_id}, expected ${expectedCompanyId}`)
  }
  if (opp.primary_contact_id !== expectedPersonId) {
    throw new CopperError(0, `Opportunity linked to person ${opp.primary_contact_id}, expected ${expectedPersonId}`)
  }
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export async function pushLeadToCopper(
  creds: CopperCredentials,
  lead: Lead,
  record: ProspectRecord | undefined,
  pipelineId: number,
  stageId: number,
): Promise<CopperPushResult> {
  // Step 1: Company
  const companyId = lead.copper_company_id ?? (await createCompany(creds, lead, record))
  await verifyCompany(creds, companyId)

  // Step 2: Person (linked to company)
  const personId = lead.copper_person_id ?? (await createPerson(creds, lead, record, companyId))
  await verifyPerson(creds, personId, companyId)

  // Step 3: Opportunity (linked to company + person)
  const opportunityId =
    lead.copper_opportunity_id ??
    (await createOpportunity(creds, lead, companyId, personId, pipelineId, stageId))
  await verifyOpportunity(creds, opportunityId, companyId, personId)

  return {
    company_id: companyId,
    person_id: personId,
    opportunity_id: opportunityId,
  }
}
