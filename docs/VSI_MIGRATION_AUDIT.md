# VSI Migration Audit — Prospect Tracker → VSI Prospect Tracker

**Branch:** `audit/vsi-migration` in `betterPOStools/prospect-tracker`
**Date:** 2026-04-14
**Author:** Claude Sonnet 4.6 (sub-agent)

---

## Context

`prospect-tracker` persists all state as a single JSONB blob at `prospect.app_state.payload` (row id=1, ~1.4 MB; row id=2 holds `osTasks` metadata only). Every edit debounces a full-state re-upload via `app/src/hooks/useSupabaseSync.js:36–59`. As scraping scales beyond one city, blob size grows linearly with `dbRecords`, creating sync churn and mobile perf degradation.

`vsi-prospect-tracker` is an earlier TypeScript rewrite with a normalized `vsi_prospect` schema (`leads`, `canvass_stops`, `db_records`, `day_logs`, `blocklist`), per-row upsert/delete sync via `src/store/ProspectStore.tsx:452–506`, and an offline write queue at `src/lib/offlineQueue.ts`. The UI and architecture are considered more desirable than the legacy app. The migration must happen now before the feature gap widens further.

---

## Section 1 — Feature Parity Matrix

All references to PT code are under `prospect-tracker/app/src/`; VSI PT code under `vsi-prospect-tracker/src/`.

| PT Feature | PT File(s) | VSI Status | VSI File(s) | Notes |
|---|---|---|---|---|
| **My Leads (Kanban)** | `features/leads/LeadsTab.jsx` | Present | `crm/LeadsTab.tsx` | VSI has richer stage taxonomy (6 stages: new/contacted/demo/proposal/won/lost vs PT's Open/Won/Lost/Abandoned — `types/prospect.ts:5–17`). PT stages must be remapped. |
| **LeadCard — edit/notes/activity log** | `features/leads/LeadCard.jsx` | Present | `crm/LeadsTab.tsx` (inline) | VSI calls fields: `activities[]`, `followUps[]`; PT uses `activityLog[]`, `notesLog[]`. See §2 column map. |
| **LeadCard — "Build Custom Demo" link** | `features/leads/LeadCard.jsx:115–126` | **Absent** | — | Opens `VITE_DEMO_BUILDER_URL/?menu_url=&name=&type=&pt_record_id=`. Phase C. |
| **LeadCard — "Add to Queue"** | `features/leads/LeadCard.jsx:92–113` | Present | `crm/LeadsTab.tsx` | VSI uses `fromDbId` (camelCase); PT uses `fromDb`. |
| **Canvass queue** | `features/canvass/CanvassTab.jsx` | Present | `crm/CanvassTab.tsx` | VSI has 11-state taxonomy vs PT's 7. PT values like `'Not visited yet'` must be remapped to `'not_visited'`. See §2. |
| **Canvass card notes/history** | `features/canvass/CanvassCard.jsx` | Present | `crm/CanvassTab.tsx` (inline) | VSI stores `notesLog` + `history` arrays natively. |
| **Follow-up panel** | `features/canvass/FollowUpPanel.jsx` | Present (via status taxonomy) | `crm/CanvassTab.tsx` | VSI uses `come_back` / `dmu_unavailable` statuses; PT uses `'Come back later'` / `'Decision maker unavailable'`. |
| **End-of-day modal** | `features/canvass/EndDayModal.jsx` | **Absent** | — | PT has this at `EndDayModal.jsx`; VSI has no equivalent. Accumulates daily stats, moves come-back stops to Follow Up, logs visits and returns others to DB pool. Phase B. |
| **Build Run modal** | `features/canvass/BuildRunModal.jsx` | Present (via DatabaseTab DB-to-Canvass) | `crm/DatabaseTab.tsx` | VSI calls it `DB_TO_CANVASS` action; PT calls it BuildRun. Functionally equivalent. |
| **Database — Browse tab** | `features/database/BrowsePanel.jsx` | Present | `crm/DatabaseTab.tsx` (sub-tab "browse") | VSI uses `@tanstack/react-virtual` virtualizer. Feature-equivalent. |
| **Database — Planner tab** | `features/database/WeekPlannerPanel.jsx` | Present | `crm/DatabaseTab.tsx` (sub-tab "planner") | VSI uses `src/lib/weekPlanner.ts`. |
| **Database — Map tab** | `features/database/MapPanel.jsx` | Present | `crm/MapPanel.tsx` | Both use Leaflet/react-leaflet. |
| **Database — Outscraper import** | `features/database/OutscraperPanel.jsx` | Present | `crm/OutscraperPanel.tsx` | VSI `src/lib/outscraper.ts` uses different API endpoint (`/maps/search-v3` vs PT's `/tasks`). Import flow works but lacks raw-scrape archiving. See next rows. |
| **Raw-scrape archive → Supabase `raw_scrapes`** | `data/outscraper.js:16–23` | **Absent** | — | PT inserts to `prospect.raw_scrapes` after import. Phase B. |
| **Raw-scrape archive → demo-builder filesystem** | `data/outscraper.js:29–33` | **Absent** | — | PT POSTs to `VITE_LOCAL_DEMO_BUILDER_URL/api/scrapes/save`. LAN-only. Phase B. |
| **Database — Demos sub-tab** | `features/database/DemoDatabasesPanel.jsx` | **Absent** | — | Full demo-builder batch queue UI. Phase C. |
| **Database — AI Priority Panel** | `features/database/AiPriorityPanel.jsx` | **Absent** | — | Rank/brief modes via `VITE_AI_RANK_URL`. Phase C. |
| **Database — Corridor Planner** | `features/database/CorridorPlannerPanel.jsx` | **Absent** | — | Geographic stop selection with start/end endpoint. Phase D. |
| **Database — Blocklist manager** | `features/database/BlocklistManager.jsx` | Present | `crm/SettingsTab.tsx` (Settings tab) | VSI manages blocklist in Settings, not Database. Functionally equivalent. |
| **Database — Snapshot manager** | `features/database/SnapshotManager.jsx` | Present (export/import in Settings) | `crm/SettingsTab.tsx` | VSI has full backup/restore in Settings. |
| **Sales Queue tab** (`prospect_rankings`) | **Present on `feat/sales-queue-panel` (PR #6, commit `ad1256a`)** — `app/src/lib/rankings.js` + `app/src/features/database/SalesQueuePanel.jsx` mounted as Database → Queue sub-tab | **Absent** | — | Phase C — straight port (TypeScript conversion of `rankings.js` + panel). Cross-schema read via `supabase.schema('demo_builder').from('prospect_rankings')`. |
| **Route tab — RouteXL optimization** | `features/route/RouteTab.jsx:44–64` | Present | `crm/RouteTab.tsx:71–90` | Both use RouteXL API with Basic auth. |
| **Route tab — Nominatim geocoding** | `features/route/RouteTab.jsx:13–27` | Present | `crm/RouteTab.tsx` (via `src/lib/geocode.ts`) | VSI abstracts geocoding into `src/lib/geocode.ts`. |
| **Route tab — Home/Work endpoint picker** | `features/route/RouteTab.jsx:35–43` (localStorage keys `vs_rxl_start_choice` etc.) | **Absent** | `crm/RouteTab.tsx` has GPS only | VSI `RouteTab.tsx` uses GPS as origin; no Home/Work/Custom picker. Phase B. |
| **Route tab — Leg-based navigation (>9 stops)** | `features/route/RouteTab.jsx` | Present | `crm/RouteTab.tsx:170,593–623` | Both chunk stops into 9-stop legs. |
| **Route tab — Waze navigation** | `features/route/RouteTab.jsx` | Present | `crm/RouteTab.tsx:36–38` | Both support Google Maps + Waze. |
| **Route tab — fixedends parameter** | `features/route/RouteTab.jsx:49–52` | **Absent** | — | PT passes `fixedends=1` to RouteXL when explicit end endpoint set. VSI doesn't pass this. Phase B (add with endpoint picker). |
| **Analytics tab** | `features/export/AnalyticsPanel.jsx` | Present | `crm/AnalyticsTab.tsx` | VSI uses Recharts. PT uses custom charts. Functionally equivalent. |
| **Mileage / Location tracking** | `features/export/MileagePanel.jsx`, `hooks/useLocationTracking.js` | Present | `crm/MileagePanel.tsx`, `hooks/useLocationTracking.ts` | Both use Capacitor Geolocation plugin. VSI localStorage key: `pecan-location-tracks`; PT key: `vs_location_tracks`. |
| **Export (CSV/JSON)** | `features/export/ExportTab.jsx` | Present | `crm/SettingsTab.tsx` | VSI consolidates export into Settings. |
| **KMZ export** | `data/kmzExport.js` | Present | `crm/SettingsTab.tsx` (uses `jszip` dep) | VSI has `jszip` in deps; export is in Settings. |
| **Service Worker / PWA** | `vite.config.ts` | Present | `vite.config.ts` (vite-plugin-pwa) | VSI uses `vite-plugin-pwa`. PT does NOT — PT has a bare-bones `sw.js` that has a known caching bug for POST requests (`feedback_sw_post_cache.md`). VSI's PWA is superior. |
| **Capacitor Android** | `app/capacitor.config.json` | Present | `capacitor.config.json` | Both use `com.valuesystems.prospecttracker`. VSI uses `androidScheme: "https"`; PT uses `"http"`. |
| **Dark/light theme** | `hooks/useTheme.js` | Present | `hooks/useTheme.ts` | Both. |
| **Offline write queue** | `hooks/useSupabaseSync.js` (debounce, no per-op queue) | Present (richer) | `src/lib/offlineQueue.ts` | VSI has proper per-operation retry queue with 10-retry cap. PT only debounces; full-blob re-upload on reconnect. |
| **Realtime multi-device sync** | `hooks/useSupabaseSync.js:61–83` | Present | `src/lib/supabase.ts:466–486` | PT uses channel on `app_state` table. VSI subscribes per-table. Both via Supabase Realtime. |

**Summary — gaps requiring new code in VSI PT:**

| Gap | Priority Phase |
|-----|----------------|
| End-of-day modal | Phase B |
| Home/Work/Custom route endpoint picker + `fixedends` | Phase B |
| Raw-scrape archive (Supabase + demo-builder filesystem) | Phase B |
| AI Priority Panel | Phase C |
| Demo-builder "Build Custom Demo" LeadCard link | Phase C |
| Demos sub-tab (DemoDatabasesPanel) | Phase C |
| Sales Queue tab (prospect_rankings) | Phase C |
| Corridor Planner | Phase D |

---

## Section 2 — Column Map

### 2a. `dbRecord` → `vsi_prospect.db_records`

PT field names from `data/outscraper.js:267–302` and `data/storage.js`. VSI row type from `src/lib/supabase.ts:73–101`.

| PT field | PT type | VSI column (`db_records`) | Disposition | Notes |
|---|---|---|---|---|
| `id` | `string` (`db_${place_id}`) | `id TEXT` | **Strip `db_` prefix** | See §4. |
| `n` | string | `name` | Map | |
| `ty` | string | `type` | Map | |
| `a` | string | `address` | Map | |
| `ci` | string | `city` | Map | |
| `zi` | string | `zip` | Map | |
| `ph` | string | `phone` | Map | |
| `web` | string | `website` | Map | |
| `mn` | string | `menu_link` | Map | |
| `em` | string | `email` | Map | |
| `lt` | number | `lat` | Map | |
| `lg` | number | `lng` | Map | |
| `rt` | number | `rating` | Map | |
| `rv` | number | `reviews` | Map | |
| `ar` | string | `area` | Map | First-class in VSI — fixes multi-city problem. |
| `da` | string | `day_assigned` | Map | PT: `'Mon'`/`'Tue'` etc. VSI: same. |
| `cn` | string | `contact_name` | Map | |
| `ct` | string | `contact_title` | Map | |
| `df` | number | `dropped_count` | Map | |
| `st` | string | `status` | Map + recode | PT values: `'unworked'\|'in_canvass'\|'canvassed'\|'converted'`. VSI adds `'lead'`. No recode needed — all PT values are valid VSI values (`types/prospect.ts:146–155`). |
| `sc` | number | `score` | Map | |
| `pr` | string | `priority` | Map + recode | PT values: `'Fire'\|'Hot'\|'Warm'\|'Cold'\|'Dead'` (capitalized). VSI expects lowercase (`'fire'\|'hot'\|'warm'\|'cold'\|'dead'`). ETL: `r.pr.toLowerCase()`. |
| `_ts` | object | **Drop** | Drop | Per-field sync timestamp used by PT's `mergeArr()` (`data/storage.js:28–38`, `data/store.jsx:240–260`). VSI uses row-level `updated_at`; per-field merge is not needed. |
| `es` | string | `metadata.email_status` | Stash in `metadata` | Email validator status from Outscraper enrichment. Populated on ~subset of records. |
| `hr` | string | `metadata.working_hours` | Stash in `metadata` | CSV-formatted working hours (`working_hours_csv_compatible`). |
| `pc` | string | `metadata.phone_carrier` | Stash in `metadata` | Phone enricher carrier. Populated only when `usePhoneEnricher=true`. |
| `pt` | string | `metadata.phone_type` | Stash in `metadata` | Phone enricher type. Same condition. |
| `emp` | number | `metadata.employees` | Stash in `metadata` | US company data enricher. Populated only when `useCompanyData=true`. |
| `rev` | string | `metadata.annual_revenue` | Stash in `metadata` | Same condition. |
| `nai` | string | `metadata.naics_code` | Stash in `metadata` | Same condition. |
| `nad` | string | `metadata.naics_description` | Stash in `metadata` | Same condition. |
| `pi` | string | `metadata.place_id` | Stash in `metadata` | Raw Google Place ID (duplicate of `id` after prefix strip). Keep for cross-reference. |
| `fb` | string | `metadata.facebook` | Stash in `metadata` | `company_facebook` from Outscraper. |
| `ig` | string | `metadata.instagram` | Stash in `metadata` | `company_instagram` from Outscraper. |
| `ch` | boolean | `metadata.is_chain` | Stash in `metadata` | Chain flag from Outscraper. VSI scoring uses `isChain()` at import time; field not needed post-import but useful for audit. |
| `grp` | string | `metadata.group` | Stash in `metadata` | Used for AI-seed tagging (`grp='ai-seed'`). Keep — AI Priority Panel port (Phase C) will need it. |
| `co` | string | `cooldown_date` | Map | PT field `co` set by EndDayModal (`EndDayModal.jsx:64`). Maps to VSI `cooldown_date`. |

**`metadata` JSONB schema** — add this column to `vsi_prospect.db_records`:

```sql
ALTER TABLE vsi_prospect.db_records ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
```

Schema shape:
```json
{
  "email_status": "valid|invalid|risky|unknown",
  "working_hours": "Mon-Fri 9am-5pm,...",
  "phone_carrier": "T-Mobile",
  "phone_type": "mobile",
  "employees": 12,
  "annual_revenue": "$1M-$5M",
  "naics_code": "722511",
  "naics_description": "Full-Service Restaurants",
  "place_id": "ChIJ...",
  "facebook": "https://...",
  "instagram": "https://...",
  "is_chain": false,
  "group": "ai-seed"
}
```

All fields are optional. ETL omits keys where the PT value is falsy (empty string, 0, false).

---

### 2b. `prospect` (lead) → `vsi_prospect.leads`

PT lead fields from `features/leads/LeadCard.jsx:33–186`. VSI lead row from `src/lib/supabase.ts:15–46`.

| PT field | PT type | VSI column (`leads`) | Disposition | Notes |
|---|---|---|---|---|
| `id` | string (uid) | `id` | Map | PT leads use non-prefixed UIDs already. |
| `name` | string | `name` | Map | |
| `phone` | string | `phone` | Map | |
| `email` | string | `email` | Map | |
| `addr` | string | `address` | Map | PT uses `addr`; VSI uses `address`. |
| `owner` | string | `contact` | Map | PT's "main contact name"; VSI calls it `contact`. |
| `status` | string | `stage` | Map + recode | PT values: `'Open'\|'Won'\|'Lost'\|'Abandoned'`. VSI stages: `'new'\|'contacted'\|'demo'\|'proposal'\|'won'\|'lost'`. ETL map: `Open→new`, `Won→won`, `Lost→lost`, `Abandoned→lost` (closest match). |
| `followUp` | string (ISO date) | `follow_up_date` | Map | |
| `lastContact` | string (ISO) | `last_contact` | Map | |
| `menu` | string | `menu_link` | Map | |
| `website` | string | `website` | Map | |
| `activityLog` | `{text, ts, type}[]` | `activities` | Map + shape | VSI shape: `{id, type, text, timestamp}`. ETL: add `id=uuid()` per entry, rename `ts→timestamp`. |
| `notesLog` | `{text, ts}[]` | `activities` | Merge into `activities` | PT notes are stored separately from activity log. ETL: convert each note to an activity of type `'note'`, merge into `activities[]`. |
| `fromDb` | string | **Drop** | Drop | Back-reference to a DB record. Not stored in VSI leads. The canvass stop's `fromDbId` carries the link. |
| `fromLead` (canvass field) | string | — | See canvass map | |
| `city` | — | `city` | **Missing in PT leads** | PT leads don't store city. ETL: blank string `''`. |
| `state` | — | `state` | **Missing in PT leads** | ETL: blank string `''`. |
| `zip` | — | `zip` | **Missing in PT leads** | ETL: blank string `''`. |
| `type` | — | `type` | **Missing in PT leads** | PT leads don't store restaurant type. ETL: blank string `''`. |
| — | — | `stations` | **Missing in PT leads** | ETL: `0`. |
| — | — | `value` | **Missing in PT leads** | ETL: `0`. |
| — | — | `monthly_recurring` | **Missing in PT leads** | ETL: `0`. |
| — | — | `source` | **Missing in PT leads** | ETL: `'migrated'`. |
| — | — | `priority` | **Missing in PT leads** | ETL: `'cold'`. |
| — | — | `current_pos` | **Missing in PT leads** | ETL: `''`. |
| — | — | `owner` | VSI has `owner` too | PT's `owner` maps to both `contact` (name) and `owner`. ETL: copy value to both. |
| — | — | `lost_reason` | **Missing in PT leads** | ETL: `''`. |
| — | — | `referred_by` | **Missing in PT leads** | ETL: `''`. |
| — | — | `tags` | **Missing in PT leads** | ETL: `[]`. |
| — | — | `follow_ups` | **Missing in PT leads** | PT `followUp` is a single date string. ETL: if `followUp` is set, create one `FollowUp` object with `completed=false`. |
| `_ts` | object | **Drop** | Drop | Same rationale as dbRecord. |

---

### 2c. `canvassStop` → `vsi_prospect.canvass_stops`

PT canvass stop fields from `features/canvass/AddStopPanel.jsx` and `data/store.jsx:56–108`. VSI row from `src/lib/supabase.ts:48–71`.

| PT field | PT type | VSI column (`canvass_stops`) | Disposition | Notes |
|---|---|---|---|---|
| `id` | string (uid) | `id` | Map | |
| `name` | string | `name` | Map | |
| `addr` | string | `address` | Map | PT uses `addr`; VSI uses `address`. |
| `phone` | string | `phone` | Map | |
| `email` | string | `email` | Map | |
| `website` | string | `website` | Map | |
| `status` | string | `status` | Map + recode | PT string values (e.g., `'Not visited yet'`) → VSI enum values. Full remap table: `'Not visited yet'→'not_visited'`, `'No answer / closed'→'no_answer'`, `'Come back later'→'come_back'`, `'Decision maker unavailable'→'dmu_unavailable'`, `'Not interested'→'not_interested'`, `'Converted'→'converted'`, `'Dropped folder'→'dropped_folder'`, `'Wrong type'→'wrong_type'`, `'Permanently closed'→'permanently_closed'` |
| `date` | string (`toLocaleDateString()`) | `date` | Map + parse | PT date is locale string (e.g., `'4/14/2026'`); VSI expects `YYYY-MM-DD`. ETL: `new Date(stop.date).toISOString().slice(0,10)`. Caveat: `'ended'` sentinel from EndDayModal (`EndDayModal.jsx:59`) → treat as `'1970-01-01'` and filter out of active queue. |
| `added` | string (ISO) | `created_at` | Map | |
| `notesLog` | `{text, ts, system?}[]` | `notes_log` | Map | Same shape as VSI `CanvassNote[]`. |
| `history` | `{status, ts}[]` | `history` | Map + recode | Status values must be recoded same as `status` field. |
| `followUp` | string (ISO date) | `follow_up_date` | Map | |
| `fromDb` | string | `from_db_id` | Map | After ID prefix strip, VSI IDs match. |
| `fromLead` | string | **Drop** | Drop | PT-only back-reference to a lead record. Not in VSI schema — redundant since `convertedLeadId` covers the forward direction. |
| `lat` | number\|undefined | `lat` | Map | |
| `lng` | number\|undefined | `lng` | Map | |
| `notes` | string | `notes` | Map | PT's top-level notes field (separate from `notesLog`). ETL: copy to `notes`. |
| — | — | `city` | **Missing in PT stops** | PT canvass stops don't store city. ETL: `''`. |
| — | — | `state` | **Missing in PT stops** | ETL: `''`. |
| — | — | `zip` | **Missing in PT stops** | ETL: `''`. |
| — | — | `priority` | **Missing in PT stops** | Sort order integer. ETL: use array index. |
| — | — | `converted_lead_id` | **Missing in PT stops** | ETL: `''` (PT tracks this on the lead, not the stop). |
| `_ts` | object | **Drop** | Drop | |

---

### 2d. `dbBlocklist` → `vsi_prospect.blocklist`

PT stores blocklist as `string[]` in localStorage key `vs_db_block` and in the Supabase payload. VSI stores as a table with a single `name TEXT` column.

| PT | VSI | Disposition |
|----|-----|-------------|
| `string` (lowercase, e.g., `'mcdonald'`) | `{ name: string }` row | Map. VSI upserts on `name`. ETL: `names.map(n => ({ name: n.toLowerCase() }))`. |

---

### 2e. `locationTracks` — localStorage-only

PT stores GPS track points under `vs_location_tracks` (key from `hooks/useLocationTracking.js:6`). Structure: `{ [YYYY-MM-DD]: { date, points: [{lat, lng, ts}][], miles } }`. VSI stores the same under `pecan-location-tracks` (`hooks/useLocationTracking.ts:13`).

**Verdict: localStorage-only, keep as-is.** Do not migrate to Supabase. Rationale: tracks are local/ephemeral, device-specific, and large (potentially MB of GPS points). VSI already has a compatible hook with the same `TrackPoint` shape. ETL simply does not touch this data.

---

### 2f. `dbAreas` — array of area label strings

PT stores `string[]` in localStorage `vs_db_areas`. VSI has no equivalent table — area is first-class on each `db_records` row. **Drop as standalone store.** The set of areas is derived at query time via `SELECT DISTINCT area FROM db_records`.

---

### 2g. `osTasks` — Outscraper task metadata (app_state row id=2)

PT stores Outscraper task metadata at `prospect.app_state` row `id=2`, field `payload.osTasks` (`hooks/useOutscraper.js:11`). Structure: `OsTask[]` — taskId, city, state, zips, queryCount, status, resultData, recordCount, etc.

**Verdict: localStorage-only, migrate manually.** VSI `src/lib/outscraper.ts` stores tasks at `pecan-outscraper-tasks`. These are transient — in-flight tasks complete within hours. The ETL does not migrate `osTasks`. Rep should complete or abandon any in-flight tasks before cutover.

---

## Section 3 — External-Service Dependency Graph

### PT integrations → VSI status

| Service | Endpoint | Auth | PT File | PT Env Var | VSI Status | VSI Env Var | Port Difficulty |
|---|---|---|---|---|---|---|---|
| **Supabase** | `prospect.app_state` (blob) | anon key | `app/src/lib/supabase.js:6` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Present — schema swap only | Same var names; change schema `prospect→vsi_prospect` (`src/lib/supabase.ts:126`) | Trivial |
| **prospect-tracker-api (Anthropic proxy)** | `POST /api/rank` (rank + brief modes) | Origin allowlist | `app/src/data/aiRanking.js:101` | `VITE_AI_RANK_URL` | **Absent** | Same — `VITE_AI_RANK_URL` | Medium — port `AiPriorityPanel.jsx` + extend `ALLOWED_ORIGINS` in Vercel env |
| **demo-builder `/api/batch/status`** | `GET /api/batch/status?pt_record_ids=` | None (LAN/Tailscale) | `app/src/lib/demoBuilder.js:28–38` | `VITE_DEMO_BUILDER_URL` | **Absent** | Same — `VITE_DEMO_BUILDER_URL` | Low — straight copy of `demoBuilder.js` |
| **demo-builder `/api/batch/queue`** | `POST /api/batch/queue` | None | `app/src/lib/demoBuilder.js:41–49` | `VITE_DEMO_BUILDER_URL` | **Absent** | Same | Low |
| **demo-builder `/api/batch/load`** | `POST /api/batch/load` | None | `app/src/lib/demoBuilder.js:52–59` | `VITE_DEMO_BUILDER_URL` | **Absent** | Same | Low |
| **demo-builder `/api/scrapes/save`** | `POST /api/scrapes/save` | None (LAN-only) | `app/src/data/outscraper.js:29–33` | `VITE_LOCAL_DEMO_BUILDER_URL` | **Absent** | Add `VITE_LOCAL_DEMO_BUILDER_URL` | Low — 5-line fetch call |
| **prospect.raw_scrapes (Supabase)** | Supabase INSERT | anon key | `app/src/data/outscraper.js:16–23` | `VITE_SUPABASE_URL` | **Absent** | Same — but schema is now `vsi_prospect`; need `raw_scrapes` table there | Low — add table migration + 1 INSERT call |
| **demo_builder.prospect_rankings (Supabase cross-schema)** | SELECT via `.schema('demo_builder')` | anon key | `app/src/lib/rankings.js` (PT PR #6, commit `ad1256a`, `feat/sales-queue-panel`) | `VITE_SUPABASE_URL` | **Absent** | Same | Low — straight port from PR #6 |
| **RouteXL** | `POST https://api.routexl.com/tour/` | Basic auth | `app/src/features/route/RouteTab.jsx:44–64` | localStorage (`vs_rxl_user`, `vs_rxl_pass`) | Present | localStorage (`pecan-routexl-username`, `pecan-routexl-password`) | Trivial — already wired. Keys differ; ETL or settings copy needed. |
| **Nominatim** | `GET https://nominatim.openstreetmap.org/search` | None | `app/src/features/route/RouteTab.jsx:13–27`, `CorridorPlannerPanel.jsx:18–30` | None | Present | `src/lib/geocode.ts` | Trivial |
| **Outscraper API** | `POST https://api.outscraper.cloud/tasks` (PT) / `POST .../maps/search-v3` (VSI) | `X-API-KEY` | `app/src/data/outscraper.js:189`, `hooks/useOutscraper.js` | localStorage (`vs_os_key`) | Present but diverged | localStorage (`pecan-outscraper-key`) | Medium — VSI uses different endpoint + request shape (`src/lib/outscraper.ts:129–167`). PT's richer output-column list and filter pipeline not in VSI. Phase B: align VSI to PT's API call shape. |
| **Zippopotam.us** | `GET https://api.zippopotam.us/us/...` | None | `app/src/data/outscraper.js:90–111` | None | Present | `src/lib/outscraper.ts:95–101` | Trivial |
| **Capacitor Geolocation** | Native plugin | OS permissions | `hooks/useLocationTracking.js:3` | None | Present | `hooks/useLocationTracking.ts:3` | Trivial |

### `prospect-tracker-api` ALLOWED_ORIGINS — what needs updating

`api/rank.ts:28` reads `process.env.ALLOWED_ORIGINS` (comma-separated). Current value must include the PT GH Pages domain. Phase C must add:
- VSI PT GH Pages domain (or Vercel preview URL)
- VSI PT Android APK origin (`capacitor://localhost` or `http://localhost`)

---

## Section 4 — Record ID Format Decision

**Verdict: STRIP `db_` prefix.**

### Evidence

- 1598 of 1605 rows in `demo_builder.batch_queue` carry the `db_` prefix.
- 7 rows are disposable: UUIDs of all-zeros or all-ones, business names "Test Restaurant", "Test Place", and a duplicate "Gator Zone Sports Bar" — all test rows with no production value.
- `demo_builder.prospect_rankings.place_id` already stores the raw Google Place ID (no prefix), so stripping makes the join natural: `db_records.id = prospect_rankings.place_id`.

### Coupling cost table

| Option | PT record IDs | `batch_queue` rewrite | `prospect_rankings` join | Verdict |
|---|---|---|---|---|
| **Strip `db_`** | Raw `ChIJ...` | `UPDATE ... SET pt_record_id = substring(pt_record_id FROM 4) WHERE pt_record_id LIKE 'db\_%' ESCAPE '\'` | Natural: `id = place_id` | **Chosen** |
| Keep `db_` | `db_ChIJ...` | Zero change | `'db_' \|\| place_id = id` (conditional) | Avoids one-time migration but poisons all future joins |
| Hybrid | Mixed | Zero change | Conditional | Adds permanent complexity; never do this |

### Migration SQL

```sql
-- Step 1: Strip prefix from batch_queue
UPDATE demo_builder.batch_queue
SET pt_record_id = substring(pt_record_id FROM 4)
WHERE pt_record_id LIKE 'db\_%' ESCAPE '\';

-- Step 2: Delete 7 test rows (identified by UUID-like IDs or test names)
DELETE FROM demo_builder.batch_queue
WHERE name IN ('Test Restaurant', 'Test Place')
   OR pt_record_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}';

-- Step 3: Verify
SELECT count(*), count(DISTINCT pt_record_id) FROM demo_builder.batch_queue;
```

Run Step 3 dry-run first (no transaction needed — `batch_queue` is append-only by design).

---

## Section 5 — ETL Script

**Script path:** `prospect-tracker/scripts/migrate_to_vsi.mjs`

A sibling agent is authoring this script concurrently. This section describes its contract so the audit doc and the script stay in sync.

### What the script does

1. **Reads** `prospect.app_state.payload` (row id=1) from Supabase DEV using the service-role key from the environment (`SUPABASE_SERVICE_KEY`). Also reads `prospect.app_state.payload` row id=2 for `osTasks` (reported, not migrated).

2. **Maps** each entity using mapper functions that mirror the column map in §2:
   - `dbRecords[]` → `vsi_prospect.db_records` rows: strip `db_` from id; lowercase priority; move unmapped fields into `metadata` JSONB; drop `_ts`.
   - `prospects[]` (PT leads) → `vsi_prospect.leads` rows: remap `status→stage`; merge `activityLog` + `notesLog` into `activities[]`; synthesize missing VSI fields with neutral defaults.
   - `canvass[]` (PT stops) → `vsi_prospect.canvass_stops` rows: recode status enum strings; parse locale date to ISO; strip `fromLead`; drop `_ts`.
   - `dbBlocklist[]` → `vsi_prospect.blocklist` rows: lowercase, deduplicate.

3. **Dry-run output** (default, no `--write` flag):
   - Row counts per entity.
   - Field-loss warnings: for each metadata-bound field, prints count of records with non-empty values (e.g., `"42 records have 'fb' populated → stashed in metadata.facebook"`).
   - Validation errors: any row that fails the VSI type shape (missing required fields, bad enum values).
   - Sample outputs: first 3 rows of each entity in VSI shape.

4. **`--write` flag**: enables actual upsert to `vsi_prospect.*`. Requires confirmation prompt.

5. **`--truncate` flag** (only usable with `--write`): `TRUNCATE` target tables before upsert. Requires second confirmation.

### Reused code

The script imports directly from `vsi-prospect-tracker/src/lib/supabase.ts` mappers (`dbRecordToRow`, `canvassToRow`, `leadToRow`) converted to plain JS equivalents (since the script is `.mjs`, not TypeScript). It does not duplicate mapper logic.

### Running it

```bash
# Dry-run (safe — no writes):
node scripts/migrate_to_vsi.mjs

# Verify and write:
node scripts/migrate_to_vsi.mjs --write

# Wipe target tables and re-write (destructive):
node scripts/migrate_to_vsi.mjs --write --truncate
```

Requires `SOURCE_SUPABASE_SERVICE_KEY` and `SOURCE_SUPABASE_URL` in environment. Run from `app/` directory so `@supabase/supabase-js` resolves from `app/node_modules`.

### Dry-run results (executed 2026-04-14, PT Supabase DEV)

Source: `prospect.app_state` row id=1 (1301.4 KB) + row id=2 (osTasks: 0 tasks).

| Entity | Source → Target | Skipped | Warnings |
|--------|-----------------|---------|----------|
| `db_records` | 1925 → 1925 | 0 | 3778 (field-loss stashes) |
| `canvass_stops` | 4 → 4 | 0 | 0 |
| `leads` | 5 → 5 | 0 | 100 (richer VSI schema, defaulted) |
| `blocklist` | 109 → 109 | 0 | 0 |
| `day_logs` | 0 → 0 | — | localStorage-only, not in app_state |
| **Total writes** | **2043** | **0** | — |

**Blocking errors:** 0. **Validation errors:** 0.

**Field-loss triage — `dbRecord` → `db_records.metadata` JSONB:**

| PT field | Populated | Verdict |
|----------|-----------|---------|
| `pi` (photo/image ref) | 1925 / 1925 | → `metadata.pi` |
| `fb` (Facebook) | 953 / 1925 | → `metadata.fb` |
| `ig` (Instagram) | 672 / 1925 | → `metadata.ig` |
| `emp` (employee count estimate) | 216 / 1925 | → `metadata.emp` |
| `grp` (ai-seed tag etc.) | 12 / 1925 | → `metadata.grp` |

All 5 stash into `db_records.metadata` JSONB. **Phase 0 must add `metadata JSONB` column** to `vsi_prospect.db_records` before `--write` — without it, the upsert will 422.

**Value-mapping fallbacks:**
- `canvass.status = 'Not visited yet'` → `'not_visited'` (4 rows).
- `lead.status = 'Abandoned'` → `'lost'` (no exact VSI equivalent; lossy but semantically closest).

**Lead-side warnings (100 total = 20 defaulted fields × 5 leads):** all expected — VSI `leads` schema is richer than PT's. Fields like `stations`, `value`, `monthly_recurring`, `city`, `state`, `zip`, `tags`, `follow_ups`, `activities` have no PT source and get sensible defaults (empty string, 0, empty array). This is not data loss; it is schema upgrade. The 5 PT leads will work in VSI immediately; the rep fills in the richer fields over time.

---

## Section 6 — Phased Execution Roadmap

### Phase 0 — Pre-flight (1 PR)

**Entry criteria:** Audit signed off.

**Files touched:**
- `vsi-prospect-tracker/supabase/migrations/001_vsi_prospect_schema.sql` — create `vsi_prospect` schema with all 5 tables (currently live in Supabase DEV but not codified). Include `metadata JSONB` column on `db_records` and `raw_scrapes` table.
- `vsi-prospect-tracker/CLAUDE.md` — add project rules, stack, port (5176 same as PT — verify no conflict; if conflict, assign 5177 and update suite port table).
- `vsi-prospect-tracker/HANDOFF.md` — current session state.
- `vsi-prospect-tracker/TOOLS.md` — document the ETL script.

**Test plan:**
- `supabase db push` against DEV project confirms migration applies cleanly.
- Verify `vsi_prospect` tables exist with correct columns via Supabase dashboard.

**Rollback:** `DROP SCHEMA vsi_prospect CASCADE` on DEV. No production impact.

---

### Phase A — Data layer (1–2 PRs)

**Entry criteria:** Phase 0 merged; ETL dry-run shows zero validation errors and acceptable field-loss warnings.

**Files touched:**
- `prospect-tracker/scripts/migrate_to_vsi.mjs` (authored separately) — execute with `--write`.
- No VSI PT code changes (just data).

**Test plan:**
- After `--write`: open VSI PT in browser, confirm Leads/Canvass/Database tabs show correct record counts matching PT PROD.
- Spot-check 5 db_records: name, area, priority (lowercase), status, lat/lng correct.
- Spot-check 2 leads: stage mapping correct, activities array has entries.
- Spot-check 3 canvass stops: status enum value correct (not `'Not visited yet'`), date is `YYYY-MM-DD`.
- Blocklist: confirm count matches PT's `dbBlocklist.length`.

**Rollback:** `TRUNCATE vsi_prospect.db_records, vsi_prospect.leads, vsi_prospect.canvass_stops, vsi_prospect.blocklist` on DEV. Re-run ETL.

---

### Phase B — Critical-path features (3 PRs)

**Entry criteria:** Phase A data smoke-test passes; VSI PT loads with real data.

**PR B1 — Outscraper pipeline alignment + raw-scrape archiving:**

Files to create/modify in `vsi-prospect-tracker/`:
- `src/lib/outscraper.ts` — align `submitScrape()` to PT's richer API call shape (`data/outscraper.js:126–196`): add `output_columns`, `enrichments`, `filters`, `dropDuplicates`, `ignoreWithoutEmails`, etc.
- `src/crm/OutscraperPanel.tsx` — add raw-scrape archiving calls after successful import: (1) INSERT to `vsi_prospect.raw_scrapes` (new table from Phase 0 migration), (2) fire-and-forget POST to `VITE_LOCAL_DEMO_BUILDER_URL/api/scrapes/save`.
- `vsi-prospect-tracker/.env.example` — add `VITE_LOCAL_DEMO_BUILDER_URL`.

Test: import a small JSON file; confirm `raw_scrapes` row appears in Supabase and `Scrapes/raw/` on Mac.

**PR B2 — Route endpoint picker + `fixedends`:**

Files in `vsi-prospect-tracker/src/crm/RouteTab.tsx`:
- Add `StartEndPicker` sub-component matching PT's `vs_rxl_*` localStorage key naming (rename to `pecan-rxl-*` to stay consistent with VSI's `pecan-` prefix).
- Add `fixedends=1` to RouteXL call body when an explicit end endpoint is set (`features/route/RouteTab.jsx:49`).
- Add localStorage keys: `pecan-rxl-start-choice`, `pecan-rxl-end-choice`, `pecan-rxl-home-addr`, `pecan-rxl-home-coords`, `pecan-rxl-work-addr`, `pecan-rxl-work-coords`, `pecan-rxl-custom-start`, `pecan-rxl-custom-end`.

Test: set Home address; optimize a route; verify RouteXL receives the home coords as first location with `fixedends=1`.

**PR B3 — End-of-day modal:**

Files to create in `vsi-prospect-tracker/`:
- `src/crm/EndDayModal.tsx` — port `features/canvass/EndDayModal.jsx`. Uses VSI's `UPDATE_STOP_STATUS` and `BULK_UPDATE_DB_STATUS` dispatch actions. Accumulate stats in localStorage key `pecan-endday`.
- `src/crm/CanvassTab.tsx` — add "End Day" button that opens modal.

Test: add 4 test stops with different statuses; run End Day; confirm come-back stops move to follow-up date `'ended'`, not-interested stops get 30-day cooldown on their db_records row.

---

### Phase C — AI + Demos (2 PRs)

**Entry criteria:** Phase B merged and stable for 2+ days of daily use.

**PR C1 — AI Priority Panel + Sales Queue:**

Files to create/modify in `vsi-prospect-tracker/`:
- `src/data/aiRanking.ts` — port `app/src/data/aiRanking.js` and `app/src/data/signalDerivation.js`.
- `src/crm/AiPriorityPanel.tsx` — port `features/database/AiPriorityPanel.jsx`.
- `src/crm/DatabaseTab.tsx` — add "AI" sub-tab above Browse.
- `src/data/salesQueue.ts` — straight port of `app/src/lib/rankings.js` (exists on PT `feat/sales-queue-panel`, PR #6, commit `ad1256a`). Convert to TS: type the `PT_TIER_ORDER`/`VOLUME_ORDER` maps and the `RankingRow` interface.
- `src/crm/SalesQueuePanel.tsx` — straight port of `app/src/features/database/SalesQueuePanel.jsx` (same PR). Join to VSI records via `record.id === ranking.place_id` instead of PT's `record.id.slice(3) === ranking.place_id` (after ID-strip decision in §4).
- `vsi-prospect-tracker/.env.example` — add `VITE_AI_RANK_URL`.

`prospect-tracker-api` change: add VSI PT GH Pages domain and `capacitor://localhost` to `ALLOWED_ORIGINS` Vercel env var.

Test: confirm rank mode returns a shortlist with IDs matching records in the DB; confirm brief mode returns narrative text.

**PR C2 — Demos sub-tab + LeadCard "Build Custom Demo":**

Files to create/modify in `vsi-prospect-tracker/`:
- `src/lib/demoBuilder.ts` — port `app/src/lib/demoBuilder.js` (fetch wrappers + cache Map + `useDemoStatus` hook).
- `src/crm/DemoDatabasesPanel.tsx` — port `features/database/DemoDatabasesPanel.jsx`.
- `src/crm/DatabaseTab.tsx` — add "Demos" sub-tab.
- `src/crm/LeadsTab.tsx` — add "Build Custom Demo" button to lead detail view, opening `VITE_DEMO_BUILDER_URL/?name=&menu_url=&type=&pt_record_id=` (mirrors `LeadCard.jsx:115–126`).
- `vsi-prospect-tracker/.env.example` — add `VITE_DEMO_BUILDER_URL`.

Test: queue one lead for demo; confirm `batch_queue` row appears in demo-builder Supabase; confirm status badge updates after poll cycle.

---

### Phase D — Corridor Planner (1 PR)

**Entry criteria:** Phase C stable.

Files to create/modify in `vsi-prospect-tracker/`:
- `src/data/corridorPlanner.ts` — port `app/src/data/corridorPlanner.js` (`selectCorridorStops()` function).
- `src/crm/CorridorPlannerPanel.tsx` — port `features/database/CorridorPlannerPanel.jsx`. Shares the `pecan-rxl-*` endpoint localStorage keys from Phase B so plan → optimize works end-to-end.
- `src/crm/DatabaseTab.tsx` — add "Corridor" sub-tab (or integrate into Planner).

Test: pick a start/end address, select 3-mile corridor, verify selected stops are within corridor bounding box using haversine; verify "Add to Queue" pushes stops to today's canvass.

---

### Phase E — Cutover (1 PR + ops)

**Entry criteria:** Phase D merged; rep has used VSI PT as parallel daily driver for 5 days without data loss.

**Pre-cutover ops:**
1. Run ETL `--truncate --write` to sync final data from PT PROD into VSI PT (or if VSI PT has been used live since Phase A, skip truncate and only upsert delta).
2. Execute `batch_queue` ID prefix-strip SQL from §4.
3. Rebuild and sideload VSI PT APK (same `appId: com.valuesystems.prospecttracker` — uninstall PT APK first, same signature conflict as noted in `feedback_apk_signature_reinstall.md`).

**Files:**
- `vsi-prospect-tracker/.github/workflows/deploy.yml` — GH Pages deploy workflow (same structure as PT's existing workflow).
- `prospect-tracker/index.html` — add `<meta http-equiv="refresh">` redirect to VSI PT GH Pages URL.

Test: install VSI APK on Pixel 8 Pro; open app; confirm Supabase hydration loads all records; confirm canvass queue shows today's stops; make one status change and verify it persists in Supabase.

**Rollback:** reinstall PT APK. Data is still in PT Supabase DEV unchanged.

---

### Phase F — Cleanup (1 PR)

**Entry criteria:** 14 days of stable daily use on VSI PT.

**Files:**
- `prospect-tracker/README.md` — archive notice pointing to `vsi-prospect-tracker`.
- `vsi-prospect-tracker/supabase/migrations/002_archive_prospect_schema.sql` — drop `prospect.app_state` table (but NOT the schema). Retain `prospect.raw_scrapes`.

**What to preserve:**
- `prospect.raw_scrapes` — historical archive, may be referenced for analytics.
- `prospect-tracker` repo — archive on GitHub (Settings → Archive repository), do not delete.

---

## Next Steps

The execution plan for this migration — covering branch strategy, day-by-day sequencing, and blocking decisions — will be written as:

`/Users/nomad/.claude/plans/<name-TBD>.md`

This file should be created after the audit is reviewed and signed off. The execution plan references this audit as the source of truth for column maps, phase entry criteria, and dependency graph.

**Immediate actions before execution plan:**
1. ~~Run `scripts/migrate_to_vsi.mjs` dry-run~~ — **done 2026-04-14.** 2043 rows, 0 errors. Field-loss triage: 5 fields (`pi`, `fb`, `ig`, `emp`, `grp`) → `metadata` JSONB. See §5.
2. Verify `vsi_prospect` schema exists in Supabase DEV with all required columns. **Phase 0 must add `metadata JSONB` column to `db_records` and `raw_scrapes` table** before ETL `--write`.
3. Confirm `batch_queue` ID prefix-strip SQL against DEV first (non-destructive SELECT count) — counts already confirmed during audit (§4).
4. Add `ALLOWED_ORIGINS` entry in `prospect-tracker-api` Vercel project env for VSI PT origin before Phase C.
