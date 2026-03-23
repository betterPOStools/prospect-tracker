# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sales prospect tracker for Value Systems (a POS company). Aaron uses this to manage restaurant canvassing — importing Outscraper data, scoring/clustering prospects, scheduling canvass routes, and tracking leads.

## Build & Test

```bash
cd app
npm run dev         # Dev server on localhost:5173
npm run build       # Vite build — must pass before committing
npm run lint        # ESLint
npx playwright test # E2E tests (~228 tests, Chromium, ~2min)
```

Build stamp: `app/src/App.jsx` line 12 — update when making changes.

## React App (`/app/`)

### Stack
- React 19, Vite, CSS Modules + CSS variables (`tokens.css`)
- `useReducer` + Context for state (no Redux/Zustand)
- localStorage for persistence; Google Drive file sync + Supabase cross-device sync
- Playwright for E2E tests in `app/tests/`

### Key Architecture
```
src/
  data/
    store.jsx          — 3 contexts (Database, Prospects, Canvass) + reducers + DataProvider. DO NOT MODIFY lightly.
    storage.js         — localStorage keys & persistence. DO NOT MODIFY lightly.
    outscraper.js      — Outscraper API (submit, poll, processOutscraperRows)
    scoring.js         — calcScore(), calcPriority(), PRIORITIES, PRIORITY_EMOJI
    clustering.js      — buildClusters() — geographic ZIP clustering
    blocklist.js       — isBlocklisted(), DEFAULT_BLOCKLIST (~90 chains)
    helpers.js         — uid(), POS_OPTIONS, hoursChip(), parseTime()
    kmzExport.js       — KMZ/KML map export
    weekPlanner.js     — Week planning utilities
  hooks/
    useOutscraper.js   — Task submission, polling, batching, Supabase task sync
    useSnapshots.js    — takeSnapshot(), restoreSnapshot() (max 5, auto-trims on quota)
    useFileSync.js     — Google Drive file sync via File System API + IndexedDB
    useSupabaseSync.js — Supabase real-time sync (debounced 1.5s, echo-window 2s)
    useTheme.js        — Light/dark toggle
  features/
    database/          — DatabaseTab + sub-tabs: Browse, Zones, Week Planner, Outscraper, Blocklist, Snapshots
    canvass/           — Canvass route management
    leads/             — My Leads (converted prospects)
    route/             — Route optimization
    export/            — CSV/XLSX export
    sources/           — Free Sources tab
  components/          — Button, Card, Badge, Modal, StatBar, EmptyState, PosSelect
  lib/supabase.js      — Supabase client (uses VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
```

### State & Sync

**Contexts** (all in store.jsx):
- `useDatabase()` → `{ dbRecords, dbClusters, dbAreas, dbBlocklist }`
- `useProspects()` → leads array
- `useCanvass()` → canvass stops array

**Sync flow**: Startup loads File → Supabase → localStorage (newest per-field timestamp wins). On change: auto-save to localStorage (immediate) + File + Supabase (debounced 1.5s). Supabase realtime pushes to other devices.

**Record field abbreviations** (compact for localStorage): `n` (name), `ty` (type), `ci` (city), `zi` (zip), `ph` (phone), `em` (email), `sc` (score), `pr` (priority), `ar` (area), `zo` (zone), `da` (day), `st` (status), `pi` (place_id), `_ts` (per-field timestamps).

### Outscraper Integration

- localStorage keys (local-only, NOT synced to Drive/Supabase): `vs_os_key`, `vs_os_cfg`, `vs_os_tasks`
- Task metadata syncs to Supabase (resultData stripped to save space)
- Submit flow: buildQueries() → submitScrape() → getTaskConfig() for queueTaskId → poll /requests/{id}
- Poll endpoint returns results for ~2 hours after completion, then expires (status resets to "Pending" with no data)
- Task statuses: `pending` → `completed`/`failed`/`expired`
- processOutscraperRows() shared between XLSX file import and API import — identical dedup/scoring
- Tags sent to Outscraper: `"City, ST"` format (used in S3 filename)
- Vite dev proxy: `/s3-proxy/` → `https://s3.us-east-005.backblazeb2.com` (CORS bypass)

### CSS Variables (tokens.css)
`--bg`, `--bg2`, `--bg3`, `--text`, `--text2`, `--text3`, `--border`, `--border2`, `--accent`
`--radius` (8px), `--radius-lg` (12px), `--font` (DM Sans), `--mono` (DM Mono)
Semantic: `--blue-bg/text`, `--green-bg/text`, `--red-bg/text`, `--yellow-bg/text`, `--orange-text`, `--purple-bg/text`

### Rules
- Do NOT modify `store.jsx` or `storage.js` without very good reason
- Do NOT add Outscraper data to Drive sync or Supabase payloads
- No new npm dependencies without approval
- Inline styles (no new CSS module files) for new database-tab components
- Run `npm run build` and `npx playwright test` after changes

## Common Tasks

### Import Outscraper rows
```js
import { processOutscraperRows } from '../../data/outscraper.js'
const result = processOutscraperRows(rows, area, db.dbRecords, db.dbBlocklist, db.dbAreas)
dispatch({ type: 'IMPORT', dbRecords: result.allRecords, dbClusters: result.dbClusters, dbAreas: result.dbAreas })
```

### Add a Database sub-tab
1. Add tab name to `SUB_TABS` array in `DatabaseTab.jsx`
2. Create `MyPanel.jsx` in `features/database/`
3. Add `{subTab === 'My Tab' && <MyPanel />}` in DatabaseTab render

### Take a snapshot before destructive action
```js
const { takeSnapshot } = useSnapshots()
takeSnapshot('pre-import') // or 'pre-clear', 'manual'
```

## Legacy HTML File (`/Downloads/prospect_tracker.html`)

Single-file ~4100 line vanilla JS app. Rules when editing:
- **No template literals for HTML strings** — use string concatenation only
- **No static SheetJS `<script>` tags** — loaded dynamically via `loadScript()`
- **Run `node --check`** on extracted JS block before saving
- **Check for duplicate function names** after any additions
- **`data-*` attributes + event delegation** for onclick handlers in dynamic HTML
- Key utilities: `esc()`, `showMsg()`, `uid()`, `save()`, `stamp()`, `dl()`
- Update build stamp on line ~273 when making changes
