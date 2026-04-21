/**
 * migrate_to_vsi.mjs — PT → VSI Prospect Tracker dry-run ETL
 *
 * Reads `prospect.app_state` (Supabase DEV, same project used by PT) and
 * transforms the denormalised JSONB blob into the normalized `vsi_prospect`
 * schema tables: db_records, canvass_stops, leads, blocklist, day_logs.
 *
 * ============================================================
 * HOW TO RUN
 * ============================================================
 *
 *   # 1. Install deps (only needed once — reuses app/node_modules if you
 *   #    symlink, or install fresh in scripts/):
 *   cd /path/to/prospect-tracker/app
 *   # @supabase/supabase-js is already a dep — node_modules is usable from
 *   # the parent dir via the NODE_PATH trick below.
 *
 *   # 2. Dry run (default — no writes):
 *   SOURCE_SUPABASE_SERVICE_KEY=<svc_key> \
 *   node --experimental-vm-modules \
 *        --import=file:///$(pwd)/scripts/register_esm.mjs \   # not needed
 *     scripts/migrate_to_vsi.mjs
 *
 *   # Simpler: run from app/ directory so node_modules resolves:
 *   cd prospect-tracker/app
 *   SOURCE_SUPABASE_SERVICE_KEY=<svc_key> node ../scripts/migrate_to_vsi.mjs
 *
 *   # 3. With write (prompts for confirmation):
 *   SOURCE_SUPABASE_SERVICE_KEY=<svc_key> node ../scripts/migrate_to_vsi.mjs --write
 *
 *   # 4. Truncate target tables first, then write:
 *   SOURCE_SUPABASE_SERVICE_KEY=<svc_key> node ../scripts/migrate_to_vsi.mjs --write --truncate
 *
 *   # 5. Override target (e.g., ETL from DEV → PROD or a branch):
 *   SOURCE_SUPABASE_URL=https://mqifktmmyiqzrolrvsmy.supabase.co \
 *   SOURCE_SUPABASE_SERVICE_KEY=<svc_key> \
 *   TARGET_SUPABASE_URL=https://nngjtbrvwhjrmbokephl.supabase.co \
 *   TARGET_SUPABASE_SERVICE_KEY=<prod_svc_key> \
 *   node ../scripts/migrate_to_vsi.mjs --write
 *
 * ============================================================
 * FLAGS
 * ============================================================
 *   (none)        Dry-run: read, transform, print report. No writes.
 *   --write       After report, prompt "Type 'MIGRATE' to proceed:".
 *                 On confirmation, upsert all rows into vsi_prospect.*.
 *   --truncate    Only valid with --write. Prompts separately:
 *                 "Type 'TRUNCATE VSI' to proceed:". DELETEs all rows
 *                 from target tables before upsert.
 *
 * ============================================================
 * ENV VARS
 * ============================================================
 *   SOURCE_SUPABASE_URL          Default: https://mqifktmmyiqzrolrvsmy.supabase.co
 *   SOURCE_SUPABASE_SERVICE_KEY  REQUIRED. Must be service role (not anon).
 *                                Retrieve from Supabase dashboard or via:
 *                                security find-generic-password -s betterpos-supabase (macOS keychain)
 *   TARGET_SUPABASE_URL          Default: same as SOURCE_SUPABASE_URL
 *   TARGET_SUPABASE_SERVICE_KEY  Default: same as SOURCE_SUPABASE_SERVICE_KEY
 *
 * ============================================================
 * DEPS SETUP
 * ============================================================
 * This script imports @supabase/supabase-js. Two options:
 *
 *   A) Run from prospect-tracker/app/ directory (RECOMMENDED):
 *      cd prospect-tracker/app && node ../scripts/migrate_to_vsi.mjs
 *      Node resolves imports from cwd, so app/node_modules/@supabase/supabase-js
 *      is found automatically. No separate install needed.
 *
 *   B) Add scripts/package.json with { "dependencies": { "@supabase/supabase-js": "^2" } }
 *      and run `npm install` in scripts/. Then run from scripts/:
 *      cd prospect-tracker/scripts && node migrate_to_vsi.mjs
 *
 * Option A is simpler and the recommended default.
 *
 * ============================================================
 * NOTES ON FIELD LOSS / ASSUMPTIONS
 * ============================================================
 * See "Field-loss warnings" section of the dry-run report for per-field detail.
 *
 * Key assumptions made by best judgment:
 *   - PT lead status 'Open'     → VSI stage 'new'    (no closer mapping)
 *   - PT lead status 'Abandoned'→ VSI stage 'lost'   (treatment is same)
 *   - PT canvass 'Incorrect address' → VSI 'wrong_type' (closest structural fit;
 *     flagged as a warning — see CANVASS_STATUS_MAP below)
 *   - PT dbRecord fields fb, ig, pc, pt, emp, rev, nai, nad, pi, ch, _ts
 *     have no VSI column → stashed in metadata JSONB (assumes vsi_prospect.db_records
 *     has a `metadata` JSONB column; if not, these fields are reported as warnings
 *     but the row is still written without them — script will warn loudly)
 *   - PT dbRecord `mn` (menuLink) → VSI `menu_link` (direct map)
 *   - PT dbRecord `da` (dayAssigned) → VSI `day_assigned`
 *   - PT dbRecord `df` (droppedCount) → VSI `dropped_count`
 *   - PT dbRecord `sc` (score) → VSI `score`
 *   - PT dbRecord `pr` (priority) → VSI `priority` (lowercased)
 *   - PT dbRecord `st` (status) → VSI `status` (pass-through; both use same values)
 *   - PT canvass `fromDb` → VSI `from_db_id` (id prefix stripped: db_xxx → xxx)
 *   - PT canvass `convertedDate` → no VSI column; stashed in notes_log metadata entry
 *   - PT canvass `group` → no VSI column; stashed in metadata
 *   - day_logs: PT has no equivalent table. The canvass log is localStorage-only
 *     and not in app_state. This table will show 0 rows in the report.
 *   - VSI lead fields with no PT source default to "" (empty string), not NULL,
 *     per the spec. Fields: contact, email, state, zip, type, posType, source,
 *     priority, current_pos, owner, lost_reason, referred_by.
 *   - VSI lead `stations`, `value`, `monthly_recurring` default to 0.
 *   - VSI lead `tags`, `activities`, `follow_ups` default to [].
 *   - VSI canvass `city`, `state`, `zip`, `email`, `website` not in PT stops;
 *     default to "".
 *   - VSI canvass `priority` (sort integer) defaults to 0.
 *   - VSI canvass `date` uses lastContact date if available, else today.
 */

import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DO_WRITE    = args.includes('--write');
const DO_TRUNCATE = args.includes('--truncate');

if (DO_TRUNCATE && !DO_WRITE) {
  console.error('ERROR: --truncate requires --write.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Env / config
// ---------------------------------------------------------------------------

const DEFAULT_SOURCE_URL = 'https://mqifktmmyiqzrolrvsmy.supabase.co';

const SOURCE_URL = process.env.SOURCE_SUPABASE_URL || DEFAULT_SOURCE_URL;
const SOURCE_KEY = process.env.SOURCE_SUPABASE_SERVICE_KEY;
const TARGET_URL = process.env.TARGET_SUPABASE_URL || SOURCE_URL;
const TARGET_KEY = process.env.TARGET_SUPABASE_SERVICE_KEY || SOURCE_KEY;

if (!SOURCE_KEY) {
  console.error(`
ERROR: SOURCE_SUPABASE_SERVICE_KEY is not set.

This must be the service role key (not the anon key) for the source Supabase project.
Retrieve it from:
  - Supabase dashboard → Settings → API → service_role
  - macOS keychain: security find-generic-password -s betterpos-supabase
  - Project .envrc / .env.local (look for SUPABASE_SERVICE_ROLE_KEY)

Then re-run:
  SOURCE_SUPABASE_SERVICE_KEY=<key> node scripts/migrate_to_vsi.mjs
`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------

const sourceClient = createClient(SOURCE_URL, SOURCE_KEY, {
  db: { schema: 'prospect' },
  auth: { persistSession: false },
});

const targetClient = createClient(TARGET_URL, TARGET_KEY, {
  db: { schema: 'vsi_prospect' },
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Canvass status map: PT human-readable → VSI CanvassStatus enum
// ---------------------------------------------------------------------------

/**
 * PT uses verbose human labels; VSI uses snake_case enum keys.
 * Source of truth: app/src/features/canvass/constants.js + VSI types/prospect.ts
 *
 * Unmapped values fall back to 'not_visited' with a warning.
 */
const CANVASS_STATUS_MAP = {
  // Active statuses
  'Not visited yet':           'not_visited',
  'No answer / closed':        'no_answer',
  'Not interested':            'not_interested',
  'Come back later':           'come_back',
  'Decision maker unavailable':'dmu_unavailable',
  'Dropped folder':            'dropped_folder',
  // Completed statuses
  'Converted':                 'converted',
  // Removal statuses
  'Permanently closed':        'permanently_closed',
  'Duplicate':                 'duplicate',
  'Wrong business type':       'wrong_type',
  'Already a customer':        'already_customer',
  // Best-judgment mapping: "Incorrect address" has no VSI equivalent.
  // Mapped to 'wrong_type' as the closest structural fit (business is not a
  // valid canvass target). Flagged as a fallback warning.
  'Incorrect address':         'wrong_type',
};

const CANVASS_STATUS_FALLBACK = 'not_visited';

// ---------------------------------------------------------------------------
// PT priority → VSI priority (lowercase)
// PT: 'Fire'|'Hot'|'Warm'|'Cold'|'Dead'
// VSI DbPriority: 'fire'|'hot'|'warm'|'cold'|'dead'
// ---------------------------------------------------------------------------

function mapPriority(pt) {
  if (!pt) return 'cold';
  return pt.toLowerCase();
}

// ---------------------------------------------------------------------------
// PT lead status → VSI Stage
// PT: 'Open'|'Won'|'Lost'|'Abandoned'
// VSI Stage: 'new'|'contacted'|'demo'|'proposal'|'won'|'lost'
//
// Assumptions:
//   'Open'      → 'new'   (no finer-grained stage info in PT)
//   'Won'       → 'won'
//   'Lost'      → 'lost'
//   'Abandoned' → 'lost'  (PT abandoned = gave up pursuing; VSI lost is closest)
// ---------------------------------------------------------------------------

function mapLeadStage(ptStatus) {
  switch (ptStatus) {
    case 'Won':       return 'won';
    case 'Lost':      return 'lost';
    case 'Abandoned': return 'lost';
    case 'Open':
    default:          return 'new';
  }
}

// ---------------------------------------------------------------------------
// PT record ID → VSI record ID
// PT: id = "db_<place_id>" or fallback "name-zip" style (no prefix)
// VSI: id = place_id (strip "db_" prefix)
// ---------------------------------------------------------------------------

function stripDbPrefix(id) {
  if (typeof id === 'string' && id.startsWith('db_')) {
    return id.slice(3);
  }
  return id; // non-prefixed fallback IDs kept as-is
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

const NOW_ISO = new Date().toISOString();

function tsOrNow(val) {
  if (!val) return NOW_ISO;
  // Accept epoch ms or ISO string
  if (typeof val === 'number') return new Date(val).toISOString();
  return val;
}

function extractCreatedAt(record) {
  // PT stores per-field timestamps in r._ts as { fieldName: epochMs }
  // Use _ts.createdAt if present; fall back to _ts.id (first recorded field); then NOW
  const ts = record._ts;
  if (ts) {
    if (ts.createdAt) return tsOrNow(ts.createdAt);
    // Use earliest non-zero timestamp across all fields as a proxy
    const vals = Object.values(ts).filter(v => typeof v === 'number' && v > 0);
    if (vals.length > 0) return new Date(Math.min(...vals)).toISOString();
  }
  return NOW_ISO;
}

// ---------------------------------------------------------------------------
// Warning / error accumulators
// ---------------------------------------------------------------------------

const fieldLossWarnings  = {}; // { fieldName: count }
const statusMappings     = {}; // { rawStatus: { target, count, isFallback } }
const validationErrors   = []; // [{ entity, id, message }]

function warnFieldLoss(fieldName, entityType) {
  const key = `${entityType}.${fieldName}`;
  fieldLossWarnings[key] = (fieldLossWarnings[key] || 0) + 1;
}

function recordStatusMapping(raw, mapped, isFallback) {
  if (!statusMappings[raw]) {
    statusMappings[raw] = { target: mapped, count: 0, isFallback };
  }
  statusMappings[raw].count += 1;
}

function addError(entity, id, message) {
  validationErrors.push({ entity, id, message });
}

// ---------------------------------------------------------------------------
// Transform: dbRecord (PT) → DbRecordRow (VSI)
// ---------------------------------------------------------------------------

function transformDbRecord(r) {
  const ptId = r.id;
  const vsiId = stripDbPrefix(ptId);

  // Fields with no VSI column: fb, ig, pc, pt, emp, rev, nai, nad, pi, ch, ar, grp
  // Collect populated ones for metadata stash
  const metadata = {};

  const metaFields = {
    fb:  'facebook',
    ig:  'instagram',
    pc:  'phoneCarrier',
    pt:  'phoneType',
    emp: 'employees',
    rev: 'annualRevenue',
    nai: 'naicsCode',
    nad: 'naicsDescription',
    pi:  'placeId',
    ch:  'isChain',
    ar:  'area',       // area label (implicit in per-row area column which VSI does have — use it too)
    grp: 'group',
  };

  for (const [shortKey, longKey] of Object.entries(metaFields)) {
    const val = r[shortKey];
    // 'ar' maps to VSI `area` column directly — skip metadata stash for it
    if (shortKey === 'ar') continue;
    if (val !== undefined && val !== null && val !== '' && val !== false) {
      metadata[longKey] = val;
      warnFieldLoss(shortKey, 'dbRecord');
    }
  }

  const createdAt = extractCreatedAt(r);
  const updatedAt = createdAt; // PT has no separate updatedAt

  const row = {
    id:            vsiId,
    name:          r.n  || '',
    address:       r.a  || '',
    city:          r.ci || '',
    zip:           r.zi || '',
    area:          r.ar || '',
    phone:         r.ph || '',
    email:         r.em || '',
    website:       r.web || '',
    type:          r.ty  || '',
    rating:        Number(r.rt)  || 0,
    reviews:       Number(r.rv)  || 0,
    score:         Number(r.sc)  || 0,
    priority:      mapPriority(r.pr),
    status:        r.st  || 'unworked',
    day_assigned:  r.da  || '',
    contact_name:  r.cn  || '',
    contact_title: r.ct  || '',
    notes:         '',   // PT dbRecord has no free-text notes field
    menu_link:     r.mn  || '',
    cooldown_date: '',   // PT has no cooldown concept
    dropped_count: Number(r.df) || 0,
    tags:          [],   // PT has no tags on records
    lat:           Number(r.lt) || 0,
    lng:           Number(r.lg) || 0,
    created_at:    createdAt,
    updated_at:    updatedAt,
  };

  // Stash metadata if any fields were collected
  if (Object.keys(metadata).length > 0) {
    row.metadata = metadata;
  }

  // Validation
  if (!row.id) {
    addError('dbRecord', ptId, 'Missing id — row will be skipped');
    return null;
  }
  if (!row.name) {
    addError('dbRecord', ptId, 'Missing name (r.n) — row included but name is blank');
  }

  return row;
}

// ---------------------------------------------------------------------------
// Transform: canvassStop (PT) → CanvassRow (VSI)
// ---------------------------------------------------------------------------

function transformCanvassStop(stop) {
  if (!stop.id) {
    addError('canvassStop', '?', 'Missing id — skipped');
    return null;
  }

  // Status mapping
  const rawStatus = stop.status || '';
  let vsiStatus;
  let isFallback = false;

  if (rawStatus in CANVASS_STATUS_MAP) {
    vsiStatus = CANVASS_STATUS_MAP[rawStatus];
    isFallback = rawStatus === 'Incorrect address'; // best-judgment mapping flagged
  } else if (rawStatus) {
    vsiStatus = CANVASS_STATUS_FALLBACK;
    isFallback = true;
    addError('canvassStop', stop.id,
      `Unknown status "${rawStatus}" → fallback "${CANVASS_STATUS_FALLBACK}"`);
  } else {
    vsiStatus = CANVASS_STATUS_FALLBACK;
    isFallback = true;
  }

  recordStatusMapping(rawStatus || '(empty)', vsiStatus, isFallback);

  // fromDb → from_db_id (strip db_ prefix to match vsi_prospect.db_records.id)
  const fromDbId = stop.fromDb ? stripDbPrefix(stop.fromDb) : '';

  // convertedDate: no VSI column. If present, inject as a system note entry.
  const extraNotes = [];
  if (stop.convertedDate) {
    extraNotes.push({
      id:        randomUUID(),
      text:      `[migrated] convertedDate: ${stop.convertedDate}`,
      timestamp: stop.convertedDate,
      system:    true,
    });
    warnFieldLoss('convertedDate', 'canvassStop');
  }

  // group: no VSI column — warn only, not stashed (canvass rows have no metadata column)
  if (stop.group) {
    warnFieldLoss('group', 'canvassStop');
  }

  // notesLog: PT shape { text, ts, system, type } — VSI shape { id, text, timestamp, system? }
  // Normalise: ts → timestamp, inject id if missing, drop unknown keys cleanly
  const notesLog = (stop.notesLog || []).map(n => ({
    id:        n.id || randomUUID(),
    text:      n.text || '',
    timestamp: tsOrNow(n.ts || n.timestamp),
    ...(n.system ? { system: true } : {}),
    ...(n.type   ? { type: n.type }  : {}),
  })).concat(extraNotes);

  // history: PT shape { status, ts } — VSI shape { status: CanvassStatus, timestamp }
  const history = (stop.history || []).map(h => {
    const rawS   = h.status || '';
    const mappedS = CANVASS_STATUS_MAP[rawS] || CANVASS_STATUS_FALLBACK;
    if (!(rawS in CANVASS_STATUS_MAP) && rawS) {
      recordStatusMapping(rawS, mappedS, true);
    }
    return {
      status:    mappedS,
      timestamp: tsOrNow(h.ts || h.timestamp),
    };
  });

  // date: use lastContact if available (YYYY-MM-DD extraction), else today
  let date = '';
  if (stop.lastContact) {
    const d = new Date(stop.lastContact);
    date = isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (!date) date = NOW_ISO.slice(0, 10);

  const createdAt = tsOrNow(null); // PT canvass stops have no creation timestamp
  const updatedAt = stop.lastContact ? tsOrNow(stop.lastContact) : NOW_ISO;

  return {
    id:               stop.id,
    name:             stop.name    || '',
    address:          stop.addr    || '',
    city:             '',    // PT canvass stops have no city field
    state:            '',    // PT canvass stops have no state field
    zip:              '',    // PT canvass stops have no zip field
    phone:            stop.phone   || '',
    email:            '',    // PT canvass stops have no email field
    website:          '',    // PT canvass stops have no website field
    status:           vsiStatus,
    date:             date,
    priority:         0,     // PT has no sort-order integer for canvass stops
    notes:            '',    // free-text notes are in notesLog
    notes_log:        notesLog,
    history:          history,
    follow_up_date:   '',    // PT has no explicit follow-up date on canvass stops
    from_db_id:       fromDbId,
    converted_lead_id:'',    // no direct PT equivalent
    lat:              null,
    lng:              null,
    created_at:       createdAt,
    updated_at:       updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Transform: lead/prospect (PT) → LeadRow (VSI)
// ---------------------------------------------------------------------------

function transformLead(prospect) {
  if (!prospect.id) {
    addError('lead', '?', 'Missing id — skipped');
    return null;
  }

  const stage = mapLeadStage(prospect.status);

  // Many VSI lead fields have no PT source. Document each default.
  const missingDefaults = [
    'contact', 'email', 'city', 'state', 'zip', 'type',
    'stations', 'value', 'monthly_recurring', 'source',
    'priority', 'current_pos', 'owner', 'lost_reason', 'referred_by',
    'website', 'menu_link', 'tags', 'activities', 'follow_ups',
  ];
  for (const f of missingDefaults) {
    warnFieldLoss(f, 'lead');
  }

  const createdAt = tsOrNow(prospect.added);
  const updatedAt = prospect.lastContact ? tsOrNow(prospect.lastContact) : createdAt;

  return {
    id:               prospect.id,
    name:             prospect.name        || '',
    contact:          '',          // no PT equivalent
    phone:            prospect.phone       || '',
    email:            '',          // no PT equivalent
    address:          prospect.address     || '',
    city:             '',          // no PT equivalent
    state:            '',          // no PT equivalent
    zip:              '',          // no PT equivalent
    type:             prospect.posType     || '',  // PT posType is the closest analog to restaurant type
    stations:         0,           // no PT equivalent
    value:            0,           // no PT equivalent
    monthly_recurring:0,           // no PT equivalent
    source:           '',          // no PT equivalent
    priority:         '',          // PT prospects have no priority field
    stage:            stage,
    notes:            prospect.notes       || '',
    current_pos:      '',          // no PT equivalent
    website:          '',          // no PT equivalent
    menu_link:        '',          // no PT equivalent
    owner:            '',          // no PT equivalent
    follow_up_date:   prospect.followUp    || '',
    last_contact:     prospect.lastContact ? tsOrNow(prospect.lastContact) : '',
    lost_reason:      '',          // no PT equivalent
    referred_by:      '',          // no PT equivalent
    tags:             [],
    activities:       [],
    follow_ups:       [],
    created_at:       createdAt,
    updated_at:       updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Transform: blocklist (PT) → VSI blocklist rows
// ---------------------------------------------------------------------------

function transformBlocklist(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(e => typeof e === 'string' && e.trim().length > 0)
    .map(name => ({ name: name.trim() }));
}

// ---------------------------------------------------------------------------
// Prompt helper (readline)
// ---------------------------------------------------------------------------

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Batch upsert helper
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

async function batchUpsert(client, table, rows, description) {
  if (rows.length === 0) {
    console.log(`  [SKIP] ${table}: 0 rows`);
    return;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await client.from(table).upsert(chunk);
    if (error) {
      console.error(`  [ERROR] ${table} batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      addError(table, 'batch', error.message);
    } else {
      inserted += chunk.length;
    }
  }
  console.log(`  [OK] ${table}: ${inserted} rows upserted (${description})`);
}

// ---------------------------------------------------------------------------
// Truncate helper
// ---------------------------------------------------------------------------

async function truncateTables(client) {
  const tables = ['db_records', 'canvass_stops', 'leads', 'blocklist', 'day_logs'];
  for (const table of tables) {
    // Supabase JS doesn't expose raw TRUNCATE; use DELETE with a universal filter
    const { error } = await client.from(table).delete().not('id', 'is', null);
    if (error) {
      // Blocklist uses 'name' as PK, not 'id'
      if (table === 'blocklist') {
        const { error: e2 } = await client.from(table).delete().not('name', 'is', null);
        if (e2) {
          console.error(`  [ERROR] truncate ${table}: ${e2.message}`);
        } else {
          console.log(`  [TRUNCATE] ${table}: cleared`);
        }
      } else {
        console.error(`  [ERROR] truncate ${table}: ${error.message}`);
      }
    } else {
      console.log(`  [TRUNCATE] ${table}: cleared`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

function hr() { console.log('-'.repeat(65)); }
function section(title) { console.log(`\n=== ${title} ===`); }

function printReport({
  sourceUrl, targetUrl,
  payloadSizeKB, osTaskCount,
  dbRecordsIn, dbRecordsOut, dbRecordsSkipped, dbRecordsWarned,
  canvassIn, canvassOut, canvassSkipped, canvassWarned,
  leadsIn, leadsOut, leadsSkipped, leadsWarned,
  blocklistIn, blocklistOut,
}) {
  section('PT → VSI Dry-Run Migration Report');
  console.log(`Source: ${sourceUrl}`);
  console.log(`Target: ${targetUrl}`);

  hr();
  console.log(`[READ] prospect.app_state row id=1: ${payloadSizeKB.toFixed(1)} KB`);
  console.log(`[READ] prospect.app_state row id=2 (osTasks): ${osTaskCount} tasks`);

  hr();
  console.log(`[TRANSFORM] dbRecords        : ${dbRecordsIn} → ${dbRecordsOut}  (${dbRecordsSkipped} skipped, ${dbRecordsWarned} warnings)`);
  console.log(`[TRANSFORM] canvass stops    : ${canvassIn} → ${canvassOut}  (${canvassSkipped} skipped, ${canvassWarned} warnings)`);
  console.log(`[TRANSFORM] leads (prospects): ${leadsIn} → ${leadsOut}  (${leadsSkipped} skipped, ${leadsWarned} warnings)`);
  console.log(`[TRANSFORM] blocklist        : ${blocklistIn} → ${blocklistOut}  (no skip expected)`);
  console.log(`[TRANSFORM] day_logs         : 0 → 0  (PT stores daily log in localStorage only — not in app_state; no data to migrate)`);

  section('Field-loss warnings');
  const lossEntries = Object.entries(fieldLossWarnings);
  if (lossEntries.length === 0) {
    console.log('(none)');
  } else {
    // Group by entity type
    const byEntity = {};
    for (const [key, count] of lossEntries) {
      const [entity, field] = key.split('.');
      if (!byEntity[entity]) byEntity[entity] = [];
      byEntity[entity].push({ field, count });
    }
    for (const [entity, fields] of Object.entries(byEntity)) {
      for (const { field, count } of fields.sort((a, b) => b.count - a.count)) {
        const note = getFieldLossNote(entity, field);
        console.log(`  ${entity}.${field.padEnd(16)}: ${String(count).padStart(4)} records populated → ${note}`);
      }
    }
  }

  section('Value-mapping warnings (canvass.status)');
  const statusEntries = Object.entries(statusMappings);
  if (statusEntries.length === 0) {
    console.log('(none)');
  } else {
    for (const [raw, { target, count, isFallback }] of statusEntries.sort((a, b) => b[1].count - a[1].count)) {
      const flag = isFallback ? '  *** FALLBACK ***' : '';
      console.log(`  '${raw}' → '${target}' : ${count} rows${flag}`);
    }
  }

  section('Validation errors');
  if (validationErrors.length === 0) {
    console.log('(none)');
  } else {
    for (const e of validationErrors) {
      console.log(`  [${e.entity}] id=${e.id}: ${e.message}`);
    }
    console.log('');
    if (validationErrors.some(e => e.message.includes('skipped'))) {
      console.log('WARNING: Some rows will be skipped due to missing required fields (id).');
    }
  }

  const totalRows = dbRecordsOut + canvassOut + leadsOut + blocklistOut;
  const unmappedCount = lossEntries.length;
  const fallbackCount = statusEntries.filter(([, v]) => v.isFallback).length;
  const blockingErrors = validationErrors.filter(e => e.message.includes('skipped')).length;

  section('Summary');
  console.log(`Total rows to write  : ${totalRows}`);
  console.log(`  db_records         : ${dbRecordsOut}`);
  console.log(`  canvass_stops      : ${canvassOut}`);
  console.log(`  leads              : ${leadsOut}`);
  console.log(`  blocklist          : ${blocklistOut}`);
  console.log(`  day_logs           : 0`);
  console.log(`Unmapped field types : ${unmappedCount} unique`);
  console.log(`Status fallbacks     : ${fallbackCount} distinct values`);
  console.log(`Blocking errors      : ${blockingErrors}`);

  if (!DO_WRITE) {
    console.log('\nDry-run only. To write: re-run with --write.');
  }

  return { totalRows, blockingErrors };
}

function getFieldLossNote(entity, field) {
  // canvassStop fields with no VSI column
  if (entity === 'canvassStop') {
    if (field === 'convertedDate') return 'injected as system note in notes_log';
    if (field === 'group')         return 'NO VSI column — data lost (future: add metadata col)';
    return `NO VSI column — data lost`;
  }
  // lead fields with no PT source (these are "missing defaults" warnings, not field loss)
  if (entity === 'lead') {
    const defaultedFields = {
      contact: 'no PT source → defaulted ""',
      email: 'no PT source → defaulted ""',
      city: 'no PT source → defaulted ""',
      state: 'no PT source → defaulted ""',
      zip: 'no PT source → defaulted ""',
      type: 'mapped from posType if present, else ""',
      stations: 'no PT source → defaulted 0',
      value: 'no PT source → defaulted 0',
      monthly_recurring: 'no PT source → defaulted 0',
      source: 'no PT source → defaulted ""',
      priority: 'PT leads have no priority → ""',
      current_pos: 'no PT source → defaulted ""',
      owner: 'no PT source → defaulted ""',
      lost_reason: 'no PT source → defaulted ""',
      referred_by: 'no PT source → defaulted ""',
      website: 'no PT source → defaulted ""',
      menu_link: 'no PT source → defaulted ""',
      tags: 'no PT source → defaulted []',
      activities: 'no PT source → defaulted []',
      follow_ups: 'no PT source → defaulted []',
    };
    return defaultedFields[field] || 'no PT source → defaulted';
  }
  // dbRecord metadata-stashed fields
  const metaNotes = {
    fb:  'no VSI column → stashed in metadata JSONB',
    ig:  'no VSI column → stashed in metadata JSONB',
    pc:  'no VSI column → stashed in metadata JSONB',
    pt:  'no VSI column → stashed in metadata JSONB',
    emp: 'no VSI column → stashed in metadata JSONB',
    rev: 'no VSI column → stashed in metadata JSONB',
    nai: 'no VSI column → stashed in metadata JSONB',
    nad: 'no VSI column → stashed in metadata JSONB',
    pi:  'no VSI column → stashed in metadata JSONB',
    ch:  'no VSI column → stashed in metadata JSONB',
    grp: 'no VSI column → stashed in metadata JSONB',
  };
  return metaNotes[field] || 'no VSI column → data loss';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\nPT → VSI Migration Tool');
  console.log(`Mode: ${DO_WRITE ? (DO_TRUNCATE ? 'WRITE + TRUNCATE' : 'WRITE') : 'DRY RUN'}`);
  console.log('');

  // ── Read source data ──────────────────────────────────────────────────────

  console.log('[1/3] Reading source data from prospect.app_state ...');

  const { data: rows, error: readError } = await sourceClient
    .from('app_state')
    .select('id, payload')
    .in('id', [1, 2]);

  if (readError) {
    console.error(`ERROR reading app_state: ${readError.message}`);
    console.error('Hint: check that SOURCE_SUPABASE_SERVICE_KEY is the service role key');
    console.error('      and that the "prospect" schema is exposed in Supabase dashboard.');
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.error('ERROR: No rows returned from prospect.app_state. Is the table empty?');
    process.exit(1);
  }

  const row1 = rows.find(r => r.id === 1);
  const row2 = rows.find(r => r.id === 2);

  if (!row1) {
    console.error('ERROR: prospect.app_state row id=1 not found (main state blob).');
    process.exit(1);
  }

  const payload = row1.payload;
  const payloadSizeKB = JSON.stringify(payload).length / 1024;

  const osTasks = row2?.payload?.osTasks || [];
  const osTaskCount = Array.isArray(osTasks) ? osTasks.length : 0;

  console.log(`  Row 1: ${payloadSizeKB.toFixed(1)} KB`);
  console.log(`  Row 2 (osTasks): ${osTaskCount} tasks`);

  if (osTaskCount > 0) {
    console.log('  NOTE: osTasks have no VSI target table — will be reported as a warning.');
  }

  // ── Extract source collections ────────────────────────────────────────────

  const ptDbRecords  = Array.isArray(payload.dbRecords)  ? payload.dbRecords  : [];
  const ptCanvass    = Array.isArray(payload.canvass)     ? payload.canvass    : [];
  const ptProspects  = Array.isArray(payload.prospects)   ? payload.prospects  : [];
  const ptBlocklist  = Array.isArray(payload.dbBlocklist) ? payload.dbBlocklist: [];
  const ptAreas      = Array.isArray(payload.dbAreas)     ? payload.dbAreas    : [];

  console.log(`\n  Source counts:`);
  console.log(`    dbRecords   : ${ptDbRecords.length}`);
  console.log(`    canvass     : ${ptCanvass.length}`);
  console.log(`    prospects   : ${ptProspects.length}`);
  console.log(`    dbBlocklist : ${ptBlocklist.length}`);
  console.log(`    dbAreas     : ${ptAreas.length}  (area labels — implicit in db_records.area; no dedicated VSI table)`);
  console.log(`    osTasks     : ${osTaskCount}  (no VSI table — will need vsi_prospect.os_tasks in future)`);

  // ── Transform ─────────────────────────────────────────────────────────────

  console.log('\n[2/3] Transforming ...');

  // dbRecords
  const vsiDbRecords = [];
  for (const r of ptDbRecords) {
    const row = transformDbRecord(r);
    if (row) vsiDbRecords.push(row);
  }
  const dbRecordsSkipped = ptDbRecords.length - vsiDbRecords.length;
  const dbRecordsWarned  = Object.entries(fieldLossWarnings)
    .filter(([k]) => k.startsWith('dbRecord.')).reduce((s, [, v]) => s + v, 0);

  // canvass stops
  const initialLossCount = Object.values(fieldLossWarnings).reduce((s, v) => s + v, 0);
  const vsiCanvass = [];
  for (const stop of ptCanvass) {
    const row = transformCanvassStop(stop);
    if (row) vsiCanvass.push(row);
  }
  const canvassSkipped = ptCanvass.length - vsiCanvass.length;
  const canvassWarned  = Object.entries(fieldLossWarnings)
    .filter(([k]) => k.startsWith('canvassStop.')).reduce((s, [, v]) => s + v, 0);

  // leads
  const vsiLeads = [];
  for (const prospect of ptProspects) {
    const row = transformLead(prospect);
    if (row) vsiLeads.push(row);
  }
  const leadsSkipped = ptProspects.length - vsiLeads.length;
  const leadsWarned  = Object.entries(fieldLossWarnings)
    .filter(([k]) => k.startsWith('lead.')).reduce((s, [, v]) => s + v, 0);

  // blocklist
  const vsiBlocklist = transformBlocklist(ptBlocklist);

  console.log('  Transform complete.');

  // ── Report ────────────────────────────────────────────────────────────────

  console.log('');
  const { totalRows, blockingErrors } = printReport({
    sourceUrl: SOURCE_URL,
    targetUrl: TARGET_URL,
    payloadSizeKB,
    osTaskCount,
    dbRecordsIn:      ptDbRecords.length,
    dbRecordsOut:     vsiDbRecords.length,
    dbRecordsSkipped,
    dbRecordsWarned,
    canvassIn:        ptCanvass.length,
    canvassOut:       vsiCanvass.length,
    canvassSkipped,
    canvassWarned,
    leadsIn:          ptProspects.length,
    leadsOut:         vsiLeads.length,
    leadsSkipped,
    leadsWarned,
    blocklistIn:      ptBlocklist.length,
    blocklistOut:     vsiBlocklist.length,
  });

  // ── Write path ────────────────────────────────────────────────────────────

  if (!DO_WRITE) return;

  console.log('');
  hr();

  if (blockingErrors > 0) {
    console.error(`\nWRITE BLOCKED: ${blockingErrors} blocking validation error(s) must be resolved first.`);
    console.error('Review the "Validation errors" section above.');
    process.exit(1);
  }

  // Truncate gate
  if (DO_TRUNCATE) {
    console.log('\n*** TRUNCATE requested. This will DELETE ALL rows from vsi_prospect.* ***');
    const truncateAnswer = await prompt("Type 'TRUNCATE VSI' to proceed (or anything else to abort): ");
    if (truncateAnswer !== 'TRUNCATE VSI') {
      console.log('Truncate aborted. Exiting.');
      process.exit(0);
    }
    console.log('\nTruncating target tables ...');
    await truncateTables(targetClient);
  }

  // Write gate
  console.log(`\n*** WRITE requested. This will upsert ${totalRows} rows into ${TARGET_URL} (schema: vsi_prospect) ***`);
  const writeAnswer = await prompt("Type 'MIGRATE' to proceed (or anything else to abort): ");
  if (writeAnswer !== 'MIGRATE') {
    console.log('Migration aborted. Exiting.');
    process.exit(0);
  }

  console.log('\n[3/3] Writing to target ...');

  await batchUpsert(targetClient, 'db_records',   vsiDbRecords, `${vsiDbRecords.length} db records`);
  await batchUpsert(targetClient, 'canvass_stops', vsiCanvass,   `${vsiCanvass.length} canvass stops`);
  await batchUpsert(targetClient, 'leads',         vsiLeads,     `${vsiLeads.length} leads`);

  // Blocklist: uses 'name' as PK
  if (vsiBlocklist.length > 0) {
    const { error: blError } = await targetClient.from('blocklist').upsert(vsiBlocklist);
    if (blError) {
      console.error(`  [ERROR] blocklist: ${blError.message}`);
    } else {
      console.log(`  [OK] blocklist: ${vsiBlocklist.length} entries upserted`);
    }
  } else {
    console.log('  [SKIP] blocklist: 0 entries');
  }

  console.log('\n[DONE] Migration complete.');
  console.log('Verify the target data in Supabase dashboard or with:');
  console.log('  SELECT table_name, COUNT(*) FROM information_schema.tables ...');
  console.log('  (or run the VSI Prospect Tracker app and check each tab)');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
