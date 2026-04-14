# Prospect Tracker — Handoff

> Last updated: 2026-04-14

## Current State

**Build:** `v0.13.2` (app/src/App.jsx:13)  
**Branch:** `main` (feat/demo-builder-integration merged via PR #4)  
**Deployed:** GitHub Pages → `https://betterpostools.github.io/prospect-tracker/`  
**APK:** debug build installed on Pixel 8 Pro (100.93.173.89:5555)

---

## What's Working

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
f73af04 feat(database): needs_pdf badge + demo-builder URL + demo-databases doc
11e72ea feat: archive raw Outscraper data on every import
b7b019e feat: Demo Builder integration — batch queue, Demos tab, HTTP chain
```

---

## Next Up
- Monitor demo builder agent processing the queued records overnight
- Re-queue ~186 failed jobs (per db-suite/demo-builder agent logs)
- Consider adding state field (`st`/`state_code`) to dbRecord — currently not saved, baked into address string only; would enable state-level filtering in Demos tab
