import { createContext, useContext, useReducer, type Dispatch } from 'react'
import type { ProspectRecord } from '../types'
import { cache } from '../lib/storage'

// ── Action types ────────────────────────────────────────────────────────────

export type RecordsAction =
  | { type: 'SET_ALL'; records: ProspectRecord[] }
  | { type: 'UPSERT'; record: ProspectRecord }
  | { type: 'UPSERT_MANY'; records: ProspectRecord[] }
  | { type: 'UPDATE_STATUS'; id: string; status: ProspectRecord['status'] }
  | { type: 'UPDATE_STATUS_MANY'; ids: string[]; fields: Partial<ProspectRecord> }
  | { type: 'ASSIGN_DAY'; ids: string[]; day: string }
  | { type: 'WEEK_ASSIGN'; assignments: Array<{ id: string; day: string }> }
  | { type: 'CLEAR_WEEK' }
  | { type: 'CLEAR_DAY'; day: string }
  | { type: 'SET_GROUP'; ids: string[]; group: string }
  | { type: 'INCREMENT_DROPPED'; id: string }
  | { type: 'DELETE'; id: string }

// ── Reducer ─────────────────────────────────────────────────────────────────

function recordsReducer(state: ProspectRecord[], action: RecordsAction): ProspectRecord[] {
  let next: ProspectRecord[]

  switch (action.type) {
    case 'SET_ALL':
      next = action.records
      break
    case 'UPSERT': {
      const idx = state.findIndex((r) => r.id === action.record.id)
      next = idx >= 0
        ? state.map((r) => (r.id === action.record.id ? action.record : r))
        : [...state, action.record]
      break
    }
    case 'UPSERT_MANY': {
      const map = new Map(state.map((r) => [r.id, r]))
      action.records.forEach((r) => map.set(r.id, r))
      next = Array.from(map.values())
      break
    }
    case 'UPDATE_STATUS':
      next = state.map((r) => (r.id === action.id ? { ...r, status: action.status } : r))
      break
    case 'UPDATE_STATUS_MANY':
      next = state.map((r) => (action.ids.includes(r.id) ? { ...r, ...action.fields } : r))
      break
    case 'ASSIGN_DAY':
      next = state.map((r) => (action.ids.includes(r.id) ? { ...r, day: action.day } : r))
      break
    case 'WEEK_ASSIGN': {
      const dayMap = Object.fromEntries(action.assignments.map((a) => [a.id, a.day]))
      next = state.map((r) => (dayMap[r.id] !== undefined ? { ...r, day: dayMap[r.id] } : r))
      break
    }
    case 'CLEAR_WEEK':
      next = state.map((r) => ({ ...r, day: undefined }))
      break
    case 'CLEAR_DAY':
      next = state.map((r) => (r.day === action.day ? { ...r, day: undefined } : r))
      break
    case 'SET_GROUP':
      next = state.map((r) => (action.ids.includes(r.id) ? { ...r, group: action.group } : r))
      break
    case 'INCREMENT_DROPPED':
      next = state.map((r) =>
        r.id === action.id ? { ...r, dropped_count: (r.dropped_count ?? 0) + 1 } : r
      )
      break
    case 'DELETE':
      next = state.filter((r) => r.id !== action.id)
      break
    default:
      return state
  }

  cache.setRecords(next)
  return next
}

// ── Contexts ─────────────────────────────────────────────────────────────────

const RecordsContext = createContext<ProspectRecord[] | null>(null)
const RecordsDispatchContext = createContext<Dispatch<RecordsAction> | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function RecordsProvider({ children }: { children: React.ReactNode }) {
  const [records, dispatch] = useReducer(recordsReducer, cache.getRecords())
  return (
    <RecordsContext value={records}>
      <RecordsDispatchContext value={dispatch}>{children}</RecordsDispatchContext>
    </RecordsContext>
  )
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useRecords() {
  const ctx = useContext(RecordsContext)
  if (ctx === null) throw new Error('useRecords must be used within RecordsProvider')
  return ctx
}

export function useRecordsDispatch() {
  const ctx = useContext(RecordsDispatchContext)
  if (ctx === null) throw new Error('useRecordsDispatch must be used within RecordsProvider')
  return ctx
}
