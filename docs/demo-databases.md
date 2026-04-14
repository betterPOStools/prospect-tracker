# Demo Databases — Developer Reference

This document covers the Demo Databases feature in the Prospect Tracker Database tab: how the batch generation pipeline works, the status lifecycle for each record, and how to troubleshoot common issues.

For the full API reference and PT implementation spec, see `PT_INTEGRATION_SPEC.md` in the Demo Builder repo (`betterpostools/db-suite/demo-builder/`).

---

## What This Feature Does

The Demo Databases panel lets you pre-generate a custom MariaDB database for each prospect restaurant before a sales trip. When you arrive at a stop, "Load Demo" deploys the pre-generated database to the demo tablet in ~25 seconds — fast enough to do in front of a client.

The pipeline:
1. **Batch queue** — PT sends prospect records to Demo Builder's `/api/batch/queue`
2. **Agent extraction** — The local deploy agent on the Mac fetches each restaurant's menu (via structured data, web scrape, or AI extraction) and generates SQL + images
3. **Snapshot saved** — The generated SQL is stored; status flips to `done`
4. **Load Demo** — On the day of the visit, one click deploys the snapshot to the tablet

---

## Status Lifecycle

Each record in the panel shows one of these statuses:

| Status | Badge color | Meaning |
|--------|-------------|---------|
| `no_snapshot` | Gray | Never queued — no generation has been attempted |
| `queued` | Yellow | In the queue; the agent has not claimed it yet |
| `processing` | Yellow | Agent is actively extracting and generating (~30–90s) |
| `done` | Green | Ready — SQL + images generated; "Load Demo" is available |
| `failed` | Red | Generation failed; hover the badge to see the error message |
| `needs_pdf` | Orange | Menu URL resolved to a PDF file — skipped in the mechanical batch pass, awaiting vision extraction queue |

### Terminal states

`done`, `failed`, and `needs_pdf` are all terminal for the current batch pass. The panel stops polling once all visible rows reach a terminal state or `no_snapshot`.

### Re-queuing

To retry a `failed` row, click "Retry". This calls `/api/batch/queue` with `skip_if_exists: false`, which resets the record and re-runs the full pipeline.

`needs_pdf` rows cannot be retried from the panel — they require a separate Sonnet vision extraction pass (not yet implemented). Clicking "Retry" on a `needs_pdf` row is intentionally not shown.

---

## Menu URL Discovery

The agent automatically resolves homepage URLs to the actual menu page. Most PT records store the restaurant's homepage (e.g. `https://gatorzone.com`), not the direct menu link. Before any extraction, the agent:

1. Fetches the homepage and scans nav links for patterns like `/menu`, `/menus`, `/food`, `/dining`
2. If a menu page is found, it processes that URL instead and updates the record in its internal queue
3. If the URL points to a PDF, it sets `needs_pdf` and skips extraction

This means you don't need to find the exact menu URL for each prospect — the homepage is sufficient in most cases.

---

## `needs_pdf` Records

Some restaurants host their menu as a PDF file. PDF extraction is expensive (requires Sonnet vision at ~$0.03–0.05/restaurant) and slow. The batch pipeline skips them and marks them `needs_pdf` so the cheap mechanical pass can run at scale first.

**Planned:** A second pass using Sonnet vision will process `needs_pdf` rows when we're ready to spend the AI budget on them. For now, these records stay in `needs_pdf` and require manual handling (use the "Build Custom Demo" button on the lead card to run the full AI pipeline for individual restaurants).

---

## Workflow

### Night-before prep

1. Open the Database tab → Demo Databases panel
2. Filter to the city or area you're visiting
3. Click "Queue All" — this queues all records that don't already have a `done` snapshot
4. Leave the panel open; it polls every 10 seconds and updates badges as jobs complete
5. When all rows show green "Ready ✓", you're ready for the trip

### In the field

1. Navigate to the canvass stop card for your current restaurant
2. Click "Load Demo" → confirm the connection (should default to "Demo Tablet")
3. Wait ~25 seconds for the deployment progress to complete
4. The POS app on the tablet restarts automatically with the restaurant's demo data

### If a row shows "Failed"

- Hover the red badge to see the error message
- Common causes: Cloudflare-protected site (can't be scraped headlessly), broken menu URL, the agent is not running
- Click "Retry" to requeue — the agent will attempt the full extraction chain again
- If it fails again, use "Build Custom Demo" on the lead card for manual pipeline

### If the agent isn't processing jobs

Jobs stuck in `queued` or `processing` for more than 5 minutes usually mean the agent is not running on the Mac. Check:

```bash
# On the Mac:
launchctl list | grep demo-builder-agent
# Should show the PID. If not running:
launchctl load ~/Library/LaunchAgents/com.valuesystems.demo-builder-agent.plist
```

Agent logs: `~/Library/Logs/demo-builder-agent.log`

---

## Implementation Notes

- **Panel component:** `app/src/features/database/DemoDatabasesPanel.jsx`
- **API calls:** `app/src/lib/demoBuilder.js` — `fetchBatchStatus()`, `queueBatch()`, `loadDemo()`
- **Demo Builder URL:** Set via `VITE_DEMO_BUILDER_URL` in `.env.local` — currently `https://demo-builder-seven.vercel.app`
- **Status polling:** 10-second interval; stops when no rows are in `queued` or `processing`
- **Full spec:** `PT_INTEGRATION_SPEC.md` in the demo-builder repo — API contracts, request/response shapes, all edge cases
