// Append-only log of AI rank/brief responses. Kept client-side in localStorage
// so the user can review patterns, export for training, or audit cost over time.
// See memory: project_ai_prioritization_layer.md for how this fits in.

const KEY = 'vs_ai_brief_history'
const LAST_KEY = 'vs_ai_last_result'
const VERSION = 1

// Persist the currently-displayed run so it survives tab switches / reloads.
// Cleared explicitly when the user wants a fresh panel.
export function saveLastResult(mode, response) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ v: VERSION, mode, response })) } catch { /* quota */ }
}
export function loadLastResult() {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.v !== VERSION) return null
    return { mode: parsed.mode, response: parsed.response }
  } catch { return null }
}
export function clearLastResult() {
  try { localStorage.removeItem(LAST_KEY) } catch { /* ignore */ }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { v: VERSION, entries: [] }
    const parsed = JSON.parse(raw)
    if (parsed?.v !== VERSION || !Array.isArray(parsed.entries)) return { v: VERSION, entries: [] }
    return parsed
  } catch { return { v: VERSION, entries: [] } }
}

/** Append one response to history. Silently no-ops if localStorage is full. */
export function appendBrief({ mode, candidates, response, userContext, currentLocation }) {
  const state = load()
  state.entries.push({
    id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    mode,
    candidateCount: candidates.length,
    candidateIds: candidates.map(c => c.id),
    userContext: userContext || '',
    currentLocation: currentLocation || null,
    response,
    usage: response?.usage || null,
  })
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota — ignore */ }
}

export function loadBriefHistory() { return load().entries }

/** Browser-native JSON download. Works in Vite and Capacitor webview. */
export function exportBriefHistoryJson() {
  const state = load()
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prospect-tracker-briefs-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function clearBriefHistory() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
