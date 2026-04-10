# CLAUDE.md — Prospect Tracker

## Project Rules
- Follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Never commit directly to main — use feature branches (`feat/*`, `fix/*`, `refactor/*`)
- Run `npm run lint` and `npm test` before every commit
- One logical change per commit
- No features outside the approved design doc (`app-suite-docs/docs/PROSPECT-TRACKER-DESIGN.md`)

## Allowed Commands
- `npm install`, `npm run build`, `npm run dev`, `npm test`, `npm run lint`, `npm run format`, `npm run type-check`
- `npx` for project-scoped tools only
- `git add`, `git commit`, `git checkout -b`, `git tag`
- File operations within project directory only

## Blocked (require human approval)
- `git push`
- `git merge` to main
- `rm -rf`
- Any command outside the project directory
- Any deployment command

## Dev Server Port
This app runs on port **5176**. See the [suite port table](/Users/nomad/Projects/CLAUDE.md#dev-server-port-assignments) for all assignments — never change ports without updating that table.

## Stack
- React 19 + Vite + TypeScript (strict)
- Tailwind CSS 4 + `src/styles/mobile.css` for native overrides
- Turso (LibSQL/SQLite) — migrated from Supabase 2026-04-10
- Capacitor 6 for Android native shell
- Vitest (unit) + Playwright (E2E)

## Key Architecture
```
src/
  lib/
    supabase.ts     — DEPRECATED (Supabase client, no longer used)
    platform.ts     — isNative, isAndroid, exportFile, getNetworkStatus
    storage.ts      — localStorage cache helpers
  store/
    DataProvider.tsx     — composes all contexts
    RecordsContext.tsx   — prospect.records state
    LeadsContext.tsx     — prospect.leads state
    StopsContext.tsx     — prospect.canvass_stops state
    OfflineContext.tsx   — online/offline + mutation queue
  data/
    scoring.ts      — calcScore(), calcPriority()
    clustering.ts   — haversine()
    dayPlanner.ts   — fillFromAnchor()
    outscraper.ts   — processOutscraperRows(), Zod schemas
    blocklist.ts    — DEFAULT_BLOCKLIST, isBlocklisted()
    analyticsCalc.ts
    canvassLog.ts
    migration.ts    — one-time migration from old localStorage
  features/
    leads/          — LeadsTab
    canvass/        — CanvassTab
    route/          — RouteTab
    database/       — DatabaseTab (Browse, Planner, Map)
    utilities/      — UtilitiesTab (Analytics, Import, Export, Backups, Blocklist, Settings)
  components/       — Button, Badge, Card, Modal, TabBar, StatusBar, EmptyState
  styles/
    global.css      — Tailwind + CSS vars
    mobile.css      — Native-only overrides, scoped to body.native
  types/
    index.ts        — all shared interfaces
```

## Database (Supabase DEV)

Rolled back from Turso to Supabase DEV on 2026-04-10. Turso migration had white-screen issues; DEV Supabase is stable.

- **Project:** `mqifktmmyiqzrolrvsmy` (DEV) — PROD `nngjtbrvwhjrmbokephl` is stuck/unrecoverable
- **URL:** `https://mqifktmmyiqzrolrvsmy.supabase.co`
- **Env vars (baked into APK at build time):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Sync hook:** `app/src/hooks/useSupabaseSync.js` — Supabase realtime
- **Schema:** `prospect` — tables: `app_state` (full state JSON), `records`, `leads`, `canvass_stops`
- **APK:** rebuild required after any env change — `npm run build && npx cap sync android && ./gradlew assembleDebug`
- **APK output:** `app/android/app/build/outputs/apk/debug/app-debug.apk`

## Tabs
1. **My Leads** — converted leads pipeline (`prospect.leads`)
2. **Canvass** — daily working queue (`prospect.canvass_stops`)
3. **Route** — RouteXL optimization, leg-based navigation
4. **Database** — prospect records (`prospect.records`), Browse/Planner/Map
5. **Utilities** — Analytics/Import/Export/Backups/Blocklist/Settings

## Context Management
- Run /compact after every 3 feature branches completed
- Run /compact before starting any new phase
- Run /compact if the session exceeds ~50 tool calls
- When compacting, focus on: approved design doc, completed features, current branch, failing tests

## Autonomous Work
- Work in parallel whenever tasks are independent — don't wait for permission to parallelize
- Commit and tag at every phase boundary without being asked
- Run lint + type-check + tests before every commit; fix failures before committing

## Legacy Code
`app/` — the previous JavaScript version. Keep as reference only. Do not develop.

## Design Doc
Full spec (archived): `/Users/nomad/Projects/app-suite-docs/archive/2026-03-28-original-specs/PROSPECT-TRACKER-DESIGN.md`
Current technical analysis: `/Users/nomad/Projects/app-suite-docs/TECHNICAL_ANALYSIS_2026-03-30.md`
