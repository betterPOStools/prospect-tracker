# Backlog

## Bugs
- ~~**Outscraper webhook** — verified working end-to-end (2026-03-25)~~
- **Stuck DB statuses** — records may be stuck as "in_canvass" from earlier demotion bug (fixed in v0.10.0). Use Browse bulk edit to reset to "unworked".

## Tasks
- ~~Remove SheetJS (`xlsx` package)~~ — done in v0.11.1

## Outscraper — Not Yet Implemented
- Yelp scraper (`yelp_service`) — cross-reference Google Maps records with Yelp for additional coverage
- Google reviews by place_id (`google_maps_reviews`) — pull recent reviews for sentiment analysis
- Coordinates as query locations — use lat/lng URLs instead of ZIP codes

## Upcoming
- **Copper CRM integration (v0.12.0)** — push leads as Company+Person+Opportunity, sync call/SMS logs as Activities. Needs API key + account-specific pipeline/stage IDs from Aaron.

## Ideas
- Email outreach via Gmail — one-tap pitch email from lead cards
- ~~Coverage tracker~~ — done in v0.11.1 (stacked bars in Analytics)
- Demo POS menu extractor (separate project)
