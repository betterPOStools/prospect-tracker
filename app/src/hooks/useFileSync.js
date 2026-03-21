import { useState, useRef, useCallback, useEffect } from 'react'

// ── IndexedDB helpers ──────────────────────────────────────────────────────────
const DB_NAME    = 'vs_filesync'
const DB_STORE   = 'handles'
const HANDLE_KEY = 'primary'

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}
async function getStoredHandle() {
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(HANDLE_KEY)
    req.onsuccess = e => resolve(e.target.result ?? null)
    req.onerror   = e => reject(e.target.error)
  })
}
async function setStoredHandle(handle) {
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(handle, HANDLE_KEY)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  })
}
async function clearStoredHandle() {
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(HANDLE_KEY)
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  })
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useFileSync() {
  const isAvailable = typeof window !== 'undefined' && 'showOpenFilePicker' in window

  const [linked,      setLinked]      = useState(false)
  const [fileName,    setFileName]    = useState(null)
  const [status,      setStatus]      = useState('idle')   // idle|saving|saved|error|needs-permission
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [error,       setError]       = useState(null)

  const handleRef        = useRef(null)
  const writeTimerRef    = useRef(null)
  const pendingPayloadRef = useRef(null)

  // ── initFromStorage ──────────────────────────────────────────────────────────
  // Called once on mount from DataProvider. Returns the handle if permission is
  // already granted (so DataProvider can read the file). Sets needs-permission
  // state if prompt is required (user must click Re-authorize to proceed).
  async function initFromStorage() {
    if (!isAvailable) return null
    let handle
    try { handle = await getStoredHandle() } catch { return null }
    if (!handle) return null

    let perm
    try { perm = await handle.queryPermission({ mode: 'readwrite' }) } catch { return null }

    if (perm === 'granted') {
      handleRef.current = handle
      setLinked(true)
      setFileName(handle.name)
      return handle
    }
    if (perm === 'prompt') {
      handleRef.current = handle
      setFileName(handle.name)
      setStatus('needs-permission')
      return null
    }
    // denied — clear stale handle
    try { await clearStoredHandle() } catch { /* ignore */ }
    return null
  }

  // ── readFromFile ─────────────────────────────────────────────────────────────
  async function readFromFile() {
    if (!handleRef.current) return null
    try {
      const file = await handleRef.current.getFile()
      const text = await file.text()
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  // ── writeToFile (debounced) ──────────────────────────────────────────────────
  const writeToFile = useCallback((payload) => {
    if (!handleRef.current || !linked) return
    pendingPayloadRef.current = payload
    clearTimeout(writeTimerRef.current)
    writeTimerRef.current = setTimeout(async () => {
      setStatus('saving')
      try {
        const w = await handleRef.current.createWritable()
        await w.write(JSON.stringify(payload, null, 2))
        await w.close()
        const now = new Date()
        setLastSavedAt(now)
        localStorage.setItem('vs_filesync_saved_at', now.toISOString())
        setStatus('saved')
        setTimeout(() => setStatus(s => s === 'saved' ? 'idle' : s), 3000)
      } catch (e) {
        setStatus('error')
        setError(e.message)
      }
    }, 1500)
  }, [linked]) // stable ref — DataProvider dep array depends on this

  // ── flushWrite (immediate) ───────────────────────────────────────────────────
  async function flushWrite(payload) {
    if (!handleRef.current) return
    clearTimeout(writeTimerRef.current)
    pendingPayloadRef.current = null
    setStatus('saving')
    try {
      const w = await handleRef.current.createWritable()
      await w.write(JSON.stringify(payload, null, 2))
      await w.close()
      const now = new Date()
      setLastSavedAt(now)
      localStorage.setItem('vs_filesync_saved_at', now.toISOString())
      setStatus('saved')
      setTimeout(() => setStatus(s => s === 'saved' ? 'idle' : s), 3000)
    } catch (e) {
      setStatus('error')
      setError(e.message)
    }
  }

  // ── linkFile ─────────────────────────────────────────────────────────────────
  async function linkFile() {
    if (!isAvailable) return
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      })
      await setStoredHandle(handle)
      handleRef.current = handle
      setLinked(true)
      setFileName(handle.name)
      setStatus('idle')
      setError(null)
    } catch (e) {
      if (e.name !== 'AbortError') { setStatus('error'); setError(e.message) }
    }
  }

  // ── createNewFile ────────────────────────────────────────────────────────────
  async function createNewFile() {
    if (!isAvailable) return
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'backup.json',
        types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
      })
      // Write an empty payload so the file isn't 0 bytes
      const w = await handle.createWritable()
      await w.write(JSON.stringify({ version: 1, savedAt: new Date().toISOString() }, null, 2))
      await w.close()
      await setStoredHandle(handle)
      handleRef.current = handle
      setLinked(true)
      setFileName(handle.name)
      setStatus('idle')
      setError(null)
    } catch (e) {
      if (e.name !== 'AbortError') { setStatus('error'); setError(e.message) }
    }
  }

  // ── unlinkFile ───────────────────────────────────────────────────────────────
  async function unlinkFile() {
    try { await clearStoredHandle() } catch { /* ignore */ }
    handleRef.current = null
    clearTimeout(writeTimerRef.current)
    pendingPayloadRef.current = null
    setLinked(false)
    setFileName(null)
    setStatus('idle')
    setError(null)
    setLastSavedAt(null)
  }

  // ── requestAccess (must be called from a user gesture) ───────────────────────
  async function requestAccess() {
    if (!handleRef.current) return
    try {
      const perm = await handleRef.current.requestPermission({ mode: 'readwrite' })
      if (perm === 'granted') {
        setLinked(true)
        setStatus('idle')
      } else {
        setStatus('error')
        setError('Permission denied.')
      }
    } catch (e) {
      setStatus('error')
      setError(e.message)
    }
  }

  // ── beforeunload flush ───────────────────────────────────────────────────────
  useEffect(() => {
    function flush() {
      if (writeTimerRef.current && handleRef.current && pendingPayloadRef.current) {
        clearTimeout(writeTimerRef.current)
        handleRef.current.createWritable()
          .then(w => w.write(JSON.stringify(pendingPayloadRef.current, null, 2)).then(() => w.close()))
          .catch(() => {})
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, []) // intentionally empty — refs are stable

  return {
    isAvailable,
    linked, fileName, status, lastSavedAt, error,
    initFromStorage, readFromFile,
    linkFile, createNewFile, unlinkFile, requestAccess,
    writeToFile, flushWrite,
  }
}
