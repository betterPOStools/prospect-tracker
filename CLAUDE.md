# Prospect Tracker — Claude Code Guide

## Project Overview

Sales prospect tracker for Value Systems (a POS company). Aaron uses this to manage restaurant canvassing — importing Outscraper data, scoring/clustering prospects, scheduling canvass routes, and tracking leads.

Two codebases exist side-by-side:
- **`/app/`** — React 19 + Vite app (the active, production codebase)
- **`/Downloads/prospect_tracker.html`** — Legacy single-file vanilla JS version (still receives feature ports)

## React App (`/app/`)

### Stack
- React 19, Vite, CSS Modules + CSS variables (`tokens.css`)
- `useReducer` + Context for state (no Redux/Zustand)
- localStorage for persistence; Google Drive file sync + Supabase cross-device sync
- Playwright for E2E tests (`npx playwright test` from `/app/`)

### Key Architecture
```
src/
  data/
    store.jsx          — All contexts, reducers, DataProvider. DO NOT MODIFY lightly.
    storage.js         — localStorage keys (vs_p3, vs_c1, vs_db, etc.). DO NOT MODIFY.
    scoring.js         — calcScore(), calcPriority(), PRIORITIES, PRIORITY_EMOJI
    clustering.js      — buildClusters() — geographic ZIP clustering
    blocklist.js       — isBlocklisted(), DEFAULT_BLOCKLIST
    outscraper.js      — Outscraper API logic + processOutscraperRows() shared function
  hooks/
    useSnapshots.js    — takeSnapshot(), restoreSnapshot()
    useOutscraper.js   — React hook wrapping outscraper.js
    useFileSync.js     — Google Drive file sync
    useSupabaseSync.js — Supabase real-time sync
  features/
    database/          — DatabaseTab, ImportBar, BrowsePanel, ZonesPanel, WeekPlannerPanel, OutscraperPanel
    canvass/           — Canvass route management
    leads/             — My Leads (converted prospects)
    route/             — Route optimization
    export/            — CSV/XLSX export
    sources/           — Free Sources tab
  components/
    Button, Card, Badge, Modal, StatBar, EmptyState, PosSelect
```

### State Shape (store.jsx)
```js
// Database context (useDatabase())
{ dbRecords, dbClusters, dbAreas, dbBlocklist }

// IMPORT action
dispatch({ type: 'IMPORT', dbRecords, dbClusters, dbAreas })
```

### Outscraper localStorage Keys (local-only, NOT synced)
- `vs_os_key` — API key
- `vs_os_cfg` — Config (categories, autoImport)
- `vs_os_tasks` — Task queue

### CSS Variables (tokens.css)
`--bg`, `--bg2`, `--bg3`, `--text`, `--text2`, `--text3`, `--border`, `--accent`
`--radius`, `--radius-lg`, `--font`, `--mono`
`--blue-bg`, `--blue-text`, `--green-text`, `--red-text`, `--yellow-text`

### Rules
- Do NOT modify `store.jsx` or `storage.js` without very good reason
- Do NOT add Outscraper data to Drive sync or Supabase payloads
- No new npm dependencies without approval
- Inline styles (no new CSS module files) for new database-tab components
- Run `npm run build` and `npx playwright test` after changes

## Legacy HTML File (`/Downloads/prospect_tracker.html`)

Single-file ~4100 line vanilla JS app. Rules when editing:
- **No template literals for HTML strings** — use string concatenation only
- **No static SheetJS `<script>` tags** — loaded dynamically via `loadScript()`
- **Run `node --check`** on extracted JS block before saving
- **Check for duplicate function names** after any additions
- **`data-*` attributes + event delegation** for onclick handlers in dynamic HTML
- Key utilities: `esc()`, `showMsg()`, `uid()`, `save()`, `stamp()`, `dl()`
- Update build stamp on line ~273 when making changes

## Common Tasks

### Add a Database sub-tab (React)
1. Add tab name to `SUB_TABS` array in `DatabaseTab.jsx`
2. Create `MyPanel.jsx` in `features/database/`
3. Add `{subTab === 'My Tab' && <MyPanel />}` in DatabaseTab render

### Import Outscraper rows (React)
```js
import { processOutscraperRows } from '../../data/outscraper.js'
const result = processOutscraperRows(rows, area, db.dbRecords, db.dbBlocklist, db.dbAreas)
dispatch({ type: 'IMPORT', dbRecords: result.allRecords, dbClusters: result.dbClusters, dbAreas: result.dbAreas })
```

### Take a snapshot before destructive action
```js
const { takeSnapshot } = useSnapshots()
takeSnapshot('pre-import') // or 'pre-clear', 'manual'
```

## Build & Test
```bash
cd app
npm run build       # Vite build — must pass before committing
npx playwright test # 228 tests, ~2min
npm run dev         # Dev server on localhost:5173
```
