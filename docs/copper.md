# Copper CRM API

Docs: https://developer.copper.com/

## Authentication

All requests require these headers:

```
X-PW-AccessToken: <api_key>
X-PW-Application: developer_api
X-PW-UserEmail: <email_of_token_owner>
Content-Type: application/json
```

HTTPS + TLS 1.2+ required.

## Base URL

```
https://api.copper.com/developer_api/v1
```

## Rate Limits

- **Standard:** 180 requests/minute (rolling window)
- **Bulk API:** 3 requests/second
- **429** returned when exceeded

## Endpoints Used

### Companies

**Create:** `POST /companies`

```json
{
  "name": "Restaurant Name",
  "address": {
    "street": "123 Main St",
    "city": "Myrtle Beach",
    "state": "SC",
    "postal_code": "29577"
  },
  "phone_numbers": [{ "number": "843-555-0001", "category": "work" }],
  "email_domain": "example.com",
  "details": "Notes about the restaurant",
  "tags": ["area:Myrtle Beach"],
  "websites": [{ "url": "https://example.com", "category": "work" }]
}
```

Response includes `id` for linking to People/Opportunities.

### People (Contacts)

**Create:** `POST /people`

```json
{
  "name": "Jane Manager",
  "emails": [{ "email": "jane@example.com", "category": "work" }],
  "phone_numbers": [{ "number": "843-555-0001", "category": "mobile" }],
  "company_id": 12345,
  "title": "Manager"
}
```

### Opportunities (Deals)

**Create:** `POST /opportunities`

```json
{
  "name": "Restaurant Name — POS Deal",
  "company_id": 12345,
  "primary_contact_id": 67890,
  "pipeline_id": "<from GET /pipelines>",
  "pipeline_stage_id": "<from GET /pipelines>",
  "monetary_value": 0,
  "status": "Open"
}
```

### Activities (Call/SMS/Note logs)

**Create:** `POST /activities`

```json
{
  "parent": {
    "type": "person",
    "id": 67890
  },
  "type": {
    "category": "user",
    "id": 0
  },
  "details": "Called — left voicemail"
}
```

Activity type IDs (from `GET /activity_types`):
- `0` = Note
- Phone Call and Meeting IDs are account-specific — fetch from API

`parent.type` can be: `"person"`, `"company"`, `"opportunity"`

### Pipelines & Stages

**List:** `GET /pipelines`

Returns array of pipeline objects:

```json
{
  "id": 12345,
  "name": "Sales Pipeline",
  "stages": [
    { "id": 1, "name": "Prospect", "win_probability": 0 },
    { "id": 2, "name": "Demo Scheduled", "win_probability": 25 },
    { "id": 3, "name": "Proposal Sent", "win_probability": 50 },
    { "id": 4, "name": "Closed Won", "win_probability": 100 }
  ]
}
```

Stage IDs are account-specific — must fetch at runtime or configure.

### Activity Types

**List:** `GET /activity_types`

Returns `{ "user": [...], "system": [...] }`. Each type has `id`, `name`, `category`.

## Integration Plan (v0.12.0)

### Push flow: Lead → Copper

1. **GET /pipelines** → cache pipeline_id + stage_ids (or store in settings)
2. **GET /activity_types** → cache call/note type IDs
3. On "Push to Copper" from lead card:
   - **POST /companies** → get `company_id`
   - **POST /people** (with `company_id`) → get `person_id`
   - **POST /opportunities** (with `company_id` + `person_id` + `pipeline_stage_id`)
4. On call/SMS/note log:
   - **POST /activities** (parent = person or company)

### Config needed from Aaron

- API key (Settings → Integrations → API Keys in Copper)
- Email associated with the API key
- Which pipeline to use (if multiple)
- Desired initial stage for new opportunities
