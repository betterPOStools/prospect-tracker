# Backlog

## Bugs
- **Outscraper webhook** — Edge Function rewritten to fetch from `results_location`; needs deploy + real scrape test to verify (2026-03-25)

## Deploy Queue
- Set Supabase secret: `supabase secrets set OUTSCRAPER_API_KEY=...`
- Run migration 002 (`results_location` column): `supabase db push`
- Deploy Edge Function: `supabase functions deploy outscraper-webhook --no-verify-jwt`

## Tasks
- Remove SheetJS (`xlsx` package) once all old S3 XLSX files expire

## Outscraper — Not Yet Implemented
- Yelp scraper (`yelp_service`) — cross-reference Google Maps records with Yelp for additional coverage
- Google reviews by place_id (`google_maps_reviews`) — pull recent reviews for sentiment analysis
- Coordinates as query locations — use lat/lng URLs instead of ZIP codes

## Ideas
- Email outreach via Gmail — one-tap pitch email from lead cards
- Follow-up date field on leads/canvass stops, overdue floats to top
- Copper CRM direct API push (eliminate CSV export step)
- Coverage tracker — map/chart showing % of each zone worked
- Demo POS menu extractor (separate project)
