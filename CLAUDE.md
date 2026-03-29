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

## Stack
- React 19 + Vite + TypeScript (strict)
- Tailwind CSS 4 + `src/styles/mobile.css` for native overrides
- Supabase PostgreSQL (normalized tables in `prospect` schema)
- Capacitor 6 for Android native shell
- Vitest (unit) + Playwright (E2E)

## Key Architecture
```
src/
  lib/
    supabase.ts     — Supabase client
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

## Tabs
1. **My Leads** — converted leads pipeline (`prospect.leads`)
2. **Canvass** — daily working queue (`prospect.canvass_stops`)
3. **Route** — RouteXL optimization, leg-based navigation
4. **Database** — prospect records (`prospect.records`), Browse/Planner/Map
5. **Utilities** — Analytics/Import/Export/Backups/Blocklist/Settings

## Legacy Code
`app/` — the previous JavaScript version. Keep as reference only. Do not develop.

## Design Doc
Full spec: `/Users/nomad/Projects/app-suite-docs/docs/PROSPECT-TRACKER-DESIGN.md`
