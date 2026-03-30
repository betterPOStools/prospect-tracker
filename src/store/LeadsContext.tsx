import { createContext, useContext, useReducer, type Dispatch } from 'react'
import type { Lead, Activity } from '../types'
import { cache } from '../lib/storage'

// ── Action types ────────────────────────────────────────────────────────────

export type LeadsAction =
  | { type: 'SET_ALL'; leads: Lead[] }
  | { type: 'ADD'; lead: Lead }
  | { type: 'UPDATE'; lead: Lead }
  | { type: 'UPDATE_STATUS'; id: string; status: Lead['status'] }
  | { type: 'DELETE'; id: string }
  | { type: 'APPEND_ACTIVITY'; lead_id: string; activity: Activity }

// ── Reducer ─────────────────────────────────────────────────────────────────

function leadsReducer(state: Lead[], action: LeadsAction): Lead[] {
  let next: Lead[]

  switch (action.type) {
    case 'SET_ALL':
      next = action.leads
      break
    case 'ADD':
      next = [...state, action.lead]
      break
    case 'UPDATE':
      next = state.map((l) => (l.id === action.lead.id ? action.lead : l))
      break
    case 'UPDATE_STATUS':
      next = state.map((l) => (l.id === action.id ? { ...l, status: action.status } : l))
      break
    case 'DELETE':
      next = state.filter((l) => l.id !== action.id)
      break
    case 'APPEND_ACTIVITY':
      next = state.map((l) =>
        l.id === action.lead_id
          ? { ...l, activities: [...(l.activities ?? []), action.activity] }
          : l,
      )
      break
    default:
      return state
  }

  cache.setLeads(next)
  return next
}

// ── Contexts ─────────────────────────────────────────────────────────────────

const LeadsContext = createContext<Lead[] | null>(null)
const LeadsDispatchContext = createContext<Dispatch<LeadsAction> | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function LeadsProvider({ children }: { children: React.ReactNode }) {
  const [leads, dispatch] = useReducer(leadsReducer, cache.getLeads())
  return (
    <LeadsContext value={leads}>
      <LeadsDispatchContext value={dispatch}>{children}</LeadsDispatchContext>
    </LeadsContext>
  )
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useLeads() {
  const ctx = useContext(LeadsContext)
  if (ctx === null) throw new Error('useLeads must be used within LeadsProvider')
  return ctx
}

export function useLeadsDispatch() {
  const ctx = useContext(LeadsDispatchContext)
  if (ctx === null) throw new Error('useLeadsDispatch must be used within LeadsProvider')
  return ctx
}
