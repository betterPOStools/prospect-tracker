# Phase A Migration Runlog — 2026-04-15

Execution log for Phase A of the PT → VSI Prospect Tracker migration (see `docs/VSI_MIGRATION_AUDIT.md` and plan `~/.claude/plans/tender-meandering-eagle.md`).

## Environment

- **Source / target Supabase:** DEV `mqifktmmyiqzrolrvsmy` (in-place migration into `vsi_prospect` schema).
- **Script:** `scripts/migrate_to_vsi.mjs` (v dry-run + `--write` gated behind "Type MIGRATE").
- **Branch:** `audit/vsi-migration` (PR #7).
- **Prereqs landed in Phase 0 (VSI PT):** `id` columns retyped UUID → TEXT on `db_records`, `canvass_stops`, `leads`; `db_records.metadata JSONB` added; `raw_scrapes`, `location_tracks`, `os_tasks`, `app_config` tables created with permissive RLS.

## Phase A1 — ETL write

### Result summary

| Target table | Rows written | Source count | Notes |
|---|---:|---:|---|
| `vsi_prospect.db_records` | 1925 | 1925 | Matches audit baseline. `metadata` JSONB carries `pi` (1925), `fb` (953), `ig` (672), `emp` (216), `grp` (12). |
| `vsi_prospect.canvass_stops` | 4 | 4 | Status map applied: `Not visited yet → not_visited`. |
| `vsi_prospect.leads` | 5 | 5 | `priority` defaulted to empty string (see fixup). |
| `vsi_prospect.blocklist` | 0 | 109 | FAILED on first pass — see fixup. |
| `vsi_prospect.day_logs` | 0 | 0 | PT day logs are localStorage-only (`appendDaySummary` in `canvassLog.js`). |

Total landed on the first successful pass: **1934 / 2043**.

### Raw ETL output (trimmed)

```
=== PT → VSI Dry-Run Migration Report ===
Source: https://mqifktmmyiqzrolrvsmy.supabase.co
Target: https://mqifktmmyiqzrolrvsmy.supabase.co
[TRANSFORM] dbRecords        : 1925 → 1925  (0 skipped, 3778 warnings)
[TRANSFORM] canvass stops    : 4 → 4  (0 skipped, 0 warnings)
[TRANSFORM] leads (prospects): 5 → 5  (0 skipped, 100 warnings)
[TRANSFORM] blocklist        : 109 → 109
[TRANSFORM] day_logs         : 0 → 0
=== Validation errors ===
(none)
[3/3] Writing to target ...
  [OK] db_records: 1925 rows upserted
  [OK] canvass_stops: 4 rows upserted
  [OK] leads: 5 rows upserted
  [ERROR] blocklist: ON CONFLICT DO UPDATE command cannot affect row a second time
```

### Fixup 1 — blocklist duplicate-key failure

The ETL batch upsert failed with *"ON CONFLICT DO UPDATE command cannot affect row a second time"*. Root cause: the source `dbBlocklist` array contains case/whitespace-variant duplicates (e.g. `"McDonald's"` and `"mcdonalds"`). Postgres refuses to update the same target row twice in a single statement.

Resolved out-of-band with a deterministic de-duplicating SQL insert:

```sql
INSERT INTO vsi_prospect.blocklist (name)
SELECT DISTINCT trim(name) AS name
FROM   (<109 source strings>) AS src(name)
WHERE  trim(name) <> ''
ON CONFLICT (name) DO NOTHING;
```

Result: **108 unique rows inserted** (1 row collapsed by `DISTINCT trim()` — confirmed a case-variant dupe in the PT blob).

**Script follow-up (non-blocking):** `scripts/migrate_to_vsi.mjs` → `transformBlocklist` (around line 558) should `Map`-dedupe on `trim().toLowerCase()` before batching. Tracked for a re-run safety pass; not required for this cutover because the 108 rows are already in place.

### Fixup 2 — leads.priority default

The VSI PT `LeadsTab` `PriorityBadge` lookup (`src/crm/LeadsTab.tsx:163`) crashes when `priority` is not one of `hot | warm | cold | lost`. ETL defaulted to `""` because PT leads have no `priority` field.

```sql
UPDATE vsi_prospect.leads
SET    priority = 'warm'
WHERE  priority = '' OR priority IS NULL;
-- 5 rows.
```

**Script follow-up (non-blocking):** default `priority` to `'warm'` (the VSI schema default) in `transformLeads`, not `""`.

## Phase A2 — `demo_builder.batch_queue` `db_`-prefix strip

Per audit §4, the PT-era batch queue stored `pt_record_id` values as `db_<place_id>` strings. Now that VSI's `db_records.id` is TEXT holding the raw Google Place ID, the queue must store raw IDs to join cleanly.

```sql
-- Trim prefixes on real rows.
UPDATE demo_builder.batch_queue
SET    pt_record_id = substring(pt_record_id FROM 4)
WHERE  pt_record_id LIKE 'db_%';
-- 1598 rows.

-- Drop test UUIDs (non-ChIJ/GhIJ shapes) that were never valid place IDs.
DELETE FROM demo_builder.batch_queue
WHERE  pt_record_id !~ '^(ChIJ|GhIJ|EiN|EkQ)';
-- 7 rows.
```

### Verification

```sql
SELECT count(*)
FROM   demo_builder.batch_queue q
JOIN   vsi_prospect.db_records  r ON r.id = q.pt_record_id;
-- 1598 — every remaining queue row joins.
```

An ADR for this change belongs in `db-suite/demo-builder/docs/adr/` (follow-up PR on that repo).

## Session incidents worth noting

1. **Supabase Management API `POST /v1/projects/{ref}/pause` is destructive.** Probing for a 404 instead returned 200 and paused DEV for ~2 minutes. Captured as `memory/feedback_supabase_pause_is_destructive.md`. Do not POST against unfamiliar Mgmt API paths on live projects.
2. **Free-plan egress overshoot silently throttled PostgREST config reloads.** Dashboard Save, Management API PATCH, `NOTIFY pgrst`, and full project restart all no-op'd while the org was over quota (5.388 / 5 GB). Resolution: organization upgraded to Pro. Captured in `memory/feedback_postgrest_schema_expose_reload.md`.
3. **PGRST106 persisted after upgrade** for ~1 hour. Root cause turned out to be a role-level GUC override: `authenticator` had `pgrst.db_schemas` pinned via `ALTER ROLE ... SET`, which overrides every other reload surface. Fix was a one-liner:
   ```sql
   ALTER ROLE authenticator
     SET pgrst.db_schemas = 'public, prospect, demo_builder, menu_import, scaffold, template_builder, vsi_prospect';
   ```
   Captured in full as `memory/feedback_pgrst_db_schemas_role_override.md`.

## Next

- Phase B (three parallel PRs on `vsi-prospect-tracker`): `feat/outscraper-archive`, `feat/route-endpoint-picker`, `feat/end-of-day-modal`.
- Script cleanup (non-blocking): blocklist dedupe + leads priority default in `scripts/migrate_to_vsi.mjs`.
- ADR on `db-suite/demo-builder` for the prefix strip.
