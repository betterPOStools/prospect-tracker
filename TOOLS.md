# TOOLS — Prospect Tracker

Tool-and-script reference per suite policy (`Projects/CLAUDE.md` → Tool & Script Documentation Policy). Every non-trivial utility that lives in or around this repo is documented here.

## AI Prioritization Layer

### `prospect-tracker-api` (sibling repo / Vercel project)

**Path:** `/Users/nomad/Projects/betterpostools/prospect-tracker-api/`

**Purpose.** Stateless Vercel edge proxy between the Prospect Tracker client (Capacitor APK + GitHub Pages) and the Anthropic Claude API. Holds the Anthropic key server-side so it never ships in a client bundle.

**What it achieves.** Accepts `POST /api/rank` with `{ mode, candidates, todayIso }`; returns either a ranked shortlist (Haiku 4.5) or a narrative day briefing (Sonnet 4.6 + extended thinking). The stable system prompt uses prompt caching (ephemeral 5-min) for ~10x cost reduction on the prefix after the first hit of a session.

**Inputs / env vars:**
- `ANTHROPIC_API_KEY` (required)
- `ALLOWED_ORIGINS` (comma-separated; must include `capacitor://localhost` + GH Pages domain)

**Constraints & iteration history:**
- Key in APK considered and rejected — APK bundles are trivially decompilable; any baked `VITE_*` secret is leaked to any user with the device.
- Piggyback on Demo Builder's Vercel considered and rejected — coupling two apps' AI budget and logs to one project makes ops harder. Second project is cheap.
- Persisting AI-relevant fields on Record schema (`lc`, `cf`, `fd`) considered and rejected for v1 — canvass_stops already holds the ground truth; deriving at call-time avoids a migration + drift. Revisit if we ever need AI ranks to survive a full rescore.
- Two output modes (`rank` + `brief`) ship simultaneously so the user can A/B them in the field before we converge on one.
- `thinking` is enabled only for `brief` mode — on mobile, a 5–10s latency on shortlist would kill the interactive feel of the Planner.
- Rate limit is a tiny in-memory token bucket (10/min/IP). Process-local and resets on cold start. That's fine for single-user; if this grows to a team, move to Upstash Redis.

**Deploy:**
```bash
whoami-check                      # MUST exit 0
cd prospect-tracker-api
vercel link                       # once
vercel env add ANTHROPIC_API_KEY production
vercel env add ALLOWED_ORIGINS production
vercel --prod
```

**Key rotation:**
```bash
vercel env rm ANTHROPIC_API_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```
No client rebuild required — clients call the proxy URL, not Anthropic directly.

**Known issues:** None yet. Streaming is not implemented for `brief` mode; users see a spinner for the duration of the call.

### Client glue

| File | Purpose |
|------|---------|
| `app/src/data/signalDerivation.js` | Pure function `deriveSignals(record, stops)` — joins canvass stops to records at call-time, returns `{ lastContact, touchCount, daysSinceContact, isOverdue, recentNotes }`. Covered by `app/scripts/test-signal-derivation.mjs`. |
| `app/src/data/aiRanking.js` | `buildCandidatePayload`, `callRankService`, cache helpers. Filters out chains, blocklisted names, and non-unworked records; caps at 200 candidates. Cache is payload-hash keyed in localStorage. |
| `app/src/features/database/AiPriorityPanel.jsx` | UI. Lives above the WeekPlannerPanel. Mode toggle (Shortlist / Briefing). Results cached until candidate set changes. "Mark as AI-seed" tags selected records with `grp='ai-seed'` — geo planner remains the decider; this is a bias signal only. |

**Test:**
```bash
cd app
node scripts/test-signal-derivation.mjs
```

**Related docs:**
- `docs/adr/ADR-001-ai-prioritization-layer.md` — rationale
- `docs/prompt-caching.md` — cache-control usage
- `/Users/nomad/.claude/plans/velvety-giggling-giraffe.md` — implementation plan

---

## PT Prospect Ranking (batch classifier)

Corpus-wide AI classifier that tiers every Outscraper prospect for Value Systems POS fit. Distinct from the per-session AI Prioritization Layer above: this runs offline against the full scrape corpus and writes durable rows; the prioritization layer reads canvass signals at call-time.

**Code lives in demo-builder** (`betterpostools/db-suite/demo-builder/agent/`) because it shares that repo's Anthropic + Supabase infrastructure. Output targets PT workflows.

| File | Role |
|------|------|
| `agent/pt_rank_batch.py` | One-shot Messages Batch submit/poll/ingest for all ~2229 prospects (50% batch discount + cache hits). State in `agent/.pt_rank_batch_state.json`. |
| `agent/pt_rank_prototype.py` | Synchronous per-prospect ranker for iteration / spot checks. |
| `agent/pt_rank_unified.py`, `pt_rank_v8_sample.py`, `pt_rank_crosscheck.py` | QA + rubric-revision flip-matrix tooling. |
| `agent/scrape_loader.py` | Unified Outscraper loader — reads the 16 JSON/XLSX files in `prospect-tracker/Scrapes/`, dedups by `place_id`. |
| `agent/prompts/pt_rank_rubric_v8.md` | Current rubric (versioned — bump file + `RUBRIC_VERSION` constant to roll forward). |
| `agent/prompts/pt_rank_rubric_v7.md` | Archived — retained for `prospect_rankings.rubric_version = 'v7-2026-04-14'` row lineage. |
| `agent/TOOLS.md` → "PT Prospect Ranking" | Full tool docs (inputs, iteration history, run commands). |

**Storage:** `demo_builder.prospect_rankings` in Supabase DEV (`mqifktmmyiqzrolrvsmy`). Migrations: `db-suite/demo-builder/supabase/migrations/005_prospect_rankings.sql`, `006_..._detected_pos.sql`, `007_..._swipe_volume.sql`. Keyed by `place_id` (Google Place ID — `TEXT`, not UUID).

**Key columns:** `tier` (`not_a_fit` | `chain_nogo` | `small_indie` | `mid_market` | `kiosk_tier`), `score`, `detected_pos` + `detected_pos_evidence`, `estimated_swipe_volume` (`high`|`medium`|`low`|`unknown`) + `swipe_volume_evidence`, `rubric_version`, `reasoning`, `signals`, `concerns`.

**Common runs** (from `db-suite/demo-builder/`):
```bash
python3 agent/pt_rank_batch.py --dry-run          # build requests, print stats
python3 agent/pt_rank_batch.py --only-missing --run  # rank only unranked prospects
python3 agent/pt_rank_prototype.py <place_id>     # single-prospect spot check
```

**Sales queue SQL pattern** (weighted by residual potential):
```sql
SELECT place_id, name, city, state, tier, score, detected_pos, estimated_swipe_volume
FROM demo_builder.prospect_rankings
WHERE tier IN ('small_indie','mid_market','kiosk_tier')
ORDER BY
  CASE tier WHEN 'small_indie' THEN 1 WHEN 'mid_market' THEN 2 ELSE 3 END,
  score DESC;
```

**PT integration status:** Data exists in Supabase but is NOT yet surfaced in the PT UI. Future wiring options: join `prospect_rankings` into DatabaseTab rows (tier badge + POS-detected flag), or feed `tier` into `AiPriorityPanel` candidate filter so the Planner skips `not_a_fit` / `chain_nogo` entirely.
