import { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react'
import { loadAll, saveProspects, saveCanvass, saveDb, loadFromFile } from './storage.js'
import { useFileSync as useFileSyncHook } from '../hooks/useFileSync.js'
import { useSupabaseSync } from '../hooks/useSupabaseSync.js'
import { calcScore, calcPriority } from './scoring.js'

function rescoreAll(records) {
  let changed = false
  const result = records.map(r => {
    const sc = calcScore(r)
    const pr = calcPriority(sc)
    if (r.sc === sc && r.pr === pr) return r
    changed = true
    return { ...r, sc, pr }
  })
  return changed ? result : records
}

// ── Last Save ──────────────────────────────────────────────────────────────────
const LastSaveContext = createContext(null)

// ── Prospects ──────────────────────────────────────────────────────────────────
const ProspectsContext = createContext(null)
const ProspectsDispatchContext = createContext(null)

function prospectsReducer(state, action) {
  let next
  switch (action.type) {
    case 'ADD':
      next = [...state, action.prospect]
      break
    case 'UPDATE':
      next = state.map(p => p.id === action.prospect.id ? action.prospect : p)
      break
    case 'DELETE':
      next = state.filter(p => p.id !== action.id)
      break
    case 'IMPORT_MERGE':
      next = mergeArr([...state], action.incoming)
      break
    case '_REPLACE_ALL':
      next = action.items || []
      break
    default:
      return state
  }
  saveProspects(next)
  return next
}

// ── Canvass ────────────────────────────────────────────────────────────────────
const CanvassContext = createContext(null)
const CanvassDispatchContext = createContext(null)

function canvassReducer(state, action) {
  let next
  switch (action.type) {
    case 'ADD':
      next = [...state, action.stop]
      break
    case 'ADD_MANY':
      next = [...state, ...action.stops]
      break
    case 'UPDATE':
      next = state.map(s => s.id === action.stop.id ? action.stop : s)
      break
    case 'UPDATE_STATUS':
      next = state.map(s => s.id === action.id ? { ...s, status: action.status } : s)
      break
    case 'DELETE':
      next = state.filter(s => s.id !== action.id)
      break
    case 'DELETE_MANY':
      next = state.filter(s => !action.ids.includes(s.id))
      break
    case 'IMPORT_MERGE':
      next = mergeArr([...state], action.incoming)
      break
    case '_REPLACE_ALL':
      next = action.items || []
      break
    default:
      return state
  }
  saveCanvass(next)
  return next
}

// ── Database ───────────────────────────────────────────────────────────────────
const DatabaseContext = createContext(null)
const DatabaseDispatchContext = createContext(null)

function databaseReducer(state, action) {
  let next
  switch (action.type) {
    case 'IMPORT':
      next = {
        ...state,
        dbRecords:  action.dbRecords,
        dbClusters: action.dbClusters,
        dbAreas:    action.dbAreas,
        dbBlocklist: action.dbBlocklist ?? state.dbBlocklist,
      }
      break
    case 'UPDATE_RECORD':
      next = { ...state, dbRecords: state.dbRecords.map(r => r.id === action.record.id ? action.record : r) }
      break
    case 'UPDATE_RECORD_STATUS':
      next = { ...state, dbRecords: state.dbRecords.map(r => r.id === action.id ? { ...r, st: action.status } : r) }
      break
    case 'UPDATE_RECORD_STATUS_MANY':
      next = { ...state, dbRecords: state.dbRecords.map(r => action.ids.includes(r.id) ? { ...r, ...action.fields } : r) }
      break
    case 'ASSIGN_DAY':
      next = { ...state, dbRecords: state.dbRecords.map(r => action.ids.includes(r.id) ? { ...r, da: action.day } : r) }
      break
    case 'SET_CLUSTERS':
      next = { ...state, dbClusters: action.dbClusters }
      break
    case 'SET_AREAS':
      next = { ...state, dbAreas: action.dbAreas }
      break
    case 'SET_BLOCKLIST':
      next = { ...state, dbBlocklist: action.dbBlocklist }
      break
    case 'WEEK_ASSIGN': {
      // action.assignments = [{ id, da }]
      const daMap = Object.fromEntries(action.assignments.map(a => [a.id, a.da]))
      next = { ...state, dbRecords: state.dbRecords.map(r => daMap[r.id] !== undefined ? { ...r, da: daMap[r.id] } : r) }
      break
    }
    case 'CLEAR_WEEK':
      next = { ...state, dbRecords: state.dbRecords.map(r => ({ ...r, da: '' })) }
      break
    case 'CLEAR_DAY':
      next = { ...state, dbRecords: state.dbRecords.map(r => r.da === action.day ? { ...r, da: '' } : r) }
      break
    case 'REMOVE_FROM_DAY':
      next = { ...state, dbRecords: state.dbRecords.map(r => r.id === action.id ? { ...r, da: '' } : r) }
      break
    case 'RESTORE_SNAPSHOT':
      next = {
        dbRecords:   action.dbRecords   || [],
        dbClusters:  action.dbClusters  || [],
        dbAreas:     action.dbAreas     || [],
        dbBlocklist: action.dbBlocklist || state.dbBlocklist,
      }
      break
    case 'END_DAY_UPDATE': {
      const updatedRecords = state.dbRecords.map(r => {
        const u = action.updates.find(x => x.id === r.id)
        if (!u) return r
        const fields = { ...u.fields }
        const note   = fields._note; delete fields._note
        const down   = fields._downgrade; delete fields._downgrade
        let updated  = { ...r, ...fields }
        if (note) updated.nt = updated.nt ? updated.nt + '\n' + note : note
        if (down) {
          const map = { Fire: 'Hot', Hot: 'Warm', Warm: 'Cold', Cold: 'Dead', Dead: 'Dead' }
          if (map[updated.pr]) updated.pr = map[updated.pr]
        }
        return updated
      })
      next = { ...state, dbRecords: updatedRecords }
      break
    }
    case 'RENAME_ZONE': {
      const updated = state.dbRecords.map(r =>
        r.zo === action.oldName ? { ...r, zo: action.newName } : r
      )
      const updatedClusters = state.dbClusters.map(c =>
        c.zone === action.oldName ? { ...c, zone: action.newName } : c
      )
      next = { ...state, dbRecords: updated, dbClusters: updatedClusters }
      break
    }
    default:
      return state
  }
  saveDb(next)
  return next
}

// ── File Sync Context ──────────────────────────────────────────────────────────
const FileSyncContext = createContext(null)
export const useFileSync = () => useContext(FileSyncContext)

// ── Supabase Sync Context ──────────────────────────────────────────────────────
const SupabaseSyncContext = createContext(null)
export const useSupabaseSyncCtx = () => useContext(SupabaseSyncContext)

// ── Shared merge utility ───────────────────────────────────────────────────────
function mergeField(driveVal, localVal, driveTs, localTs) {
  if (driveVal === localVal) return driveVal
  const dEmpty = driveVal == null || driveVal === ''
  const lEmpty = localVal == null || localVal === ''
  if (dEmpty) return localVal
  if (lEmpty) return driveVal
  if (driveTs && localTs) return driveTs >= localTs ? driveVal : localVal
  if (typeof driveVal !== 'string' || typeof localVal !== 'string') return driveVal
  const d = driveVal.trim(), l = localVal.trim()
  if (d === l) return d
  if (l.includes(d)) return l
  if (d.includes(l)) return d
  return d + '>>' + l
}

function mergeArr(local, incoming) {
  const idxById = new Map(local.map((item, i) => [item.id, i]))
  incoming.forEach(p => {
    if (!p.id || !p.name) return
    const i = idxById.get(p.id)
    if (i === undefined) {
      idxById.set(p.id, local.length)
      local.push(p)
    } else {
      const merged = { ...local[i] }
      const dTs = p._ts || {}, lTs = local[i]._ts || {}
      Object.keys(p).forEach(k => {
        if (k === '_ts') return
        merged[k] = mergeField(p[k], local[i][k], dTs[k], lTs[k])
      })
      merged._ts = { ...lTs, ...dTs }
      local[i] = merged
    }
  })
  return local
}

// ── Provider ───────────────────────────────────────────────────────────────────
export function DataProvider({ children }) {
  const initial = loadAll()
  if (initial.dbRecords.length) initial.dbRecords = rescoreAll(initial.dbRecords)

  const [prospects, prospectsDispatch] = useReducer(prospectsReducer, initial.prospects)
  const [canvassStops, canvassDispatch] = useReducer(canvassReducer, initial.canvassStops)
  const [db, dbDispatch] = useReducer(databaseReducer, {
    dbRecords:   initial.dbRecords,
    dbClusters:  initial.dbClusters,
    dbAreas:     initial.dbAreas,
    dbBlocklist: initial.dbBlocklist,
  })

  const fileSync      = useFileSyncHook()
  const supabaseSync  = useSupabaseSync()
  const isInitializingRef = useRef(true)
  const [lastLocalSave, setLastLocalSave] = useState(null)

  // Startup: read from linked file or Supabase if newer than localStorage
  useEffect(() => {
    async function init() {
      // ── File sync (existing) ────────────────────────────────────────────────
      const handle = await fileSync.initFromStorage()
      if (handle) {
        const raw  = await fileSync.readFromFile()
        const data = loadFromFile(raw)
        if (data) {
          const fileSavedAt  = data.savedAt ? new Date(data.savedAt) : null
          const lsTs         = localStorage.getItem('vs_filesync_saved_at')
          const localSavedAt = lsTs ? new Date(lsTs) : null
          if (!localSavedAt || (fileSavedAt && fileSavedAt > localSavedAt)) {
            dbDispatch({ type: 'RESTORE_SNAPSHOT',
              dbRecords: data.dbRecords, dbClusters: data.dbClusters,
              dbAreas: data.dbAreas, dbBlocklist: data.dbBlocklist })
            prospectsDispatch({ type: '_REPLACE_ALL', items: data.prospects })
            canvassDispatch({ type: '_REPLACE_ALL', items: data.canvass })
          }
        }
      }

      // ── Supabase (new) ─────────────────────────────────────────────────────
      if (supabaseSync.enabled) {
        const row = await supabaseSync.loadFromSupabase()
        if (row?.payload && Object.keys(row.payload).length > 0) {
          const remoteSavedAt = row.updated_at ? new Date(row.updated_at) : null
          const localBestTs   = [
            localStorage.getItem('vs_filesync_saved_at'),
            localStorage.getItem('vs_supabase_synced_at'),
          ].filter(Boolean).map(s => new Date(s)).sort((a, b) => b - a)[0] ?? null

          if (!localBestTs || (remoteSavedAt && remoteSavedAt > localBestTs)) {
            const p = row.payload
            dbDispatch({ type: 'RESTORE_SNAPSHOT',
              dbRecords: rescoreAll(p.dbRecords || []), dbClusters: p.dbClusters,
              dbAreas: p.dbAreas, dbBlocklist: p.dbBlocklist })
            prospectsDispatch({ type: '_REPLACE_ALL', items: p.prospects || [] })
            canvassDispatch({ type: '_REPLACE_ALL', items: p.canvass || [] })
          }
        }
      }

      setTimeout(() => { isInitializingRef.current = false }, 0)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track localStorage saves
  useEffect(() => {
    if (isInitializingRef.current) return
    setLastLocalSave(new Date())
  }, [prospects, canvassStops, db])

  // Auto-write to file on any state change
  useEffect(() => {
    if (isInitializingRef.current) return
    if (!fileSync.linked) return
    fileSync.writeToFile({
      version: 1, savedAt: new Date().toISOString(),
      prospects, canvass: canvassStops,
      dbRecords: db.dbRecords, dbClusters: db.dbClusters,
      dbAreas: db.dbAreas, dbBlocklist: db.dbBlocklist,
    })
  }, [prospects, canvassStops, db, fileSync.linked]) // writeToFile is stable (useCallback)

  // Auto-sync to Supabase on any state change
  useEffect(() => {
    if (isInitializingRef.current) return
    if (!supabaseSync.enabled) return
    supabaseSync.writeToSupabase({
      version: 1,
      prospects,
      canvass:     canvassStops,
      dbRecords:   db.dbRecords,
      dbClusters:  db.dbClusters,
      dbAreas:     db.dbAreas,
      dbBlocklist: db.dbBlocklist,
    })
  }, [prospects, canvassStops, db, supabaseSync.enabled]) // writeToSupabase is stable (useCallback)

  // Realtime: apply updates from other devices
  useEffect(() => {
    if (!supabaseSync.enabled) return
    return supabaseSync.subscribeRealtime({
      onUpdate: (payload) => {
        if (isInitializingRef.current) return
        if (payload.dbRecords !== undefined) {
          dbDispatch({ type: 'RESTORE_SNAPSHOT',
            dbRecords: payload.dbRecords, dbClusters: payload.dbClusters,
            dbAreas: payload.dbAreas, dbBlocklist: payload.dbBlocklist })
        }
        if (payload.prospects !== undefined) prospectsDispatch({ type: '_REPLACE_ALL', items: payload.prospects })
        if (payload.canvass   !== undefined) canvassDispatch({ type: '_REPLACE_ALL', items: payload.canvass })
      }
    })
  }, [supabaseSync.enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SupabaseSyncContext.Provider value={supabaseSync}>
    <LastSaveContext.Provider value={lastLocalSave}>
    <FileSyncContext.Provider value={fileSync}>
    <ProspectsContext.Provider value={prospects}>
      <ProspectsDispatchContext.Provider value={prospectsDispatch}>
        <CanvassContext.Provider value={canvassStops}>
          <CanvassDispatchContext.Provider value={canvassDispatch}>
            <DatabaseContext.Provider value={db}>
              <DatabaseDispatchContext.Provider value={dbDispatch}>
                {children}
              </DatabaseDispatchContext.Provider>
            </DatabaseContext.Provider>
          </CanvassDispatchContext.Provider>
        </CanvassContext.Provider>
      </ProspectsDispatchContext.Provider>
    </ProspectsContext.Provider>
    </FileSyncContext.Provider>
    </LastSaveContext.Provider>
    </SupabaseSyncContext.Provider>
  )
}

// ── Hooks ──────────────────────────────────────────────────────────────────────
export const useProspects = () => useContext(ProspectsContext)
export const useProspectsDispatch = () => useContext(ProspectsDispatchContext)
export const useCanvass = () => useContext(CanvassContext)
export const useCanvassDispatch = () => useContext(CanvassDispatchContext)
export const useDatabase = () => useContext(DatabaseContext)
export const useDatabaseDispatch = () => useContext(DatabaseDispatchContext)
export const useLastSave = () => useContext(LastSaveContext)

// Returns a complete state payload suitable for file sync / export
export function useCurrentStatePayload() {
  const prospects = useProspects()
  const canvass   = useCanvass()
  const db        = useDatabase()
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    prospects,
    canvass,
    dbRecords:   db.dbRecords,
    dbClusters:  db.dbClusters,
    dbAreas:     db.dbAreas,
    dbBlocklist: db.dbBlocklist,
  }
}
