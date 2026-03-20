# Changes — 2026-03-20

## 1. Log visits on End Day, return No Answer / Not Interested to DB pool

**Problem:** "No answer / closed" and "Not interested" stops were lingering in All Active after End Day, cluttering the view indefinitely.

**Changes:**
- `confirmEndDay()` — No answer and Not interested stops now get a dated visit note written to the DB record (`r.nt`), are reset to `unworked` status, and are removed from the canvass queue entirely instead of aging into All Active.
- Not interested additionally drops the record's priority one level (Hot → Warm, Warm → Cold) as a soft signal.
- `endDay()` recap text updated to reflect the new behavior ("visit logged, returned to DB pool").
- End Day modal static description updated to accurately describe what happens to each stop type.
- `renderDb()` — DB list cards now display visit notes (`r.nt`) below the address so attempt history is visible at a glance.

---

## 2. Auto-updating build timestamp in app header

**Problem:** The hardcoded `Build YYYY-MM-DD HH:MM` timestamp in the app header was not updating, making it hard to confirm you were on the latest live version.

**Changes:**
- Added a git pre-commit hook (`.git/hooks/pre-commit`) that rewrites the build timestamp to the current date and time on every commit.
- The header now always reflects the exact time of the last commit.

---

## Earlier in the day (commits also on 2026-03-20)

- **Playwright test suite** — Added full test coverage across all major features (67 checks).
- **Fix Build a Run modal** — Stopped the modal from reopening after geocode completes post-confirm.
- **Fix crashes on missing fields** — Guarded against missing `c.mb` and `r.n` fields in DB records and clusters.
- **Auto-snapshot before Drive merge** — Snapshot is taken before any Drive sync that would overwrite local data, preventing accidental data loss.
- **Extend snapshots** — Snapshot coverage extended to leads and canvass data, not just DB records.
- **Add .gitignore** — Excluded `node_modules` from version control.
