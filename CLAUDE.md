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

## Context Management
- Run /compact after every 3 feature branches completed
- Run /compact before starting any new phase
- Run /compact if the session exceeds ~50 tool calls
- When compacting, focus on: approved design doc, completed features, current branch, failing tests

## Autonomous Work
- Work in parallel whenever tasks are independent — don't wait for permission to parallelize
- Commit and tag at every phase boundary without being asked
- Run lint + type-check + tests before every commit; fix failures before committing

## Changelog, Backlog & Bug Tracking

**Before every commit:**
1. Update `HANDOFF.md` — current state, prioritized next steps, known bugs. Stage and commit it with your code changes.
2. Add entries to `CHANGELOG.md` under `## [Unreleased]` for any user-facing or notable changes.

**Commit message body** (include after the subject line for non-trivial commits):
```
## Changelog
- What was added or changed

## Bug Fixes
- What was fixed (or "none")

## Known Bugs
- What's still broken (or "none")

## Backlog
- Top 3-5 next priorities
```

**CHANGELOG.md format** ([Keep a Changelog](https://keepachangelog.com)):
```markdown
## [Unreleased]
### Added
### Fixed
### Changed
### Removed
```
Move `[Unreleased]` to `[x.y.z] - YYYY-MM-DD` on each release.

## Legacy Code
`app/` — the previous JavaScript version. Keep as reference only. Do not develop.

## Design Doc
Full spec (archived): `/Users/nomad/Projects/app-suite-docs/archive/2026-03-28-original-specs/PROSPECT-TRACKER-DESIGN.md`
Current technical analysis: `/Users/nomad/Projects/app-suite-docs/TECHNICAL_ANALYSIS_2026-03-30.md`

## POS Remote Access (SSH + Network Shares)

Bidirectional SSH and SMB access to the POS machine at `192.168.40.141`:

| Direction | Command |
|-----------|---------|
| Mac → POS | `ssh Aaron@192.168.40.141` |
| POS → Mac | `ssh nomad@192.168.40.10` |

- **Auth:** Ed25519 key pair (no password)
- **POS OS:** Windows 11 Pro, cmd.exe shell (use `findstr`, `dir`, `type` — not `grep`, `ls`, `cat`)
- **Claude Code on POS:** `C:\Users\Aaron\.local\bin\claude.exe` (v2.1.86)
- **SMB:** `/Volumes/POS` mounts full C: drive; `smb://192.168.40.141/SharedWithMac` for file transfers
- **Tools on POS:** Node v24.14.0, Python 3.12.10, Git 2.53.0, GitHub CLI, Claude Code 2.1.86
- **MariaDB service:** `sc query PecanMariaDB` (root/123456 on port 3306)

**Tailscale IPs (work outside LAN):**
| Device | LAN IP | Tailscale IP | Hostname |
|--------|--------|-------------|---------|
| Mac (aarons-imac) | 192.168.40.10 | 100.96.113.106 | aarons-imac |
| POS (aaron-sales) | 192.168.40.141 | 100.87.4.121 | aaron-sales |
| Android (Pixel 8 Pro) | — | 100.93.173.89 | pixel-8-pro |

Use Tailscale IPs when not on LAN: `ssh Aaron@100.87.4.121`

**Useful for Prospect Tracker:** Cross-reference prospect records against live POS customer data, verify POS site details for leads, query MariaDB to check whether a prospect is already a customer.

```bash
# Check if a location exists in live POS
ssh Aaron@192.168.40.141 "\"C:\\Program Files\\MariaDB 10.4\\bin\\mysql.exe\" -u root -p123456 scaffoldtest2 -e \"SELECT storeName FROM storesettings LIMIT 1;\""
# List files on POS
ssh Aaron@192.168.40.141 "dir C:\\repos\\"
# Copy a file from POS to Mac
scp Aaron@192.168.40.141:C:/path/to/file ./local/
```

**Multi-agent concurrency:** Prospect Tracker is read-only relative to the POS — no writes to MariaDB or API. Reads (SSH file reads, SELECT queries, GET API calls) are always safe in parallel. See parent CLAUDE.md for lock rules if a future task requires POS writes.
