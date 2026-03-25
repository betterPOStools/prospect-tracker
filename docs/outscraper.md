# Outscraper API

## Auth
Header: `X-API-KEY`. Reseller account — `GET /tasks` list endpoint returns empty (not supported). Request IDs are required for polling.

## Endpoints
- `POST /tasks` — submit async scrape
- `GET /requests/{requestId}` — poll status + get results (status: Pending → Running → Success)
- `GET /tasks` — list all tasks by API key (NOT supported by our reseller)
- `GET /tasks/{taskId}` — get task config/metadata (title, tags, queue_task_id)

Results available in `data: [...]` in the poll response body when Success. Also downloadable via S3 URL. **2-hour data availability window** after completion — after that, status resets to "Pending" with no data.

## Webhook
- Add `webhook` field to `POST /tasks` payload with a URL
- Outscraper POSTs a **notification** (not the data) when complete:
  ```json
  {
    "id": "request-id",
    "status": "SUCCESS",
    "results_location": "https://api.outscraper.cloud/requests/request-id",
    "quota_usage": [{ "product_name": "Google Maps Data", "quantity": 1 }]
  }
  ```
- Must fetch actual results from `results_location` using API key
- Signature header: `X-Hub-Signature-256: sha256=HMAC(api_key, raw_payload)`

## Implemented features
- JSON output — `output_extension: 'json'`
- Pre-query filters — `minRating`, `minReviews` in payload filters
- Webhook URL — `webhook` field in payload
- Phone enrichment — `phones_enricher` (carrier + line type)
- US company data — `us_companies_data_enricher` (employees/revenue/NAICS)
- Contact enrichment — `contacts_n_leads` + `company_insights_service` + `emails_validator_service`

## Not yet implemented
- Yelp scraper (`yelp_service`) — cross-reference with Google Maps
- Google reviews by place_id (`google_maps_reviews`) — sentiment analysis
- Coordinates as query locations — `https://www.google.com/maps/search/restaurants/@lat,lng,17z`

## Pricing
Pay only for results extracted — not per query. Empty ZIP queries cost nothing. Duplicates not charged.

## Query tips
- `exactMatch: false` (default) — Google may add adjacent categories
- 500 result cap per query — split into ZIP codes to get more
- 25-query batch limit for sync API only — async `POST /tasks` supports many more

## Reseller limitations
- `GET /tasks` list: returns empty
- Cross-device task visibility requires manual "Add by task ID" or Supabase sync
- Task ID format: first 8 chars = YYYYMMDD (used to construct S3 download URLs)
- `queue_task_id` (UUID) from submit response = the `requestId` for polling
