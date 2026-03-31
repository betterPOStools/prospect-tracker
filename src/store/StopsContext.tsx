import { createContext, useContext, useReducer, type Dispatch } from 'react'
import type { CanvassStop, Activity } from '../types'
import { cache } from '../lib/storage'

// ── Action types ────────────────────────────────────────────────────────────

export type StopsAction =
  | { type: 'SET_ALL'; stops: CanvassStop[] }
  | { type: 'ADD'; stop: CanvassStop }
  | { type: 'ADD_MANY'; stops: CanvassStop[] }
  | { type: 'UPDATE'; stop: CanvassStop }
  | { type: 'UPDATE_STATUS'; id: string; status: CanvassStop['status'] }
  | { type: 'APPEND_ACTIVITY'; stop_id: string; activity: Activity }
  | { type: 'UPDATE_ACTIVITY'; stop_id: string; activity_id: string; text: string }
  | { type: 'DELETE'; id: string }
  | { type: 'DELETE_MANY'; ids: string[] }

// ── Reducer ─────────────────────────────────────────────────────────────────

function stopsReducer(state: CanvassStop[], action: StopsAction): CanvassStop[] {
  let next: CanvassStop[]

  switch (action.type) {
    case 'SET_ALL':
      next = action.stops
      break
    case 'ADD':
      next = [...state, action.stop]
      break
    case 'ADD_MANY': {
      const existing = new Set(state.map((s) => s.id))
      const unique = action.stops.filter((s) => !existing.has(s.id))
      next = [...state, ...unique]
      break
    }
    case 'UPDATE':
      next = state.map((s) => (s.id === action.stop.id ? action.stop : s))
      break
    case 'UPDATE_STATUS':
      next = state.map((s) =>
        s.id === action.id
          ? { ...s, status: action.status, last_contact: new Date().toISOString() }
          : s
      )
      break
    case 'APPEND_ACTIVITY':
      next = state.map((s) =>
        s.id === action.stop_id
          ? { ...s, activities: [...(s.activities ?? []), action.activity] }
          : s
      )
      break
    case 'UPDATE_ACTIVITY':
      next = state.map((s) =>
        s.id === action.stop_id
          ? {
              ...s,
              activities: (s.activities ?? []).map((a) =>
                a.id === action.activity_id ? { ...a, text: action.text } : a
              ),
            }
          : s
      )
      break
    case 'DELETE':
      next = state.filter((s) => s.id !== action.id)
      break
    case 'DELETE_MANY':
      next = state.filter((s) => !action.ids.includes(s.id))
      break
    default:
      return state
  }

  cache.setStops(next)
  return next
}

// ── Contexts ─────────────────────────────────────────────────────────────────

const StopsContext = createContext<CanvassStop[] | null>(null)
const StopsDispatchContext = createContext<Dispatch<StopsAction> | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function StopsProvider({ children }: { children: React.ReactNode }) {
  const [stops, dispatch] = useReducer(stopsReducer, cache.getStops())
  return (
    <StopsContext value={stops}>
      <StopsDispatchContext value={dispatch}>{children}</StopsDispatchContext>
    </StopsContext>
  )
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useStops() {
  const ctx = useContext(StopsContext)
  if (ctx === null) throw new Error('useStops must be used within StopsProvider')
  return ctx
}

export function useStopsDispatch() {
  const ctx = useContext(StopsDispatchContext)
  if (ctx === null) throw new Error('useStopsDispatch must be used within StopsProvider')
  return ctx
}
