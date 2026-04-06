# Prospect Tracker — Data Recovery Guide

## Background

The old app stored data in browser localStorage under the GitHub Pages domain.
The old URL was: `https://nomadd3v.github.io/prospect-tracker/`

Chrome retains localStorage even when a page returns 404, so the data may still be recoverable.

## localStorage Keys

| Key | Contents |
|-----|----------|
| `vs_p3` | Prospects |
| `vs_c1` | Canvass stops |
| `vs_db` | Database records |
| `vs_db_areas` | Areas |
| `vs_db_block` | Blocklist |

## Recovery Steps

1. Open Chrome and navigate to `https://nomadd3v.github.io/prospect-tracker/` (404 is fine)
2. Press **F12** → **Application** tab → **Local Storage** → click `https://nomadd3v.github.io`
3. Look for the keys listed above

### Option A — Download via Console

Open the browser console on that page and run:

```js
const data = {};
['vs_p3','vs_c1','vs_db','vs_db_areas','vs_db_block'].forEach(k => {
  const v = localStorage.getItem(k);
  if (v) data[k] = JSON.parse(v);
});
const a = document.createElement('a');
a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify(data, null, 2));
a.download = 'prospect-recovery.json';
a.click();
```

This downloads `prospect-recovery.json`. Hand that file to Claude Code to import into Supabase PROD (`nngjtbrvwhjrmbokephl`, `prospect` schema).

### Option B — Manual Copy

Copy the raw JSON value of `vs_p3` and `vs_db` from the Local Storage panel and paste into Claude Code. It can import directly into Supabase.

## Current Supabase State

- **PROD** (`nngjtbrvwhjrmbokephl`) — `prospect` schema, all tables exist but are empty
- **DEV** (`mqifktmmyiqzrolrvsmy`) — same, also empty
- Both `app_state` tables are empty (old JSONB sync row was never written)
