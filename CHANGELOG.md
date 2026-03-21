# Changelog

All notable changes to the Value Systems Restaurant Prospect Tracker are documented here.

---

## [Unreleased] — React Migration + Playwright Test Suite

### Overview
This release migrates the application from a static HTML/JS implementation to a full
React 19 + Vite single-page application, introduces a Playwright end-to-end test suite
covering all features, and fixes three bugs discovered during testing.

---

### Bug Fixes

#### 1. Modal — POS "Other" text field losing focus to email on every keystroke
**File:** `app/src/components/Modal.jsx`

**Root cause:** The `Modal` component used a single `useEffect([onClose])` to both
auto-focus the first field and attach a keyboard listener. Because `onClose` was a new
inline function on every parent render, the effect re-fired whenever the parent
re-rendered — including when PosSelect's internal state changed to show the "Other"
text input. Each re-fire ran `el?.focus()` and stole focus back to the first interactive
element (the email field).

**Fix:**
- Split the monolithic effect into two separate effects:
  - Mount-only auto-focus (`[]` deps) — runs once, never again
  - Keyboard listener effect — uses a `useRef` to track the latest `onClose` without
    re-subscribing, so adding/removing keydown listener is stable
- The POS "Other" input now retains focus correctly when typing

#### 2. Modal closes when dragging to select text inside it
**File:** `app/src/components/Modal.jsx`

**Root cause:** The overlay's `onClick` handler fired whenever a mouse button was
released over the overlay, including when the user started a drag inside the modal
content (e.g. selecting email text) and released outside the modal box.

**Fix:**
- Added a `mouseDownOnOverlay` ref
- `onMouseDown` on the overlay records whether the press originated ON the overlay
- `onClick` only closes the modal when BOTH the mousedown AND the click originated
  on the overlay background — drag-selects that start inside the modal and end outside
  no longer close it

#### 3. End Day recap showing only the last batch instead of full-day totals
**File:** `app/src/features/canvass/EndDayModal.jsx`

**Root cause:** End Day could be run multiple times per day (e.g., morning batch and
afternoon batch). Each time, it only counted the stops in the current batch, discarding
the totals from earlier runs. At the end of the day the recap showed incomplete stats.

**Fix:**
- Added a `vs_endday` localStorage key that persists an accumulator keyed to today's
  date string
- Each time End Day is confirmed, the batch counts are added to the running totals for
  the day and saved
- Each time the End Day modal opens, it reads the accumulated totals so the recap
  always shows the full day's canvass activity
- Accumulator auto-resets the next calendar day (date-keyed, so stale data is ignored)

---

### New Features

#### Playwright End-to-End Test Suite
**Directory:** `app/tests/`

A comprehensive smoke test suite was built using Playwright covering every tab, panel,
modal, input field, and button in the application. All 228 tests pass.

**Test files:**

| File | Tests | Coverage |
|------|-------|----------|
| `app.spec.ts` | 16 | App shell, header, tab navigation, dark mode, badges, keyboard nav, modal focus trap |
| `canvass.spec.ts` | 80 | Add Stop, Today panel, Convert to Lead modal, End Day modal, Follow Up, Build Run modal, All Active, Archived, stat bar |
| `leads.spec.ts` | 60 | Add Lead form, filters, LeadCard view/edit modes, status changes, Demote modal, convert-then-edit flow |
| `database.spec.ts` | 47 | Snapshot manager, blocklist manager, Browse panel (all filters), Zones panel, Week Planner panel, subtab nav |
| `export.spec.ts` | 18 | Export JSON/CSV, import round-trip, import cancel, record counts, Git Sync section |
| `route.spec.ts` | 14 | Route list, position numbers, Google Maps links, reorder (▲▼), reset order, footer counts |
| `helpers.ts` | — | Shared utilities: `clearStorage`, `goTab`, `goCanvassSubtab`, `addStop`, `seedCanvassStop`, `seedLead`, `makeDbRecord`, `seedDatabase` |

**Key test infrastructure decisions:**
- `clearStorage` + `reload` in every `beforeEach` ensures each test starts from a
  clean slate with no shared state
- `seedLead` / `seedCanvassStop` / `seedDatabase` write directly to localStorage for
  fast, reliable setup without UI interaction
- CSS Module class name selectors use `[class*="..."]` patterns (e.g. `[class*="card"]`,
  `[class*="subtab"]`) since Vite hashes module class names at build time
- Edit-mode LeadCards are identified by presence of a Save button to avoid placeholder
  conflicts with the Add Lead form at the top of the same page

**Selector issues resolved during suite development:**

| Problem | Fix |
|---------|-----|
| `[class*="subtab"]` matched both container `_subtabs_` div and `_subtab_` buttons | Changed to `button[class*="subtab"]` |
| `getByText('Convert to Lead')` matched card button + modal title + modal button | Scoped to `dialog.locator('[class*="title"]')` |
| POS option `'Square'` not found | Corrected to `'Square for Restaurants'` (full option label) |
| `getByText('Hot')` / `getByText('Unworked')` matched stat labels + filter options + row data | Scoped to `[class*="statL"]` stat bar labels |
| `getByText('1')` matched address text and date strings | Used `{ exact: true }` for position number assertions |
| `borderBottom` CSS attribute selector failed | Used kebab-case `border-bottom` (React converts camelCase inline styles) |
| Zones panel `→ Canvass` button not found | Corrected button label to `'Load to canvass'` |
| `getByRole('button', { name: 'Auto-fill' })` matched `'Auto-fill Week'` via substring | Added `{ exact: true }` to target only per-day Auto-fill buttons |
| Demoted lead not visible on Canvass Today tab | Demoted stops have no `date` field so they land in All Active, not Today — test navigates to All Active |
| Follow Up status change disappeared card | `'Not interested'` is an archived status and removed the card from Follow Up — changed test to use `'Decision maker unavailable'` which stays in Follow Up |
| `[style*="cursor: pointer"]` matched elements across entire page | Changed to click on restaurant name text or use checkbox directly |
| LeadCard edit mode input placeholders conflicted with Add Lead form | All edit-mode interactions scoped to `locator('[class*="card"]').filter({ has: getByRole('button', { name: 'Save' }) })` |

---

### React Migration (app/)

The prospect tracker was migrated from a monolithic `index.html` to a full React 19 +
Vite component architecture.

**Stack:**
- React 19 + Vite 6
- CSS Modules for scoped styles
- Context + useReducer for global state (prospects, canvass stops, database records)
- localStorage persistence with per-field timestamps for Drive merge conflict resolution
- Playwright + Chromium for end-to-end tests

**Feature set (all migrated from original):**
- **Canvass tab** — Add Stop, Today queue, Follow Up, Build Run modal, All Active, Archived, End Day
- **My Leads tab** — Add Lead, status/search filters, LeadCard view/edit, Demote to Canvass modal
- **Database tab** — XLSX import, snapshot manager, chain blocklist, Browse with 5 filters, Zones, Week Planner
- **Route tab** — Today's ordered route, drag reorder, Google Maps integration
- **Export / Import tab** — JSON backup/restore, CSV exports, Git Sync workflow guide, Auto File Sync
- **Free Sources tab** — Resource links
- Dark mode toggle with localStorage persistence
- Google Drive sync with auto-snapshot safety net and per-field timestamp merge
- Pre-commit hook auto-updates build timestamp in app header

---

## Prior Commits (pre-React migration)

See `git log` for earlier work on the original HTML/JS implementation, including:
- `e7fc197` — Inline Build Run button in Follow Up cards
- `0bbc3d1` — Fix All Active tab not re-rendering after removing a canvass stop
- `43ec823` — Add per-field timestamps for deterministic Drive merge
- `2690329` — Add pre-commit hook to auto-update build timestamp in app header
- `b298328` — Extend snapshots to cover leads/canvass + fix Drive sync safety
- `d814516` — Auto-snapshot before Drive merge when local data would be overwritten
- `8536d57` — Fix crashes on missing c.mb and r.n fields in DB records/clusters
- `83be60a` — Fix Build a Run modal reopening after geocode completes post-confirm
