# Prospect Tracker — Handoff

> Last updated: 2026-04-14 (session 2)

## Current State

**Build:** `v0.13.2` (app/src/App.jsx:13)
**Branch:** `main` — PR #5 merged (`750c55e`)
**Deployed:** GitHub Pages → `https://betterpostools.github.io/prospect-tracker/`
**APK:** debug build rebuilt + installed on Pixel 8 Pro this session (100.93.173.89:5555)

---

## What's Working

### AI Prioritization Panel polish (PR #5, 2026-04-14)
- **Persistence**: current shortlist/brief survives tab switches + app reloads via `vs_ai_last_result` in localStorage (`app/src/data/briefHistory.js` — `saveLastResult` / `loadLastResult` / `clearLastResult`).
- **History Load**: HistoryModal entries now have a Load action that rehydrates a past run into the panel.
- **Active-queue exclusion**: candidate pool filters out records whose `id` is already referenced by a stop in the Canvass queue (`fromDb`). Fixes the "Add to Queue does nothing" silent no-op caused by dedup blocking every selection.
- **Toast clarity**: Add-to-Queue now says `Nothing added — all N already in Canvass queue` vs `Added N (M already present)` vs `Added N. Open Route tab to optimize.`
- **Silent output-truncation guard**: `aiRanking.js` checks `usage.outputTokens` and surfaces a clear error when Haiku hits the output cap mid-JSON (previously returned empty shortlist with no error).
- **Known soft-spot**: `rank` (Haiku) ignores soft userContext budgets like "2 hour day"; `brief` (Sonnet) respects them. Captured in memory `feedback_ai_rank_vs_brief_context.md`.

### Corridor Planner (PR #5, 2026-04-14)
- New panel: `app/src/features/database/CorridorPlannerPanel.jsx`, mounted in Planner tab above week-day columns, under `AiPriorityPanel`.
- Selection module: `app/src/data/corridorPlanner.js`
  - `filterCorridor(records, a, b, widthMiles)` — ellipse test: `dA + dB ≤ |AB| + 2·widthMiles`.
  - `projectOnLine(a, b, p)` — law-of-cosines scalar projection so stops order naturally along A→B.
  - `selectCorridorStops(...)` returns `{ stops, estMinutes, rejected }` in two modes:
    - **By stops**: top-N by `sc` desc, re-ordered by projection.
    - **By time**: walk A→B in projection order, greedy pick while reserving tail drive to B so the budget is honored.
  - `DEFAULT_VISIT_MIN = 3` (was 15 — user: "most are under 3 minutes, 5 max"); `DEFAULT_AVG_MPH = 25`.
- Shares the `vs_rxl_*` localStorage keys with Route tab so Start/End picked in one place is remembered in the other.
- Clicking **Add to Canvass queue** parks the selected corridor stops; the Route tab's RouteXL step then sequences them within the picked endpoints.

### Route tab — Start/End endpoint picker + order persistence (PR #5, 2026-04-14)
- Start/End dropdowns in `app/src/features/route/RouteTab.jsx`: `Current GPS | Home | Work | Custom…`. End adds `None` (one-way).
- Home/Work addresses entered once in **RouteXL setup** panel, persisted to localStorage + geocoded lazily via Nominatim with a coord cache.
- `callRouteXL` passes `fixedends=1` to RouteXL when Start/End resolve, so the optimizer cannot swap the picked endpoints.
- Order rehydration: optimized sequence + legs persist in `vs_route_order` and reload on tab switch (same-day gated via `date` key).
- 401 / credential errors now auto-open the RouteXL setup panel instead of a dead-end toast.
- Google Maps "Open route" URL builds a leg-aware URL: origin on leg 0, destination on the last leg, picked Start/End inserted as real addresses rather than `__start__` / `__end__` sentinels.
- Backing storage keys (shared with Corridor Planner): `vs_rxl_start_choice`, `vs_rxl_end_choice`, `vs_rxl_home_addr`, `vs_rxl_home_coords`, `vs_rxl_work_addr`, `vs_rxl_work_coords`, `vs_rxl_custom_start`, `vs_rxl_custom_end`.

### Service worker POST fix (PR #5)
- `app/public/sw.js` now guards on `event.request.method !== 'GET'` and passes through vercel.app requests untouched. Previously the blanket cache.put() threw on any POST (including the AI rank proxy).

### Demo Builder Integration (PR #4, merged 2026-04-13)
- **Demos tab** — Database → Demos (4th sub-tab after Map)
  - Filters: name search, city dropdown, type dropdown, status dropdown (All/Not started/Queued/Generating/Ready/Failed)
  - Summary: "N records · N to generate · of N total"
  - Queue All (N) button — disabled when nothing to generate
  - Per-row: Generate / Retry / Load Demo buttons; City column
- **demoBuilder.js** — API client with module-level status cache + pub/sub; `useDemoStatus()` hook for CanvassCard
- **CanvassCard** — "Load Demo" button when `demoEntry.status === 'done'`
- **LeadCard** — "Build Custom Demo ↗" opens demo builder with pre-filled params

### Capacitor → Demo Builder HTTP Chain
- `androidScheme: http` (was https) — eliminates mixed-content block on HTTP endpoints
- `network_security_config.xml` — allows cleartext to `100.118.51.78` (Mac Tailscale)
- `proxy.ts` in demo-builder — CORS handler for `http://localhost` origin (Next.js 16 convention)
- `VITE_DEMO_BUILDER_URL=https://demo-builder-seven.vercel.app` (production, in `.env.local`)
- `LOCAL_DEMO_BUILDER_URL=http://100.118.51.78:3002` — used only for local filesystem writes

### Raw Scrape Archiving (2026-04-14)
Every import now saves unstripped raw rows to two places:
1. **Supabase `prospect.raw_scrapes`** — always-on cloud backup (area, source, task_id, row_count, raw_data JSONB)
2. **Local file** via demo-builder `/api/scrapes/save` → `Scrapes/raw/YYYY-MM-DD_area_source.json` (when on LAN)

Covers all three import paths: file upload, API fetch, webhook.

### Supabase DEV Configuration Fixes (2026-04-13)
- `prospect` schema now exposed to PostgREST (`ALTER ROLE authenticator SET pgrst.db_schemas`)
- All suite schemas exposed: `public, prospect, demo_builder, menu_import, scaffold, template_builder`
- GitHub Pages secrets updated to DEV project (`mqifktmmyiqzrolrvsmy`) — was pointing to dead PROD

---

## Known Issues / Watch Items

### Demo Builder Queue Failures
- Records fail when the restaurant website blocks scraping (Cloudflare, JS-heavy, no menu)
- Status shows "Failed" with error tooltip — use Retry button
- Playwright fallback in demo-builder agent handles JS-rendered menus (cc9f2d8)
- `VITE_DEMO_BUILDER_URL` now points at Vercel production — agent must be running locally to actually process

### Demo Builder Local vs Vercel
- Queue/status API calls go to `demo-builder-seven.vercel.app`
- Filesystem writes (raw scrapes) go to `100.118.51.78:3002` — requires local demo-builder running
- To start local: `cd db-suite/demo-builder && npm run dev -- -H 0.0.0.0`
- Local log: `tail -f /tmp/demo-builder.log`

---

## Infrastructure

### Supabase DEV (`mqifktmmyiqzrolrvsmy`)
- Schema: `prospect` — tables: `app_state`, `records`, `leads`, `canvass_stops`, `raw_scrapes`
- `app_state` row 1 = full app state JSON (~1.4MB), synced on every change
- `raw_scrapes` = all unstripped Outscraper import data going forward

### PT Record ID Format
**PT record IDs are Google Place IDs: `db_ChIJ...`** — NOT UUIDs.  
Any Supabase column storing PT record refs must be `TEXT`. This bit us in `batch_queue.pt_record_id` (was UUID, fixed in migration 003).

### GitHub Pages Deploy
- Triggered on push to `main` via `.github/workflows/deploy.yml`
- Secrets: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (both set to DEV project)
- **Does NOT include `VITE_DEMO_BUILDER_URL`** — falls back to `http://localhost:3002` in the bundle (GH Pages can't reach the local Mac anyway; demo builder is Vercel for the browser version)

### ADB / APK
- Device: `adb connect 100.93.173.89:5555` (Pixel 8 Pro via Tailscale)
- Build + install:
  ```bash
  CAPACITOR_BUILD=1 npm run build && npx cap sync android
  cd android && ./gradlew assembleDebug -q
  adb -s 100.93.173.89:5555 install -r android/app/build/outputs/apk/debug/app-debug.apk
  ```
- Switching prod→debug APK requires uninstall first (signature mismatch)

---

## Recent Commits
```
750c55e AI panel polish + Corridor Planner + Route endpoint picker (#5)
813758f docs: add HANDOFF.md — session state as of 2026-04-14
f73af04 feat(database): needs_pdf badge + demo-builder URL + demo-databases doc
11e72ea feat: archive raw Outscraper data on every import
b7b019e feat: Demo Builder integration — batch queue, Demos tab, HTTP chain
```

---

## Next Up
- Monitor demo builder agent processing the queued records overnight
- Re-queue ~186 failed jobs (per db-suite/demo-builder agent logs)
- Consider adding state field (`st`/`state_code`) to dbRecord — currently not saved, baked into address string only; would enable state-level filtering in Demos tab
- Decide whether to tighten the `rank` prompt so Haiku respects free-text budget hints, or keep brief-mode as the "budget-aware" path
- If users start planning the whole week in one pass (vs. working out of the Canvass queue), wire AI-seeds into `autoAssignDay` directly — see memory `project_ai_queue_routing_decision.md`
