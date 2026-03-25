# Changelog

## v0.8.2
- Browse: area filter cascades into ZIP and zone dropdowns (only shows values for selected area)
- Browse: "Reassign areas" button — derives area from city field + rebuilds zones with auto-assignment
- Canvass: group field on each card for tagging stops while canvassing
- Canvass: group filter in queue panel
- Browse: removed group assignment controls (moved to canvass cards)
- Deployed webhook fix + migration to Supabase (Edge Function v2, migration 002)

## v0.8.1
- Fix Outscraper webhook: Edge Function now fetches results from `results_location` instead of expecting inline data
- App-side fallback: if Edge Function has no API key, app fetches via local key on webhook check
- Add CHANGELOG.md and BACKLOG.md tracking to every commit
- Add `docs/` folder with API docs (Outscraper, RouteXL, Nominatim)
- Bump build stamp to v0.8.1

## v0.8.0
- Embedded map view (MapPanel with Leaflet)
- Seed data for fresh installs
- Fix MapPanel lazy-loading, PWA meta tag

## v0.7.1
- Bulk edit in Browse panel

## v0.7.0
- PWA / offline support

## v0.6.0
- Analytics dashboard

## v0.5.0
- Outscraper output migrated from XLSX to JSON
- Pre-query filters, enrichments, webhook support, code splitting
- Outscraper webhook Edge Function + auto-import from Supabase

## v0.4.0
- Canvass overhaul: Queue / Follow Up / Completed sub-tabs
- Notes log + status history on canvass stops
- Scoring overhaul + record groups + dropped folder counter
- Leads -> Queue button
- RouteXL API integration, Nominatim geocoding, Navigate button
- Removal statuses (5 types) + blocklist-on-removal
- Working hours parsing from Outscraper data

## v0.3.5
- Utilities tab with sub-tabs, Database cleanup

## v0.3.4
- Tab restructure: My Leads first, remove Free Sources

## v0.3.3
- Remove All Stops, Planner rename, Today -> Canvass

## v0.3.2
- BrowsePanel list virtualization (@tanstack/react-virtual)

## v0.3.1
- Remaining optimization items (#11, #12, #14, #15, #16)

## Pre-v0.3
- See `git log` for React migration, Playwright test suite, KMZ export, 5-priority scoring, and earlier work
