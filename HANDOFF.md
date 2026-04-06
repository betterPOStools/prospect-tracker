# HANDOFF — prospect-tracker

This file is updated before every commit so any Claude Code session can pick up where the last one left off.

**Last updated:** 2026-04-02 (Supervisor — Supabase migration to prod, TS build fixes)
**Branch:** main

---

## Who You're Working With

Aaron is a POS field tech and sales rep at Value Systems POS. Prospect Tracker is App 1 of 4 in the pipeline — a field CRM for canvassing and lead management. It runs as a React/Vite SPA and is wrapped in Capacitor for Android.

---

## Current State

Post-Supabase migration: the app now points to the shared PROD Supabase project (`nngjtbrvwhjrmbokephl`), `prospect` schema. TypeScript build errors (OfflineBanner.tsx, useOutscraper.ts) have been fixed. App should be building clean and deploying to Vercel on push to main.

---

## Next Steps

1. **Verify Vercel deploy** — push to main, confirm live URL works end-to-end with prod Supabase
2. **Wire lead "Won" → Menu Import** — URL handoff `?name=&url=&type=` when a lead is marked Won
3. **Android build** — run `npx cap sync && npx cap open android`, verify Capacitor shell works on device
4. **Copper CRM sync** — bidirectional sync is planned; currently export-only

## Known Bugs

- None currently known post-build-fix

## Environment Notes

- Dev server: `npm run dev` → port 5176
- Supabase: PROD project `nngjtbrvwhjrmbokephl`, schema `prospect`
- `.env.local` in repo root (gitignored)
- Vercel project: `prospect-tracker` (auto-deploys on push to main)
